import redis.asyncio as aioredis
from app.config import get_settings

_client: aioredis.Redis | None = None

# Key TTLs (seconds)
TTL_FINGERPRINT_CACHE = 300    # 5 min — refreshed on every enrollment change
TTL_PUNCH_LOCK = 60            # 1 min — duplicate punch guard
TTL_SESSION = 28800            # 8 hours — matches JWT expiry
TTL_PAYROLL_LOCK = 3600        # 1 hour — payroll run lock


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        settings = get_settings()
        _client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=False,  # Keep raw bytes — fingerprint templates are binary
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


# ── Key builders ────────────────────────────────────────────────────────────

def key_fingerprint_cache(org_id: str) -> str:
    return f"fp:templates:{org_id}"


def key_punch_lock(employee_id: str, date: str) -> str:
    return f"att:lock:{employee_id}:{date}"


def key_payroll_lock(period_id: str) -> str:
    return f"payroll:lock:{period_id}"
