-- ============================================================
-- 013_encrypt_bank_details.sql
-- Widen bank_account and bank_ifsc to store Fernet-encrypted
-- values instead of plaintext. Same rationale as 012 for
-- pan_number/aadhar_number — Fernet tokens run well past the
-- original VARCHAR limits even for short inputs.
--
-- bank_name is left as plaintext — it identifies a bank
-- ("State Bank of India"), not an individual, so it doesn't
-- carry the same sensitivity as an account number or IFSC.
--
-- No data backfill needed — no real banking data has been
-- entered yet. If any test values exist, they are plaintext
-- and will fail to decrypt after this change; clear or re-enter
-- them via the API once the app-layer encryption is deployed
-- alongside this migration.
-- ============================================================

ALTER TABLE employees
  ALTER COLUMN bank_account TYPE TEXT,
  ALTER COLUMN bank_ifsc TYPE TEXT;
