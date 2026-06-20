from asyncpg import UniqueViolationError, ForeignKeyViolationError
from asyncpg import Connection

from app.core.exceptions import NotFoundError, ConflictError, BadRequestError
from app.modules.config import queries as q
from app.modules.config.schemas import (
    ShiftCreate, ShiftUpdate,
    CategoryCreate,
    SubCategoryCreate,
    DepartmentCreate,
    SalaryComponentCreate, SalaryComponentUpdate,
    LabourTierRatesUpsert,
)


# ── Shifts ───────────────────────────────────────────────────────────────────

async def list_shifts(conn: Connection, org_id: str) -> list[dict]:
    rows = await conn.fetch(q.SHIFT_LIST, org_id)
    return [dict(r) for r in rows]


async def get_shift(conn: Connection, org_id: str, shift_id: str) -> dict:
    row = await conn.fetchrow(q.SHIFT_GET, shift_id, org_id)
    if not row:
        raise NotFoundError("Shift", shift_id)
    return dict(row)


async def create_shift(conn: Connection, org_id: str, data: ShiftCreate) -> dict:
    try:
        row = await conn.fetchrow(
            q.SHIFT_INSERT,
            org_id, data.name, data.start_time, data.end_time,
            data.duration_hours, data.standard_hours, data.crosses_midnight,
        )
        return dict(row)
    except UniqueViolationError:
        raise ConflictError(f"Shift '{data.name}' already exists")


async def update_shift(
    conn: Connection, org_id: str, shift_id: str, data: ShiftUpdate
) -> dict:
    row = await conn.fetchrow(
        q.SHIFT_UPDATE,
        shift_id, org_id,
        data.name, data.start_time, data.end_time,
        data.duration_hours, data.standard_hours,
        data.crosses_midnight, data.is_active,
    )
    if not row:
        raise NotFoundError("Shift", shift_id)
    return dict(row)


# ── Categories ───────────────────────────────────────────────────────────────

async def list_categories(conn: Connection, org_id: str) -> list[dict]:
    rows = await conn.fetch(q.CATEGORY_LIST, org_id)
    return [dict(r) for r in rows]


async def create_category(conn: Connection, org_id: str, data: CategoryCreate) -> dict:
    try:
        row = await conn.fetchrow(q.CATEGORY_INSERT, org_id, data.name, data.pay_type)
        return dict(row)
    except UniqueViolationError:
        raise ConflictError(f"Category '{data.name}' already exists")


# ── Sub-categories ────────────────────────────────────────────────────────────

async def list_sub_categories(
    conn: Connection, org_id: str, category_id: str | None = None
) -> list[dict]:
    if category_id:
        rows = await conn.fetch(q.SUBCATEGORY_LIST_BY_CATEGORY, org_id, category_id)
    else:
        rows = await conn.fetch(q.SUBCATEGORY_LIST, org_id)
    return [dict(r) for r in rows]


async def create_sub_category(
    conn: Connection, org_id: str, category_id: str, data: SubCategoryCreate
) -> dict:
    # Validate: daily_flat must have flat_daily_rate
    if data.salary_type == "daily_flat" and not data.flat_daily_rate:
        raise BadRequestError("flat_daily_rate is required for salary_type 'daily_flat'")

    # Validate category belongs to org
    cat = await conn.fetchrow(q.CATEGORY_GET, category_id, org_id)
    if not cat:
        raise NotFoundError("Category", category_id)

    try:
        row = await conn.fetchrow(
            q.SUBCATEGORY_INSERT,
            category_id, org_id, data.name, data.salary_type,
            data.flat_daily_rate, data.has_epf, data.has_components,
        )
        return dict(row)
    except UniqueViolationError:
        raise ConflictError(
            f"Sub-category '{data.name}' already exists under this category"
        )


# ── Departments ───────────────────────────────────────────────────────────────

async def list_departments(
    conn: Connection, org_id: str, category_id: str | None = None
) -> list[dict]:
    if category_id:
        rows = await conn.fetch(q.DEPARTMENT_LIST_BY_CATEGORY, org_id, category_id)
    else:
        rows = await conn.fetch(q.DEPARTMENT_LIST, org_id)
    return [dict(r) for r in rows]


async def create_department(
    conn: Connection, org_id: str, data: DepartmentCreate
) -> dict:
    # If category_id provided, verify it belongs to this org
    if data.category_id:
        cat = await conn.fetchrow(q.CATEGORY_GET, data.category_id, org_id)
        if not cat:
            raise NotFoundError("Category", data.category_id)

    try:
        row = await conn.fetchrow(
            q.DEPARTMENT_INSERT, org_id, data.category_id, data.name
        )
        return dict(row)
    except UniqueViolationError:
        raise ConflictError(
            f"Department '{data.name}' already exists under this category"
        )


# ── Salary Components ─────────────────────────────────────────────────────────

async def list_salary_components(conn: Connection, org_id: str) -> list[dict]:
    rows = await conn.fetch(q.SALARY_COMPONENT_LIST, org_id)
    return [dict(r) for r in rows]


async def create_salary_component(
    conn: Connection, org_id: str, data: SalaryComponentCreate
) -> dict:
    if data.formula_type == "percent_of_component" and not data.ref_component_id:
        raise BadRequestError(
            "ref_component_id is required when formula_type is 'percent_of_component'"
        )

    try:
        row = await conn.fetchrow(
            q.SALARY_COMPONENT_INSERT,
            org_id, data.name, data.type, data.formula_type,
            data.formula_value, data.ref_component_id,
            data.calculation_order, data.is_displayed,
        )
        # Re-fetch with JOIN for ref_component_name
        return await _get_component(conn, org_id, str(row["id"]))
    except UniqueViolationError:
        raise ConflictError(f"Component '{data.name}' already exists")
    except ForeignKeyViolationError:
        raise BadRequestError("ref_component_id does not exist")


async def update_salary_component(
    conn: Connection, org_id: str, component_id: str, data: SalaryComponentUpdate
) -> dict:
    row = await conn.fetchrow(
        q.SALARY_COMPONENT_UPDATE,
        component_id, org_id,
        data.name, data.formula_type, data.formula_value,
        data.ref_component_id, data.calculation_order,
        data.is_displayed, data.is_active,
    )
    if not row:
        raise NotFoundError("Salary component", component_id)
    return await _get_component(conn, org_id, component_id)


async def _get_component(conn: Connection, org_id: str, component_id: str) -> dict:
    row = await conn.fetchrow(q.SALARY_COMPONENT_GET, component_id, org_id)
    if not row:
        raise NotFoundError("Salary component", component_id)
    return dict(row)


# ── Labour Tier Rates ─────────────────────────────────────────────────────────

async def list_tier_rates(
    conn: Connection, org_id: str, department_id: str | None = None
) -> list[dict]:
    if department_id:
        rows = await conn.fetch(q.TIER_RATE_LIST_BY_DEPT, org_id, department_id)
    else:
        rows = await conn.fetch(q.TIER_RATE_LIST, org_id)
    return [dict(r) for r in rows]


async def upsert_tier_rates(
    conn: Connection, org_id: str, department_id: str, data: LabourTierRatesUpsert
) -> list[dict]:
    # Validate tiers are exactly 1, 2, 3 in any order
    tiers = sorted(t.tier for t in data.tiers)
    if tiers != [1, 2, 3]:
        raise BadRequestError("Exactly 3 tiers (1, 2, 3) must be provided")

    # Validate department belongs to org
    dept = await conn.fetchrow(q.DEPARTMENT_GET, department_id, org_id)
    if not dept:
        raise NotFoundError("Department", department_id)

    async with conn.transaction():
        # Delete existing tiers for this department
        await conn.execute(q.TIER_RATE_DELETE_BY_DEPT, org_id, department_id)

        # Insert all 3 tiers
        rows = []
        for tier in data.tiers:
            row = await conn.fetchrow(
                q.TIER_RATE_INSERT,
                org_id, department_id, tier.tier,
                tier.min_days, tier.max_days, tier.daily_rate,
            )
            rows.append({**dict(row), "department_name": dept["name"]})

    return sorted(rows, key=lambda r: r["tier"])
