-- ============================================================
-- 016: Attendance status model update
--   - Remove 'holiday'  (was always 0-pay, identical to absent)
--   - Add    'overtime' (paid full day + OT hours entered manually)
--   - 'weekly_off' becomes a PAID day (engine-side weighting, see queries.py)
--   - 'late' is now paid from hours entered (engine-side, undertime docks short hrs)
--
-- Reclassify any existing 'holiday' rows to 'absent' before tightening the
-- CHECK constraint so the ALTER does not fail on legacy data.
-- ============================================================

UPDATE attendance_daily SET status = 'absent' WHERE status = 'holiday';

ALTER TABLE attendance_daily DROP CONSTRAINT IF EXISTS attendance_daily_status_check;

ALTER TABLE attendance_daily ADD CONSTRAINT attendance_daily_status_check
  CHECK (status IN (
    'present', 'absent', 'half_day',
    'late', 'weekly_off', 'overtime'
  ));
