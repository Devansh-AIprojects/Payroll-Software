# All SQL for the config module in one place.
# Every query is org-scoped — org_id is always a parameter.

# ── Shifts ───────────────────────────────────────────────────────────────────

SHIFT_LIST = """
    SELECT id, org_id, name,
           start_time::text, end_time::text,
           duration_hours, standard_hours,
           crosses_midnight, is_active, created_at, updated_at
    FROM shifts
    WHERE org_id = $1
    ORDER BY name
"""

SHIFT_GET = """
    SELECT id, org_id, name,
           start_time::text, end_time::text,
           duration_hours, standard_hours,
           crosses_midnight, is_active, created_at, updated_at
    FROM shifts
    WHERE id = $1 AND org_id = $2
"""

SHIFT_INSERT = """
    INSERT INTO shifts
      (org_id, name, start_time, end_time, duration_hours, standard_hours, crosses_midnight)
    VALUES ($1, $2, $3::time, $4::time, $5, $6, $7)
    RETURNING id, org_id, name,
              start_time::text, end_time::text,
              duration_hours, standard_hours,
              crosses_midnight, is_active, created_at, updated_at
"""

SHIFT_UPDATE = """
    UPDATE shifts
    SET name             = COALESCE($3, name),
        start_time       = COALESCE($4::time, start_time),
        end_time         = COALESCE($5::time, end_time),
        duration_hours   = COALESCE($6, duration_hours),
        standard_hours   = COALESCE($7, standard_hours),
        crosses_midnight = COALESCE($8, crosses_midnight),
        is_active        = COALESCE($9, is_active)
    WHERE id = $1 AND org_id = $2
    RETURNING id, org_id, name,
              start_time::text, end_time::text,
              duration_hours, standard_hours,
              crosses_midnight, is_active, created_at, updated_at
"""

# ── Categories ───────────────────────────────────────────────────────────────

CATEGORY_LIST = """
    SELECT id, org_id, name, pay_type, created_at
    FROM categories
    WHERE org_id = $1
    ORDER BY name
"""

CATEGORY_GET = """
    SELECT id, org_id, name, pay_type, created_at
    FROM categories
    WHERE id = $1 AND org_id = $2
"""

CATEGORY_INSERT = """
    INSERT INTO categories (org_id, name, pay_type)
    VALUES ($1, $2, $3)
    RETURNING id, org_id, name, pay_type, created_at
"""

# ── Sub-categories ───────────────────────────────────────────────────────────

SUBCATEGORY_LIST = """
    SELECT id, org_id, category_id, name, salary_type,
           flat_daily_rate, has_epf, has_components, created_at
    FROM sub_categories
    WHERE org_id = $1
    ORDER BY name
"""

SUBCATEGORY_LIST_BY_CATEGORY = """
    SELECT id, org_id, category_id, name, salary_type,
           flat_daily_rate, has_epf, has_components, created_at
    FROM sub_categories
    WHERE org_id = $1 AND category_id = $2
    ORDER BY name
"""

SUBCATEGORY_GET = """
    SELECT id, org_id, category_id, name, salary_type,
           flat_daily_rate, has_epf, has_components, created_at
    FROM sub_categories
    WHERE id = $1 AND org_id = $2
"""

SUBCATEGORY_INSERT = """
    INSERT INTO sub_categories
      (category_id, org_id, name, salary_type, flat_daily_rate, has_epf, has_components)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, org_id, category_id, name, salary_type,
              flat_daily_rate, has_epf, has_components, created_at
"""

# ── Departments ───────────────────────────────────────────────────────────────

DEPARTMENT_LIST = """
    SELECT d.id, d.org_id, d.category_id, d.name, d.is_active, d.created_at,
           c.name AS category_name
    FROM departments d
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE d.org_id = $1
    ORDER BY c.name NULLS LAST, d.name
"""

DEPARTMENT_LIST_BY_CATEGORY = """
    SELECT d.id, d.org_id, d.category_id, d.name, d.is_active, d.created_at,
           c.name AS category_name
    FROM departments d
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE d.org_id = $1 AND d.category_id = $2
    ORDER BY d.name
"""

DEPARTMENT_GET = """
    SELECT d.id, d.org_id, d.category_id, d.name, d.is_active, d.created_at,
           c.name AS category_name
    FROM departments d
    LEFT JOIN categories c ON c.id = d.category_id
    WHERE d.id = $1 AND d.org_id = $2
"""

DEPARTMENT_INSERT = """
    INSERT INTO departments (org_id, category_id, name)
    VALUES ($1, $2, $3)
    RETURNING id, org_id, category_id, name, is_active, created_at
"""

# ── Salary Components ─────────────────────────────────────────────────────────

SALARY_COMPONENT_LIST = """
    SELECT sc.id, sc.org_id, sc.name, sc.type, sc.formula_type,
           sc.formula_value, sc.ref_component_id,
           ref.name AS ref_component_name,
           sc.calculation_order, sc.is_displayed, sc.is_active,
           sc.created_at, sc.updated_at
    FROM salary_components sc
    LEFT JOIN salary_components ref ON ref.id = sc.ref_component_id
    WHERE sc.org_id = $1
    ORDER BY sc.calculation_order
"""

SALARY_COMPONENT_GET = """
    SELECT sc.id, sc.org_id, sc.name, sc.type, sc.formula_type,
           sc.formula_value, sc.ref_component_id,
           ref.name AS ref_component_name,
           sc.calculation_order, sc.is_displayed, sc.is_active,
           sc.created_at, sc.updated_at
    FROM salary_components sc
    LEFT JOIN salary_components ref ON ref.id = sc.ref_component_id
    WHERE sc.id = $1 AND sc.org_id = $2
"""

SALARY_COMPONENT_INSERT = """
    INSERT INTO salary_components
      (org_id, name, type, formula_type, formula_value,
       ref_component_id, calculation_order, is_displayed)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
"""

SALARY_COMPONENT_UPDATE = """
    UPDATE salary_components
    SET name              = COALESCE($3, name),
        formula_type      = COALESCE($4, formula_type),
        formula_value     = COALESCE($5, formula_value),
        ref_component_id  = COALESCE($6, ref_component_id),
        calculation_order = COALESCE($7, calculation_order),
        is_displayed      = COALESCE($8, is_displayed),
        is_active         = COALESCE($9, is_active)
    WHERE id = $1 AND org_id = $2
    RETURNING id
"""

# ── Labour Tier Rates ─────────────────────────────────────────────────────────

TIER_RATE_LIST = """
    SELECT ltr.id, ltr.org_id, ltr.department_id, ltr.tier,
           ltr.min_days, ltr.max_days, ltr.daily_rate,
           ltr.created_at, ltr.updated_at,
           d.name AS department_name
    FROM labour_tier_rates ltr
    JOIN departments d ON d.id = ltr.department_id
    WHERE ltr.org_id = $1
    ORDER BY d.name, ltr.tier
"""

TIER_RATE_LIST_BY_DEPT = """
    SELECT ltr.id, ltr.org_id, ltr.department_id, ltr.tier,
           ltr.min_days, ltr.max_days, ltr.daily_rate,
           ltr.created_at, ltr.updated_at,
           d.name AS department_name
    FROM labour_tier_rates ltr
    JOIN departments d ON d.id = ltr.department_id
    WHERE ltr.org_id = $1 AND ltr.department_id = $2
    ORDER BY ltr.tier
"""

TIER_RATE_DELETE_BY_DEPT = """
    DELETE FROM labour_tier_rates
    WHERE org_id = $1 AND department_id = $2
"""

TIER_RATE_INSERT = """
    INSERT INTO labour_tier_rates
      (org_id, department_id, tier, min_days, max_days, daily_rate)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, org_id, department_id, tier,
              min_days, max_days, daily_rate, created_at, updated_at
"""
