from fastapi import APIRouter, Query
from typing import Optional

from app.auth.dependencies import require_hr, require_admin, AuthUser
from app.database import get_connection
from app.core.responses import APIResponse
from app.modules.config import service
from app.modules.config.schemas import (
    ShiftCreate, ShiftUpdate, ShiftResponse,
    CategoryCreate, CategoryResponse,
    SubCategoryCreate, SubCategoryResponse,
    DepartmentCreate, DepartmentResponse,
    SalaryComponentCreate, SalaryComponentUpdate, SalaryComponentResponse,
    LabourTierRatesUpsert, LabourTierRateResponse,
)

router = APIRouter(prefix="/config", tags=["config"])


# ── Shifts ───────────────────────────────────────────────────────────────────

@router.get("/shifts", response_model=APIResponse[list[ShiftResponse]])
async def list_shifts(user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.list_shifts(conn, user.org_id)
    return APIResponse(data=data)


@router.post("/shifts", response_model=APIResponse[ShiftResponse], status_code=201)
async def create_shift(body: ShiftCreate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.create_shift(conn, user.org_id, body)
    return APIResponse(data=data, message="Shift created")


@router.patch("/shifts/{shift_id}", response_model=APIResponse[ShiftResponse])
async def update_shift(shift_id: str, body: ShiftUpdate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.update_shift(conn, user.org_id, shift_id, body)
    return APIResponse(data=data)


# ── Categories ───────────────────────────────────────────────────────────────

@router.get("/categories", response_model=APIResponse[list[CategoryResponse]])
async def list_categories(user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.list_categories(conn, user.org_id)
    return APIResponse(data=data)


@router.post("/categories", response_model=APIResponse[CategoryResponse], status_code=201)
async def create_category(body: CategoryCreate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.create_category(conn, user.org_id, body)
    return APIResponse(data=data, message="Category created")


# ── Sub-categories ────────────────────────────────────────────────────────────

@router.get("/sub-categories", response_model=APIResponse[list[SubCategoryResponse]])
async def list_sub_categories(
    category_id: Optional[str] = Query(None),
    user: AuthUser = require_hr,
):
    async with get_connection() as conn:
        data = await service.list_sub_categories(conn, user.org_id, category_id)
    return APIResponse(data=data)


@router.post(
    "/categories/{category_id}/sub-categories",
    response_model=APIResponse[SubCategoryResponse],
    status_code=201,
)
async def create_sub_category(
    category_id: str, body: SubCategoryCreate, user: AuthUser = require_admin
):
    async with get_connection() as conn:
        data = await service.create_sub_category(conn, user.org_id, category_id, body)
    return APIResponse(data=data, message="Sub-category created")


# ── Departments ───────────────────────────────────────────────────────────────

@router.get("/departments", response_model=APIResponse[list[DepartmentResponse]])
async def list_departments(
    category_id: Optional[str] = Query(None),
    user: AuthUser = require_hr,
):
    async with get_connection() as conn:
        data = await service.list_departments(conn, user.org_id, category_id)
    return APIResponse(data=data)


@router.post("/departments", response_model=APIResponse[DepartmentResponse], status_code=201)
async def create_department(body: DepartmentCreate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.create_department(conn, user.org_id, body)
    return APIResponse(data=data, message="Department created")


# ── Salary Components ─────────────────────────────────────────────────────────

@router.get(
    "/salary-components",
    response_model=APIResponse[list[SalaryComponentResponse]],
)
async def list_salary_components(user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.list_salary_components(conn, user.org_id)
    return APIResponse(data=data)


@router.post(
    "/salary-components",
    response_model=APIResponse[SalaryComponentResponse],
    status_code=201,
)
async def create_salary_component(
    body: SalaryComponentCreate, user: AuthUser = require_admin
):
    async with get_connection() as conn:
        data = await service.create_salary_component(conn, user.org_id, body)
    return APIResponse(data=data, message="Component created")


@router.patch(
    "/salary-components/{component_id}",
    response_model=APIResponse[SalaryComponentResponse],
)
async def update_salary_component(
    component_id: str, body: SalaryComponentUpdate, user: AuthUser = require_admin
):
    async with get_connection() as conn:
        data = await service.update_salary_component(
            conn, user.org_id, component_id, body
        )
    return APIResponse(data=data)


# ── Labour Tier Rates ─────────────────────────────────────────────────────────

@router.get(
    "/labour-tier-rates",
    response_model=APIResponse[list[LabourTierRateResponse]],
)
async def list_tier_rates(
    department_id: Optional[str] = Query(None),
    user: AuthUser = require_hr,
):
    async with get_connection() as conn:
        data = await service.list_tier_rates(conn, user.org_id, department_id)
    return APIResponse(data=data)


@router.put(
    "/labour-tier-rates/{department_id}",
    response_model=APIResponse[list[LabourTierRateResponse]],
)
async def upsert_tier_rates(
    department_id: str, body: LabourTierRatesUpsert, user: AuthUser = require_admin
):
    async with get_connection() as conn:
        data = await service.upsert_tier_rates(conn, user.org_id, department_id, body)
    return APIResponse(data=data, message="Tier rates updated")
