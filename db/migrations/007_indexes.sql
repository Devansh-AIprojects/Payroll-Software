-- ============================================================
-- 007_indexes.sql
-- Performance indexes. Every foreign key that will be used in
-- joins or WHERE clauses gets an index. High-frequency queries
-- (attendance lookup, payroll run, fingerprint match cache) get
-- composite indexes tuned to their access pattern.
-- ============================================================

-- --------------------------------------------------------
-- TENANT
-- --------------------------------------------------------
CREATE INDEX idx_users_org_id         ON users(org_id);
CREATE INDEX idx_users_org_email      ON users(org_id, email);

-- --------------------------------------------------------
-- CONFIG
-- --------------------------------------------------------
CREATE INDEX idx_shifts_org_active            ON shifts(org_id, is_active);
CREATE INDEX idx_categories_org               ON categories(org_id);
CREATE INDEX idx_sub_categories_org           ON sub_categories(org_id);
CREATE INDEX idx_sub_categories_category      ON sub_categories(category_id);
CREATE INDEX idx_departments_org              ON departments(org_id);
CREATE INDEX idx_departments_org_category     ON departments(org_id, category_id);
CREATE INDEX idx_salary_components_org_order  ON salary_components(org_id, calculation_order);
CREATE INDEX idx_salary_components_org_active ON salary_components(org_id, is_active);
CREATE INDEX idx_labour_tier_rates_org_dept   ON labour_tier_rates(org_id, department_id);

-- --------------------------------------------------------
-- EMPLOYEES
-- --------------------------------------------------------
CREATE INDEX idx_employees_org_active      ON employees(org_id, is_active);
CREATE INDEX idx_employees_org_category    ON employees(org_id, category_id);
CREATE INDEX idx_employees_org_sub_cat     ON employees(org_id, sub_category_id);
CREATE INDEX idx_employees_org_dept        ON employees(org_id, department_id);
CREATE INDEX idx_employees_org_code        ON employees(org_id, employee_code);

-- Fingerprint lookup: the attendance engine scans all active templates
-- for an org on every punch — this index is hit on every finger scan.
CREATE INDEX idx_fingerprints_org_active   ON employee_fingerprints(org_id, is_active);
CREATE INDEX idx_fingerprints_employee     ON employee_fingerprints(employee_id);

-- --------------------------------------------------------
-- ATTENDANCE
-- --------------------------------------------------------
CREATE INDEX idx_devices_org_active        ON devices(org_id, is_active);

-- Raw log lookups: by employee over time, and unmatched logs for alert queries
CREATE INDEX idx_att_logs_org_employee     ON attendance_logs(org_id, employee_id);
CREATE INDEX idx_att_logs_punched_at       ON attendance_logs(org_id, punched_at DESC);
CREATE INDEX idx_att_logs_unmatched        ON attendance_logs(org_id, matched, punched_at DESC)
  WHERE matched = FALSE;

-- Daily records: primary access patterns are by employee+date (single lookup)
-- and by org+date range (monthly payroll pull, attendance reports)
CREATE INDEX idx_att_daily_employee_date   ON attendance_daily(employee_id, date DESC);
CREATE INDEX idx_att_daily_org_date        ON attendance_daily(org_id, date DESC);
CREATE INDEX idx_att_daily_org_emp_date    ON attendance_daily(org_id, employee_id, date);
CREATE INDEX idx_att_daily_status          ON attendance_daily(org_id, status, date);

CREATE INDEX idx_leave_employee_dates      ON leave_applications(employee_id, from_date, to_date);
CREATE INDEX idx_leave_org                 ON leave_applications(org_id);

-- --------------------------------------------------------
-- PAYROLL
-- --------------------------------------------------------
CREATE INDEX idx_payroll_periods_org_year  ON payroll_periods(org_id, year DESC, month DESC);
CREATE INDEX idx_payroll_periods_status    ON payroll_periods(org_id, status);

-- Payroll record access: by period (full run fetch) and by employee (history)
CREATE INDEX idx_payroll_records_period    ON payroll_records(period_id);
CREATE INDEX idx_payroll_records_employee  ON payroll_records(employee_id);
CREATE INDEX idx_payroll_records_org_mode  ON payroll_records(org_id, payment_mode);

CREATE INDEX idx_pcv_record_id             ON payroll_component_values(payroll_record_id);
CREATE INDEX idx_pcv_displayed             ON payroll_component_values(payroll_record_id, is_displayed);

CREATE INDEX idx_deductions_record         ON payroll_deductions(payroll_record_id);
CREATE INDEX idx_deductions_employee       ON payroll_deductions(employee_id);
CREATE INDEX idx_deductions_org_type       ON payroll_deductions(org_id, type);
