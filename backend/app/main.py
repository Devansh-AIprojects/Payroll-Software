from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import get_pool, close_pool
from app.redis_client import get_redis, close_redis
from app.auth.router import router as auth_router
from app.modules.config.router import router as config_router
from app.modules.employees.router import router as employees_router
from app.modules.devices.router import router as devices_router
from app.modules.attendance.router import adms_router, attendance_router, leave_router
from app.modules.payroll.router import router as payroll_router

# ── Lifespan (replaces on_event startup/shutdown) ────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await get_pool()
    await get_redis()
    yield
    # Shutdown
    await close_pool()
    await close_redis()


# ── App ───────────────────────────────────────────────────────────────────────

settings = get_settings()

# Fail fast: refuse to boot in production without an explicit CORS allowlist,
# rather than silently running with allow_origins=[] and breaking every
# cross-origin frontend request with a confusing CORS error later.
if settings.is_production and not settings.cors_allowed_origins:
    raise RuntimeError(
        "CORS_ALLOWED_ORIGINS must be set in production .env — "
        "e.g. CORS_ALLOWED_ORIGINS=https://your-frontend-domain.com"
    )

app = FastAPI(
    title="Mill Payroll & Attendance API",
    version="0.1.0",
    debug=settings.app_debug,
    lifespan=lifespan,
    # Disable docs in production
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if settings.app_debug:
        raise exc
    return JSONResponse(
        status_code=500,
        content={"success": False, "detail": "Internal server error"},
    )


# ── Routers ───────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth_router,      prefix=API_PREFIX)
app.include_router(config_router,    prefix=API_PREFIX)
app.include_router(employees_router, prefix=API_PREFIX)
app.include_router(devices_router)
app.include_router(adms_router)       # mounts at /iclock — no auth
app.include_router(attendance_router) # mounts at /attendance — JWT auth
app.include_router(leave_router, prefix=API_PREFIX)  # mounts at /api/v1/leave — JWT auth
app.include_router(payroll_router, prefix=API_PREFIX)  # mounts at /api/v1/payroll — JWT auth


# ── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}
