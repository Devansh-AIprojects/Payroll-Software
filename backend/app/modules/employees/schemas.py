from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional
from decimal import Decimal
from datetime import date, datetime


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    gender: Optional[Literal["M", "F", "O"]] = None
    category_id: str
    sub_category_id: str
    department_id: Optional[str] = None
    shift_id: str
    monthly_salary: Optional[Decimal] = Field(None, gt=0)
    per_day_salary: Optional[Decimal] = Field(None, gt=0, description="Actual per-day rate used for payroll. If not set, falls back to monthly_salary / 26.")
    epf_enrolled: bool = False
    uan_number: Optional[str] = Field(None, max_length=30)
    payment_mode: Literal["bank", "cash", "bank_cash"] = "cash"
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    pan_number: Optional[str] = Field(None, max_length=20)
    aadhar_number: Optional[str] = Field(None, max_length=20)
    phone_number: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    jobber_type: Literal["none", "lc", "pp", "rf"] = "none"
    room_no: Optional[str] = Field(None, max_length=50)
    joining_date: date
    device_user_id: Optional[int] = Field(
        None, ge=1, le=32767,
        description=(
            "Numeric ID assigned to this worker on the BioMax fingerprint device. "
            "HR enters this once when registering the worker on the device. "
            "Used to resolve punch logs (ATTLOG UID) to this employee."
        ),
    )


    @model_validator(mode="after")
    def validate_epf_uan(self) -> "EmployeeCreate":
        if self.epf_enrolled and not self.uan_number:
            raise ValueError("uan_number is required when epf_enrolled is True")
        return self


class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    gender: Optional[Literal["M", "F", "O"]] = None
    department_id: Optional[str] = None
    shift_id: Optional[str] = None
    monthly_salary: Optional[Decimal] = Field(None, gt=0)
    per_day_salary: Optional[Decimal] = Field(None, gt=0, description="Actual per-day rate used for payroll calculation.")
    epf_enrolled: Optional[bool] = None
    uan_number: Optional[str] = Field(None, max_length=30)
    payment_mode: Optional[Literal["bank", "cash", "bank_cash"]] = None
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    pan_number: Optional[str] = Field(None, max_length=20)
    aadhar_number: Optional[str] = Field(None, max_length=20)
    phone_number: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    jobber_type: Optional[Literal["none", "lc", "pp", "rf"]] = None
    room_no: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None
    device_user_id: Optional[int] = Field(
        None, ge=1, le=32767,
        description="Update or assign the BioMax device UID for this employee.",
    )


class EmployeeResponse(BaseModel):
    id: str
    org_id: str
    employee_code: str
    name: str
    gender: Optional[str]
    category_id: str
    category_name: str
    sub_category_id: str
    sub_category_name: str
    department_id: Optional[str]
    department_name: Optional[str]
    shift_id: str
    shift_name: str
    monthly_salary: Optional[Decimal]
    per_day_salary: Optional[Decimal]
    epf_enrolled: bool
    uan_number: Optional[str]
    payment_mode: str
    bank_account: Optional[str]
    bank_name: Optional[str]
    bank_ifsc: Optional[str]
    pan_number: Optional[str]
    aadhar_number: Optional[str]
    phone_number: Optional[str]
    address: Optional[str]
    city: Optional[str]
    jobber_type: str
    room_no: Optional[str]
    joining_date: date
    device_user_id: Optional[int]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class EmployeeListItem(BaseModel):
    """Lighter shape for list views — omits bank details."""
    id: str
    employee_code: str
    name: str
    category_name: str
    sub_category_name: str
    department_name: Optional[str]
    shift_name: str
    payment_mode: str
    epf_enrolled: bool
    device_user_id: Optional[int]
    jobber_type: str
    room_no: Optional[str]
    is_active: bool
    joining_date: date


# ── Fingerprint schemas ───────────────────────────────────────────────────────

class FingerprintCreate(BaseModel):
    """Enroll a new finger. template_data is base64-encoded binary from scanner SDK."""
    finger_index: int = Field(
        ge=1, le=10,
        description=(
            "ISO/IEC 19794-2 finger index — "
            "1=right thumb  2=right index  3=right middle  4=right ring  5=right little  "
            "6=left thumb   7=left index   8=left middle   9=left ring   10=left little"
        ),
    )
    template_data: str = Field(
        min_length=1,
        description=(
            "Base64-encoded fingerprint template binary produced by the scanner SDK. "
            "The API decodes → encrypts → stores as BYTEA. Never returned after this call."
        ),
    )


class FingerprintUpdate(BaseModel):
    """Replace the encrypted template for an existing fingerprint row."""
    template_data: str = Field(
        min_length=1,
        description="Base64-encoded fingerprint template binary — replaces the existing template.",
    )


class FingerprintResponse(BaseModel):
    """Metadata-only response. template_data is write-only and never returned via API."""
    id: str
    employee_id: str
    org_id: str
    finger_index: int
    enrolled_at: datetime
    enrolled_by: Optional[str]
    is_active: bool
