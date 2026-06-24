# RLS Security Hardening — Task Brief for Claude Code

> **Context:** All 18 Supabase tables have RLS disabled. The backend connects to Postgres via asyncpg using a direct connection string. This doc captures the architecture decisions made in Claude.ai — execute them here.

---

## Threat Model

| Threat | Risk | Fix |
|---|---|---|
| Supabase REST API exposed (anon key leak) | **HIGH** — anyone with the anon key can `SELECT * FROM employees` via `https://project.supabase.co/rest/v1/` | Approach A (now) |
| Backend bug serving wrong org's data | Medium — all queries already scope by `org_id`, but no DB-level enforcement | Approach B (later, multi-tenant) |
| Direct DB credential leak | Low — connection string is in env vars only | Standard secret management |

---

## Approach A — Lock Down Supabase REST API (DO THIS NOW)

### What it does
Revoke all table-level permissions from `anon` and `authenticated` Supabase roles. This kills the REST API attack surface completely. The backend still works because it connects as `postgres` (superuser), which bypasses RLS and role restrictions.

### Why this is enough for now
- Single tenant (STC Cotyarn only)
- Backend already scopes every query with `WHERE org_id = $1`
- No real PII loaded yet (trial uses dummy data)
- `postgres` superuser bypasses RLS anyway — writing row-level policies without changing the connection role is security theater

### Migration to write: `016_lock_supabase_roles.sql`

**Before writing the migration, verify:**

1. **Which role the backend connects as** — read `backend/app/database.py` and `backend/app/config.py` to find the connection string. Check the username in the DSN. If it's `postgres`, Approach A works as described. If it's a different role, adjust accordingly.

2. **Which Supabase roles exist** — run this query:
   ```sql
   SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres');
   ```

3. **Current table permissions** — run this to see what `anon` can already do:
   ```sql
   SELECT grantee, table_name, privilege_type 
   FROM information_schema.table_privileges 
   WHERE table_schema = 'public' 
   AND grantee IN ('anon', 'authenticated');
   ```

### Migration template (adjust after verification):

```sql
-- 016_lock_supabase_roles.sql
-- Revoke all public table access from Supabase API roles.
-- Backend connects as postgres (superuser) so is unaffected.

-- Revoke from anon (unauthenticated REST API callers)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revoke from authenticated (Supabase Auth JWT holders)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Revoke default privileges so future tables are also locked
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
```

### Post-migration verification:

1. Re-run the permissions query — `anon` and `authenticated` should have zero rows
2. Test backend still works (login, list employees, run payroll) — should be unaffected since it uses `postgres` role
3. Test REST API is blocked — try hitting `https://your-project.supabase.co/rest/v1/employees?select=*` with the anon key in the header. Should return 403 or empty.

---

## Approach B — Full Row-Level Security (DO THIS LATER, before multi-tenant)

> **Do NOT implement this now.** This section is reference for when multi-tenant is on the roadmap.

### What it requires

1. **Create a dedicated backend role** (not superuser):
   ```sql
   CREATE ROLE payroll_backend LOGIN PASSWORD 'xxx';
   GRANT USAGE ON SCHEMA public TO payroll_backend;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO payroll_backend;
   ```

2. **Change `database.py`** to connect as `payroll_backend` instead of `postgres`

3. **Set session variable on every request** — in the FastAPI middleware or dependency:
   ```python
   await conn.execute("SET LOCAL app.current_org_id = $1", org_id)
   ```

4. **Enable RLS on every table** and write policies:
   ```sql
   ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
   CREATE POLICY org_isolation ON employees
     USING (org_id = current_setting('app.current_org_id')::uuid);
   ```

5. **Handle tables without direct `org_id`** — some tables (likely `payroll_component_values`, `payroll_deductions`, `employee_fingerprints`) reference a parent row via FK. Policies need JOINs or subqueries:
   ```sql
   CREATE POLICY org_isolation ON payroll_deductions
     USING (record_id IN (
       SELECT id FROM payroll_records WHERE org_id = current_setting('app.current_org_id')::uuid
     ));
   ```

### Tables to categorize (do this during implementation):

**Direct `org_id` column (simple policy):**
- organisations, users, shifts, categories, sub_categories, departments, salary_components, labour_tier_rates, employees, devices, attendance_logs, attendance_daily, leave_applications, payroll_periods, payroll_records

**FK to parent (needs subquery policy):**
- employee_fingerprints → employees.id → org_id
- payroll_component_values → payroll_records.id → org_id
- payroll_deductions → payroll_records.id → org_id

**Verify this by reading actual CREATE TABLE statements before writing policies.**

---

## Summary

| Step | When | Migration |
|---|---|---|
| Approach A: revoke anon/authenticated | **Now, before trial deployment** | `016_lock_supabase_roles.sql` |
| Approach B: session-variable RLS | Before multi-tenant launch | `017_rls_policies.sql` (or later) |
