import logging
from decimal import Decimal

from asyncpg import Connection, UniqueViolationError
import redis.asyncio as aioredis

from app.core.exceptions import NotFoundError, ConflictError, BadRequestError
from app.redis_client import key_payroll_lock, TTL_PAYROLL_LOCK
from app.modules.payroll import queries as q
from app.modules.payroll.engine import (
    calc_path_a_tier,
    calc_path_b_daily_flat,
    calc_path_c_monthly,
    apply_components,
)

logger = logging.getLogger(__name__)


# ── Period CRUD ───────────────────────────────────────────────────────────────

async def create_period(
    conn: Connection,
    org_id: str,
    month: int,
    year: int,
) -> dict:
    """Create a new payroll period. Raises ConflictError on duplicate."""
    try:
        row = await conn.fetchrow(q.PERIOD_INSERT, org_id, month, year)
    except UniqueViolationError:
        raise ConflictError(f"Payroll period for {month}/{year} already exists")
    return dict(row)


async def get_period(conn: Connection, org_id: str, period_id: str) -> dict:
    row = await conn.fetchrow(q.PERIOD_GET, period_id, org_id)
    if not row:
        raise NotFoundError("Payroll period", period_id)
    return dict(row)


async def list_periods(
    conn: Connection,
    org_id: str,
    page: int = 1,
    page_size: int = 20,
) -> list[dict]:
    offset = (page - 1) * page_size
    rows = await conn.fetch(q.PERIOD_LIST, org_id, page_size, offset)
    return [dict(r) for r in rows]


# ── Status transitions ───────────────────────────────────────────────────────

# Allowed transitions: draft→processing, processing→approved, approved→paid
_VALID_TRANSITIONS = {
    ("draft", "processing"),
    ("processing", "approved"),
    ("approved", "paid"),
}


async def update_period_status(
    conn: Connection,
    org_id: str,
    period_id: str,
    new_status: str,
    user_id: str | None = None,
) -> dict:
    """
    Advance a period's workflow status.
    - draft→processing: DB trigger enforces zero attendance exceptions.
    - processing→approved: sets approved_at and approved_by.
    - approved→paid: sets paid_at.
    """
    period = await get_period(conn, org_id, period_id)
    current_status = period["status"]

    if (current_status, new_status) not in _VALID_TRANSITIONS:
        raise BadRequestError(
            f"Cannot transition from '{current_status}' to '{new_status}'. "
            f"Allowed: {', '.join(f'{a}→{b}' for a, b in _VALID_TRANSITIONS)}"
        )

    if new_status == "approved":
        row = await conn.fetchrow(q.PERIOD_SET_APPROVED, period_id, org_id, user_id)
    elif new_status == "paid":
        row = await conn.fetchrow(q.PERIOD_SET_PAID, period_id, org_id)
    else:
        # draft → processing
        row = await conn.fetchrow(q.PERIOD_STATUS_UPDATE, period_id, org_id, new_status)

    if not row:
        raise BadRequestError(f"Status update to '{new_status}' failed — precondition not met")

    return dict(row)


# ── Payroll engine run ────────────────────────────────────────────────────────

async def run_payroll(
    conn: Connection,
    redis: aioredis.Redis,
    org_id: str,
    period_id: str,
) -> dict:
    """
    Execute the payroll engine for a period.

    1. Validate period status (must be draft or processing).
    2. Check unresolved attendance exceptions → 400 if any.
    3. Acquire Redis lock → 409 if already running.
    4. Transition period to 'processing' if still 'draft'.
    5. For each active employee: calculate gross, apply components, UPSERT record.
    6. Release Redis lock.
    7. Return run summary.
    """
    # 1. Load period
    period = await get_period(conn, org_id, period_id)
    if period["status"] not in ("draft", "processing"):
        raise BadRequestError(
            f"Cannot run payroll on a period with status '{period['status']}'. "
            "Period must be in 'draft' or 'processing' status."
        )

    month = period["month"]
    year = period["year"]

    # 2. Check unresolved attendance exceptions
    exc_row = await conn.fetchrow(q.EXCEPTIONS_UNRESOLVED_COUNT, org_id, month, year)
    exc_count = exc_row["count"] if exc_row else 0
    if exc_count > 0:
        raise BadRequestError(
            f"{exc_count} unresolved attendance exception(s) for {month}/{year}. "
            "Resolve all flagged attendance records before running payroll."
        )

    # 3. Acquire Redis lock
    lock_key = key_payroll_lock(period_id)
    lock_acquired = await redis.set(
        lock_key, b"1", nx=True, ex=TTL_PAYROLL_LOCK,
    )
    if not lock_acquired:
        raise ConflictError("Payroll run already in progress for this period")

    try:
        # 4. Transition to processing if draft
        if period["status"] == "draft":
            await conn.execute(q.PERIOD_STATUS_UPDATE, period_id, org_id, "processing")

        # 5. Fetch all active employees
        employees = await conn.fetch(q.PAYROLL_ENGINE_EMPLOYEES, org_id)

        # Fetch salary components once (shared across all employees)
        components = [dict(r) for r in await conn.fetch(q.SALARY_COMPONENTS_LIST, org_id)]

        stats = {
            "period_id": period_id,
            "employees_processed": len(employees),
            "records_written": 0,
            "errors": [],
        }

        for emp in employees:
            try:
                await _process_single_employee(
                    conn, org_id, period_id, month, year, emp, components,
                )
                stats["records_written"] += 1
            except Exception as exc:
                emp_label = f"{emp['employee_code']} ({emp['name']})"
                logger.error("Payroll error for %s: %s", emp_label, exc, exc_info=True)
                stats["errors"].append(f"{emp_label}: {str(exc)}")

        logger.info(
            "Payroll run complete for org=%s period=%s: %d employees, %d records, %d errors",
            org_id, period_id, stats["employees_processed"],
            stats["records_written"], len(stats["errors"]),
        )

    finally:
        # 6. Release Redis lock
        await redis.delete(lock_key)

    return stats


async def _process_single_employee(
    conn: Connection,
    org_id: str,
    period_id: str,
    month: int,
    year: int,
    emp: dict,
    components: list[dict],
) -> None:
    """Process payroll for a single employee. Called within the run_payroll loop."""
    emp_id = str(emp["id"])
    salary_type = emp["salary_type"]
    has_components = emp["has_components"]
    epf_enrolled = emp["epf_enrolled"]
    payment_mode = emp["payment_mode"]

    # Fetch attendance summary
    att_row = await conn.fetchrow(
        q.PAYROLL_ATTENDANCE_SUMMARY, org_id, emp_id, year, month,
    )
    days_present = Decimal(str(att_row["days_present"]))
    ot_hours = Decimal(str(att_row["ot_hours"]))
    undertime_hours = Decimal(str(att_row["undertime_hours"]))

    # Jobber allowance
    jobber_allowance_per_day = Decimal("0")
    if emp.get("jobber_type") == "lc":
        jobber_allowance_per_day = Decimal("30")
    elif emp.get("jobber_type") == "pp":
        jobber_allowance_per_day = Decimal("30")
    elif emp.get("jobber_type") == "rf":
        jobber_allowance_per_day = Decimal("40")
        
    total_jobber_allowance = jobber_allowance_per_day * days_present

    # Calculate gross based on salary path
    tier_applied = None
    daily_rate_applied = None

    if salary_type == "tier":
        # Path A — Labour Skilled
        days_int = int(days_present)  # Tier lookup uses integer days
        tier_row = await conn.fetchrow(
            q.PAYROLL_TIER_RATE, org_id, str(emp["department_id"]), days_int,
        )
        if not tier_row:
            raise BadRequestError(
                f"No tier rate found for department with {days_int} days present"
            )
        base_tier_rate = Decimal(str(tier_row["daily_rate"]))  # bare rate, jobber excluded
        daily_rate = base_tier_rate + jobber_allowance_per_day
        tier_applied = tier_row["tier"]
        daily_rate_applied = float(daily_rate)
        # OT/undertime valued on the bare tier rate per shift hour (jobber excluded)
        standard_hours = Decimal(str(emp["standard_hours"]))
        gross = calc_path_a_tier(
            days_present, daily_rate, base_tier_rate,
            ot_hours, undertime_hours, standard_hours,
        )

    elif salary_type == "daily_flat":
        # Path B — Trainee
        flat_rate = Decimal(str(emp["flat_daily_rate"])) + jobber_allowance_per_day
        daily_rate_applied = float(flat_rate)
        gross = calc_path_b_daily_flat(days_present, flat_rate)
        ot_hours = Decimal("0")
        undertime_hours = Decimal("0")

    elif salary_type == "monthly":
        # Path C — Maintenance / Staff
        # Use per_day_salary if set; otherwise fall back to monthly_salary / 26
        from app.modules.payroll.engine import MONTHLY_DIVISOR
        raw_per_day = emp["per_day_salary"]
        if raw_per_day is not None:
            per_day_salary = Decimal(str(raw_per_day))
        else:
            raw_monthly = emp["monthly_salary"]
            if raw_monthly is None:
                raise BadRequestError(
                    f"Employee {emp['employee_code']} has no per_day_salary or monthly_salary set. "
                    "Please set a per-day salary before running payroll."
                )
            per_day_salary = Decimal(str(raw_monthly)) / MONTHLY_DIVISOR
            
        per_day_salary += jobber_allowance_per_day
        standard_hours = Decimal(str(emp["standard_hours"]))
        gross = calc_path_c_monthly(
            per_day_salary, days_present, ot_hours, undertime_hours, standard_hours,
        )
        daily_rate_applied = float(per_day_salary)

    else:
        raise BadRequestError(f"Unknown salary_type '{salary_type}'")

    # Apply salary components (if applicable)
    component_rows = []
    component_deductions = Decimal("0")
    if has_components:
        component_rows, component_deductions = apply_components(
            gross, components, epf_enrolled,
        )

    # UPSERT payroll record (initial: total_deductions = component deductions only,
    # manual deductions are added on top after the upsert)
    record_row = await conn.fetchrow(
        q.PAYROLL_RECORD_UPSERT,
        period_id, org_id, emp_id,
        float(days_present), tier_applied, daily_rate_applied,
        float(ot_hours), float(undertime_hours),
        float(gross), float(total_jobber_allowance), float(component_deductions),
        float(gross - component_deductions),  # tentative net_pay
        payment_mode,
    )
    record_id = str(record_row["id"])

    # Delete old component values and insert fresh ones (idempotent re-run)
    await conn.execute(q.COMPONENT_VALUES_DELETE, record_id)
    for cr in component_rows:
        await conn.fetchrow(
            q.COMPONENT_VALUES_INSERT,
            record_id,
            cr["component_id"],
            cr["component_name"],
            cr["component_type"],
            cr["is_displayed"],
            float(cr["value"]),
        )

    # Recalculate total_deductions with existing manual deductions (preserved across re-runs)
    manual_sum_row = await conn.fetchrow(q.DEDUCTION_SUM, record_id)
    manual_deductions = Decimal(str(manual_sum_row["total"]))
    total_deductions = component_deductions + manual_deductions
    net_pay = gross - total_deductions

    await conn.execute(
        q.PAYROLL_RECORD_UPDATE_TOTALS,
        record_id, org_id, float(total_deductions), float(net_pay),
    )


# ── Deduction management ─────────────────────────────────────────────────────

async def add_deduction(
    conn: Connection,
    org_id: str,
    period_id: str,
    employee_id: str,
    deduction_type: str,
    label: str,
    amount: Decimal,
    created_by: str,
) -> dict:
    """
    Add a manual deduction for an employee in a period.
    Period must be in 'draft' or 'processing' status.
    After insert, recalculates total_deductions and net_pay on the record.
    """
    period = await get_period(conn, org_id, period_id)
    if period["status"] not in ("draft", "processing"):
        raise BadRequestError(
            f"Cannot add deductions to a period with status '{period['status']}'"
        )

    # Find the payroll record for this employee
    record_row = await conn.fetchrow(
        q.PAYROLL_RECORD_BY_EMPLOYEE, period_id, employee_id, org_id,
    )
    if not record_row:
        raise NotFoundError(
            "Payroll record",
            f"employee {employee_id} in period {period_id}",
        )
    record_id = str(record_row["id"])

    # Insert deduction
    ded_row = await conn.fetchrow(
        q.DEDUCTION_INSERT,
        record_id, org_id, employee_id,
        deduction_type, label, float(amount), created_by,
    )

    # Recalculate totals on the record
    await _recalculate_record_totals(conn, org_id, record_id, record_row)

    return dict(ded_row)


async def delete_deduction(
    conn: Connection,
    org_id: str,
    deduction_id: str,
    period_id: str,
) -> None:
    """
    Delete a manual deduction. Period must be draft or processing.
    After delete, recalculates total_deductions and net_pay on the record.
    """
    period = await get_period(conn, org_id, period_id)
    if period["status"] not in ("draft", "processing"):
        raise BadRequestError(
            f"Cannot remove deductions from a period with status '{period['status']}'"
        )

    ded_row = await conn.fetchrow(q.DEDUCTION_GET, deduction_id, org_id)
    if not ded_row:
        raise NotFoundError("Deduction", deduction_id)

    record_id = str(ded_row["payroll_record_id"])

    # Delete the deduction
    await conn.execute(q.DEDUCTION_DELETE, deduction_id, org_id)

    # Fetch the record to recalculate
    record_row = await conn.fetchrow(q.PAYROLL_RECORD_GET, record_id, org_id)
    if record_row:
        await _recalculate_record_totals(conn, org_id, record_id, record_row)


async def _recalculate_record_totals(
    conn: Connection,
    org_id: str,
    record_id: str,
    record_row: dict,
) -> None:
    """Recalculate total_deductions and net_pay after deduction changes."""
    gross = Decimal(str(record_row["gross"]))

    # Sum component deductions
    comp_rows = await conn.fetch(q.COMPONENT_VALUES_BY_RECORD, record_id)
    component_deductions = Decimal("0")
    for cr in comp_rows:
        if cr["component_type"] == "deduction":
            component_deductions += Decimal(str(cr["value"]))

    # Sum manual deductions
    manual_sum_row = await conn.fetchrow(q.DEDUCTION_SUM, record_id)
    manual_deductions = Decimal(str(manual_sum_row["total"]))

    total_deductions = component_deductions + manual_deductions
    net_pay = gross - total_deductions

    await conn.execute(
        q.PAYROLL_RECORD_UPDATE_TOTALS,
        record_id, org_id, float(total_deductions), float(net_pay),
    )


# ── Payslip ──────────────────────────────────────────────────────────────────

async def get_payslip(
    conn: Connection,
    org_id: str,
    period_id: str,
    employee_id: str,
) -> dict:
    """
    Full payslip for one employee in a period.
    Returns the payroll record + component breakdown + deductions list.
    """
    record_row = await conn.fetchrow(
        q.PAYROLL_RECORD_BY_EMPLOYEE, period_id, employee_id, org_id,
    )
    if not record_row:
        raise NotFoundError(
            "Payroll record",
            f"employee {employee_id} in period {period_id}",
        )

    record_id = str(record_row["id"])
    record = dict(record_row)

    # Components
    comp_rows = await conn.fetch(q.COMPONENT_VALUES_BY_RECORD, record_id)
    components = [dict(r) for r in comp_rows]

    # Deductions
    ded_rows = await conn.fetch(q.DEDUCTION_LIST, record_id)
    deductions = [dict(r) for r in ded_rows]

    return {
        "record": record,
        "components": components,
        "deductions": deductions,
    }


# ── Salary sheet ─────────────────────────────────────────────────────────────

async def get_salary_sheet(
    conn: Connection,
    org_id: str,
    period_id: str,
) -> list[dict]:
    """
    Returns one row per employee for the salary sheet view.
    Components (Basic, DA, T Basic, Allowances, EPF) are fetched in a single
    query and pivoted in Python — no per-employee round trips.
    """
    await get_period(conn, org_id, period_id)

    rows = await conn.fetch(q.PAYROLL_SHEET_RECORDS, period_id, org_id)
    comp_rows = await conn.fetch(q.PAYROLL_SHEET_COMPONENTS, period_id, org_id)

    # Pivot: record_id → { component_name: value }
    comps_by_record: dict[str, dict] = {}
    for cr in comp_rows:
        rid = str(cr["payroll_record_id"])
        comps_by_record.setdefault(rid, {})[cr["component_name"]] = float(cr["value"])

    result = []
    for i, row in enumerate(rows, 1):
        rid = str(row["payroll_record_id"])
        comps = comps_by_record.get(rid, {})
        salary_type = row["salary_type"]

        if salary_type == "monthly":
            monthly_salary = float(row["monthly_salary"]) if row["monthly_salary"] is not None else None
            # Use the rate the engine actually paid — already stored as daily_rate_applied
            per_day = float(row["daily_rate_applied"]) if row["daily_rate_applied"] is not None else None
        else:
            # Labour (tier) or Trainee (daily_flat) — no monthly salary concept
            monthly_salary = None
            per_day = float(row["daily_rate_applied"]) if row["daily_rate_applied"] is not None else None

        result.append({
            "sr_no": i,
            "employee_id": str(row["employee_id"]),
            "employee_code": row["employee_code"],
            "employee_name": row["employee_name"],
            "gender": row["gender"],
            "salary_type": salary_type,
            "monthly_salary": monthly_salary,
            "per_day": per_day,
            "days_present": float(row["days_present"]),
            "ot_hours": float(row["ot_hours"]),
            "gross": float(row["gross"]),
            "basic": comps.get("Basic"),
            "da": comps.get("DA"),
            "t_basic": comps.get("T Basic"),
            "allowances": comps.get("Allowances"),
            "epf": comps.get("EPF"),
            "total_deductions": float(row["total_deductions"]),
            "net_pay": float(row["net_pay"]),
            "payment_mode": row["payment_mode"],
        })

    return result


# ── Record listing ───────────────────────────────────────────────────────────

async def list_records(
    conn: Connection,
    org_id: str,
    period_id: str,
    page: int = 1,
    page_size: int = 50,
    category_id: str | None = None,
    department_id: str | None = None,
) -> tuple[list[dict], int]:
    """Paginated list of payroll records for a period with optional filters."""
    # Verify period exists
    await get_period(conn, org_id, period_id)

    offset = (page - 1) * page_size
    rows = await conn.fetch(
        q.PAYROLL_RECORD_LIST,
        period_id, org_id, category_id, department_id, page_size, offset,
    )
    count_row = await conn.fetchrow(
        q.PAYROLL_RECORD_COUNT,
        period_id, org_id, category_id, department_id,
    )
    total = count_row["total"] if count_row else 0
    return [dict(r) for r in rows], total
