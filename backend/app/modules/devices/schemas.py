from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    device_identifier: str = Field(
        min_length=1, max_length=100,
        description="Hardware serial number printed on the device label (e.g. AMDB24051400074)",
    )


class DeviceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    location: Optional[str] = Field(None, max_length=255)
    is_active: Optional[bool] = None


class DeviceResponse(BaseModel):
    id: str
    org_id: str
    name: str
    location: Optional[str]
    device_identifier: str
    is_active: bool
    last_seen_at: Optional[datetime]
    created_at: datetime
