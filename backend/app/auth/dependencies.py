from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import bcrypt

from app.config import get_settings
from app.core.exceptions import UnauthorizedError, ForbiddenError

bearer_scheme = HTTPBearer(auto_error=False)


ALGORITHM = "HS256"


@dataclass
class AuthUser:
    user_id: str
    org_id: str
    role: str


# ── Token helpers ────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: str, org_id: str, role: str) -> str:
    from datetime import datetime, timedelta, timezone

    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {
        "sub": user_id,
        "org_id": org_id,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


# ── Request dependency ───────────────────────────────────────────────────────

async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
    ] = None,
) -> AuthUser:
    if credentials is None:
        raise UnauthorizedError()

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
        org_id: str | None = payload.get("org_id")
        role: str | None = payload.get("role")

        if not all([user_id, org_id, role]):
            raise UnauthorizedError("Malformed token")

    except JWTError:
        raise UnauthorizedError("Token invalid or expired")

    # NOTE: We intentionally do NOT re-query the DB to check is_active on every
    # request. That round-trip dominated latency (~1s/request, cross-region) and
    # roughly doubled every authenticated call. We trust the signed JWT for its
    # lifetime (settings.access_token_expire_minutes). Trade-off: a deactivated
    # user stays valid until their token expires. If immediate revocation is ever
    # required, re-introduce a check here — ideally cached in Redis, not a raw DB
    # hit on the hot path.
    return AuthUser(user_id=user_id, org_id=org_id, role=role)


# ── Role guards ──────────────────────────────────────────────────────────────

def require_role(*roles: str):
    async def _check(
        user: AuthUser = Depends(get_current_user),
    ) -> AuthUser:
        if user.role not in roles:
            raise ForbiddenError(f"Requires one of: {', '.join(roles)}")
        return user
    return _check


# Shorthand guards used in route files
require_admin = Depends(require_role("admin"))
require_hr    = Depends(require_role("admin", "hr"))
require_any   = Depends(get_current_user)
