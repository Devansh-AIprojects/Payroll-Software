# ── Payroll period queries ─────────────────────────────────────────────────────

# Create a new payroll period. UNIQUE constraint on (org_id, month, year)
# prevents duplicates — the service layer catches the UniqueViolationError.
PERIOD_INSERT = """
    INSERT INTO payroll_periods (org_id, month, year)
    VALUES ($1, $2, $3)
    RETURNING id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
"""

PERIOD_GET = """
    SELECT id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
    FROM payroll_periods
    WHERE id = $1 AND org_id = $2
"""

PERIOD_LIST = """
    SELECT id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
    FROM payroll_periods
    WHERE org_id = $1
    ORDER BY year DESC, month DESC
    LIMIT $2 OFFSET $3
"""

# Status update — the DB trigger trigger_block_payroll_processing() on
# payroll_periods enforces the draft→processing gate (exceptions must be zero).
# The application layer validates allowed transitions before calling this.
PERIOD_STATUS_UPDATE = """
    UPDATE payroll_periods
    SET status = $3
    WHERE id = $1 AND org_id = $2
    RETURNING id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
"""

PERIOD_SET_APPROVED = """
    UPDATE payroll_periods
    SET status = 'approved', approved_at = NOW(), approved_by = $3
    WHERE id = $1 AND org_id = $2 AND status = 'processing'
    RETURNING id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
"""

PERIOD_SET_PAID = """
    UPDATE payroll_periods
    SET status = 'paid', paid_at = NOW()
    WHERE id = $1 AND org_id = $2 AND status = 'approved'
    RETURNING id, org_id, month, year, status, created_at, approved_at, approved_by, paid_at
"""

# ── Engine data queries ───────────────────────────────────────────────────────

# Fetch every active employee with their salary config for payroll calculation.
# Joins sub_categories for salary_type, flat_daily_rate, has_components, has_epf.
# Joins categories for pay_type (used to distinguish tier_based vs hours_based).
PAYROLL_ENGINE_EMPLOYEES = """
    SELECT e.id, e.org_id, e.employee_code, e.name,
           e.category_id, e.sub_category_id, e.department_id,
           e.shift_id, e.monthly_salary, e.per_day_salary, e.epf_enrolled, e.payment_mode,
           e.jobber_type,
           sc.salary_type, sc.flat_daily_rate, sc.has_components, sc.has_epf,
           c.pay_type,
           s.standard_hours
    FROM employees e
    JOIN sub_categories sc ON sc.id = e.sub_category_id
    JOIN categories c ON c.id = e.category_id
    JOIN shifts s ON s.id = e.shift_id
    WHERE e.org_id = $1 AND e.is_active = TRUE
"""

# Attendance summary for one employee for a given month/year.
# Half-day counts as 0.5 present. Absent doesn't count.
# Returns: days_present (NUMERIC), ot_hours (NUMERIC), undertime_hours (NUMERIC).
PAYROLL_ATTENDANCE_SUMMARY = """
    SELECT
        COALESCE(SUM(
            CASE
                WHEN status = 'present' THEN 1.0
                WHEN status = 'half_day' THEN 0.5
                ELSE 0
            END
        ), 0) AS days_present,
        COALESCE(SUM(ot_hours), 0) AS ot_hours,
        COALESCE(SUM(undertime_hours), 0) AS undertime_hours
    FROM attendance_daily
    WHERE org_id = $1 AND employee_id = $2
      AND date >= make_date($3::int, $4::int, 1)
      AND date <= (make_date($3::int, $4::int, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date
"""

# Tier rate lookup — finds the matching tier for a department given days_present.
# max_days IS NULL means no upper bound (tier 3).
PAYROLL_TIER_RATE = """
    SELECT tier, daily_rate
    FROM labour_tier_rates
    WHERE org_id = $1 AND department_id = $2
      AND min_days <= $3
      AND (max_days IS NULL OR max_days >= $3)
    ORDER BY tier DESC
    LIMIT 1
"""

# Salary components for the org, ordered by calculation_order.
# Only active components are used.
SALARY_COMPONENTS_LIST = """
    SELECT id, name, type, formula_type, formula_value,
           ref_component_id, calculation_order, is_displayed
    FROM salary_components
    WHERE org_id = $1 AND is_active = TRUE
    ORDER BY calculation_order ASC
"""

# ── Payroll record queries ────────────────────────────────────────────────────

# UPSERT: insert or update payroll_records for an employee in a period.
# Re-running payroll on the same period updates existing rows.
PAYROLL_RECORD_UPSERT = """
    INSERT INTO payroll_records (
        period_id, org_id, employee_id,
        days_present, tier_applied, daily_rate_applied,
        ot_hours, undertime_hours,
        gross, jobber_allowance, total_deductions, net_pay, payment_mode
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (period_id, employee_id)
    DO UPDATE SET
        days_present       = EXCLUDED.days_present,
        tier_applied       = EXCLUDED.tier_applied,
        daily_rate_applied = EXCLUDED.daily_rate_applied,
        ot_hours           = EXCLUDED.ot_hours,
        undertime_hours    = EXCLUDED.undertime_hours,
        gross              = EXCLUDED.gross,
        jobber_allowance   = EXCLUDED.jobber_allowance,
        total_deductions   = EXCLUDED.total_deductions,
        net_pay            = EXCLUDED.net_pay,
        payment_mode       = EXCLUDED.payment_mode
    RETURNING id
"""

PAYROLL_RECORD_GET = """
    SELECT pr.id, pr.period_id, pr.org_id, pr.employee_id,
           pr.days_present, pr.tier_applied, pr.daily_rate_applied,
           pr.ot_hours, pr.undertime_hours,
           pr.gross, pr.jobber_allowance, pr.total_deductions, pr.net_pay, pr.payment_mode,
           pr.created_at, pr.updated_at,
           e.name AS employee_name, e.employee_code
    FROM payroll_records pr
    JOIN employees e ON e.id = pr.employee_id
    WHERE pr.id = $1 AND pr.org_id = $2
"""

PAYROLL_RECORD_BY_EMPLOYEE = """
    SELECT pr.id, pr.period_id, pr.org_id, pr.employee_id,
           pr.days_present, pr.tier_applied, pr.daily_rate_applied,
           pr.ot_hours, pr.undertime_hours,
           pr.gross, pr.jobber_allowance, pr.total_deductions, pr.net_pay, pr.payment_mode,
           pr.created_at, pr.updated_at,
           e.name AS employee_name, e.employee_code
    FROM payroll_records pr
    JOIN employees e ON e.id = pr.employee_id
    WHERE pr.period_id = $1 AND pr.employee_id = $2 AND pr.org_id = $3
"""

# List all records for a period. Optional filters by category and department.
PAYROLL_RECORD_LIST = """
    SELECT pr.id, pr.period_id, pr.org_id, pr.employee_id,
           pr.days_present, pr.tier_applied, pr.daily_rate_applied,
           pr.ot_hours, pr.undertime_hours,
           pr.gross, pr.jobber_allowance, pr.total_deductions, pr.net_pay, pr.payment_mode,
           pr.created_at, pr.updated_at,
           e.name AS employee_name, e.employee_code
    FROM payroll_records pr
    JOIN employees e ON e.id = pr.employee_id
    WHERE pr.period_id = $1 AND pr.org_id = $2
      AND ($3::uuid IS NULL OR e.category_id = $3)
      AND ($4::uuid IS NULL OR e.department_id = $4)
    ORDER BY e.name
    LIMIT $5 OFFSET $6
"""

PAYROLL_RECORD_COUNT = """
    SELECT COUNT(*) AS total
    FROM payroll_records pr
    JOIN employees e ON e.id = pr.employee_id
    WHERE pr.period_id = $1 AND pr.org_id = $2
      AND ($3::uuid IS NULL OR e.category_id = $3)
      AND ($4::uuid IS NULL OR e.department_id = $4)
"""

# Update totals after deduction changes. Called by the deduction add/delete flow
# to recalculate total_deductions and net_pay on the payroll_record.
PAYROLL_RECORD_UPDATE_TOTALS = """
    UPDATE payroll_records
    SET total_deductions = $3, net_pay = $4
    WHERE id = $1 AND org_id = $2
    RETURNING id
"""

# ── Component value queries ───────────────────────────────────────────────────

# Delete all component values for a record before re-inserting fresh ones.
# This makes re-running payroll idempotent.
COMPONENT_VALUES_DELETE = """
    DELETE FROM payroll_component_values
    WHERE payroll_record_id = $1
"""

COMPONENT_VALUES_INSERT = """
    INSERT INTO payroll_component_values (
        payroll_record_id, component_id, component_name,
        component_type, is_displayed, value
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
"""

COMPONENT_VALUES_BY_RECORD = """
    SELECT id, payroll_record_id, component_id, component_name,
           component_type, is_displayed, value
    FROM payroll_component_values
    WHERE payroll_record_id = $1
    ORDER BY component_name
"""

# ── Deduction queries ─────────────────────────────────────────────────────────

# Manual deductions are entered by HR per employee per period.
# They attach to the payroll_records row for that employee.
DEDUCTION_INSERT = """
    INSERT INTO payroll_deductions (
        payroll_record_id, org_id, employee_id, type, label, amount, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, payroll_record_id, org_id, employee_id, type, label, amount, created_by, created_at
"""

DEDUCTION_LIST = """
    SELECT id, payroll_record_id, org_id, employee_id,
           type, label, amount, created_by, created_at
    FROM payroll_deductions
    WHERE payroll_record_id = $1
    ORDER BY created_at
"""

DEDUCTION_GET = """
    SELECT id, payroll_record_id, org_id, employee_id,
           type, label, amount, created_by, created_at
    FROM payroll_deductions
    WHERE id = $1 AND org_id = $2
"""

DEDUCTION_DELETE = """
    DELETE FROM payroll_deductions
    WHERE id = $1 AND org_id = $2
    RETURNING payroll_record_id
"""

# Sum of all manual deductions for a payroll record.
DEDUCTION_SUM = """
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payroll_deductions
    WHERE payroll_record_id = $1
"""

# ── Exception guard ───────────────────────────────────────────────────────────

# Count unresolved attendance exceptions for a month/year.
# Used by the service layer before allowing a payroll run.
EXCEPTIONS_UNRESOLVED_COUNT = """
    SELECT fn_attendance_exception_count($1, $2::smallint, $3::smallint) AS count
"""
