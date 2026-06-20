# Database — Spinning Mill Payroll & Attendance

PostgreSQL + Redis. Config-driven, multi-tenant.

---

## Run Order

```bash
# 1. Run migrations in order
psql -d your_db -f migrations/001_extensions.sql
psql -d your_db -f migrations/002_tenant.sql
psql -d your_db -f migrations/003_config.sql
psql -d your_db -f migrations/004_employees.sql
psql -d your_db -f migrations/005_attendance.sql
psql -d your_db -f migrations/006_payroll.sql
psql -d your_db -f migrations/007_indexes.sql

# 2. Seed the mill's config (run once per new org)
psql -d your_db -f seeds/001_stc_cotyarn.sql
```

---

## File Map

| File | What it creates |
|---|---|
| `001_extensions.sql` | uuid-ossp, pgcrypto, shared updated_at trigger function |
| `002_tenant.sql` | organisations, users |
| `003_config.sql` | shifts, categories, sub_categories, departments, salary_components, labour_tier_rates |
| `004_employees.sql` | employees, employee_fingerprints |
| `005_attendance.sql` | devices, attendance_logs, attendance_daily, leave_applications |
| `006_payroll.sql` | payroll_periods, payroll_records, payroll_component_values, payroll_deductions |
| `007_indexes.sql` | All performance indexes |
| `seeds/001_stc_cotyarn.sql` | STC Cotyarn full config seed |

---

## Payroll Engine — Calculation Paths

The engine reads `sub_categories.salary_type` to pick a path:

### Path A — tier (Labour Skilled)
```
1. Count days_present from attendance_daily WHERE status='present'
2. Match days_present against labour_tier_rates (min_days / max_days)
3. gross = daily_rate × days_present
4. Run salary_components in calculation_order
5. Skip EPF if epf_enrolled = FALSE
6. Sum payroll_deductions
7. net_pay = gross - component deductions - manual deductions
```

### Path B — daily_flat (Labour Trainee)
```
1. Count days_present
2. gross = sub_categories.flat_daily_rate × days_present
3. No salary_components (has_components = FALSE)
4. No EPF (has_epf = FALSE)
5. Sum payroll_deductions (manual only)
6. net_pay = gross - manual deductions
```

### Path C — monthly (Maintenance + Staff)
```
1. Count days_present, sum ot_hours, sum undertime_hours from attendance_daily
2. per_day  = monthly_salary / 30
3. per_hour = per_day / shifts.standard_hours
4. gross    = (per_day × days_present) + (per_hour × ot_hours) - (per_hour × undertime_hours)
5. Run salary_components in calculation_order
6. Skip EPF if epf_enrolled = FALSE
7. Sum payroll_deductions
8. net_pay = gross - component deductions - manual deductions
```

---

## Component Calculation — Current Mill Config

Components run in this order. T Basic is intermediate (not printed on payslip, used only as EPF reference):

```
Basic      = gross × 50%        order=1  displayed=TRUE
DA         = gross × 10%        order=2  displayed=TRUE
T Basic    = gross × 60%        order=3  displayed=FALSE  ← EPF reference
Allowances = gross × 40%        order=4  displayed=TRUE
EPF        = T Basic × 12%      order=5  displayed=TRUE   ← only if epf_enrolled
```

---

## Redis Usage

| Key pattern | Value | TTL | Purpose |
|---|---|---|---|
| `fp:templates:{org_id}` | All active templates serialised | 5 min | Fingerprint match cache — avoids DB hit on every punch |
| `att:lock:{employee_id}:{date}` | 1 | 60 sec | Duplicate punch guard — prevents double IN within same minute |
| `session:{token}` | user_id, org_id, role | 24 hr | Auth session cache |
| `payroll:lock:{period_id}` | 1 | Until released | Prevents concurrent payroll runs on same period |

Invalidate `fp:templates:{org_id}` whenever `employee_fingerprints` is inserted or deactivated.

---

## Adding a New Mill (Multi-tenant Onboarding)

1. Run `seeds/` with the new mill's config values
2. Every table is scoped by `org_id` — no data leaks between orgs
3. Salary components, tiers, shifts, departments are all configurable per org
4. Zero code changes required for a new mill with different rules

---

## Key Constraints to Know

- `attendance_logs` — never UPDATE, only INSERT. Treat as immutable event log.
- `payroll_records` — UNIQUE on (period_id, employee_id). Rerunning payroll updates the existing row.
- `labour_tier_rates` — UNIQUE on (org_id, department_id, tier). Only one rate per tier per dept.
- `attendance_daily` — UNIQUE on (org_id, employee_id, date). One processed record per employee per day.
- `departments` — UNIQUE on (org_id, category_id, name). Same dept name can exist under different categories (LC under Labour ≠ LC under Maintenance).
