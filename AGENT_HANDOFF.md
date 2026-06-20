# STC Cotyarn Payroll System — Agent Handoff

> Created: 2026-06-18. Pick this up in a fresh Antigravity session.
> Workspace path: `C:\Users\agraw\Payroll Software`

---

## What Has Been Built

This is a **full-stack payroll management system** for a spinning mill (STC Cotyarn Exim, Akola, Maharashtra). The system manages employees, fingerprint attendance, payroll calculation, and payslips.

### Architecture

```
C:\Users\agraw\Payroll Software\
├── backend/          ← FastAPI + asyncpg + Redis (Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── redis_client.py
│   │   ├── auth/
│   │   │   ├── router.py     ← POST /api/v1/auth/login
│   │   │   └── dependencies.py ← require_hr, require_admin, AuthUser
│   │   ├── core/
│   │   │   ├── exceptions.py
│   │   │   └── responses.py  ← APIResponse, PaginatedResponse wrappers
│   │   └── modules/
│   │       ├── config/       ← shifts, categories, departments, salary components
│   │       ├── employees/    ← employees CRUD + fingerprints
│   │       ├── devices/      ← BioMax fingerprint scanner registration
│   │       ├── attendance/   ← ADMS receiver, processing engine, exceptions, leave
│   │       └── payroll/      ← payroll engine, periods, records, deductions
├── frontend/         ← Vite + React (JavaScript)
│   ├── vite.config.js
│   └── src/
│       ├── api/client.js     ← fetch wrapper, exports api (→ /api/v1/*) and raw (→ /*)
│       ├── context/AuthContext.jsx
│       ├── components/       ← Layout, Sidebar, DataTable, Modal, StatusBadge, Loader
│       └── pages/
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── employees/Employees.jsx + EmployeeDetail.jsx
│           ├── attendance/Exceptions.jsx + AttendanceProcess.jsx
│           └── payroll/Periods.jsx + PeriodDetail.jsx + Payslip.jsx
└── db/
    └── migrations/   ← 001–009 SQL migrations (all applied)
```

---

## Critical Architecture Rules

1. **No hardcoded business logic** — all config (shifts, tiers, components, rates) is in the DB.
2. **Decimal arithmetic** — all financial math uses `decimal.Decimal` (Python) matching `NUMERIC(10,2)` DB columns.
3. **Auth pattern** — `require_hr` dependency injects `AuthUser(user_id, org_id, role)` into every protected route.
4. **DB access** — always use `get_connection()` (read) or `get_transaction()` (write) context managers from `app/database.py`.
5. **API response wrappers** — every endpoint returns `APIResponse[T]` or `PaginatedResponse[T]`. The login endpoint is the ONLY exception — it returns `LoginResponse` directly (no wrapper).
6. **Attendance router mount** — `attendance_router` mounts at `/attendance` (NO `/api/v1` prefix). `leave_router` mounts at `/api/v1/leave`. Everything else is under `/api/v1`.

---

## Backend Route Map

| Prefix | Router | Auth |
|---|---|---|
| `POST /api/v1/auth/login` | auth_router | None |
| `/api/v1/config/*` | config_router | HR |
| `/api/v1/employees/*` | employees_router | HR/Admin |
| `/iclock/*` | adms_router | None (device SN auth) |
| `/attendance/*` | attendance_router | HR |
| `/api/v1/leave/*` | leave_router | HR |
| `/api/v1/payroll/*` | payroll_router | HR |

---

## Frontend API Client — IMPORTANT

Two exports from `src/api/client.js`:
- **`api`** → prepends `/api/v1` → use for employees, payroll, config, auth, leave
- **`raw`** → no prefix → use for `/attendance/*` routes ONLY

```js
import api, { raw } from '../../api/client';
// employees: api.get('/employees')
// attendance: raw.get('/attendance/exceptions?year=2026&month=6')
// leave: api.get('/leave')
// payroll: api.get('/payroll/periods')
```

Vite proxy routes (in `vite.config.js`): `/api`, `/attendance`, `/iclock` → all proxied to `http://localhost:8000`.

---

## How to Run

### Backend
```powershell
# MUST run from backend/ dir — not project root
cd "C:\Users\agraw\Payroll Software\backend"
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
# Runs on http://localhost:8000
# Swagger: http://localhost:8000/docs
```

### Frontend
```powershell
cd "C:\Users\agraw\Payroll Software\frontend"
npm run dev
# Runs on http://localhost:5173
```

### Login credentials
- Email: `admin@stccotyarn.com`
- Password: `changeme123`

---

## Database Migrations (all applied)

```
001_bootstrap.sql      ← orgs, users, uuid extension
002_config.sql         ← shifts, categories, sub_categories, departments, salary_components, labour_tier_rates
003_config.sql         ← ...additional config
004_employees.sql      ← employees, employee_fingerprints
005_devices.sql        ← devices table (BioMax scanners)
006_payroll.sql        ← payroll_periods, payroll_records, payroll_component_values, payroll_deductions
007_attendance.sql     ← attendance_logs, attendance_daily
008_leave.sql          ← employee_leaves
009_attendance_validation.sql ← DB trigger: blocks payroll_period draft→processing if attendance exceptions > 0
```

Run migrations with:
```powershell
cd "C:\Users\agraw\Payroll Software\backend"
.\venv\Scripts\Activate.ps1
python run_migrations.py
```

---

## Three Salary Paths (engine.py)

The payroll engine in `backend/app/modules/payroll/engine.py` implements:

| Path | Salary Type | Employees | Formula |
|---|---|---|---|
| A | `tier` | Labour Skilled | `daily_rate (from tier table) × days_present` |
| B | `daily_flat` | Trainee | `flat_daily_rate × days_present` |
| C | `monthly` | Maintenance / Staff | `(salary/30 × days) ± (per_hr × OT/UT)` |

Tier table: `labour_tier_rates` (org_id, department_id, min_days, max_days, daily_rate)
Components (EPF, DA, etc): `salary_components` (org_id, formula_type: percent_of_gross/percent_of_component/fixed)

---

## Payroll Workflow (period status transitions)

```
draft → processing → approved → paid
```

- **draft → processing**: Blocked by DB trigger if attendance exceptions exist (flagged_count > 0)
- **processing → approved**: Sets `approved_at`, `approved_by`
- **approved → paid**: Sets `paid_at`
- Running payroll engine is idempotent (UPSERT) — can re-run without duplicating data
- Redis lock key: `payroll:lock:{period_id}` (TTL 3600s) prevents concurrent runs

---

## What Is WORKING ✅

### Backend (100% complete)
- All 5 phases fully built and tested
- Auth, Config, Employees, Devices, Attendance, Leave, Payroll — all endpoints working
- DB migrations all applied
- Integration tests: `backend/test_integration.py`, `test_phase4.py`, `test_phase5.py`

### Frontend (Phase 6 — ~85% complete)
| Page | Route | Status |
|---|---|---|
| Login | `/login` | ✅ Working |
| Dashboard | `/` | ✅ Working — stat cards + quick actions |
| Employees list | `/employees` | ✅ Working — search, filter, paginated |
| Employee detail | `/employees/:id` | ✅ Working — info + fingerprints + deactivate |
| Attendance Processing | `/attendance/process` | ✅ Working — run engine + daily records viewer |
| Attendance Exceptions | `/attendance/exceptions` | ✅ Working — resolve + override modal |
| Payroll Periods | `/payroll/periods` | ✅ Working — list + create modal |
| Period Detail | `/payroll/periods/:id` | ✅ Working — records table + run/approve/pay buttons |
| Payslip | `/payroll/periods/:id/records/:empId` | ✅ Working — earnings + deductions + add/remove |

---

## What Is REMAINING (Next Agent's Work)

### High Priority
1. **Employee Create form** — No UI to add new employees yet. Backend POST `/api/v1/employees` exists. Need a modal or page with all fields: name, code, gender, category_id, sub_category_id, department_id, shift_id, monthly_salary, epf_enrolled, payment_mode, joining_date.
2. **Employee Edit form** — PATCH `/api/v1/employees/:id` exists but no UI.
3. **Leave management UI** — `POST/GET /api/v1/leave` endpoints exist. Need a page under `/attendance/leave` to record and view leaves per employee.
4. **Seed data / populate DB** — Currently 0 employees because `db/seeds/001_stc_cotyarn.sql` may not have been run. Check and seed.

### Medium Priority
5. **Config page** — Read-only view of shifts, categories, departments, salary components, tier rates. Route: `/config`. Backend: `GET /api/v1/config/*`.
6. **Dashboard employee count fix** — Shows 0 because DB might not be seeded. Will resolve once #4 above is done.
7. **Print / Export payslip** — Add a "Print" button on the Payslip page using `window.print()` with a print-specific CSS (`@media print`).

### Low Priority / Polish
8. **Toast notifications** — Currently alerts render inline. A toast system (top-right popups auto-dismissing after 3s) would be cleaner.
9. **Error boundary** — Wrap the router in a React error boundary component.
10. **Mobile sidebar** — Currently sidebar is hidden on mobile (<768px). Add a hamburger toggle.

---

## Key Config Data in DB (from seeds)

From `db/seeds/001_stc_cotyarn.sql`:
- **Org**: STC Cotyarn Exim Pvt. Ltd., Akola
- **Shifts**: General Shift (8h), Night Shift (8h)
- **Categories**: Labour, Maintenance, Staff (each has sub-categories with salary_type: tier/daily_flat/monthly)
- **Departments**: Spinning, Weaving, Processing, Maintenance, Admin
- **Salary Components**: Basic, DA, HRA (earnings), EPF Employee, EPF Employer (deductions)
- **Tier Rates**: Labour Skilled tier 1/2/3 by days_present ranges

---

## Design System Summary

File: `frontend/src/index.css`

| Token | Value |
|---|---|
| Root background | `#0a0b10` |
| Card background | `rgba(255,255,255,0.04)` + `backdrop-filter: blur(12px)` |
| Accent (amber) | `#f59e0b` |
| Success (teal) | `#14b8a6` |
| Error (rose) | `#f43f5e` |
| Warning (orange) | `#fb923c` |
| Font | Inter (Google Fonts) |

Status badge classes: `.badge-draft`, `.badge-processing`, `.badge-approved`, `.badge-paid`, `.badge-success`, `.badge-error`, `.badge-warning`

Button classes: `.btn.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`, `.btn-ghost`, `.btn-sm`, `.btn-lg`

---

## Known Issues / Gotchas

1. **Backend must run from `backend/` dir** — running from project root gives `ModuleNotFoundError: No module named 'app'`
2. **Attendance router has NO `/api/v1` prefix** — use `raw.*` from client.js for all `/attendance/*` calls
3. **Login response is NOT wrapped** in `APIResponse` — it returns `{access_token, role, org_id, user_id}` directly
4. **Payroll run requires attendance data** — if no attendance records exist, run returns 0 records (not an error)
5. **DB trigger blocks payroll** — `trigger_block_payroll_processing()` fires on `payroll_periods` INSERT/UPDATE when status changes to 'processing'. It calls `fn_attendance_exception_count()` and raises an exception if > 0.
6. **Requests library** — was not in original requirements.txt. Added as `requests==2.34.2` for test scripts.

---

## File Structure Quick Reference

```
backend/app/
  main.py                          ← FastAPI app, all routers wired
  config.py                        ← pydantic settings from .env
  database.py                      ← asyncpg pool, get_connection(), get_transaction()
  redis_client.py                  ← redis pool, key_payroll_lock(), TTL_PAYROLL_LOCK
  auth/
    router.py                      ← POST /auth/login (no APIResponse wrapper)
    dependencies.py                ← require_hr, require_admin, AuthUser, create_access_token
  core/
    exceptions.py                  ← NotFoundError, ConflictError, BadRequestError, UnauthorizedError
    responses.py                   ← APIResponse[T], PaginatedResponse[T]
  modules/
    config/router.py               ← GET /config/shifts, /categories, /departments, /salary-components, /tier-rates
    employees/
      queries.py                   ← SQL constants
      schemas.py                   ← Pydantic I/O
      service.py                   ← business logic
      router.py                    ← /employees CRUD + /fingerprints
    attendance/
      queries.py
      schemas.py
      service.py                   ← handle_device_register, handle_attlog, process_daily_attendance
      router.py                    ← adms_router (/iclock), attendance_router (/attendance), leave_router (/api/v1/leave)
    payroll/
      queries.py
      schemas.py
      engine.py                    ← calc_path_a_tier, calc_path_b_daily_flat, calc_path_c_monthly, apply_components
      service.py                   ← run_payroll, add_deduction, delete_deduction, get_payslip
      router.py                    ← /payroll/periods + /run + /records + deductions

frontend/src/
  App.jsx                          ← BrowserRouter, all routes
  index.css                        ← full design system
  api/client.js                    ← api (→/api/v1/*), raw (→/*)
  context/AuthContext.jsx          ← login(), logout(), user state, localStorage
  components/
    Layout.jsx                     ← sidebar + topbar shell (uses Outlet)
    Sidebar.jsx                    ← nav: Dashboard, Employees, Processing, Exceptions, Periods
    ProtectedRoute.jsx             ← redirects to /login if no token
    DataTable.jsx                  ← reusable table (columns, data, onRowClick)
    Modal.jsx                      ← overlay modal (ESC + backdrop close)
    StatusBadge.jsx                ← colored pill for draft/processing/approved/paid/present/absent
    Loader.jsx                     ← Spinner, SkeletonLines
  pages/
    Login.jsx
    Dashboard.jsx
    employees/Employees.jsx        ← list with search + active/inactive filter
    employees/EmployeeDetail.jsx   ← detail + fingerprints + deactivate
    attendance/Exceptions.jsx      ← flagged records, resolve + override modal
    attendance/AttendanceProcess.jsx ← process engine + daily records per employee
    payroll/Periods.jsx            ← list + create modal
    payroll/PeriodDetail.jsx       ← records table + run/approve/pay + summary cards
    payroll/Payslip.jsx            ← earnings + statutory deductions + manual deductions + add modal
```

---

## Screenshot Evidence (what the UI looks like)

Screenshots are saved at:
`C:\Users\devde\.gemini\antigravity-ide\brain\d9f41203-7396-48a8-9414-72967d7e44a6\`

- `login_page_screenshot_1781803844026.webp` — login page (dark, glassmorphism card, amber title)
- `dashboard_1781804641042.png` — dashboard with stat cards + sidebar
- `employees_1781804656287.png` — employees page (empty because no seed data)
- `payroll_periods_1781804625164.png` — periods list page

The sidebar correctly shows: Dashboard | WORKFORCE: Employees | ATTENDANCE: Processing, Exceptions | PAYROLL: Periods

---

## Immediate First Steps for Next Agent

1. **Read this file fully**
2. Verify backend is running: `curl http://localhost:8000/health`
3. Check if DB has seed data: `GET /api/v1/employees` — if 0 results, run seed: `psql -d <db> -f db/seeds/001_stc_cotyarn.sql`
4. Start the frontend dev server and confirm all 8 pages load at `http://localhost:5173`
5. Build the **Employee Create modal** (highest priority missing feature):
   - Add a "+ New Employee" button to `Employees.jsx`
   - Fetch categories/subcategories/departments/shifts from `/api/v1/config/*` to populate selects
   - POST to `/api/v1/employees` on submit
   - Reload employee list on success
