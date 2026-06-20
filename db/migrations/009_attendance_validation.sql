-- ============================================================
-- 009_attendance_validation.sql
-- Attendance exception flagging + payroll processing gate.
--
-- review_status on attendance_daily marks whether a row has
-- passed the daily aggregation engine's sanity checks.
-- exception_type records WHY it was flagged, for HR triage UI.
--
-- The gate itself is enforced as a DB trigger on payroll_periods:
-- a period cannot move draft -> processing while ANY attendance_daily
-- row in that org/month/year still has review_status = 'flagged'.
-- This keeps the rule in the DB layer, not app code, consistent
-- with the config-driven / no-hardcoded-logic principle.
-- ============================================================

ALTER TABLE attendance_daily
  ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'clean'
    CHECK (review_status IN ('clean', 'flagged', 'resolved')),
  ADD COLUMN exception_type VARCHAR(30)
    CHECK (exception_type IN (
      'missing_punch', 'odd_punch_count', 'excessive_duration',
      'shift_mismatch', 'device_gap', 'leave_conflict'
    ));

-- Fast lookup for HR triage queue and the gate check below.
CREATE INDEX idx_attendance_daily_flagged
  ON attendance_daily (org_id, date, review_status)
  WHERE review_status = 'flagged';

-- ============================================================
-- READINESS CHECK FUNCTION
-- Read-only. API calls this to show "N exceptions remaining"
-- before HR even attempts to start payroll processing.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_attendance_exception_count(
  p_org_id UUID, p_month SMALLINT, p_year SMALLINT
) RETURNS INTEGER AS $$
DECLARE
  v_start DATE := make_date(p_year, p_month, 1);
  v_end   DATE := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM attendance_daily
  WHERE org_id = p_org_id
    AND date BETWEEN v_start AND v_end
    AND review_status = 'flagged';
  RETURN v_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- GATE TRIGGER
-- Hard-blocks draft -> processing if unresolved exceptions exist.
-- Engine (Phase 5) reads from payroll_periods.status = 'processing',
-- so this is the actual chokepoint, not a UI suggestion.
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_block_payroll_processing()
RETURNS TRIGGER AS $$
DECLARE
  v_flagged_count INTEGER;
BEGIN
  IF NEW.status = 'processing' AND OLD.status = 'draft' THEN
    v_flagged_count := fn_attendance_exception_count(NEW.org_id, NEW.month, NEW.year);

    IF v_flagged_count > 0 THEN
      RAISE EXCEPTION
        'Cannot start payroll processing for %-%: % unresolved attendance exception(s). Resolve flagged records first.',
        NEW.month, NEW.year, v_flagged_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_payroll_processing_on_unresolved_attendance
  BEFORE UPDATE ON payroll_periods
  FOR EACH ROW
  EXECUTE FUNCTION trigger_block_payroll_processing();
