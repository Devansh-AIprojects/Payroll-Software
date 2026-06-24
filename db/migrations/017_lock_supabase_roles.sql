-- ============================================================
-- 017: Lock Supabase REST API roles
--   Revoke all table/sequence/function access from anon and
--   authenticated roles. The backend connects as postgres
--   (superuser) via asyncpg and is completely unaffected.
--
--   This kills the Supabase REST API attack surface: no one
--   holding only the anon or service JWT can read or write
--   any table via https://project.supabase.co/rest/v1/.
--
--   Approach B (per-row org isolation via session variables)
--   is tracked in RLS_SECURITY.md and deferred to pre-
--   multi-tenant launch.
-- ============================================================

-- Revoke existing grants from anon
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revoke existing grants from authenticated
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Lock future objects too (so new tables aren't accidentally open)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
