-- ============================================================
-- 012_encrypt_pan_aadhar.sql
-- Widen pan_number and aadhar_number to store Fernet-encrypted
-- values instead of plaintext.
--
-- Fernet tokens are base64-encoded and run well past 20 chars
-- even for a 10-character PAN — VARCHAR(20) cannot hold them.
-- TEXT is used since encrypted length varies with input length
-- and there's no good fixed upper bound to pick instead.
--
-- No data backfill needed — these columns were added in 011 and
-- have no real data in them yet. If any test values exist, they
-- are plaintext and will fail to decrypt after this change; clear
-- or re-enter them via the API once the app-layer encryption
-- (employees/service.py) is deployed alongside this migration.
-- ============================================================

ALTER TABLE employees
  ALTER COLUMN pan_number TYPE TEXT,
  ALTER COLUMN aadhar_number TYPE TEXT;
