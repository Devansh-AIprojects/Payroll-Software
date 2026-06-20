-- ============================================================
-- 005_attendance.sql
-- Fingerprint devices, raw punch logs, processed daily records,
-- and leave applications.
-- ============================================================

-- ============================================================
-- DEVICES
-- One row per physical fingerprint scanner.
-- device_identifier = hardware serial number or network ID
-- used to identify which device sent a punch.
-- ============================================================

CREATE TABLE devices (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID         NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  location          VARCHAR(255),
  device_identifier VARCHAR(100) NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  last_seen_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, device_identifier)
);

-- ============================================================
-- ATTENDANCE LOGS
-- Raw immutable punch records straight from the scanner.
-- NEVER UPDATE rows in this table — only INSERT.
-- employee_id is NULL when matched = FALSE (unrecognized print).
-- raw_confidence = match score returned by the scanner SDK,
-- useful for tuning false-accept / false-reject thresholds.
-- ============================================================

CREATE TABLE attendance_logs (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_id     UUID          REFERENCES employees(id) ON DELETE SET NULL,
  device_id       UUID          REFERENCES devices(id) ON DELETE SET NULL,
  punched_at      TIMESTAMPTZ   NOT NULL,
  punch_type      VARCHAR(5)    NOT NULL CHECK (punch_type IN ('in', 'out')),
  matched         BOOLEAN       NOT NULL DEFAULT FALSE,
  raw_confidence  NUMERIC(5,2),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE DAILY
-- Processed daily attendance — one row per employee per date.
-- Derived from attendance_logs by the attendance engine.
-- HR can manually override any record (flag + reason required).
--
-- tier_applied is NULL until payroll is run for that month.
-- The payroll engine sets it when it determines the final tier
-- based on total days_present for the full period.
--
-- status values:
--   present    → IN + OUT logged, hours >= shift minimum
--   absent     → no valid punch pair for the day
--   half_day   → punched but hours below shift minimum threshold
--   late       → IN time after shift start grace window
--   holiday    → public or mill holiday, not counted as absent
--   weekly_off → employee's designated weekly off day
-- ============================================================

CREATE TABLE attendance_daily (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_id       UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date              DATE          NOT NULL,
  shift_id          UUID          REFERENCES shifts(id) ON DELETE SET NULL,
  in_time           TIMESTAMPTZ,
  out_time          TIMESTAMPTZ,
  hours_worked      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  status            VARCHAR(20)   NOT NULL DEFAULT 'absent'
                      CHECK (status IN (
                        'present', 'absent', 'half_day',
                        'late', 'holiday', 'weekly_off'
                      )),
  ot_hours          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  undertime_hours   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tier_applied      SMALLINT      CHECK (tier_applied IN (1, 2, 3)),
  is_manual_override BOOLEAN      NOT NULL DEFAULT FALSE,
  override_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  override_reason   TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, employee_id, date)
);

CREATE TRIGGER set_updated_at_attendance_daily
  BEFORE UPDATE ON attendance_daily
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- LEAVE APPLICATIONS
-- Record-only. No approval flow — HR enters it for their records.
-- Does not auto-update attendance_daily; HR must reconcile
-- the attendance record separately if needed.
-- ============================================================

CREATE TABLE leave_applications (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_id UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  from_date   DATE        NOT NULL,
  to_date     DATE        NOT NULL,
  reason      TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (to_date >= from_date)
);
