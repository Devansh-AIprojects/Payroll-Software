"""
Seed script: Insert sample employees via the backend service layer.
This ensures all business logic (UUID generation, timestamps, etc.) is applied correctly.
Run from backend/ dir:  python seed_employees.py
"""
import asyncio
from datetime import date as date_type
from app.database import get_connection

# Employee data grouped by category/sub-category
# Format: (employee_code, name, gender, sub_category_name, department_name, shift_name,
#          monthly_salary, epf_enrolled, uan_number, payment_mode, joining_date, device_user_id)

EMPLOYEES = [
    # ── Labour → Skilled (tier-based, 12hr shifts) ────────────────
    ("L-001", "Ramesh Wankhede",   "M", "Skilled", "RF", "Day 12hr",    None,     True,  "100876543210", "cash", "2023-03-15", 101),
    ("L-002", "Suresh Patil",      "M", "Skilled", "RF", "Night 12hr",  None,     True,  "100876543211", "cash", "2023-04-01", 102),
    ("L-003", "Ganesh Deshmukh",   "M", "Skilled", "PP", "Day 12hr",    None,     True,  "100876543212", "cash", "2023-06-10", 103),
    ("L-004", "Manoj Shinde",      "M", "Skilled", "PP", "Night 12hr",  None,     True,  "100876543213", "cash", "2023-07-20", 104),
    ("L-005", "Prakash Gawande",   "M", "Skilled", "LC", "Day 12hr",    None,     True,  "100876543214", "cash", "2023-08-01", 105),
    ("L-006", "Vinod Ingale",      "M", "Skilled", "LC", "Night 12hr",  None,     True,  "100876543215", "cash", "2023-09-05", 106),
    ("L-007", "Santosh Kale",      "M", "Skilled", "RF", "Day 12hr",    None,     True,  "100876543216", "cash", "2024-01-10", 107),
    ("L-008", "Anil Rathod",       "M", "Skilled", "PP", "Day 12hr",    None,     True,  "100876543217", "cash", "2024-02-15", 108),
    ("L-009", "Sunita Jadhav",     "F", "Skilled", "LC", "Day 12hr",    None,     True,  "100876543218", "cash", "2024-03-01", 109),
    ("L-010", "Kavita More",       "F", "Skilled", "RF", "Day 12hr",    None,     True,  "100876543219", "cash", "2024-04-20", 110),

    # ── Labour → Trainee (daily_flat, 12hr shifts, no EPF) ────────
    ("L-011", "Akash Gaikwad",     "M", "Trainee", "RF", "Day 12hr",   None,     False, None,           "cash", "2026-01-05", 111),
    ("L-012", "Pooja Bhosale",     "F", "Trainee", "PP", "Day 12hr",   None,     False, None,           "cash", "2026-02-10", 112),
    ("L-013", "Rahul Sonawane",    "M", "Trainee", "LC", "Day 12hr",   None,     False, None,           "cash", "2026-03-01", 113),

    # ── Maintenance (monthly salary, 8hr shifts) ──────────────────
    ("M-001", "Deepak Kulkarni",   "M", "Maintenance Worker", "LC",       "Morning 8hr (8am-5pm)",  12000, True,  "200111222333", "bank", "2022-06-01", 201),
    ("M-002", "Rajesh Pawar",      "M", "Maintenance Worker", "RF",       "Evening 8hr (4pm-12am)", 11500, True,  "200111222334", "bank", "2022-08-15", 202),
    ("M-003", "Sanjay Bhalerao",   "M", "Maintenance Worker", "Prep",     "Night 8hr (12am-8am)",   11000, True,  "200111222335", "bank", "2023-01-10", 203),
    ("M-004", "Ashok Thakre",      "M", "Maintenance Worker", "Electric", "Morning 8hr (8am-5pm)",  13000, True,  "200111222336", "bank", "2023-03-20", 204),
    ("M-005", "Vikas Dhage",       "M", "Maintenance Worker", "H Plant",  "Morning 8hr (8am-5pm)",  12500, True,  "200111222337", "cash", "2023-05-01", 205),
    ("M-006", "Nilesh Bawankar",   "M", "Maintenance Worker", "SQC",      "Morning 8hr (8am-5pm)",  11000, True,  "200111222338", "cash", "2024-01-15", 206),
    ("M-007", "Priya Deshpande",   "F", "Maintenance Worker", "Admin",    "Morning 8hr (8am-5pm)",  10500, True,  "200111222339", "cash", "2024-06-01", 207),

    # ── Staff (monthly salary, 8hr shifts) ────────────────────────
    ("S-001", "Sunil Agnihotri",   "M", "Foreman",      None,  "Morning 8hr (8am-5pm)",  22000, True,  "300222333444", "bank", "2020-04-01", 301),
    ("S-002", "Sachin Dange",      "M", "Fitter",       None,  "Morning 8hr (8am-5pm)",  15000, True,  "300222333445", "bank", "2021-07-15", 302),
    ("S-003", "Mahesh Lokhande",   "M", "Supervisor",   None,  "Morning 8hr (8am-5pm)",  20000, True,  "300222333446", "bank", "2021-01-10", 303),
    ("S-004", "Rekha Chavan",      "F", "Ass. Foreman", None,  "Morning 8hr (8am-5pm)",  18000, True,  "300222333447", "bank", "2022-03-01", 304),
    ("S-005", "Anand Khedkar",     "M", "GM",           None,  "Morning 8hr (8am-5pm)",  45000, True,  "300222333448", "bank", "2019-01-15", 305),
    ("S-006", "Sneha Joshi",       "F", "HR",           None,  "Morning 8hr (8am-5pm)",  25000, True,  "300222333449", "bank", "2021-11-01", 306),
]


async def seed():
    async with get_connection() as conn:
        # Get the org_id
        org_id = await conn.fetchval("SELECT id FROM organisations LIMIT 1")
        if not org_id:
            print("ERROR: No organisation found. Run the config seed first.")
            return

        # Build lookup maps: name -> id
        shifts = {r["name"]: r["id"] for r in await conn.fetch("SELECT id, name FROM shifts WHERE org_id=$1", org_id)}
        sub_cats = {r["name"]: r["id"] for r in await conn.fetch("SELECT id, name FROM sub_categories WHERE org_id=$1", org_id)}
        # For categories, we need the category_id from sub_categories
        sub_cat_to_cat = {r["id"]: r["category_id"] for r in await conn.fetch("SELECT id, category_id FROM sub_categories WHERE org_id=$1", org_id)}
        depts = {(r["category_id"], r["name"]): r["id"] for r in await conn.fetch("SELECT id, category_id, name FROM departments WHERE org_id=$1", org_id)}

        # Check if employees already fully seeded
        count = await conn.fetchval("SELECT count(*) FROM employees WHERE org_id=$1", org_id)
        if count >= 26:
            print(f"DB already has {count} employees. Skipping seed.")
            return
        print(f"DB has {count} employees. Adding remaining seed data...")

        inserted = 0
        for emp in EMPLOYEES:
            code, name, gender, sub_cat_name, dept_name, shift_name, salary, epf, uan, pay_mode, join_date, dev_uid = emp

            sub_cat_id = sub_cats.get(sub_cat_name)
            if not sub_cat_id:
                print(f"  SKIP {code}: sub-category '{sub_cat_name}' not found")
                continue

            category_id = sub_cat_to_cat[sub_cat_id]

            shift_id = shifts.get(shift_name)
            if not shift_id:
                print(f"  SKIP {code}: shift '{shift_name}' not found")
                continue

            dept_id = None
            if dept_name:
                dept_id = depts.get((category_id, dept_name))
                if not dept_id:
                    # Try without category scope (some depts may not have category_id)
                    dept_id = depts.get((None, dept_name))
                    if not dept_id:
                        print(f"  WARN {code}: department '{dept_name}' not found, inserting without dept")

            join_date_parts = join_date.split("-")
            join_date_obj = date_type(int(join_date_parts[0]), int(join_date_parts[1]), int(join_date_parts[2]))

            # Skip if this employee code already exists
            exists = await conn.fetchval(
                "SELECT 1 FROM employees WHERE org_id=$1 AND employee_code=$2", org_id, code
            )
            if exists:
                print(f"  SKIP {code} {name} (already exists)")
                continue

            await conn.execute(
                """
                INSERT INTO employees (
                    org_id, employee_code, name, gender,
                    category_id, sub_category_id, department_id, shift_id,
                    monthly_salary, epf_enrolled, uan_number,
                    payment_mode, bank_account, bank_name, bank_ifsc,
                    joining_date, device_user_id
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8,
                    $9, $10, $11,
                    $12, $13, $14, $15,
                    $16, $17
                )
                """,
                org_id, code, name, gender,
                category_id, sub_cat_id, dept_id, shift_id,
                salary, epf, uan,
                pay_mode,
                f"ACC{code.replace('-','')}" if pay_mode == "bank" else None,
                "State Bank of India" if pay_mode == "bank" else None,
                "SBIN0001234" if pay_mode == "bank" else None,
                join_date_obj, dev_uid,
            )
            inserted += 1
            print(f"  OK {code} {name}")

        print(f"\nDone! Inserted {inserted} employees.")


if __name__ == "__main__":
    asyncio.run(seed())
