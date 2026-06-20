-- ============================================================
-- 002_tenant.sql
-- Multi-tenant root: organisations and users
-- Every other table references org_id from here
-- ============================================================

CREATE TABLE organisations (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255)  NOT NULL,
  address     TEXT,
  city        VARCHAR(100),
  state       VARCHAR(100),
  pincode     VARCHAR(10),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  gstin       VARCHAR(20),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at_organisations
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================

CREATE TABLE users (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID         NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  password_hash  TEXT         NOT NULL,
  role           VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'hr', 'viewer')),
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
