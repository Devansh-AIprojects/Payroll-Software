from fastapi import APIRouter, Query
from typing import Optional

from app.auth.dependencies import require_hr, require_admin, AuthUser
from app.core.responses import APIResponse, PaginatedResponse
from app.database import get_connection
from app.modules.employees import service
from app.modules.employees.schemas import (
    EmployeeCreate, EmployeeUpdate,
    EmployeeResponse, EmployeeListItem,
    FingerprintCreate, FingerprintUpdate, FingerprintResponse,
)

router = APIRouter(prefix="/employees", tags=["employees"])


# ── Employee routes ───────────────────────────────────────────────────────────

@router.get("", response_model=PaginatedResponse[EmployeeListItem])
async def list_employees(
    is_active: Optional[bool] = Query(None),
    category_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: AuthUser = require_hr,
):
    async with get_connection() as conn:
        employees, total = await service.list_employees(
            conn, user.org_id, is_active, category_id, page, page_size
        )
    return PaginatedResponse(
        data=employees,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
    )


@router.post("", response_model=APIResponse[EmployeeResponse], status_code=201)
async def create_employee(body: EmployeeCreate, user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.create_employee(conn, user.org_id, body)
    return APIResponse(data=data, message="Employee created")


@router.get("/{employee_id}", response_model=APIResponse[EmployeeResponse])
async def get_employee(employee_id: str, user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.get_employee(conn, user.org_id, employee_id)
    return APIResponse(data=data)


@router.patch("/{employee_id}", response_model=APIResponse[EmployeeResponse])
async def update_employee(
    employee_id: str, body: EmployeeUpdate, user: AuthUser = require_hr
):
    async with get_connection() as conn:
        data = await service.update_employee(conn, user.org_id, employee_id, body)
    return APIResponse(data=data)


@router.delete("/{employee_id}", response_model=APIResponse[EmployeeResponse])
async def deactivate_employee(employee_id: str, user: AuthUser = require_admin):
    """Soft delete — sets is_active = FALSE. Data is preserved."""
    async with get_connection() as conn:
        data = await service.deactivate_employee(conn, user.org_id, employee_id)
    return APIResponse(data=data, message="Employee deactivated")


# ── Fingerprint routes ────────────────────────────────────────────────────────

@router.get(
    "/{employee_id}/fingerprints",
    response_model=APIResponse[list[FingerprintResponse]],
)
async def list_fingerprints(employee_id: str, user: AuthUser = require_hr):
    """List all fingerprint rows for an employee (active + inactive). Metadata only."""
    async with get_connection() as conn:
        data = await service.list_fingerprints(conn, user.org_id, employee_id)
    return APIResponse(data=data)


@router.post(
    "/{employee_id}/fingerprints",
    response_model=APIResponse[FingerprintResponse],
    status_code=201,
)
async def enroll_fingerprint(
    employee_id: str, body: FingerprintCreate, user: AuthUser = require_hr
):
    """Enroll a new finger. One call per finger_index.
    Returns 409 if the finger_index already exists — use PATCH to re-enroll.
    """
    async with get_connection() as conn:
        data = await service.enroll_fingerprint(
            conn, user.org_id, employee_id, body, user.user_id
        )
    return APIResponse(data=data, message="Fingerprint enrolled")


@router.patch(
    "/{employee_id}/fingerprints/{fp_id}",
    response_model=APIResponse[FingerprintResponse],
)
async def reenroll_fingerprint(
    employee_id: str, fp_id: str, body: FingerprintUpdate, user: AuthUser = require_hr
):
    """Replace the encrypted template for an existing fingerprint row.
    Resets enrolled_at / enrolled_by. Reactivates the row if it was deactivated.
    """
    async with get_connection() as conn:
        data = await service.reenroll_fingerprint(
            conn, user.org_id, employee_id, fp_id, body, user.user_id
        )
    return APIResponse(data=data, message="Fingerprint re-enrolled")


@router.delete(
    "/{employee_id}/fingerprints/{fp_id}",
    response_model=APIResponse[FingerprintResponse],
)
async def deactivate_fingerprint(
    employee_id: str, fp_id: str, user: AuthUser = require_admin
):
    """Soft delete — sets is_active = FALSE. Row and audit trail are preserved."""
    async with get_connection() as conn:
        data = await service.deactivate_fingerprint(
            conn, user.org_id, employee_id, fp_id
        )
    return APIResponse(data=data, message="Fingerprint deactivated")
