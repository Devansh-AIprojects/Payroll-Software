"""Quick smoke tests for Phase 4 core functions — no DB needed."""

from datetime import date, time, datetime, timezone, timedelta
from decimal import Decimal
from app.modules.attendance.service import (
    _compute_shift_window, _pair_punches, _detect_exception, IST,
)

passed = 0
failed = 0

def check(label, condition):
    global passed, failed
    if condition:
        print(f"  PASS  {label}")
        passed += 1
    else:
        print(f"  FAIL  {label}")
        failed += 1


print("=== CROSS-MIDNIGHT SHIFT WINDOW ===\n")

# Night 12hr (20:00 -> 08:00)
ws, we = _compute_shift_window(time(20, 0), time(8, 0), True, date(2026, 6, 15))
check("Night 12hr start = Jun 15 18:00", ws.day == 15 and ws.hour == 18)
check("Night 12hr end   = Jun 16 10:00", we.day == 16 and we.hour == 10)

# Evening 8hr (16:00 -> 00:00)
ws, we = _compute_shift_window(time(16, 0), time(0, 0), True, date(2026, 6, 15))
check("Evening 8hr start = Jun 15 14:00", ws.day == 15 and ws.hour == 14)
check("Evening 8hr end   = Jun 16 02:00", we.day == 16 and we.hour == 2)

# Morning 8hr (08:00 -> 17:00)
ws, we = _compute_shift_window(time(8, 0), time(17, 0), False, date(2026, 6, 15))
check("Morning 8hr start = Jun 15 06:00", ws.day == 15 and ws.hour == 6)
check("Morning 8hr end   = Jun 15 19:00", we.day == 15 and we.hour == 19)

# Day 12hr (08:00 -> 20:00)
ws, we = _compute_shift_window(time(8, 0), time(20, 0), False, date(2026, 6, 15))
check("Day 12hr start = Jun 15 06:00", ws.day == 15 and ws.hour == 6)
check("Day 12hr end   = Jun 15 22:00", we.day == 15 and we.hour == 22)

# Night 8hr (00:00 -> 08:00) — note: crosses_midnight=FALSE per seed
ws, we = _compute_shift_window(time(0, 0), time(8, 0), False, date(2026, 6, 15))
check("Night 8hr start = Jun 14 22:00", ws.day == 14 and ws.hour == 22)
check("Night 8hr end   = Jun 15 10:00", we.day == 15 and we.hour == 10)


print("\n=== PUNCH PAIRING ===\n")

# Normal IN/OUT
logs = [
    {"punch_type": "in",  "punched_at": datetime(2026, 6, 15, 20, 5, tzinfo=IST)},
    {"punch_type": "out", "punched_at": datetime(2026, 6, 16, 8, 10, tzinfo=IST)},
]
in_t, out_t = _pair_punches(logs)
check("Normal pair: in=20:05", in_t is not None and in_t.hour == 20 and in_t.minute == 5)
check("Normal pair: out=08:10", out_t is not None and out_t.hour == 8 and out_t.minute == 10)

# Missing OUT
logs_miss = [{"punch_type": "in", "punched_at": datetime(2026, 6, 15, 8, 0, tzinfo=IST)}]
in_t, out_t = _pair_punches(logs_miss)
check("Missing OUT: in exists, out=None", in_t is not None and out_t is None)

# Missing IN
logs_miss2 = [{"punch_type": "out", "punched_at": datetime(2026, 6, 15, 17, 0, tzinfo=IST)}]
in_t, out_t = _pair_punches(logs_miss2)
check("Missing IN: in=None, out exists", in_t is None and out_t is not None)

# No punches
in_t, out_t = _pair_punches([])
check("No punches: both None", in_t is None and out_t is None)

# Multiple INs and OUTs — first IN, last OUT
logs_multi = [
    {"punch_type": "in",  "punched_at": datetime(2026, 6, 15, 7, 55, tzinfo=IST)},
    {"punch_type": "in",  "punched_at": datetime(2026, 6, 15, 8, 0, tzinfo=IST)},
    {"punch_type": "out", "punched_at": datetime(2026, 6, 15, 12, 0, tzinfo=IST)},
    {"punch_type": "out", "punched_at": datetime(2026, 6, 15, 17, 5, tzinfo=IST)},
]
in_t, out_t = _pair_punches(logs_multi)
check("Multi: first IN = 07:55", in_t.hour == 7 and in_t.minute == 55)
check("Multi: last OUT = 17:05", out_t.hour == 17 and out_t.minute == 5)


print("\n=== EXCEPTION DETECTION ===\n")

dt1 = datetime(2026, 6, 15, 8, 0, tzinfo=IST)
dt2 = datetime(2026, 6, 15, 20, 0, tzinfo=IST)

check("missing_punch (only IN)",
      _detect_exception(dt1, None, Decimal("0"), Decimal("12"), [{"punch_type": "in"}], False) == "missing_punch")

check("missing_punch (only OUT)",
      _detect_exception(None, dt2, Decimal("0"), Decimal("12"), [{"punch_type": "out"}], False) == "missing_punch")

check("leave_conflict",
      _detect_exception(dt1, dt2, Decimal("12"), Decimal("12"),
                         [{"punch_type": "in"}, {"punch_type": "out"}], True) == "leave_conflict")

check("excessive_duration (20h on 12h shift)",
      _detect_exception(dt1, dt2, Decimal("20"), Decimal("12"),
                         [{"punch_type": "in"}, {"punch_type": "out"}], False) == "excessive_duration")

check("clean record",
      _detect_exception(dt1, dt2, Decimal("12"), Decimal("12"),
                         [{"punch_type": "in"}, {"punch_type": "out"}], False) is None)

check("absent (no logs, no times)",
      _detect_exception(None, None, Decimal("0"), Decimal("12"), [], False) is None)

check("odd_punch_count",
      _detect_exception(dt1, dt2, Decimal("9"), Decimal("8"),
                         [{"punch_type": "in"}, {"punch_type": "out"},
                          {"punch_type": "in"}, {"punch_type": "out"}], False) == "odd_punch_count")


print(f"\n{'='*40}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("ALL TESTS PASSED")
else:
    print("SOME TESTS FAILED")
    exit(1)
