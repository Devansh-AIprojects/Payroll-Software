from datetime import date
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse

from app.auth.dependencies import require_hr, AuthUser
from app.core.responses import APIResponse
from app.database import get_connection
from app.modules.attendance import service
from app.modules.attendance.schemas import (
    AttendanceLogResponse, AttendanceDailyResponse,
    ProcessRequest, ProcessResponse,
    DailyOverrideRequest, ManualAttendanceCreate,
    ExceptionSummary,
    LeaveCreate, LeaveResponse,
)

# ── ADMS receiver ─────────────────────────────────────────────────────────────
# Mounted at /iclock — no JWT auth. Device authenticates via serial number (SN)
# matched against the devices table. Unknown/inactive SNs are silently ignored.

adms_router = APIRouter(prefix="/iclock", tags=["adms"])


@adms_router.get("/cdata", response_class=PlainTextResponse)
async def device_register(
    SN: str = Query(..., description="Device serial number sent by the BioMax device"),
    options: Optional[str] = Query(None),
    pushver: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
):
    """
    Device boot registration and periodic heartbeat.
    Returns ADMS options string in plain text — wrong format = device stops pushing.
    ATTLOGStamp in the response tells the device to only resend logs we haven't seen.
    """
    async with get_connection() as conn:
        response_text = await service.handle_device_register(conn, SN)
    return PlainTextResponse(content=response_text)


@adms_router.post("/cdata", response_class=PlainTextResponse)
async def receive_punch_log(
    request: Request,
    SN: str = Query(..., description="Device serial number"),
    table: Optional[str] = Query(None, description="Log type — only ATTLOG is processed"),
):
    """
    Receives raw punch records from the BioMax device.
    Body is plain text: one ATTLOG line per punch, tab-separated.
    Returns 'OK: N' where N = records accepted. Device re-pushes if it
    doesn't receive this exact ack format.
    """
    if table and table.upper() != "ATTLOG":
        # OPERLOG, ATTPHOTO etc — acknowledge but don't store
        return PlainTextResponse(content="OK: 0")

    body = await request.body()
    body_text = body.decode("utf-8", errors="replace")

    async with get_connection() as conn:
        count = await service.handle_attlog(conn, SN, body_text)

    return PlainTextResponse(content=f"OK: {count}")


# ── Attendance read + processing endpoints ────────────────────────────────────
# Mounted at /attendance — standard JWT auth.

attendance_router = APIRouter(prefix="/attendance", tags=["attendance"])


@attendance_router.get(
    "/logs/{employee_id}",
    response_model=APIResponse[list[AttendanceLogResponse]],
)
async def get_employee_logs(
    employee_id: str,
    from_date: date = Query(...),
    to_date: date = Query(...),
    user: AuthUser = require_hr,
):
    """Raw punch logs for a single employee within a date range."""
    async with get_connection() as conn:
        data = await service.get_logs_by_employee(
            conn, user.org_id, employee_id,
            from_date.isoformat(), to_date.isoformat(),
        )
    return APIResponse(data=data)


@attendance_router.get(
    "/logs/unmatched",
    response_model=APIResponse[list[AttendanceLogResponse]],
)
async def get_unmatched_logs(
    from_date: date = Query(...),
    to_date: date = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AuthUser = require_hr,
):
    """
    Punches the device could not match to any enrolled employee.
    Use this to catch workers who punched but aren't in the system yet.
    """
    async with get_connection() as conn:
        data = await service.get_unmatched_logs(
            conn, user.org_id,
            from_date.isoformat(), to_date.isoformat(),
            page, page_size,
        )
    return APIResponse(data=data)


@attendance_router.get(
    "/daily/{employee_id}",
    response_model=APIResponse[list[AttendanceDailyResponse]],
)
async def get_employee_daily(
    employee_id: str,
    from_date: date = Query(...),
    to_date: date = Query(...),
    user: AuthUser = require_hr,
):
    """Processed daily attendance records for a single employee."""
    async with get_connection() as conn:
        data = await service.get_daily_by_employee(
            conn, user.org_id, employee_id,
            from_date.isoformat(), to_date.isoformat(),
        )
    return APIResponse(data=data)


# ── Phase 4: Processing engine ────────────────────────────────────────────────

@attendance_router.post(
    "/process",
    response_model=APIResponse[ProcessResponse],
)
async def process_attendance(
    body: ProcessRequest,
    user: AuthUser = require_hr,
):
    """
    Trigger the daily attendance processing engine for a date range.
    Converts raw attendance_logs into attendance_daily records.
    Manually overridden records are skipped (not re-processed).
    """
    async with get_connection() as conn:
        stats = await service.process_daily_attendance(
            conn, user.org_id, body.from_date, body.to_date,
        )
    return APIResponse(data=stats, message="Processing complete")


# ── Phase 4: Manual override ─────────────────────────────────────────────────

@attendance_router.post(
    "/manual",
    response_model=APIResponse[AttendanceDailyResponse],
    status_code=201,
)
async def create_manual_attendance(
    body: ManualAttendanceCreate,
    user: AuthUser = require_hr,
):
    """
    HR manually inserts or overwrites an attendance_daily record from scratch.
    This bypasses the engine and marks the record as is_manual_override=TRUE.
    """
    async with get_connection() as conn:
        data = await service.create_manual_attendance(
            conn, user.org_id, body, user.user_id,
        )
    return APIResponse(data=data, message="Manual attendance recorded")


@attendance_router.patch(
    "/daily/{daily_id}",
    response_model=APIResponse[AttendanceDailyResponse],
)
async def override_daily(
    daily_id: str,
    body: DailyOverrideRequest,
    user: AuthUser = require_hr,
):
    """
    HR manually corrects an attendance_daily record.
    Sets is_manual_override=TRUE, clears any exception flag.
    Future processing runs will skip this record.
    """
    async with get_connection() as conn:
        data = await service.override_daily(
            conn, user.org_id, daily_id, body, user.user_id,
        )
    return APIResponse(data=data, message="Record overridden")


# ── Phase 4: Exception resolve ───────────────────────────────────────────────

@attendance_router.patch(
    "/daily/{daily_id}/resolve",
    response_model=APIResponse[AttendanceDailyResponse],
)
async def resolve_exception(
    daily_id: str,
    user: AuthUser = require_hr,
):
    """
    Clear the exception flag on an attendance_daily record without changing data.
    Use when the flagged anomaly is acceptable (e.g. planned OT).
    """
    async with get_connection() as conn:
        data = await service.resolve_exception(conn, user.org_id, daily_id)
    return APIResponse(data=data, message="Exception resolved")


# ── Manual Attendance: Monthly grid ──────────────────────────────────────────

@attendance_router.get(
    "/daily/{employee_id}",
    response_model=APIResponse[list[AttendanceDailyResponse]],
)
async def get_daily_by_employee(
    employee_id: str,
    from_date: date = Query(...),
    to_date: date = Query(...),
    user: AuthUser = require_hr,
):
    """Get processed daily attendance records for a specific employee."""
    async with get_connection() as conn:
        data = await service.get_daily_by_employee(
            conn, user.org_id, employee_id, from_date.isoformat(), to_date.isoformat()
        )
    return APIResponse(data=data)


@attendance_router.get("/monthly-grid")
async def get_monthly_grid(
    year: int = Query(..., ge=2020),
    month: int = Query(..., ge=1, le=12),
    user: AuthUser = require_hr,
):
    """
    Returns all active employees + their attendance_daily rows for a given month.
    Used by the Monthly Grid View on the Manual Attendance page.
    Response: { employees: [...], stats: { total_present, total_absent, ... } }
    """
    async with get_connection() as conn:
        data = await service.get_monthly_grid(conn, user.org_id, year, month)
    return APIResponse(data=data)


# ── Phase 4: Exception list ──────────────────────────────────────────────────

@attendance_router.get(
    "/exceptions",
    response_model=APIResponse[ExceptionSummary],
)
async def get_exceptions(
    year: int = Query(..., ge=2020),
    month: int = Query(..., ge=1, le=12),
    user: AuthUser = require_hr,
):
    """
    Get all flagged attendance records for a month.
    Returns the count + full list. HR resolves these before payroll can run.
    The payroll_periods DB trigger blocks draft→processing until count = 0.
    """
    async with get_connection() as conn:
        data = await service.get_exceptions(conn, user.org_id, year, month)
    return APIResponse(data=data)


# ── Phase 4: Leave CRUD ──────────────────────────────────────────────────────

leave_router = APIRouter(prefix="/leave", tags=["leave"])


@leave_router.post("", response_model=APIResponse[LeaveResponse], status_code=201)
async def create_leave(
    body: LeaveCreate,
    user: AuthUser = require_hr,
):
    """Create a leave application record (no approval workflow)."""
    async with get_connection() as conn:
        data = await service.create_leave(conn, user.org_id, body, user.user_id)
    return APIResponse(data=data, message="Leave recorded")


@leave_router.get("", response_model=APIResponse[list[LeaveResponse]])
async def list_leaves(
    employee_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AuthUser = require_hr,
):
    """List leave applications. Optionally filter by employee_id."""
    async with get_connection() as conn:
        data = await service.list_leaves(
            conn, user.org_id, employee_id, page, page_size,
        )
    return APIResponse(data=data)


@leave_router.get("/{leave_id}", response_model=APIResponse[LeaveResponse])
async def get_leave(
    leave_id: str,
    user: AuthUser = require_hr,
):
    """Get a single leave application by ID."""
    async with get_connection() as conn:
        data = await service.get_leave(conn, user.org_id, leave_id)
    return APIResponse(data=data)

