from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime, date
from decimal import Decimal


class AttendanceLogResponse(BaseModel):
    id: str
    org_id: str
    employee_id: Optional[str]
    device_id: Optional[str]
    punched_at: datetime
    punch_type: str          # 'in' | 'out'
    matched: bool
    raw_confidence: Optional[float]
    created_at: datetime


class AttendanceDailyResponse(BaseModel):
    id: str
    org_id: str
    employee_id: str
    date: date
    shift_id: Optional[str]
    in_time: Optional[datetime]
    out_time: Optional[datetime]
    hours_worked: float
    status: str
    ot_hours: float
    undertime_hours: float
    tier_applied: Optional[int]
    is_manual_override: bool
    override_by: Optional[str]
    override_reason: Optional[str]
    review_status: str
    exception_type: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Processing engine ─────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Trigger daily attendance processing for a date range."""
    from_date: date
    to_date: date


class ProcessResponse(BaseModel):
    """Summary of processing run."""
    dates_processed: int
    employees_processed: int
    records_created: int
    records_skipped_override: int
    exceptions_flagged: int


# ── Manual override ───────────────────────────────────────────────────────────

class DailyOverrideRequest(BaseModel):
    """HR manually corrects an attendance_daily record."""
    status: Optional[Literal[
        'present', 'absent', 'half_day', 'late', 'holiday', 'weekly_off'
    ]] = None
    in_time: Optional[datetime] = None
    out_time: Optional[datetime] = None
    hours_worked: Optional[Decimal] = Field(None, ge=0)
    ot_hours: Optional[Decimal] = Field(None, ge=0)
    undertime_hours: Optional[Decimal] = Field(None, ge=0)
    override_reason: str = Field(min_length=1, max_length=500)


# ── Exceptions ────────────────────────────────────────────────────────────────

class ExceptionResponse(BaseModel):
    """A flagged attendance_daily record with employee info."""
    id: str
    org_id: str
    employee_id: str
    employee_name: str
    employee_code: str
    date: date
    shift_id: Optional[str]
    in_time: Optional[datetime]
    out_time: Optional[datetime]
    hours_worked: float
    status: str
    ot_hours: float
    undertime_hours: float
    review_status: str
    exception_type: Optional[str]
    is_manual_override: bool
    override_by: Optional[str]
    override_reason: Optional[str]
    created_at: datetime
    updated_at: datetime


class ExceptionSummary(BaseModel):
    """Count of unresolved exceptions for a month."""
    flagged_count: int
    exceptions: list[ExceptionResponse]


# ── Leave ─────────────────────────────────────────────────────────────────────

class LeaveCreate(BaseModel):
    employee_id: str
    from_date: date
    to_date: date
    reason: Optional[str] = None


class LeaveResponse(BaseModel):
    id: str
    org_id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    from_date: date
    to_date: date
    reason: Optional[str]
    applied_at: datetime
    created_by: Optional[str]
    created_at: datetime

