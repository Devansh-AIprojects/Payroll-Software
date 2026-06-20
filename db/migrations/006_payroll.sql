-- ============================================================
-- 006_payroll.sql
-- Payroll periods, per-employee records, component breakdowns,
-- and manual deductions (advances, gifts, custom).
-- ============================================================

-- ============================================================
-- PAYROLL PERIODS
-- One row per month per org. Status drives the workflow gate:
--   draft      → HR can still edit attendance and deductions
--   processing → payroll engine is running, lock attendance
--   approved   → reviewed and signed off, ready to pay
--   paid       → payment released, period is closed
-- ============================================================

CREATE TABLE payroll_periods (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  month        SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  year         SMALLINT    NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'processing', 'approved', 'paid')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ,
  approved_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  paid_at      TIMESTAMPTZ,
  UNIQUE (org_id, month, year)
);

-- ============================================================
-- PAYROLL RECORDS
-- One row per employee per payroll period.
-- All monetary values are snapshots — they reflect what was
-- calculated at run time and do not change if config changes later.
--
-- daily_rate_applied  → snapshotted for Labour (tier rate used)
--                       or flat_daily_rate for Trainee.
--                       NULL for Maintenance/Staff (monthly salary basis).
-- tier_applied        → 1/2/3 for Labour Skilled, NULL for all others.
-- ot_hours / undertime_hours → 0 for Labour/Trainee (no OT logic).
-- total_deductions    → sum of all payroll_component_values
--                       WHERE type='deduction' PLUS all payroll_deductions.
-- net_pay             → gross - total_deductions
-- payment_mode        → snapshotted from employees.payment_mode at run time
-- ============================================================

CREATE TABLE payroll_records (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_id           UUID          NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  org_id              UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_id         UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  days_present        NUMERIC(4,1)  NOT NULL DEFAULT 0,
  tier_applied        SMALLINT      CHECK (tier_applied IN (1, 2, 3)),
  daily_rate_applied  NUMERIC(10,2),
  ot_hours            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  undertime_hours     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  gross               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_deductions    NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_pay             NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_mode        VARCHAR(10)   NOT NULL CHECK (payment_mode IN ('bank', 'cash')),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (period_id, employee_id)
);

CREATE TRIGGER set_updated_at_payroll_records
  BEFORE UPDATE ON payroll_records
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- PAYROLL COMPONENT VALUES
-- One row per salary component per employee per period.
-- Stores the calculated rupee value for each component.
-- component_name and component_type are snapshotted here so
-- historical payslips are unaffected if components are renamed
-- or restructured in salary_components later.
-- is_displayed is also snapshotted for consistent payslip rendering.
-- ============================================================

CREATE TABLE payroll_component_values (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_record_id UUID         NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  component_id     UUID          REFERENCES salary_components(id) ON DELETE SET NULL,
  component_name   VARCHAR(100)  NOT NULL,
  component_type   VARCHAR(20)   NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  is_displayed     BOOLEAN       NOT NULL DEFAULT TRUE,
  value            NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- ============================================================
-- PAYROLL DEDUCTIONS
-- Manual deductions entered by HR per employee per period.
-- Not auto-calculated — HR types in the amount each month.
-- type is a classification for reporting; label is free-form.
--
-- Examples:
--   type=advance,  label='Festival advance Oct',   amount=2000
--   type=gift,     label='Diwali gift deduction',  amount=500
--   type=custom,   label='Tool damage recovery',   amount=300
--
-- These are summed and added to payroll_records.total_deductions
-- when net_pay is calculated.
-- ============================================================

CREATE TABLE payroll_deductions (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_record_id UUID          NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  org_id            UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_id       UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type              VARCHAR(20)   NOT NULL CHECK (type IN ('advance', 'gift', 'custom')),
  label             VARCHAR(255)  NOT NULL,
  amount            NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_by        UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
