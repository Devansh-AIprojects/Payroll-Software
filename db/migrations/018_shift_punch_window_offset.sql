-- ============================================================
-- 018: Shift punch-window day offset (night-shift date attribution)
--
-- Problem: a 3-shift "Night 8hr (12am-8am)" worker physically punches in at
-- 00:00 and out at 08:00 of the FOLLOWING calendar day, but the mill counts
-- that as the PRIOR day's night duty (the next day's roster only begins at its
-- morning shift). The processing engine, seeing punches dated the next day,
-- attributed the record to the wrong (next) day — off by one.
--
-- Fix (config-driven, no hardcoding): each shift carries a day offset telling
-- the engine how many days AHEAD of the attendance-day its punches occur. When
-- building attendance-day D, the engine computes the punch window for
-- (D + punch_window_day_offset) but still records the result against D.
--
--   0  = punches occur on the attendance-day itself (default — all day shifts,
--        plus the evening/night-12hr shifts which already start same-day and
--        are handled by crosses_midnight).
--   1  = punches occur the NEXT calendar morning (midnight-start night shift):
--        attendance-day 28th is built from 29th 00:00-08:00 punches.
--
-- Safe: defaults to 0, so every existing shift keeps its current behaviour.
-- Only the midnight-start "Night 8hr (12am-8am)" shift is set to 1 below.
-- ============================================================

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS punch_window_day_offset SMALLINT NOT NULL DEFAULT 0;

-- Midnight-start night shift belongs to the prior attendance-day.
UPDATE shifts
SET punch_window_day_offset = 1
WHERE start_time = '00:00:00'
  AND crosses_midnight = FALSE
  AND end_time <= '12:00:00';
