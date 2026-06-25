# Trial Deployment — Task Brief for Claude Code

> **Purpose:** Deploy a trial version of the payroll system so mill staff can test the UI and workflows for 5-6 days using dummy data. No real PII, no real salary data. This is a usability test, not a production launch.
>
> **After trial:** This deployment will be torn down and replaced with a hardened production deployment (RLS, secrets rotation, real domain, PWA).

---

## Architecture

```
Frontend (static)  →  Vercel (free tier, auto-deploy from GitHub)
Backend (FastAPI)  →  Railway (free $5 credit tier, no cold starts)
Redis              →  Railway Redis add-on (same project)
Database           →  Supabase (already live, no change)
```

**Why Railway over Render:** Render free tier sleeps after 15 min inactivity → 30-50s cold starts. Mill staff opening the app after a break and waiting 40 seconds kills the trial. Railway stays warm.

---

## Pre-Deployment Checklist

### 1. Environment Variables

**Railway (backend) needs:**

> ⚠️ **Use the EXACT names below — they are what `backend/app/config.py` reads.**
> `SECRET_KEY` and `ENCRYPTION_KEY` are **required**; the app refuses to boot without them.
> (Earlier drafts said `JWT_SECRET` / `FERNET_KEY` / `ENVIRONMENT` — those are wrong, the app ignores them.)

| Variable | Required? | Value | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ yes | Supabase connection string | Already in local .env (`postgres` superuser via pooler) |
| `SECRET_KEY` | ✅ yes | Same as local | JWT signing key. Reuse for trial — rotate before prod |
| `ENCRYPTION_KEY` | ✅ yes | Same as local | Fernet key. Reuse for trial — rotate before prod |
| `REDIS_URL` | ✅ yes | Railway Redis internal URL | Railway auto-provisions when you add the Redis add-on. Defaults to localhost if unset → will fail on Railway |
| `APP_ENV` | optional | leave unset (= `development`) for trial | If set to `production`: `/docs` is disabled AND `CORS_ALLOWED_ORIGINS` becomes mandatory or the app won't boot |
| `CORS_ALLOWED_ORIGINS` | only if `APP_ENV=production` | `https://your-app.vercel.app` | Not needed with the Vercel-rewrite proxy (browser sees same-origin). Only required if you run production mode |
| `APP_DEBUG` | optional | `false` | |

**Vercel (frontend) needs:**

No env vars needed — see rewrite approach below.

### 2. Vercel Rewrites (instead of CORS + env var)

`frontend/src/api/client.js` uses relative paths. After the `raw`→`api` cleanup, **all** browser API traffic now goes through `/api/v1/...` — so only a single rewrite is needed. In production, frontend (Vercel) and backend (Railway) are on different domains, so relative paths would 404 without this proxy.

**Fix:** `frontend/vercel.json` (already created in the repo) with one rewrite. Vercel proxies API calls to Railway. Browser sees same-origin — no CORS issue, no code changes to client.js.

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://REPLACE-WITH-RAILWAY-URL.up.railway.app/api/:path*" }
  ]
}
```

Replace the destination host with the actual Railway backend URL after deploying the backend.

> The BioMax device's `/iclock/cdata` push is **not** browser traffic — point the device directly at the Railway URL, not through Vercel. So no `/iclock` rewrite is needed here.

**Do NOT modify `client.js`** — the relative path approach is correct. Just proxy it at the hosting layer.

### 3. Test User Accounts

✅ **Already created** (direct SQL insert into `users`, org `STC Cotyarn`). Login is by **email**, not username.
Note: the DB `users_role_check` constraint allows only `admin` / `hr` / `viewer` — there is no `operator` role, so the time-office account uses `hr` (which is what `require_hr` gates: attendance + payroll entry).

| Login email | Role | Password | Purpose |
|---|---|---|---|
| `admin_test@example.com` | `admin` | `Test@1234` | Full access — for mill manager |
| `operator_test@example.com` | `hr` | `Test@1234` | Attendance + payroll entry — for time office staff |
| `viewer_test@example.com` | `viewer` | `Test@1234` | Read-only — for supervisors to browse |

Passwords are throwaway. Hashes generated with the app's own bcrypt (`hash_password`) so they verify correctly.
Note: emails must use a real TLD — the login schema's `EmailStr` rejects reserved domains like `.local` (returns 422), so `@example.com` is used.

### 4. Vite Production Build

The frontend needs `npm run build` to produce a `dist/` folder. Vercel handles this automatically when connected to the GitHub repo — set:
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Root directory:** `frontend`

### 5. Railway Backend Setup

- Connect GitHub repo
- Set root directory to `backend`
- Railway should auto-detect Python/FastAPI via `requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Add Redis add-on from Railway dashboard (one click)

---

## What NOT To Do For Trial

| Item | Skip for trial | Do before prod |
|---|---|---|
| Supabase RLS | ✅ Skip — dummy data only | Mandatory before real data |
| Secrets rotation | ✅ Skip — reuse local keys | Mandatory before real data |
| PWA config | ✅ Skip — browser access is fine for testing | Add after prod deploy |
| Custom domain | ✅ Skip — Vercel default URL works | Buy domain before prod |
| SSL/HTTPS | ✅ Already handled — Vercel and Railway give free SSL | No action needed |
| Rate limiting | ✅ Skip — 5-10 users max | Add before prod |
| Error monitoring (Sentry) | ✅ Skip | Add before prod |

---

## Deployment Steps (in order)

1. **Read `config.py`** — confirm all env var names for Railway
2. **DO NOT modify `frontend/src/api/client.js`** — relative paths are correct, Vercel rewrites handle the proxy
3. **Check `requirements.txt`** exists in `backend/` with all dependencies (fastapi, uvicorn, asyncpg, aioredis/redis, cryptography, passlib, python-jose, etc.)
4. **Push to GitHub** — ensure latest code is committed
5. **Deploy backend to Railway first** (need the URL for Vercel rewrites):
   - Connect repo → set root to `backend`
   - Add Redis add-on
   - Set all env vars from table above
   - Verify start command
   - Note the assigned URL
6. **Create `frontend/vercel.json`** with rewrites pointing to the Railway URL from step 5
7. **Deploy frontend to Vercel:**
   - Connect repo → set root to `frontend` → set build command + output dir
   - No env vars needed — rewrites handle API routing
8. **Test:** hit the Vercel URL, login with test account, verify:
   - Login works
   - Dashboard loads
   - Employee list loads (41 test employees visible)
   - Attendance page loads
   - Payroll period list loads
   - Payslip renders and print button works
9. **Create test user accounts** (if not done in step 3)
10. **Share URL with mill staff**

---

## Known Limitations To Tell Mill Staff

- "This is a test version — do NOT enter real Aadhaar, PAN, or bank details"
- "Use the test login we give you"
- "If something looks wrong or confusing, screenshot it and send to [Devansh]"
- "The app may be slightly slower than the final version — that's normal for the trial setup"

---

## After Trial (transition to prod)

1. Collect feedback from mill staff (5-6 days of use)
2. Fix UI/UX issues found during trial
3. Build Phase 8 (salary sheet export) if not done before trial
4. Security hardening: RLS policies across all 18 tables
5. Secrets rotation (JWT_SECRET, FERNET_KEY)
6. Production deployment with custom domain, PWA, error monitoring
7. Tear down trial deployment
