import logging
from datetime import datetime, timezone, timedelta, date, time
from decimal import Decimal
from typing import Optional

from asyncpg import Connection

from app.core.exceptions import NotFoundError, BadRequestError
from app.modules.attendance import queries as q
from app.modules.attendance.schemas import (
    ProcessRequest, DailyOverrideRequest, LeaveCreate, ManualAttendanceCreate
)
from app.modules.devices import queries as dq

logger = logging.getLogger(__name__)

# ── Timezone ──────────────────────────────────────────────────────────────────
# BioMax device clock is synced to IST via the TimeZone field in the ADMS
# GET response. All punched_at timestamps from ATTLOG lines are in IST.
# TODO: make this an org-level setting (organisations.timezone) in a future phase.
IST = timezone(timedelta(hours=5, minutes=30))

# ── ADMS status → punch_type mapping ─────────────────────────────────────────
# ZKTeco/BioMax ATTLOG status codes:
#   0 = Check In    → in
#   1 = Check Out   → out
#   2 = Break Out   → out
#   3 = Break In    → in
#   4 = OT In       → in
#   5 = OT Out      → out
_STATUS_TO_PUNCH_TYPE: dict[int, str] = {
    0: "in", 1: "out", 2: "out", 3: "in", 4: "in", 5: "out",
}

# ── ADMS verify_type → matched ────────────────────────────────────────────────
# 1  = Fingerprint  → matched = TRUE
# 4  = Password     → matched = FALSE
# 15 = Face         → matched = TRUE (not applicable on N-BM70W fingerprint model)
_FINGERPRINT_VERIFY_TYPES = {1, 15}

# ── Half-day threshold ────────────────────────────────────────────────────────
# V1 hardcoded: if hours_worked < 50% of standard_hours → half_day.
# Will become a configurable org-level setting in a future phase.
HALF_DAY_THRESHOLD_PERCENT = Decimal("0.50")

# Max reasonable duration above shift hours before flagging as excessive.
EXCESSIVE_HOURS_BUFFER = Decimal("4")


# ── ADMS response builder ─────────────────────────────────────────────────────

def build_adms_options_response(sn: str, last_stamp: int) -> str:
    """
    Plain-text response to device GET /iclock/cdata.
    last_stamp = Unix timestamp of last punch we received from this device.
    Device uses it to send only new logs (prevents full re-push every boot).
    TimeZone=5.5 syncs device clock to IST (UTC+5:30).
    """
    return (
        f"GET OPTION FROM: {sn}\n"
        f"ATTLOGStamp={last_stamp}\n"
        "OPERLOGStamp=9999\n"
        "ATTPHOTOStamp=None\n"
        "ErrorDelay=30\n"
        "Delay=10\n"
        "TransTimes=00:00;14:05\n"
        "TransInterval=1\n"
        "TransFlag=11111000001000\n"
        "TimeZone=5.5\n"
        "Realtime=1\n"
        "Encrypt=None\n"
        "ServerVer=2.4.1\n"
        "PushProtVer=2.4.1\n"
    )


# ── ATTLOG parser ─────────────────────────────────────────────────────────────

def _parse_attlog(body: str) -> list[dict]:
    """
    Parse raw ADMS POST body into a list of punch dicts.
    Each ATTLOG line: ATTLOG\\t{uid}\\t{datetime}\\t{status}\\t{verify}\\t...
    Malformed or non-ATTLOG lines are skipped silently.
    """
    records = []
    for line in body.strip().splitlines():
        line = line.strip()
        if not line.startswith("ATTLOG"):
            continue
        parts = line.split("\t")
        if len(parts) < 5:
            logger.warning("Malformed ATTLOG line (too few fields): %r", line)
            continue
        try:
            uid = int(parts[1])
            punched_at_naive = datetime.strptime(parts[2], "%Y-%m-%d %H:%M:%S")
            punched_at = punched_at_naive.replace(tzinfo=IST)  # treat as IST
            status = int(parts[3])
            verify = int(parts[4])

            punch_type = _STATUS_TO_PUNCH_TYPE.get(status, "in")
            matched = verify in _FINGERPRINT_VERIFY_TYPES

            records.append({
                "uid": uid,
                "punched_at": punched_at,
                "punch_type": punch_type,
                "matched": matched,
            })
        except (ValueError, IndexError) as exc:
            logger.warning("Skipping bad ATTLOG line %r: %s", line, exc)
            continue
    return records


# ── ADMS handlers ─────────────────────────────────────────────────────────────

async def handle_device_register(conn: Connection, sn: str) -> str:
    """
    Handle GET /iclock/cdata (device boot registration + heartbeat).
    Looks up device by serial number, touches last_seen_at, returns ADMS options.
    Returns the options string even for unknown devices but logs a warning —
    returning a hard error causes endless device retries.
    """
    device = await conn.fetchrow(dq.DEVICE_GET_BY_SN, sn)

    if not device:
        logger.warning("ADMS registration from unregistered device SN=%s", sn)
        # Return stamp=9999 so an unknown device sends nothing
        return build_adms_options_response(sn, 9999)

    if not device["is_active"]:
        logger.warning("ADMS registration from inactive device SN=%s", sn)
        return build_adms_options_response(sn, 9999)

    # Touch last_seen_at
    await conn.execute(dq.DEVICE_TOUCH, sn)

    # Return the timestamp of our last received log from this device
    stamp_row = await conn.fetchrow(dq.DEVICE_LAST_ATTLOG_STAMP, device["id"])
    last_stamp = stamp_row["stamp"] if stamp_row else 0

    return build_adms_options_response(sn, last_stamp)


async def handle_attlog(conn: Connection, sn: str, body: str) -> int:
    """
    Handle POST /iclock/cdata?table=ATTLOG.
    Parses ATTLOG lines, resolves employee_id from device_user_id, inserts logs.
    Returns count of records accepted (inserted, not counting dupes skipped).
    """
    device = await conn.fetchrow(dq.DEVICE_GET_BY_SN, sn)

    if not device or not device["is_active"]:
        logger.warning("ATTLOG POST from unknown/inactive device SN=%s — ignoring", sn)
        return 0

    device_id = str(device["id"])
    org_id = str(device["org_id"])

    records = _parse_attlog(body)
    if not records:
        return 0

    accepted = 0
    for rec in records:
        # Resolve device UID → employee_id
        emp_row = await conn.fetchrow(
            q.EMPLOYEE_BY_DEVICE_UID, org_id, rec["uid"]
        )
        employee_id: Optional[str] = str(emp_row["id"]) if emp_row else None
        matched = rec["matched"] and employee_id is not None

        inserted = await conn.fetchrow(
            q.ATTENDANCE_LOG_INSERT,
            org_id,
            employee_id,
            device_id,
            rec["punched_at"],
            rec["punch_type"],
            matched,
            None,  # raw_confidence not provided by ADMS protocol
        )
        if inserted:  # None = ON CONFLICT DO NOTHING fired (duplicate)
            accepted += 1

    logger.info(
        "ATTLOG from SN=%s: %d parsed, %d accepted, %d dupes skipped",
        sn, len(records), accepted, len(records) - accepted,
    )
    return accepted


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4 — DAILY ATTENDANCE PROCESSING ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _compute_shift_window(
    shift_start: time,
    shift_end: time,
    crosses_midnight: bool,
    target_date: date,
) -> tuple[datetime, datetime]:
    """
    Compute the IST timestamp window for a shift on a given date.

    For cross-midnight shifts (e.g. Night 12hr 20:00→08:00):
      window = [target_date 20:00 IST, target_date+1 08:00 IST]

    For same-day shifts (e.g. Morning 8hr 08:00→17:00):
      window = [target_date 08:00 IST, target_date 17:00 IST]

    Adds a 2-hour buffer on each side to catch early arrivals / late departures
    without overlapping adjacent shifts.
    """
    buffer = timedelta(hours=2)

    window_start = datetime.combine(target_date, shift_start, tzinfo=IST)

    if crosses_midnight:
        next_day = target_date + timedelta(days=1)
        window_end = datetime.combine(next_day, shift_end, tzinfo=IST)
    else:
        window_end = datetime.combine(target_date, shift_end, tzinfo=IST)

    # Apply buffer
    window_start -= buffer
    window_end += buffer

    return window_start, window_end


def _pair_punches(logs: list[dict]) -> tuple[Optional[datetime], Optional[datetime]]:
    """
    Extract first IN punch and last OUT punch from a list of logs.
    Logs must be sorted by punched_at ascending.

    Returns (in_time, out_time). Either can be None if missing.
    """
    in_time: Optional[datetime] = None
    out_time: Optional[datetime] = None

    for log in logs:
        if log["punch_type"] == "in" and in_time is None:
            in_time = log["punched_at"]
        if log["punch_type"] == "out":
            out_time = log["punched_at"]  # keep updating → last OUT wins

    return in_time, out_time


def _detect_exception(
    in_time: Optional[datetime],
    out_time: Optional[datetime],
    hours_worked: Decimal,
    duration_hours: Decimal,
    logs: list[dict],
    leave_exists: bool,
) -> Optional[str]:
    """
    Detect anomalies in a processed daily attendance record.
    Returns the exception_type string or None if clean.

    Priority order (first match wins):
      1. leave_conflict  — leave application exists for this date but punches found
      2. missing_punch   — only IN or only OUT, not both
      3. odd_punch_count — punches exist but don't form clean IN→OUT pair
      4. excessive_duration — hours_worked way beyond shift duration
    """
    if leave_exists and len(logs) > 0:
        return "leave_conflict"

    if in_time is not None and out_time is None:
        return "missing_punch"
    if in_time is None and out_time is not None:
        return "missing_punch"

    # Odd punch count: more than 2 punches, could indicate breaks or errors
    if len(logs) > 2:
        # Check if it's actually clean (first in, last out, rest are noise)
        in_count = sum(1 for l in logs if l["punch_type"] == "in")
        out_count = sum(1 for l in logs if l["punch_type"] == "out")
        if in_count > 1 and out_count > 1:
            return "odd_punch_count"

    if hours_worked > duration_hours + EXCESSIVE_HOURS_BUFFER:
        return "excessive_duration"

    return None


async def process_daily_attendance(
    conn: Connection,
    org_id: str,
    from_date: date,
    to_date: date,
) -> dict:
    """
    Core processing engine. For each date in the range, for each active employee:
    1. Compute shift window for the employee's assigned shift
    2. Pull matched attendance_logs within that window
    3. Pair first IN / last OUT
    4. Calculate hours_worked, status, OT/undertime
    5. Detect exceptions → set review_status + exception_type
    6. UPSERT into attendance_daily (skip manually overridden records)

    Returns processing summary stats.
    """
    # Fetch all active employees with their shift + category info
    employees = await conn.fetch(q.ACTIVE_EMPLOYEES_WITH_SHIFT, org_id)

    stats = {
        "dates_processed": 0,
        "employees_processed": len(employees),
        "records_created": 0,
        "records_skipped_override": 0,
        "exceptions_flagged": 0,
    }

    current_date = from_date
    while current_date <= to_date:
        stats["dates_processed"] += 1

        for emp in employees:
            emp_id = str(emp["id"])
            shift_id = str(emp["shift_id"])

            shift_start = emp["start_time"]
            shift_end = emp["end_time"]
            crosses_midnight = emp["crosses_midnight"]
            duration_hours = Decimal(str(emp["duration_hours"]))
            standard_hours = Decimal(str(emp["standard_hours"]))
            pay_type = emp["pay_type"]

            # 1. Compute shift window
            window_start, window_end = _compute_shift_window(
                shift_start, shift_end, crosses_midnight, current_date,
            )

            # 2. Pull matched logs within window
            log_rows = await conn.fetch(
                q.ATTENDANCE_LOGS_IN_WINDOW,
                org_id, emp_id, window_start, window_end,
            )
            logs = [dict(r) for r in log_rows]

            # 3. Pair punches
            in_time, out_time = _pair_punches(logs)

            # 4. Calculate hours_worked
            if in_time and out_time:
                delta = out_time - in_time
                hours_worked = Decimal(str(round(delta.total_seconds() / 3600, 2)))
            else:
                hours_worked = Decimal("0")

            # 5. Determine status
            if len(logs) == 0:
                status = "absent"
            elif in_time is None or out_time is None:
                # Missing punch — flag but mark as present (HR will fix)
                status = "present"
            elif hours_worked < standard_hours * HALF_DAY_THRESHOLD_PERCENT:
                status = "half_day"
            else:
                status = "present"

            # 6. Calculate OT / undertime (Maintenance + Staff only)
            ot_hours = Decimal("0")
            undertime_hours = Decimal("0")
            if pay_type == "hours_based" and status == "present" and hours_worked > 0:
                if hours_worked > standard_hours:
                    ot_hours = hours_worked - standard_hours
                elif hours_worked < standard_hours:
                    undertime_hours = standard_hours - hours_worked

            # 7. Check for leave conflict
            leave_row = await conn.fetchrow(
                q.LEAVE_EXISTS_FOR_DATE, org_id, emp_id, current_date,
            )
            leave_exists = leave_row["exists"] if leave_row else False

            # 8. Detect exceptions
            exception_type = _detect_exception(
                in_time, out_time, hours_worked,
                duration_hours, logs, leave_exists,
            )
            review_status = "flagged" if exception_type else "clean"
            if exception_type:
                stats["exceptions_flagged"] += 1

            # 9. UPSERT into attendance_daily
            result = await conn.fetchrow(
                q.ATTENDANCE_DAILY_UPSERT,
                org_id, emp_id, current_date, shift_id,
                in_time, out_time, float(hours_worked), status,
                float(ot_hours), float(undertime_hours),
                review_status, exception_type,
            )

            if result:
                stats["records_created"] += 1
            else:
                # UPSERT returned nothing → manual override exists, skip
                stats["records_skipped_override"] += 1

        current_date += timedelta(days=1)

    logger.info(
        "Attendance processing complete for org=%s, %s to %s: %s",
        org_id, from_date, to_date, stats,
    )
    return stats


# ── Manual override ───────────────────────────────────────────────────────────

async def override_daily(
    conn: Connection,
    org_id: str,
    daily_id: str,
    data: DailyOverrideRequest,
    user_id: str,
) -> dict:
    """HR manually corrects an attendance_daily record. Sets is_manual_override=TRUE."""
    row = await conn.fetchrow(
        q.ATTENDANCE_DAILY_OVERRIDE,
        daily_id, org_id,
        data.status,
        data.in_time, data.out_time,
        float(data.hours_worked) if data.hours_worked is not None else None,
        float(data.ot_hours) if data.ot_hours is not None else None,
        float(data.undertime_hours) if data.undertime_hours is not None else None,
        user_id,
        data.override_reason,
    )
    if not row:
        raise NotFoundError("Attendance daily record", daily_id)

    result = await conn.fetchrow(q.ATTENDANCE_DAILY_GET, daily_id, org_id)
    return dict(result)


async def create_manual_attendance(
    conn: Connection,
    org_id: str,
    data: ManualAttendanceCreate,
    user_id: str,
) -> dict:
    """HR manually inserts or overwrites an attendance_daily record from scratch."""
    # Ensure employee exists
    emp = await conn.fetchrow(
        "SELECT id FROM employees WHERE id = $1 AND org_id = $2",
        data.employee_id, org_id,
    )
    if not emp:
        raise NotFoundError("Employee", data.employee_id)

    row = await conn.fetchrow(
        q.ATTENDANCE_DAILY_MANUAL_UPSERT,
        org_id,
        data.employee_id,
        data.date,
        data.in_time,
        data.out_time,
        float(data.hours_worked) if data.hours_worked is not None else 0.0,
        data.status,
        float(data.ot_hours) if data.ot_hours is not None else 0.0,
        float(data.undertime_hours) if data.undertime_hours is not None else 0.0,
        user_id,
        data.override_reason,
    )
    
    result = await conn.fetchrow(q.ATTENDANCE_DAILY_GET, row["id"], org_id)
    return dict(result)


# ── Exception resolve ─────────────────────────────────────────────────────────

async def resolve_exception(
    conn: Connection,
    org_id: str,
    daily_id: str,
) -> dict:
    """Clear the exception flag without changing the underlying data."""
    row = await conn.fetchrow(q.ATTENDANCE_DAILY_RESOLVE, daily_id, org_id)
    if not row:
        raise NotFoundError("Flagged attendance record", daily_id)

    result = await conn.fetchrow(q.ATTENDANCE_DAILY_GET, daily_id, org_id)
    return dict(result)


# ── Exception queries ─────────────────────────────────────────────────────────

async def get_exceptions(
    conn: Connection,
    org_id: str,
    year: int,
    month: int,
) -> dict:
    """Get all flagged attendance records for a month + the count."""
    count_row = await conn.fetchrow(
        q.ATTENDANCE_EXCEPTION_COUNT, org_id, month, year,
    )
    flagged_count = count_row["count"] if count_row else 0

    rows = await conn.fetch(
        q.ATTENDANCE_EXCEPTIONS_LIST, org_id, year, month,
    )
    exceptions = [dict(r) for r in rows]

    return {
        "flagged_count": flagged_count,
        "exceptions": exceptions,
    }


# ── Leave service ─────────────────────────────────────────────────────────────

async def create_leave(
    conn: Connection,
    org_id: str,
    data: LeaveCreate,
    created_by: str,
) -> dict:
    """Create a leave application record (no approval workflow)."""
    # Validate employee exists and belongs to org
    emp = await conn.fetchrow(
        "SELECT id FROM employees WHERE id = $1 AND org_id = $2",
        data.employee_id, org_id,
    )
    if not emp:
        raise NotFoundError("Employee", data.employee_id)

    if data.to_date < data.from_date:
        raise BadRequestError("to_date must be >= from_date")

    row = await conn.fetchrow(
        q.LEAVE_INSERT,
        org_id, data.employee_id,
        data.from_date, data.to_date,
        data.reason, created_by,
    )
    return dict(row)


async def list_leaves(
    conn: Connection,
    org_id: str,
    employee_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> list[dict]:
    offset = (page - 1) * page_size
    rows = await conn.fetch(
        q.LEAVE_LIST, org_id, employee_id, page_size, offset,
    )
    return [dict(r) for r in rows]


async def get_leave(
    conn: Connection,
    org_id: str,
    leave_id: str,
) -> dict:
    row = await conn.fetchrow(q.LEAVE_GET, leave_id, org_id)
    if not row:
        raise NotFoundError("Leave application", leave_id)
    return dict(row)


# ── Read helpers (used by report endpoints) ───────────────────────────────────

async def get_logs_by_employee(
    conn: Connection,
    org_id: str,
    employee_id: str,
    from_date: str,
    to_date: str,
) -> list[dict]:
    rows = await conn.fetch(
        q.ATTENDANCE_LOGS_BY_EMPLOYEE, org_id, employee_id, from_date, to_date
    )
    return [dict(r) for r in rows]


async def get_unmatched_logs(
    conn: Connection,
    org_id: str,
    from_date: str,
    to_date: str,
    page: int = 1,
    page_size: int = 50,
) -> list[dict]:
    offset = (page - 1) * page_size
    rows = await conn.fetch(
        q.ATTENDANCE_LOGS_UNMATCHED, org_id, from_date, to_date, page_size, offset
    )
    return [dict(r) for r in rows]


async def get_daily_by_employee(
    conn: Connection,
    org_id: str,
    employee_id: str,
    from_date: str,
    to_date: str,
) -> list[dict]:
    rows = await conn.fetch(
        q.ATTENDANCE_DAILY_BY_EMPLOYEE, org_id, employee_id, from_date, to_date
    )
    return [dict(r) for r in rows]

