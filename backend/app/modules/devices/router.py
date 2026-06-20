from fastapi import APIRouter

from app.auth.dependencies import require_hr, require_admin, AuthUser
from app.core.responses import APIResponse
from app.database import get_connection
from app.modules.devices import service
from app.modules.devices.schemas import DeviceCreate, DeviceUpdate, DeviceResponse

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=APIResponse[list[DeviceResponse]])
async def list_devices(user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.list_devices(conn, user.org_id)
    return APIResponse(data=data)


@router.post("", response_model=APIResponse[DeviceResponse], status_code=201)
async def create_device(body: DeviceCreate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.create_device(conn, user.org_id, body)
    return APIResponse(data=data, message="Device registered")


@router.get("/{device_id}", response_model=APIResponse[DeviceResponse])
async def get_device(device_id: str, user: AuthUser = require_hr):
    async with get_connection() as conn:
        data = await service.get_device(conn, user.org_id, device_id)
    return APIResponse(data=data)


@router.patch("/{device_id}", response_model=APIResponse[DeviceResponse])
async def update_device(device_id: str, body: DeviceUpdate, user: AuthUser = require_admin):
    async with get_connection() as conn:
        data = await service.update_device(conn, user.org_id, device_id, body)
    return APIResponse(data=data)
