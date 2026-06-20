-- Add per_day_salary column to employees table.
-- monthly_salary is kept for display only.
-- per_day_salary is the actual rate used by the payroll engine (Path C).
-- Default: existing employees get NULL — HR should fill in.
-- Convention: per_day_salary = monthly_salary / 26 (26 working days; 4 holidays/month allowed)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS per_day_salary NUMERIC(10,2);

COMMENT ON COLUMN employees.per_day_salary IS
  'Actual per-day rate used by the payroll engine. '
  'monthly_salary is for display / HR reference only. '
  'Typically = monthly_salary / 26 (4 holidays per month allowed).';
