from asyncpg import UniqueViolationError, Connection

from app.core.exceptions import NotFoundError, ConflictError
from app.modules.devices import queries as q
from app.modules.devices.schemas import DeviceCreate, DeviceUpdate


async def list_devices(conn: Connection, org_id: str) -> list[dict]:
    rows = await conn.fetch(q.DEVICE_LIST, org_id)
    return [dict(r) for r in rows]


async def get_device(conn: Connection, org_id: str, device_id: str) -> dict:
    row = await conn.fetchrow(q.DEVICE_GET, device_id, org_id)
    if not row:
        raise NotFoundError("Device", device_id)
    return dict(row)


async def create_device(conn: Connection, org_id: str, data: DeviceCreate) -> dict:
    try:
        row = await conn.fetchrow(
            q.DEVICE_INSERT,
            org_id, data.name, data.location, data.device_identifier,
        )
        return dict(row)
    except UniqueViolationError:
        raise ConflictError(
            f"Device with identifier '{data.device_identifier}' is already registered"
        )


async def update_device(
    conn: Connection, org_id: str, device_id: str, data: DeviceUpdate
) -> dict:
    row = await conn.fetchrow(
        q.DEVICE_UPDATE,
        device_id, org_id, data.name, data.location, data.is_active,
    )
    if not row:
        raise NotFoundError("Device", device_id)
    return dict(row)
