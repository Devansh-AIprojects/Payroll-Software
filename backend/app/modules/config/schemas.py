from pydantic import BaseModel, Field
from typing import Literal, Optional
from decimal import Decimal
from datetime import datetime


# ── Shifts ───────────────────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")   # "08:00"
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    duration_hours: Decimal = Field(gt=0, le=24)
    standard_hours: Decimal = Field(gt=0, le=24)
    crosses_midnight: bool = False


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    start_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    end_time: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    duration_hours: Optional[Decimal] = Field(None, gt=0, le=24)
    standard_hours: Optional[Decimal] = Field(None, gt=0, le=24)
    crosses_midnight: Optional[bool] = None
    is_active: Optional[bool] = None


class ShiftResponse(BaseModel):
    id: str
    org_id: str
    name: str
    start_time: str
    end_time: str
    duration_hours: Decimal
    standard_hours: Decimal
    crosses_midnight: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Categories ───────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pay_type: Literal["tier_based", "hours_based"]


class CategoryResponse(BaseModel):
    id: str
    org_id: str
    name: str
    pay_type: str
    created_at: datetime


# ── Sub-categories ───────────────────────────────────────────────────────────

class SubCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    salary_type: Literal["monthly", "daily_flat", "tier"]
    flat_daily_rate: Optional[Decimal] = Field(None, ge=0)
    has_epf: bool = True
    has_components: bool = True


class SubCategoryResponse(BaseModel):
    id: str
    org_id: str
    category_id: str
    name: str
    salary_type: str
    flat_daily_rate: Optional[Decimal]
    has_epf: bool
    has_components: bool
    created_at: datetime


# ── Departments ───────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category_id: Optional[str] = None


class DepartmentResponse(BaseModel):
    id: str
    org_id: str
    category_id: Optional[str]
    name: str
    is_active: bool
    created_at: datetime


# ── Salary Components ─────────────────────────────────────────────────────────

class SalaryComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: Literal["earning", "deduction"]
    formula_type: Literal["percent_of_gross", "percent_of_component", "fixed"]
    formula_value: Decimal = Field(ge=0)
    ref_component_id: Optional[str] = None
    calculation_order: int = Field(ge=1)
    is_displayed: bool = True


class SalaryComponentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    formula_type: Optional[Literal["percent_of_gross", "percent_of_component", "fixed"]] = None
    formula_value: Optional[Decimal] = Field(None, ge=0)
    ref_component_id: Optional[str] = None
    calculation_order: Optional[int] = Field(None, ge=1)
    is_displayed: Optional[bool] = None
    is_active: Optional[bool] = None


class SalaryComponentResponse(BaseModel):
    id: str
    org_id: str
    name: str
    type: str
    formula_type: str
    formula_value: Decimal
    ref_component_id: Optional[str]
    ref_component_name: Optional[str]   # joined from self-reference
    calculation_order: int
    is_displayed: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Labour Tier Rates ─────────────────────────────────────────────────────────
# Sent and returned as a group of 3 tiers per department

class TierRate(BaseModel):
    tier: Literal[1, 2, 3]
    min_days: int = Field(ge=0, le=31)
    max_days: Optional[int] = Field(None, ge=0, le=31)
    daily_rate: Decimal = Field(gt=0)


class LabourTierRatesUpsert(BaseModel):
    """Replace all 3 tiers for a department in one call."""
    tiers: list[TierRate] = Field(min_length=3, max_length=3)


class LabourTierRateResponse(BaseModel):
    id: str
    org_id: str
    department_id: str
    department_name: str    # joined
    tier: int
    min_days: int
    max_days: Optional[int]
    daily_rate: Decimal
    created_at: datetime
    updated_at: datetime
