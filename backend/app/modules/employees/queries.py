EMPLOYEE_LIST = """
    SELECT
        e.id, e.org_id, e.employee_code, e.name, e.gender,
        e.category_id,     c.name  AS category_name,
        e.sub_category_id, sc.name AS sub_category_name,
        e.department_id,   d.name  AS department_name,
        e.shift_id,        s.name  AS shift_name,
        e.payment_mode, e.epf_enrolled, e.device_user_id,
        e.jobber_type, e.room_no,
        e.is_active, e.joining_date
    FROM employees e
    JOIN categories     c  ON c.id  = e.category_id
    JOIN sub_categories sc ON sc.id = e.sub_category_id
    LEFT JOIN departments d ON d.id  = e.department_id
    JOIN shifts         s  ON s.id  = e.shift_id
    WHERE e.org_id = $1
      AND ($2::boolean IS NULL OR e.is_active = $2)
      AND ($3::text    IS NULL OR e.category_id::text = $3)
    ORDER BY e.name
    LIMIT $4 OFFSET $5
"""

EMPLOYEE_COUNT = """
    SELECT COUNT(*) AS total
    FROM employees e
    WHERE e.org_id = $1
      AND ($2::boolean IS NULL OR e.is_active = $2)
      AND ($3::text    IS NULL OR e.category_id::text = $3)
"""

EMPLOYEE_GET = """
    SELECT
        e.id, e.org_id, e.employee_code, e.name, e.gender,
        e.category_id,     c.name  AS category_name,
        e.sub_category_id, sc.name AS sub_category_name,
        e.department_id,   d.name  AS department_name,
        e.shift_id,        s.name  AS shift_name,
        e.monthly_salary, e.per_day_salary, e.epf_enrolled, e.uan_number,
        e.payment_mode, e.bank_account, e.bank_name, e.bank_ifsc,
        e.pan_number, e.aadhar_number, e.phone_number, e.address, e.city,
        e.jobber_type, e.room_no,
        e.joining_date, e.device_user_id, e.is_active,
        e.created_at, e.updated_at
    FROM employees e
    JOIN categories     c  ON c.id  = e.category_id
    JOIN sub_categories sc ON sc.id = e.sub_category_id
    LEFT JOIN departments d ON d.id  = e.department_id
    JOIN shifts         s  ON s.id  = e.shift_id
    WHERE e.id = $1 AND e.org_id = $2
"""

# $23 = device_user_id
EMPLOYEE_INSERT = """
    INSERT INTO employees (
        org_id, employee_code, name, gender,
        category_id, sub_category_id, department_id, shift_id,
        monthly_salary, per_day_salary, epf_enrolled, uan_number,
        payment_mode, bank_account, bank_name, bank_ifsc,
        pan_number, aadhar_number, phone_number, address, city,
        jobber_type, room_no,
        joining_date, device_user_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    RETURNING id
"""

# $21 = device_user_id
EMPLOYEE_UPDATE = """
    UPDATE employees
    SET name           = COALESCE($3, name),
        gender         = COALESCE($4, gender),
        department_id  = COALESCE($5, department_id),
        shift_id       = COALESCE($6, shift_id),
        monthly_salary = COALESCE($7, monthly_salary),
        per_day_salary = COALESCE($8, per_day_salary),
        epf_enrolled   = COALESCE($9, epf_enrolled),
        uan_number     = COALESCE($10, uan_number),
        payment_mode   = COALESCE($11, payment_mode),
        bank_account   = COALESCE($12, bank_account),
        bank_name      = COALESCE($13, bank_name),
        bank_ifsc      = COALESCE($14, bank_ifsc),
        pan_number     = COALESCE($15, pan_number),
        aadhar_number  = COALESCE($16, aadhar_number),
        phone_number   = COALESCE($17, phone_number),
        address        = COALESCE($18, address),
        city           = COALESCE($19, city),
        is_active      = COALESCE($20, is_active),
        device_user_id = COALESCE($21, device_user_id),
        jobber_type    = COALESCE($22, jobber_type),
        room_no        = COALESCE($23, room_no)
    WHERE id = $1 AND org_id = $2
    RETURNING id
"""

VALIDATE_SUBCATEGORY = """
    SELECT id, salary_type, has_epf, has_components
    FROM sub_categories
    WHERE id = $1 AND category_id = $2 AND org_id = $3
"""

VALIDATE_SHIFT = """
    SELECT id FROM shifts WHERE id = $1 AND org_id = $2 AND is_active = TRUE
"""

VALIDATE_DEPARTMENT = """
    SELECT id FROM departments
    WHERE id = $1 AND org_id = $2 AND category_id = $3 AND is_active = TRUE
"""


# ── Fingerprint queries ───────────────────────────────────────────────────────

FINGERPRINT_LIST = """
    SELECT id, employee_id, org_id, finger_index, enrolled_at, enrolled_by, is_active
    FROM employee_fingerprints
    WHERE employee_id = $1 AND org_id = $2
    ORDER BY finger_index
"""

FINGERPRINT_GET_BY_EMPLOYEE = """
    SELECT id, employee_id, org_id, finger_index, enrolled_at, enrolled_by, is_active
    FROM employee_fingerprints
    WHERE id = $1 AND employee_id = $2 AND org_id = $3
"""

FINGERPRINT_INSERT = """
    INSERT INTO employee_fingerprints
        (employee_id, org_id, finger_index, template_data, enrolled_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, employee_id, org_id, finger_index, enrolled_at, enrolled_by, is_active
"""

FINGERPRINT_UPDATE_TEMPLATE = """
    UPDATE employee_fingerprints
    SET template_data = $4,
        enrolled_at   = NOW(),
        enrolled_by   = $5,
        is_active     = TRUE
    WHERE id = $1 AND employee_id = $2 AND org_id = $3
    RETURNING id, employee_id, org_id, finger_index, enrolled_at, enrolled_by, is_active
"""

FINGERPRINT_DEACTIVATE = """
    UPDATE employee_fingerprints
    SET is_active = FALSE
    WHERE id = $1 AND employee_id = $2 AND org_id = $3
    RETURNING id
"""
