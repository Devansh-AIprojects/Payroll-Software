from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import verify_password, create_access_token
from app.core.exceptions import UnauthorizedError
from app.database import get_connection

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    org_id: str
    user_id: str
    name: str
    email: str
    org_name: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    async with get_connection() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.org_id, u.role, u.password_hash, u.name, u.email,
                   o.name AS org_name
            FROM users u
            JOIN organisations o ON o.id = u.org_id
            WHERE LOWER(u.email) = LOWER($1) AND u.is_active = TRUE
            LIMIT 1
            """,
            body.email,
        )

    if not row or not verify_password(body.password, row["password_hash"]):
        raise UnauthorizedError("Invalid email or password")

    token = create_access_token(
        user_id=str(row["id"]),
        org_id=str(row["org_id"]),
        role=row["role"],
    )

    return LoginResponse(
        access_token=token,
        role=row["role"],
        org_id=str(row["org_id"]),
        user_id=str(row["id"]),
        name=row["name"],
        email=row["email"],
        org_name=row["org_name"],
    )
