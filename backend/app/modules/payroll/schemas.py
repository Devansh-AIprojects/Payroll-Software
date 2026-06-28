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
    jobber_allowance: float
    total_deductions: float
    net_pay: float
    payment_mode: str
    # Used by the period view to split records into Labour vs Maintenance/Staff
    # tabs (pay_type) and to show the monthly-salary columns on the Staff tab.
    pay_type: Optional[str] = None
    monthly_salary: Optional[float] = None
    per_day_salary: Optional[float] = None
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


# ── Salary sheet ─────────────────────────────────────────────────────────────

class SalarySheetRow(BaseModel):
    sr_no: int
    employee_id: str
    employee_code: str
    employee_name: str
    gender: Optional[str] = None
    # 'tier'/'daily_flat' = Labour group, 'monthly' = Maintenance/Staff. Frontend
    # uses this to split the sheet into per-class tabs + separate Excel exports.
    salary_type: Optional[str] = None
    monthly_salary: Optional[float] = None   # None for Labour/Trainee → frontend shows "—"
    per_day: Optional[float] = None
    days_present: float
    ot_hours: float = 0
    gross: float
    basic: Optional[float] = None
    da: Optional[float] = None
    t_basic: Optional[float] = None
    allowances: Optional[float] = None
    epf: Optional[float] = None
    total_deductions: float
    net_pay: float
    payment_mode: str
