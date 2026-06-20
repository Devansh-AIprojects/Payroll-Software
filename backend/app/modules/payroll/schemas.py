from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from decimal import Decimal


# ── Period schemas ────────────────────────────────────────────────────────────

class PeriodCreate(BaseModel):
    """Create a new payroll period for a month/year."""
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020)


class PeriodResponse(BaseModel):
    id: str
    org_id: str
    month: int
    year: int
    status: str
    created_at: datetime
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    paid_at: Optional[datetime] = None


class PeriodStatusUpdate(BaseModel):
    """Advance a period's workflow status."""
    status: Literal['processing', 'approved', 'paid']


# ── Deduction schemas ────────────────────────────────────────────────────────

class DeductionCreate(BaseModel):
    """HR enters a manual deduction for an employee in a period."""
    employee_id: str
    type: Literal['advance', 'gift', 'custom']
    label: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., gt=0)


class DeductionResponse(BaseModel):
    id: str
    payroll_record_id: str
    org_id: str
    employee_id: str
    type: str
    label: str
    amount: float
    created_by: Optional[str] = None
    created_at: datetime


# ── Component value schemas ──────────────────────────────────────────────────

class ComponentValueResponse(BaseModel):
    id: str
    payroll_record_id: str
    component_id: Optional[str] = None
    component_name: str
    component_type: str
    is_displayed: bool
    value: float


# ── Payroll record schemas ───────────────────────────────────────────────────

class PayrollRecordResponse(BaseModel):
    id: str
    period_id: str
    org_id: str
    employee_id: str
    employee_name: str
    employee_code: str
    days_present: float
    tier_applied: Optional[int] = None
    daily_rate_applied: Optional[float] = None
    ot_hours: float
    undertime_hours: float
    gross: float
    total_deductions: float
    net_pay: float
    payment_mode: str
    created_at: datetime
    updated_at: datetime


class PayslipResponse(BaseModel):
    """Full payslip: record + component breakdown + deductions."""
    record: PayrollRecordResponse
    components: list[ComponentValueResponse]
    deductions: list[DeductionResponse]


# ── Engine run response ──────────────────────────────────────────────────────

class RunResponse(BaseModel):
    """Summary of a payroll engine run."""
    period_id: str
    employees_processed: int
    records_written: int
    errors: list[str] = []
