import base64

from asyncpg import UniqueViolationError, Connection
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.core.exceptions import NotFoundError, ConflictError, BadRequestError
from app.modules.employees import queries as q
from app.modules.employees.schemas import (
    EmployeeCreate, EmployeeUpdate,
    FingerprintCreate, FingerprintUpdate,
)


# ── Employee service ──────────────────────────────────────────────────────────

async def list_employees(
    conn: Connection,
    org_id: str,
    is_active: bool | None = None,
    category_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    offset = (page - 1) * page_size
    rows = await conn.fetch(
        q.EMPLOYEE_LIST, org_id, is_active, category_id, page_size, offset
    )
    count_row = await conn.fetchrow(q.EMPLOYEE_COUNT, org_id, is_active, category_id)
    total = count_row["total"]
    return [dict(r) for r in rows], total


async def get_employee(conn: Connection, org_id: str, employee_id: str) -> dict:
    row = await conn.fetchrow(q.EMPLOYEE_GET, employee_id, org_id)
    if not row:
        raise NotFoundError("Employee", employee_id)
    data = dict(row)
    data["pan_number"] = _decrypt_field(data.get("pan_number"))
    data["aadhar_number"] = _decrypt_field(data.get("aadhar_number"))
    data["bank_account"] = _decrypt_field(data.get("bank_account"))
    data["bank_ifsc"] = _decrypt_field(data.get("bank_ifsc"))
    return data


async def create_employee(
    conn: Connection, org_id: str, data: EmployeeCreate
) -> dict:
    await _validate_refs(
        conn, org_id, data.category_id, data.sub_category_id,
        data.shift_id, data.department_id, data.monthly_salary,
    )
    try:
        row = await conn.fetchrow(
            q.EMPLOYEE_INSERT,
            org_id, data.employee_code, data.name, data.gender,
            data.category_id, data.sub_category_id, data.department_id, data.shift_id,
            data.monthly_salary, data.per_day_salary, data.epf_enrolled, data.uan_number,
            data.payment_mode, _encrypt_field(data.bank_account), data.bank_name,
            _encrypt_field(data.bank_ifsc),
            _encrypt_field(data.pan_number), _encrypt_field(data.aadhar_number),
            data.phone_number, data.address, data.city,
            data.jobber_type, data.room_no,
            data.joining_date, data.device_user_id,
        )
        return await get_employee(conn, org_id, str(row["id"]))
    except UniqueViolationError as exc:
        constraint = getattr(exc, "constraint_name", "") or ""
        if "device_user_id" in constraint:
            raise ConflictError(
                f"Device user ID {data.device_user_id} is already assigned to another employee"
            )
        raise ConflictError(f"Employee code '{data.employee_code}' already exists")


async def update_employee(
    conn: Connection, org_id: str, employee_id: str, data: EmployeeUpdate
) -> dict:
    existing = await get_employee(conn, org_id, employee_id)

    if data.shift_id:
        shift = await conn.fetchrow(q.VALIDATE_SHIFT, data.shift_id, org_id)
        if not shift:
            raise NotFoundError("Shift", data.shift_id)

    if data.department_id:
        dept = await conn.fetchrow(
            q.VALIDATE_DEPARTMENT,
            data.department_id, org_id, existing["category_id"],
        )
        if not dept:
            raise BadRequestError(
                "Department not found or does not belong to this employee's category"
            )

    try:
        row = await conn.fetchrow(
            q.EMPLOYEE_UPDATE,
            employee_id, org_id,
            data.name, data.gender, data.department_id, data.shift_id,
            data.monthly_salary, data.per_day_salary, data.epf_enrolled, data.uan_number,
            data.payment_mode, _encrypt_field(data.bank_account), data.bank_name,
            _encrypt_field(data.bank_ifsc),
            _encrypt_field(data.pan_number), _encrypt_field(data.aadhar_number),
            data.phone_number, data.address, data.city,
            data.is_active, data.device_user_id,
            data.jobber_type, data.room_no,
        )
    except UniqueViolationError:
        raise ConflictError(
            f"Device user ID {data.device_user_id} is already assigned to another employee"
        )

    if not row:
        raise NotFoundError("Employee", employee_id)
    return await get_employee(conn, org_id, employee_id)


async def deactivate_employee(
    conn: Connection, org_id: str, employee_id: str
) -> dict:
    row = await conn.fetchrow(
        """
        UPDATE employees SET is_active = FALSE
        WHERE id = $1 AND org_id = $2
        RETURNING id
        """,
        employee_id, org_id,
    )
    if not row:
        raise NotFoundError("Employee", employee_id)
    return await get_employee(conn, org_id, employee_id)


# ── Validation helpers ────────────────────────────────────────────────────────

async def _validate_refs(
    conn: Connection,
    org_id: str,
    category_id: str,
    sub_category_id: str,
    shift_id: str,
    department_id: str | None,
    monthly_salary: float | None,
) -> None:
    sub_cat = await conn.fetchrow(
        q.VALIDATE_SUBCATEGORY, sub_category_id, category_id, org_id
    )
    if not sub_cat:
        raise BadRequestError(
            "sub_category_id does not belong to the specified category"
        )

    if sub_cat["salary_type"] == "monthly" and monthly_salary is None:
        raise BadRequestError(
            "monthly_salary is required for sub-category salary_type 'monthly'"
        )

    if sub_cat["salary_type"] in ("tier", "daily_flat") and monthly_salary is not None:
        raise BadRequestError(
            f"monthly_salary must not be set for salary_type '{sub_cat['salary_type']}'"
        )

    shift = await conn.fetchrow(q.VALIDATE_SHIFT, shift_id, org_id)
    if not shift:
        raise NotFoundError("Shift", shift_id)

    if department_id:
        dept = await conn.fetchrow(
            q.VALIDATE_DEPARTMENT, department_id, org_id, category_id
        )
        if not dept:
            raise BadRequestError(
                "department_id not found or does not match the employee's category"
            )


# ── Encryption helpers ────────────────────────────────────────────────────────

def _get_fernet() -> Fernet:
    return Fernet(get_settings().encryption_key.encode())


def _encrypt_template(b64_template: str) -> bytes:
    try:
        raw: bytes = base64.b64decode(b64_template, validate=True)
    except Exception:
        raise BadRequestError("template_data is not valid base64")
    if not raw:
        raise BadRequestError("template_data decoded to empty bytes")
    return _get_fernet().encrypt(raw)


def _encrypt_field(value: str | None) -> str | None:
    """
    Encrypt a sensitive text field (PAN, Aadhar) before it touches the DB.
    None passes through untouched — lets EMPLOYEE_UPDATE's COALESCE("don't
    change this field") keep working exactly as before.
    """
    if value is None:
        return None
    return _get_fernet().encrypt(value.encode()).decode()


def _decrypt_field(value: str | None) -> str | None:
    """
    Decrypt a sensitive text field read back from the DB.
    Returns None on missing or undecryptable input (e.g. wrong key,
    corrupted value) rather than raising — a bad PAN/Aadhar value should
    never take down the whole employee record in a list/detail view.
    """
    if value is None:
        return None
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


# ── Fingerprint service ───────────────────────────────────────────────────────

async def list_fingerprints(
    conn: Connection, org_id: str, employee_id: str
) -> list[dict]:
    await get_employee(conn, org_id, employee_id)
    rows = await conn.fetch(q.FINGERPRINT_LIST, employee_id, org_id)
    return [dict(r) for r in rows]


async def enroll_fingerprint(
    conn: Connection,
    org_id: str,
    employee_id: str,
    data: FingerprintCreate,
    enrolled_by: str,
) -> dict:
    await get_employee(conn, org_id, employee_id)
    encrypted = _encrypt_template(data.template_data)
    try:
        row = await conn.fetchrow(
            q.FINGERPRINT_INSERT,
            employee_id, org_id, data.finger_index, encrypted, enrolled_by,
        )
    except UniqueViolationError:
        raise ConflictError(
            f"Finger index {data.finger_index} is already enrolled for this employee. "
            "Use PATCH to re-enroll."
        )
    return dict(row)


async def reenroll_fingerprint(
    conn: Connection,
    org_id: str,
    employee_id: str,
    fp_id: str,
    data: FingerprintUpdate,
    enrolled_by: str,
) -> dict:
    await get_employee(conn, org_id, employee_id)
    encrypted = _encrypt_template(data.template_data)
    row = await conn.fetchrow(
        q.FINGERPRINT_UPDATE_TEMPLATE,
        fp_id, employee_id, org_id, encrypted, enrolled_by,
    )
    if not row:
        raise NotFoundError("Fingerprint", fp_id)
    return dict(row)


async def deactivate_fingerprint(
    conn: Connection, org_id: str, employee_id: str, fp_id: str
) -> dict:
    await get_employee(conn, org_id, employee_id)
    row = await conn.fetchrow(
        q.FINGERPRINT_DEACTIVATE,
        fp_id, employee_id, org_id,
    )
    if not row:
        raise NotFoundError("Fingerprint", fp_id)
    fp = await conn.fetchrow(
        q.FINGERPRINT_GET_BY_EMPLOYEE, fp_id, employee_id, org_id
    )
    return dict(fp)
