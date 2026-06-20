# ── Employee lookup ───────────────────────────────────────────────────────────

# Resolve device UID → employee_id within an org.
# device_user_id is set once when HR enrolls the worker on the BioMax device.
EMPLOYEE_BY_DEVICE_UID = """
    SELECT id
    FROM employees
    WHERE org_id = $1 AND device_user_id = $2 AND is_active = TRUE
"""

# ── Attendance log insert ─────────────────────────────────────────────────────

# ON CONFLICT DO NOTHING: dedup guard for re-pushed ADMS records.
# Unique index attendance_logs_dedup_idx (device_id, punched_at) added in 008.
ATTENDANCE_LOG_INSERT = """
    INSERT INTO attendance_logs
        (org_id, employee_id, device_id, punched_at, punch_type, matched, raw_confidence)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (device_id, punched_at) DO NOTHING
    RETURNING id
"""

# ── Attendance log read ───────────────────────────────────────────────────────

ATTENDANCE_LOGS_BY_EMPLOYEE = """
    SELECT id, org_id, employee_id, device_id, punched_at, punch_type,
           matched, raw_confidence, created_at
    FROM attendance_logs
    WHERE org_id = $1 AND employee_id = $2
      AND punched_at::date BETWEEN $3 AND $4
    ORDER BY punched_at
"""

ATTENDANCE_LOGS_UNMATCHED = """
    SELECT id, org_id, employee_id, device_id, punched_at, punch_type,
           matched, raw_confidence, created_at
    FROM attendance_logs
    WHERE org_id = $1 AND matched = FALSE
      AND punched_at::date BETWEEN $2 AND $3
    ORDER BY punched_at DESC
    LIMIT $4 OFFSET $5
"""

# ── Attendance daily read ─────────────────────────────────────────────────────

ATTENDANCE_DAILY_BY_EMPLOYEE = """
    SELECT id, org_id, employee_id, date, shift_id,
           in_time, out_time, hours_worked, status,
           ot_hours, undertime_hours, tier_applied,
           is_manual_override, override_by, override_reason,
           review_status, exception_type,
           created_at, updated_at
    FROM attendance_daily
    WHERE org_id = $1 AND employee_id = $2
      AND date BETWEEN $3 AND $4
    ORDER BY date
"""

ATTENDANCE_DAILY_GET = """
    SELECT id, org_id, employee_id, date, shift_id,
           in_time, out_time, hours_worked, status,
           ot_hours, undertime_hours, tier_applied,
           is_manual_override, override_by, override_reason,
           review_status, exception_type,
           created_at, updated_at
    FROM attendance_daily
    WHERE id = $1 AND org_id = $2
"""

# ── Processing engine queries ─────────────────────────────────────────────────

# All active employees for an org, with their shift and category info.
# Used by the processing engine to iterate over each employee.
ACTIVE_EMPLOYEES_WITH_SHIFT = """
    SELECT e.id, e.org_id, e.employee_code, e.name,
           e.shift_id, e.category_id, e.sub_category_id, e.department_id,
           s.start_time, s.end_time, s.duration_hours, s.standard_hours,
           s.crosses_midnight, s.name AS shift_name,
           c.pay_type
    FROM employees e
    JOIN shifts s ON s.id = e.shift_id
    JOIN categories c ON c.id = e.category_id
    WHERE e.org_id = $1 AND e.is_active = TRUE
"""

# Fetch all matched attendance_logs for an employee within a timestamp window.
# Window is shift-aware: for cross-midnight shifts, window_end is the next day.
# Only matched punches are used for pairing — unmatched ones are noise.
ATTENDANCE_LOGS_IN_WINDOW = """
    SELECT id, punched_at, punch_type
    FROM attendance_logs
    WHERE org_id = $1
      AND employee_id = $2
      AND matched = TRUE
      AND punched_at >= $3
      AND punched_at <= $4
    ORDER BY punched_at
"""

# UPSERT: insert new attendance_daily row or update if already processed.
# Skips rows where is_manual_override = TRUE (HR already fixed it).
ATTENDANCE_DAILY_UPSERT = """
    INSERT INTO attendance_daily (
        org_id, employee_id, date, shift_id,
        in_time, out_time, hours_worked, status,
        ot_hours, undertime_hours,
        review_status, exception_type
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (org_id, employee_id, date)
    DO UPDATE SET
        shift_id        = EXCLUDED.shift_id,
        in_time         = EXCLUDED.in_time,
        out_time        = EXCLUDED.out_time,
        hours_worked    = EXCLUDED.hours_worked,
        status          = EXCLUDED.status,
        ot_hours        = EXCLUDED.ot_hours,
        undertime_hours = EXCLUDED.undertime_hours,
        review_status   = EXCLUDED.review_status,
        exception_type  = EXCLUDED.exception_type
    WHERE attendance_daily.is_manual_override = FALSE
    RETURNING id
"""

# ── Manual override ───────────────────────────────────────────────────────────

ATTENDANCE_DAILY_OVERRIDE = """
    UPDATE attendance_daily
    SET status            = COALESCE($3, status),
        in_time           = COALESCE($4, in_time),
        out_time          = COALESCE($5, out_time),
        hours_worked      = COALESCE($6, hours_worked),
        ot_hours          = COALESCE($7, ot_hours),
        undertime_hours   = COALESCE($8, undertime_hours),
        is_manual_override = TRUE,
        override_by       = $9,
        override_reason   = $10,
        review_status     = 'resolved',
        exception_type    = NULL
    WHERE id = $1 AND org_id = $2
    RETURNING id
"""

ATTENDANCE_DAILY_MANUAL_UPSERT = """
    INSERT INTO attendance_daily (
        org_id, employee_id, date, shift_id,
        in_time, out_time, hours_worked, status,
        ot_hours, undertime_hours,
        review_status, exception_type,
        is_manual_override, override_by, override_reason
    )
    VALUES (
        $1, $2, $3, 
        (SELECT shift_id FROM employees WHERE id = $2 AND org_id = $1), 
        $4, $5, $6, $7, $8, $9, 'resolved', NULL, TRUE, $10, $11
    )
    ON CONFLICT (org_id, employee_id, date)
    DO UPDATE SET
        in_time         = EXCLUDED.in_time,
        out_time        = EXCLUDED.out_time,
        hours_worked    = EXCLUDED.hours_worked,
        status          = EXCLUDED.status,
        ot_hours        = EXCLUDED.ot_hours,
        undertime_hours = EXCLUDED.undertime_hours,
        review_status   = EXCLUDED.review_status,
        exception_type  = EXCLUDED.exception_type,
        is_manual_override = EXCLUDED.is_manual_override,
        override_by     = EXCLUDED.override_by,
        override_reason = EXCLUDED.override_reason
    RETURNING id
"""

# ── Exception resolve (clear flag without changing data) ──────────────────────

ATTENDANCE_DAILY_RESOLVE = """
    UPDATE attendance_daily
    SET review_status = 'resolved'
    WHERE id = $1 AND org_id = $2 AND review_status = 'flagged'
    RETURNING id
"""

# ── Exception queries ─────────────────────────────────────────────────────────

ATTENDANCE_EXCEPTIONS_LIST = """
    SELECT ad.id, ad.org_id, ad.employee_id, ad.date, ad.shift_id,
           ad.in_time, ad.out_time, ad.hours_worked, ad.status,
           ad.ot_hours, ad.undertime_hours,
           ad.review_status, ad.exception_type,
           ad.is_manual_override, ad.override_by, ad.override_reason,
           ad.created_at, ad.updated_at,
           e.name AS employee_name, e.employee_code
    FROM attendance_daily ad
    JOIN employees e ON e.id = ad.employee_id
    WHERE ad.org_id = $1
      AND ad.date >= make_date($2::int, $3::int, 1)
      AND ad.date <= (make_date($2::int, $3::int, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date
      AND ad.review_status = 'flagged'
    ORDER BY ad.date, e.name
"""

ATTENDANCE_EXCEPTION_COUNT = """
    SELECT fn_attendance_exception_count($1, $2::smallint, $3::smallint) AS count
"""

# ── Leave queries ─────────────────────────────────────────────────────────────

LEAVE_INSERT = """
    INSERT INTO leave_applications (org_id, employee_id, from_date, to_date, reason, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, org_id, employee_id, from_date, to_date, reason, applied_at, created_by, created_at
"""

LEAVE_LIST = """
    SELECT la.id, la.org_id, la.employee_id, la.from_date, la.to_date,
           la.reason, la.applied_at, la.created_by, la.created_at,
           e.name AS employee_name, e.employee_code
    FROM leave_applications la
    JOIN employees e ON e.id = la.employee_id
    WHERE la.org_id = $1
      AND ($2::uuid IS NULL OR la.employee_id = $2)
    ORDER BY la.from_date DESC
    LIMIT $3 OFFSET $4
"""

LEAVE_GET = """
    SELECT la.id, la.org_id, la.employee_id, la.from_date, la.to_date,
           la.reason, la.applied_at, la.created_by, la.created_at,
           e.name AS employee_name, e.employee_code
    FROM leave_applications la
    JOIN employees e ON e.id = la.employee_id
    WHERE la.id = $1 AND la.org_id = $2
"""

# Check if a leave application covers a specific date for an employee.
# Used by exception detection to flag leave_conflict.
LEAVE_EXISTS_FOR_DATE = """
    SELECT EXISTS (
        SELECT 1
        FROM leave_applications
        WHERE org_id = $1 AND employee_id = $2
          AND $3 BETWEEN from_date AND to_date
    ) AS exists
"""
