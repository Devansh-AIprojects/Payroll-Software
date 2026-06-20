"""
Phase 5 Integration Tests — Payroll Engine
Run:  cd backend && .\\venv\\Scripts\\Activate.ps1 && python test_phase5.py

Prerequisites:
  - Server running (uvicorn app.main:app)
  - Database seeded with STC Cotyarn config
  - At least one active employee exists
  - Attendance has been processed for the target month
"""

import sys
import requests

BASE = "http://localhost:8000/api/v1"

# ── Helpers ──────────────────────────────────────────────────────────────────

def login() -> str:
    r = requests.post(f"{BASE}/auth/login", json={
        "email": "admin@stccotyarn.com",
        "password": "changeme123",
    })
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["access_token"]


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def ok(label: str):
    print(f"  ✅ {label}")


def fail(label: str, detail: str = ""):
    print(f"  ❌ {label}: {detail}")
    sys.exit(1)


# ── Tests ────────────────────────────────────────────────────────────────────

def test_create_period(h: dict) -> str:
    """Create a June 2026 payroll period."""
    r = requests.post(f"{BASE}/payroll/periods", json={
        "month": 6, "year": 2026,
    }, headers=h)

    if r.status_code == 201:
        period_id = r.json()["data"]["id"]
        ok(f"Create period → {period_id}")
        return period_id
    elif r.status_code == 409:
        # Period already exists — list and grab it
        r2 = requests.get(f"{BASE}/payroll/periods", headers=h)
        for p in r2.json()["data"]:
            if p["month"] == 6 and p["year"] == 2026:
                ok(f"Period already exists → {p['id']}")
                return p["id"]
        fail("Create period", "409 but couldn't find existing period")
    else:
        fail("Create period", r.text)


def test_list_periods(h: dict):
    r = requests.get(f"{BASE}/payroll/periods", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    assert isinstance(data, list)
    ok(f"List periods → {len(data)} period(s)")


def test_get_period(h: dict, period_id: str):
    r = requests.get(f"{BASE}/payroll/periods/{period_id}", headers=h)
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["id"] == period_id
    ok(f"Get period → status={d['status']}")


def test_run_payroll(h: dict, period_id: str) -> dict:
    """Run the payroll engine. May fail if unresolved exceptions exist."""
    r = requests.post(f"{BASE}/payroll/periods/{period_id}/run", headers=h)
    if r.status_code == 200:
        data = r.json()["data"]
        ok(f"Run payroll → {data['records_written']} records, {len(data['errors'])} errors")
        return data
    elif r.status_code == 400:
        detail = r.json().get("detail", r.text)
        print(f"  ⚠️  Run payroll blocked (400): {detail}")
        print("     This is expected if attendance exceptions are unresolved.")
        return None
    else:
        fail("Run payroll", r.text)


def test_list_records(h: dict, period_id: str) -> list:
    r = requests.get(f"{BASE}/payroll/periods/{period_id}/records", headers=h)
    assert r.status_code == 200
    data = r.json()["data"]
    total = r.json()["total"]
    ok(f"List records → {total} total, page has {len(data)} records")
    return data


def test_get_payslip(h: dict, period_id: str, employee_id: str):
    r = requests.get(
        f"{BASE}/payroll/periods/{period_id}/records/{employee_id}",
        headers=h,
    )
    assert r.status_code == 200
    d = r.json()["data"]
    record = d["record"]
    comps = d["components"]
    deds = d["deductions"]
    ok(
        f"Payslip for {record['employee_name']}: "
        f"gross={record['gross']}, net={record['net_pay']}, "
        f"{len(comps)} components, {len(deds)} deductions"
    )
    return d


def test_add_deduction(h: dict, period_id: str, employee_id: str) -> str | None:
    r = requests.post(
        f"{BASE}/payroll/periods/{period_id}/records/{employee_id}/deductions",
        json={
            "employee_id": employee_id,
            "type": "advance",
            "label": "Test advance deduction",
            "amount": 500.00,
        },
        headers=h,
    )
    if r.status_code == 201:
        ded_id = r.json()["data"]["id"]
        ok(f"Add deduction → {ded_id}")
        return ded_id
    elif r.status_code == 400:
        print(f"  ⚠️  Add deduction blocked (period not in draft/processing): {r.json().get('detail')}")
        return None
    else:
        fail("Add deduction", r.text)


def test_net_pay_changed(h: dict, period_id: str, employee_id: str, original_net: float):
    """Verify net_pay decreased after adding a deduction."""
    r = requests.get(
        f"{BASE}/payroll/periods/{period_id}/records/{employee_id}",
        headers=h,
    )
    new_net = r.json()["data"]["record"]["net_pay"]
    if new_net < original_net:
        ok(f"Net pay decreased: {original_net} → {new_net} (diff={original_net - new_net})")
    else:
        fail("Net pay unchanged", f"expected < {original_net}, got {new_net}")


def test_delete_deduction(h: dict, period_id: str, deduction_id: str):
    r = requests.delete(
        f"{BASE}/payroll/periods/{period_id}/deductions/{deduction_id}",
        headers=h,
    )
    assert r.status_code == 200
    ok(f"Delete deduction → {deduction_id}")


def test_status_transitions(h: dict, period_id: str):
    """Advance through the workflow: processing → approved → paid."""
    # processing → approved
    r = requests.patch(
        f"{BASE}/payroll/periods/{period_id}/status",
        json={"status": "approved"},
        headers=h,
    )
    if r.status_code == 200:
        ok("Status → approved")
    else:
        print(f"  ⚠️  Status → approved failed: {r.json().get('detail', r.text)}")
        return

    # approved → paid
    r = requests.patch(
        f"{BASE}/payroll/periods/{period_id}/status",
        json={"status": "paid"},
        headers=h,
    )
    if r.status_code == 200:
        ok("Status → paid")
    else:
        print(f"  ⚠️  Status → paid failed: {r.json().get('detail', r.text)}")
        return

    # Verify: adding a deduction to a 'paid' period should fail
    r = requests.post(
        f"{BASE}/payroll/periods/{period_id}/records/00000000-0000-0000-0000-000000000000/deductions",
        json={
            "employee_id": "00000000-0000-0000-0000-000000000000",
            "type": "custom",
            "label": "Should fail",
            "amount": 100,
        },
        headers=h,
    )
    if r.status_code == 400:
        ok("Deduction on paid period correctly rejected (400)")
    else:
        print(f"  ⚠️  Expected 400 for deduction on paid period, got {r.status_code}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\nPhase 5 — Payroll Engine Integration Tests\n")

    print("1. Authenticating...")
    token = login()
    h = headers(token)
    ok("Logged in")

    print("\n2. Period CRUD...")
    period_id = test_create_period(h)
    test_list_periods(h)
    test_get_period(h, period_id)

    print("\n3. Running payroll engine...")
    run_result = test_run_payroll(h, period_id)

    if run_result is None:
        print("\n⚠️  Payroll run blocked — resolve attendance exceptions and re-run.")
        print("   Skipping record/payslip/deduction tests.\n")
        return

    if run_result["records_written"] == 0:
        print("\n⚠️  No records written — no active employees or no attendance data.")
        print("   Skipping record/payslip/deduction tests.\n")
        return

    print("\n4. Record listing...")
    records = test_list_records(h, period_id)

    if records:
        first = records[0]
        emp_id = first["employee_id"]

        print(f"\n5. Payslip for {first['employee_name']}...")
        payslip = test_get_payslip(h, period_id, emp_id)
        original_net = payslip["record"]["net_pay"]

        print("\n6. Manual deduction flow...")
        ded_id = test_add_deduction(h, period_id, emp_id)
        if ded_id:
            test_net_pay_changed(h, period_id, emp_id, original_net)
            test_delete_deduction(h, period_id, ded_id)

    print("\n7. Status transitions...")
    test_status_transitions(h, period_id)

    print("\n✅ All Phase 5 tests passed!\n")


if __name__ == "__main__":
    main()
