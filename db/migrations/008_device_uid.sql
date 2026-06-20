-- ============================================================
-- 008_device_uid.sql
-- Adds device_user_id to employees so ADMS punch logs can be
-- resolved to an employee_id.
--
-- HR enters this number once when registering the worker on
-- the BioMax device. The device sends it in every ATTLOG line.
-- UNIQUE per org — different orgs can both have employee #1.
-- ============================================================

ALTER TABLE employees
  ADD COLUMN device_user_id SMALLINT,
  ADD CONSTRAINT employees_device_user_id_org_unique
      UNIQUE (org_id, device_user_id);

-- ============================================================
-- Deduplication index for ADMS push receiver.
-- The device may re-push the same punch on retry / reconnect.
-- One punch per device per timestamp is physically unique.
-- ON CONFLICT DO NOTHING in the INSERT handles the rest.
-- ============================================================

CREATE UNIQUE INDEX attendance_logs_dedup_idx
  ON attendance_logs (device_id, punched_at)
  WHERE device_id IS NOT NULL;
