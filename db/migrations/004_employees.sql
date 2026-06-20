-- ============================================================
-- 004_employees.sql
-- Employee profiles and encrypted fingerprint templates.
-- ============================================================

-- ============================================================
-- EMPLOYEES
-- Core employee record. monthly_salary is NULL for Labour and
-- Trainee — their gross is derived from tier rates or flat rate.
-- payment_mode is snapshotted onto payroll_records at run time
-- so historical payslips stay accurate if mode changes later.
-- ============================================================

CREATE TABLE employees (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID          NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  employee_code    VARCHAR(50)   NOT NULL,
  name             VARCHAR(255)  NOT NULL,
  gender           CHAR(1)       CHECK (gender IN ('M', 'F', 'O')),
  category_id      UUID          NOT NULL REFERENCES categories(id),
  sub_category_id  UUID          NOT NULL REFERENCES sub_categories(id),
  department_id    UUID          REFERENCES departments(id),
  shift_id         UUID          NOT NULL REFERENCES shifts(id),
  monthly_salary   NUMERIC(10,2),            -- NULL for Labour Skilled and Trainee
  epf_enrolled     BOOLEAN       NOT NULL DEFAULT FALSE,
  uan_number       VARCHAR(30),
  payment_mode     VARCHAR(10)   NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('bank', 'cash')),
  bank_account     VARCHAR(30),
  bank_name        VARCHAR(100),
  bank_ifsc        VARCHAR(15),
  joining_date     DATE          NOT NULL,
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, employee_code)
);

CREATE TRIGGER set_updated_at_employees
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- EMPLOYEE FINGERPRINTS
-- Stores encrypted fingerprint templates linked to employees.
-- template_data is a BYTEA blob — encrypt before insert at the
-- application layer using pgcrypto or AES-256.
-- finger_index follows ISO/IEC 19794-2 convention:
--   1 = right thumb, 2 = right index, 3 = right middle,
--   4 = right ring,  5 = right little,
--   6 = left thumb,  7 = left index,  8 = left middle,
--   9 = left ring,   10 = left little
-- Multiple fingers per employee are stored as separate rows
-- for redundancy (e.g. index fingers on both hands).
-- ============================================================

CREATE TABLE employee_fingerprints (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  org_id        UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  finger_index  SMALLINT    NOT NULL CHECK (finger_index BETWEEN 1 AND 10),
  template_data BYTEA       NOT NULL,
  enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  UNIQUE (employee_id, finger_index)
);
