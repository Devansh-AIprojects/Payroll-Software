-- ============================================================
-- 003_config.sql
-- All org-level configuration: shifts, categories, departments,
-- salary component formulas, and labour tier rates.
-- Nothing in this file is hardcoded — every rule is a row.
-- ============================================================

-- ============================================================
-- SHIFTS
-- Defines every shift window in the mill.
-- standard_hours = expected working hours, used for OT/undertime calc.
-- duration_hours = clock time between start and end.
-- crosses_midnight = TRUE when end_time is on the next calendar day.
-- ============================================================

CREATE TABLE shifts (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name             VARCHAR(100)  NOT NULL,
  start_time       TIME          NOT NULL,
  end_time         TIME          NOT NULL,
  duration_hours   NUMERIC(4,2)  NOT NULL,
  standard_hours   NUMERIC(4,2)  NOT NULL, -- threshold for OT/undertime comparison
  crosses_midnight BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE TRIGGER set_updated_at_shifts
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- CATEGORIES
-- Top-level worker grouping. pay_type drives which payroll
-- calculation path the engine takes.
--   tier_based  → Labour (daily rate determined by attendance tier)
--   hours_based → Maintenance, Staff (monthly salary ÷ 30 ± OT/undertime)
-- ============================================================

CREATE TABLE categories (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID         NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  pay_type   VARCHAR(20)  NOT NULL CHECK (pay_type IN ('tier_based', 'hours_based')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

-- ============================================================
-- SUB-CATEGORIES
-- One level below categories.
-- salary_type drives gross calculation:
--   tier       → daily_rate from labour_tier_rates × days_present (Skilled)
--   daily_flat → flat_daily_rate × days_present (Trainee)
--   monthly    → (monthly_salary / 30) × days_present ± OT/undertime
-- has_components = FALSE skips the Basic/DA/Allowances breakdown (Trainee)
-- has_epf       = FALSE skips EPF deduction (Trainee)
-- ============================================================

CREATE TABLE sub_categories (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID          NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  org_id          UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name            VARCHAR(100)  NOT NULL,
  salary_type     VARCHAR(20)   NOT NULL CHECK (salary_type IN ('monthly', 'daily_flat', 'tier')),
  flat_daily_rate NUMERIC(10,2),                    -- only set for daily_flat (Trainee = 420)
  has_epf         BOOLEAN       NOT NULL DEFAULT TRUE,
  has_components  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, category_id, name)
);

-- ============================================================
-- DEPARTMENTS
-- Scoped to org + category so the same name (e.g. "LC", "RF")
-- can exist under both Labour and Maintenance independently.
-- ============================================================

CREATE TABLE departments (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID         NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  category_id UUID         REFERENCES categories(id) ON DELETE SET NULL,
  name        VARCHAR(100) NOT NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, category_id, name)
);

-- ============================================================
-- SALARY COMPONENTS
-- Each row is one component in the payslip breakdown.
-- The engine calculates components in calculation_order sequence.
--
-- formula_type options:
--   percent_of_gross      → value is % of gross (e.g. 50 = 50%)
--   percent_of_component  → value is % of ref_component_id's value
--   fixed                 → value is a flat rupee amount
--
-- is_displayed = FALSE marks intermediate values (T Basic) used
-- only as references by other components — not shown on payslip.
--
-- type = 'deduction' means the value is subtracted from gross
-- when computing net pay.
-- ============================================================

CREATE TABLE salary_components (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name                VARCHAR(100)  NOT NULL,
  type                VARCHAR(20)   NOT NULL CHECK (type IN ('earning', 'deduction')),
  formula_type        VARCHAR(30)   NOT NULL CHECK (
                        formula_type IN (
                          'percent_of_gross',
                          'percent_of_component',
                          'fixed'
                        )
                      ),
  formula_value       NUMERIC(10,4) NOT NULL DEFAULT 0,
  ref_component_id    UUID          REFERENCES salary_components(id) ON DELETE SET NULL,
  calculation_order   INTEGER       NOT NULL DEFAULT 1,
  is_displayed        BOOLEAN       NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, name)
);

CREATE TRIGGER set_updated_at_salary_components
  BEFORE UPDATE ON salary_components
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- LABOUR TIER RATES
-- Per-department, per-tier daily rate for Labour > Skilled.
-- Tier is determined at payroll run time based on days_present
-- for the full month. The matched tier's daily_rate applies to
-- ALL days present that month (not just the days above threshold).
--
-- max_days = NULL means no upper bound (tier 3, 26+ days).
-- ============================================================

CREATE TABLE labour_tier_rates (
  id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  department_id UUID          NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  tier          SMALLINT      NOT NULL CHECK (tier IN (1, 2, 3)),
  min_days      SMALLINT      NOT NULL,
  max_days      SMALLINT,                    -- NULL = no upper bound
  daily_rate    NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, department_id, tier)
);

CREATE TRIGGER set_updated_at_labour_tier_rates
  BEFORE UPDATE ON labour_tier_rates
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
