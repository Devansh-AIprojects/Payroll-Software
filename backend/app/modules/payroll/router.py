from typing import Optional

from fastapi import APIRouter, Query

from app.auth.dependencies import require_hr, AuthUser
from app.core.responses import APIResponse, PaginatedResponse
from app.database import get_connection, get_transaction
from app.redis_client import get_redis
from app.modules.payroll import service
from app.modules.payroll.schemas import (
    PeriodCreate, PeriodResponse, PeriodStatusUpdate,
    DeductionCreate, DeductionResponse,
    PayrollRecordResponse, PayslipResponse,
    RunResponse,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])


# ── Period CRUD ───────────────────────────────────────────────────────────────

@router.post("/periods", response_model=APIResponse[PeriodResponse], status_code=201)
async def create_period(
    body: PeriodCreate,
    user: AuthUser = require_hr,
):
    """Create a new payroll period for a month/year."""
    async with get_connection() as conn:
        data = await service.create_period(conn, user.org_id, body.month, body.year)
    return APIResponse(data=data, message="Period created")


@router.get("/periods", response_model=APIResponse[list[PeriodResponse]])
async def list_periods(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: AuthUser = require_hr,
):
    """List all payroll periods for the org, newest first."""
    async with get_connection() as conn:
        data = await service.list_periods(conn, user.org_id, page, page_size)
    return APIResponse(data=data)


@router.get("/periods/{period_id}", response_model=APIResponse[PeriodResponse])
async def get_period(
    period_id: str,
    user: AuthUser = require_hr,
):
    """Get a single payroll period."""
    async with get_connection() as conn:
        data = await service.get_period(conn, user.org_id, period_id)
    return APIResponse(data=data)


# ── Status transition ────────────────────────────────────────────────────────

@router.patch(
    "/periods/{period_id}/status",
    response_model=APIResponse[PeriodResponse],
)
async def update_period_status(
    period_id: str,
    body: PeriodStatusUpdate,
    user: AuthUser = require_hr,
):
    """
    Advance a period's workflow status.
    Allowed transitions: draft→processing, processing→approved, approved→paid.
    The draft→processing transition triggers the DB-level attendance exception gate.
    """
    async with get_transaction() as conn:
        data = await service.update_period_status(
            conn, user.org_id, period_id, body.status, user.user_id,
        )
    return APIResponse(data=data, message=f"Status updated to '{body.status}'")


# ── Payroll engine run ────────────────────────────────────────────────────────

@router.post(
    "/periods/{period_id}/run",
    response_model=APIResponse[RunResponse],
)
async def run_payroll(
    period_id: str,
    user: AuthUser = require_hr,
):
    """
    Run the payroll engine for a period.
    Validates attendance exceptions are resolved, acquires a Redis lock,
    calculates gross/components/net for every active employee, and UPSERTs records.
    Re-running is idempotent — manual deductions already entered are preserved.
    """
    redis = await get_redis()
    async with get_transaction() as conn:
        data = await service.run_payroll(conn, redis, user.org_id, period_id)
    return APIResponse(data=data, message="Payroll run complete")


# ── Record listing ────────────────────────────────────────────────────────────

@router.get(
    "/periods/{period_id}/records",
    response_model=PaginatedResponse[PayrollRecordResponse],
)
async def list_records(
    period_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    category_id: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    user: AuthUser = require_hr,
):
    """List all payroll records for a period. Optionally filter by category or department."""
    async with get_connection() as conn:
        data, total = await service.list_records(
            conn, user.org_id, period_id,
            page, page_size, category_id, department_id,
        )
    return PaginatedResponse(
        data=data, total=total,
        page=page, page_size=page_size,
        has_next=(page * page_size < total),
    )


# ── Payslip (single employee) ────────────────────────────────────────────────

@router.get(
    "/periods/{period_id}/records/{employee_id}",
    response_model=APIResponse[PayslipResponse],
)
async def get_payslip(
    period_id: str,
    employee_id: str,
    user: AuthUser = require_hr,
):
    """Full payslip for one employee: record + component breakdown + deductions."""
    async with get_connection() as conn:
        data = await service.get_payslip(conn, user.org_id, period_id, employee_id)
    return APIResponse(data=data)


# ── Manual deductions ────────────────────────────────────────────────────────

@router.post(
    "/periods/{period_id}/records/{employee_id}/deductions",
    response_model=APIResponse[DeductionResponse],
    status_code=201,
)
async def add_deduction(
    period_id: str,
    employee_id: str,
    body: DeductionCreate,
    user: AuthUser = require_hr,
):
    """
    Add a manual deduction (advance, gift, custom) for an employee.
    Period must be draft or processing. Automatically recalculates net_pay.
    """
    async with get_transaction() as conn:
        data = await service.add_deduction(
            conn, user.org_id, period_id, employee_id,
            body.type, body.label, body.amount, user.user_id,
        )
    return APIResponse(data=data, message="Deduction added")


@router.delete(
    "/periods/{period_id}/deductions/{deduction_id}",
    response_model=APIResponse[dict],
)
async def delete_deduction(
    period_id: str,
    deduction_id: str,
    user: AuthUser = require_hr,
):
    """
    Remove a manual deduction. Period must be draft or processing.
    Automatically recalculates net_pay.
    """
    async with get_transaction() as conn:
        await service.delete_deduction(conn, user.org_id, deduction_id, period_id)
    return APIResponse(data={}, message="Deduction removed")
