# STC Cotyarn Payroll Software — CLAUDE.md

## Project Overview
Full-stack payroll + attendance system for a cotton spinning mill (STC Cotyarn Exim Pvt. Ltd., Akola, Maharashtra).
Built to be fully **config-driven** — all salary components, payroll rules, shifts, tiers, and deductions live in DB config rows. Nothing hardcoded. Goal: multi-tenant resale to other mills.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + asyncpg (raw SQL — no ORM) + Redis |
| Frontend | Vite + React (plain JavaScript — NOT TypeScript) |
| Database | PostgreSQL on Supabase |
| Auth | Custom HS256 JWT |
| Fingerprint | Fernet encryption (ISO/IEC 19794-2) |
| Attendance device | BioMax N-BM70W (ZKTeco-compatible) via ADMS Push |

---

## Workspace Structure

```
C:\Users\agraw\Payroll Software\
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── redis_client.py
│   │   ├── core/          # exceptions, responses
│   │   ├── auth/          # dependencies, router (JWT)
│   │   └── modules/
│   │       ├── config/    # schemas, queries, service, router
│   │       ├── employees/ # schemas, queries, service, router
│   │       ├── devices/   # schemas, queries, service, router
│   │       ├── attendance/# schemas, queries, service, router
│   │       ├── payroll/   # schemas, queries, service, router
│   │       └── leave/     # schemas, queries, service, router
│   └── workers/main.py
├── frontend/
│   └── src/
│       ├── api/client.js  # ← CRITICAL, see below
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── employees/   Employees · EmployeeDetail · EmployeeCreateModal · EmployeeEditModal
│       │   ├── attendance/  AttendanceProcess · Exceptions · LeaveManagement · ManualAttendance · ManualAttendanceModal
│       │   ├── payroll/     Periods · PeriodDetail · Payslip
│       │   └── config/      ConfigPage
│       └── components/
└── db/
    └── migrations/        # 001–015 all applied
```

---

## Dev Startup

```bash
# Terminal 1 — Backend  →  http://localhost:8000
cd "c:\Users\agraw\Payroll Software\backend"
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend  →  http://localhost:5173
cd "c:\Users\agraw\Payroll Software\frontend"
npm run dev
```

API docs auto-generated at `http://localhost:8000/docs` (Swagger UI).

---

## API Client Rules (frontend/src/api/client.js)

Two exports — use the correct one or requests will 404:

```
api  → prepends /api/v1
       Use for: auth, config, employees, attendance, payroll, leave
       (attendance_router IS mounted WITH /api/v1 in main.py)

raw  → no prefix
       Use for: /iclock/* only (ADMS device push — no JWT, no /api/v1 prefix)
```

**Import syntax:**
```javascript
import api from '../api/client';      // default export — /api/v1 routes
import { raw } from '../api/client';  // named export  — /attendance + /devices
```

**Behaviour:**
- Auth header auto-injected from `localStorage.getItem('auth_token')` — never add it manually
- `204` responses → returns `null`
- Non-ok responses → throws `Error` with `.status` (HTTP code) and `.data` (full response body)

**Response shapes:**
- Login → `{ access_token, role, org_id, user_id }` — NOT wrapped, direct object
- All other endpoints → `APIResponse<T>` = `{ success, data, message }` or `PaginatedResponse<T>` = `{ success, data, total, page, page_size, has_next }`

---

## Database

### Migration state: 001–018 all applied
No migration tracking table — applied manually. Next to write: `019_*.sql`.

| Migration | File | Change |
|---|---|---|
| 012 | `012_encrypt_pan_aadhar.sql` | Widen `pan_number` + `aadhar_number` to TEXT for Fernet values |
| 013 | `013_encrypt_bank_details.sql` | Widen `bank_account` + `bank_ifsc` to TEXT. `bank_name` stays plaintext. |
| 014 | `014_phase7_fields.sql` | Add `jobber_type VARCHAR(50)` (`none`/`lc`/`pp`/`rf`) + `room_no VARCHAR(50)` to `employees` |
| 015 | `015_payroll_jobber.sql` | Add `jobber_allowance NUMERIC(10,2) NOT NULL DEFAULT 0` to `payroll_records` |
| 016 | `016_overtime_status.sql` | Attendance status model: drop `holiday`, add `overtime`; tighten `attendance_daily_status_check` |
| 017 | `017_lock_supabase_roles.sql` | REVOKE all table/sequence/function privs from `anon` + `authenticated` (kills Supabase REST API surface). Backend connects as `postgres`, unaffected. |
| 018 | `018_shift_punch_window_offset.sql` | Add `punch_window_day_offset SMALLINT NOT NULL DEFAULT 0` to `shifts`. Set `1` on the midnight-start "Night 8hr (12am-8am)" shift so its next-morning punches attribute to the prior attendance-day. Engine reads it in `process_daily_attendance`. |

### Tables (18 total)
`organisations`, `users`, `shifts`, `categories`, `sub_categories`, `departments`, `salary_components`, `labour_tier_rates`, `employees`, `employee_fingerprints`, `devices`, `attendance_logs`, `attendance_daily`, `leave_applications`, `payroll_periods`, `payroll_records`, `payroll_component_values`, `payroll_deductions`

### Seeded with
41 employees (May 2026 test data, `T-xxx` employee codes). No real PII or banking data loaded yet.

### Encryption
`pan_number`, `aadhar_number`, `bank_account`, `bank_ifsc` — Fernet-encrypted at rest.
Helpers: `_encrypt_field()` / `_decrypt_field()` in `employees/service.py`.
Decryption centralized in `get_employee()`.
`bank_name` — intentionally left plaintext.

---

## Payroll Business Rules

### Employee Categories

| Category | Shift | Pay Logic |
|---|---|---|
| Labour | 12hr day / 12hr night | Tier-based per-day rates |
| Trainee | 12hr | Flat ₹420/day, no tiers, no EPF |
| Maintenance | 8hr × 3 rotating | Monthly salary + OT/undertime |
| Staff | 8hr × 3 rotating | Monthly salary + OT/undertime |

Shifts (Maintenance + Staff): 8am–5pm / 4pm–12am / 12am–8am

### Labour Tier Rates (tier applies to ALL days that month)

| Dept | < 24 days | 24–25 days | 26+ days |
|---|---|---|---|
| RF | ₹620 | ₹640 | ₹680 |
| PP | ₹600 | ₹610 | ₹630 |
| LC | ₹600 | ₹610 | ₹630 |

### Jobber Allowance (contract workers)
Added on top of daily rate before gross calculation. Stored as `jobber_allowance` on `payroll_records`.

| `jobber_type` | Allowance |
|---|---|
| `lc` / `pp` | ₹30/day |
| `rf` | ₹40/day |
| `none` | ₹0 |

### Trainee Rules
Flat ₹420/day. No EPF. No component breakdown. Gross minus manual deductions only.
Approved trainees → promoted to Skilled Labour.

### Salary Structure (Maintenance + Staff)
```
Basic       = 50% of Gross
DA          = 10% of Gross
T Basic     = 60% of Gross  ← EPF reference base
Allowances  = 40% of Gross
EPF         = 12% of T Basic  (enrolled employees only — blank = not enrolled)
```

### OT / Undertime Formula
```
Per Hour Rate = base rate / Shift Hours          (8h Staff, 12h Labour)
OT            = Per Hour Rate × extra hours       (added)
Undertime     = Per Hour Rate × hours short       (deducted)
```
Applies to **Labour, Maintenance and Staff** (migration 016).
`base rate` excludes jobber allowance:
- Labour (Path A): bare tier rate ÷ 12
- Maintenance/Staff (Path C): per_day_salary ÷ shift hours

Trainees (daily_flat) are flat ₹420/day — hours never affect their pay.
HR enters actual `hours_worked` on a worked-day status; the engine derives
OT (hours > shift) or undertime (hours < shift) from it. Until the fingerprint
device is live, hours are entered manually; a bare `present` with no hours = full day.

### Path C (per_day_salary) — migration 010
Payroll engine Path C uses `employees.per_day_salary` directly when set.
Falls back to `monthly_salary / 26` if unset.
**Any reference to `/30` for Path C in old docs is stale.**

### Maintenance Departments
LC, RF, Prep, Electric, H Plant, Time Office, Drafting, SQC, Sweeper, Admin, Site Worker

### Staff Sub-categories
Foreman, Fitter, Supervisor, Ass. Foreman, GM, HR

### Other Rules
- Mill runs 7 days/week
- Payment: mixed bank + cash per employee
- Leave: application form only (record — no approval flow)
- EPF blank = not enrolled (no special logic)

### Attendance Status — days_present Weights (migration 016)

Six statuses. `holiday` was removed (it equalled absent); `overtime` added.

| Status | days_present | Notes |
|---|---|---|
| `present` | 1.0 | Full day. Optional hours → OT/undertime if over/under shift. |
| `overtime` | 1.0 | Full day + OT. Enter total hours worked; OT = hours − shift. |
| `late` | 1.0 | Full day weight, but short hours dock pay via undertime. Enter total hours worked. |
| `weekly_off` | 1.0 | **Paid leave** — full day, no hours. |
| `half_day` | 0.5 | |
| `absent` | 0.0 | |

`days_present` weighting lives in `PAYROLL_ATTENDANCE_SUMMARY` (payroll/queries.py).
OT/undertime is computed in attendance/service.py from `hours_worked` vs the
employee's shift `standard_hours`, for `present`/`late`/`overtime`.

**Hours semantics:** for `late` and `overtime`, `hours_worked` = TOTAL hours
worked that day (not just the delta). The engine compares against shift hours.

---

## Redis

**Redis is NOT a job queue** — no arq, no celery. Three purposes only:

| Purpose | Key pattern | TTL |
|---|---|---|
| Fingerprint template cache | `fp:templates:{org_id}` | 5 min |
| Duplicate punch guard | `att:lock:{employee_id}:{date}` | 60 sec |
| Payroll run lock | `payroll:lock:{period_id}` | 1 hour |

`decode_responses=False` is intentional — fingerprint templates are stored as raw bytes.

---

## Frontend Design System (frontend/src/index.css)

```
Root bg:      #0a0b10
Card bg:      rgba(255,255,255,0.04) + backdrop-filter: blur(12px)
Accent:       amber  #f59e0b
Success:      teal   #14b8a6
Error:        rose   #f43f5e
Warning:      orange #fb923c
Font:         Inter
```

**Badge classes:** `.badge-draft` `.badge-processing` `.badge-approved` `.badge-paid` `.badge-success` `.badge-error` `.badge-warning`

**Button classes:** `.btn` + `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-success` / `.btn-ghost` / `.btn-sm` / `.btn-lg`

Match this system exactly. Do not introduce new color variables or component styles.

---

## ADMS Push (Attendance Device)

Device sends HTTP POST to FastAPI at `/iclock/cdata` (no JWT — device auth by serial number lookup).
`adms_router` mounts at `/iclock`. `attendance_router` mounts at `/attendance`.
Neither uses the `/api/v1` prefix.

---

## Security Status

| Item | Status |
|---|---|
| CORS fix (`cors_allowed_origins`) | ✅ Deployed |
| PAN / Aadhar / Bank Account / IFSC encryption | ✅ Done (migrations 012–013) |
| Supabase REST API lockdown (Approach A) | ✅ Done (migration 017) — `anon`/`authenticated` have zero table privs |
| Supabase RLS row-policies (Approach B) | ❌ Deferred to pre-multi-tenant — see `RLS_SECURITY.md` |
| Secrets rotation | ❌ Not done |

No real PII or banking data loaded yet. Harden before going live.

---

## Build Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Employee master + config | ✅ |
| 2 | Fingerprint enrollment | ✅ |
| 3 | ADMS Push receiver + attendance logging | ✅ |
| 4 | Attendance processing engine + validation gate | ✅ |
| 5 | Payroll engine — Labour path | ✅ |
| 6 | Payroll engine — Maintenance + Staff | ✅ |
| 7 | Deductions module | ✅ |
| 8 | Salary sheet export (bulk) | ✅ Built — `SalarySheet.jsx` + `GET /payroll/periods/{id}/sheet` |

---

## Phase 8 — Salary Sheet (resolved, ready to build)

**Decisions:**
- Read-only ✅ (no inline editing)
- SALARY column: `monthly_salary` for Staff/Maintenance, `"-"` for Labour
- PER DAY column: `per_day_salary` if set, else `monthly_salary / 30` for Staff/Maintenance; `daily_rate_applied` (from `payroll_records`) for Labour
- GROSS, NET PAY: always pulled from stored `payroll_records` values — never recalculated in the sheet

**Excel reference: `MAY EPF Copy 1.xlsx` (project root)**
Columns in order: SR. | NAME | M/F | SALARY | PER DAY | PRESENT DAYS | GROSS | BASIC | DA | T Basic | ALLOWANCES | EPF12% | NET PAY
TOTAL row sums all numeric columns. Gender counts (FEMALE / MALE / TOTAL) below total row.
42 employees in test data. Only ABDUL row has full component breakdown in the Excel — all others have None for components (partially filled reference file).

**Component names** (pulled from `payroll_component_values`, matched by `component_name`):
`Basic`, `DA`, `T Basic`, `Allowances`, `EPF` — Labour rows will have no component rows, show `"-"` for those columns.

---

## Session Workflow

- Start of session: Claude reads this file automatically — no need to re-explain the project.
- After completing a task: update Build Phase Status, Migration state, and any new business rules discovered.
- For multi-step tasks: task tracker runs in-session; no separate PLAN.md files unless a task spans multiple sessions.
- CLAUDE.md is the single source of truth — if something conflicts with a code comment or old doc, trust CLAUDE.md.

---

## Hard Rules

1. **Never hardcode business logic** — salary rules, rates, tiers, shift hours all live in DB config
2. **Raw SQL only** — no ORM, use asyncpg
3. **Plain JavaScript** — no TypeScript in frontend
4. **Check migration state** before writing any new migration (`db/migrations/` — last applied: 015, next: `016_*.sql`)
5. **Use correct API client** — `api` for /api/v1 routes, `raw` for attendance + devices
6. **Match the design system** — no new CSS variables or color tokens
7. **Ask before touching payroll engine** — read relevant service.py first
