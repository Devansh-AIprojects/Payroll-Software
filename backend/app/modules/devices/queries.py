DEVICE_INSERT = """
    INSERT INTO devices (org_id, name, location, device_identifier)
    VALUES ($1, $2, $3, $4)
    RETURNING id, org_id, name, location, device_identifier, is_active, last_seen_at, created_at
"""

DEVICE_LIST = """
    SELECT id, org_id, name, location, device_identifier, is_active, last_seen_at, created_at
    FROM devices
    WHERE org_id = $1
    ORDER BY name
"""

DEVICE_GET = """
    SELECT id, org_id, name, location, device_identifier, is_active, last_seen_at, created_at
    FROM devices
    WHERE id = $1 AND org_id = $2
"""

DEVICE_UPDATE = """
    UPDATE devices
    SET name      = COALESCE($3, name),
        location  = COALESCE($4, location),
        is_active = COALESCE($5, is_active)
    WHERE id = $1 AND org_id = $2
    RETURNING id, org_id, name, location, device_identifier, is_active, last_seen_at, created_at
"""

# Used by ADMS receiver — looks up device globally by serial number.
# No org_id filter: serial numbers are globally unique hardware identifiers.
DEVICE_GET_BY_SN = """
    SELECT id, org_id, is_active, last_seen_at
    FROM devices
    WHERE device_identifier = $1
"""

# Touch last_seen_at on every device check-in / heartbeat.
DEVICE_TOUCH = """
    UPDATE devices
    SET last_seen_at = NOW()
    WHERE device_identifier = $1
"""

# Last punch timestamp for this device — returned as ATTLOGStamp so
# the device only resends logs we haven't seen yet.
DEVICE_LAST_ATTLOG_STAMP = """
    SELECT COALESCE(
        EXTRACT(EPOCH FROM MAX(punched_at))::BIGINT,
        0
    ) AS stamp
    FROM attendance_logs
    WHERE device_id = $1
"""
