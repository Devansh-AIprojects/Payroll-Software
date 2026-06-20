"""
ARQ worker — runs as a separate process alongside the FastAPI app.
Start with: arq workers.main.WorkerSettings

Attendance processing and payroll engine jobs will be registered here.
"""

from datetime import date, timedelta

from arq import cron
from arq.connections import RedisSettings
from app.config import get_settings


# ── Job implementations ──────────────────────────────────────────────────────

async def process_daily_attendance(
    ctx: dict,
    target_date: str | None = None,
    org_id: str | None = None,
) -> dict:
    """
    Phase 4 — Attendance engine.
    Converts raw attendance_logs for a date into attendance_daily records.

    When called by ARQ cron (nightly): target_date=None → processes yesterday.
    When called manually via enqueue: pass explicit date and org_id.
    """
    from app.modules.attendance.service import process_daily_attendance as engine
    from app.database import get_connection

    # Default to yesterday if no date provided (nightly cron)
    if target_date is None:
        d = date.today() - timedelta(days=1)
    else:
        d = date.fromisoformat(target_date)

    # If org_id is None, process all orgs (future multi-tenant)
    # For now, require org_id
    if org_id is None:
        return {"error": "org_id is required"}

    async with get_connection() as conn:
        stats = await engine(conn, org_id, d, d)

    return stats


async def run_payroll(ctx: dict, period_id: str) -> dict:
    """
    Phase 5 — Payroll engine.
    Calculates payroll_records for all employees in a period.
    Triggered by HR from the payroll UI.
    """
    raise NotImplementedError("Payroll engine — Phase 5")


# ── Worker startup / shutdown ────────────────────────────────────────────────

async def startup(ctx: dict) -> None:
    from app.database import get_pool
    from app.redis_client import get_redis

    ctx["db_pool"] = await get_pool()
    ctx["redis"] = await get_redis()


async def shutdown(ctx: dict) -> None:
    from app.database import close_pool
    from app.redis_client import close_redis

    await close_pool()
    await close_redis()


# ── Worker settings ──────────────────────────────────────────────────────────

class WorkerSettings:
    settings = get_settings()

    functions = [
        process_daily_attendance,
        run_payroll,
    ]

    on_startup = startup
    on_shutdown = shutdown

    redis_settings = RedisSettings.from_dsn(settings.redis_url)

    # Nightly cron at 1am IST — processes yesterday's attendance.
    # Disabled for Phase 4 V1 (manual trigger via API).
    # Uncomment when the engine is bulletproof.
    # cron_jobs = [
    #     cron(process_daily_attendance, hour=1, minute=0),
    # ]
    cron_jobs = []

    max_jobs = 4
    job_timeout = 300   # 5 min max per job
    keep_result = 3600  # keep job result in Redis for 1 hour

