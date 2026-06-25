"""
Pure calculation functions for the payroll engine.
No DB I/O, no async — just math on Decimal values.

Three salary paths:
  Path A — tier (Labour Skilled):  gross = (daily_rate × days) + (per_hr × OT) - (per_hr × UT)
  Path B — daily_flat (Trainee):   gross = flat_daily_rate × days_present
  Path C — monthly (Maint/Staff):  gross = (salary/30 × days) + (per_hr × OT) - (per_hr × UT)

OT/undertime per-hour rate is always derived from the BASE rate excluding any
jobber allowance, divided by the employee's shift hours (8h Staff, 12h Labour).
"""

from decimal import Decimal, ROUND_HALF_UP

# Working-day divisor: 26 days/month (30 – 4 allowed holidays).
# This is used ONLY if per_day_salary is not explicitly set on the employee.
# Prefer per_day_salary from the DB; fall back to monthly_salary / 26 if absent.
MONTHLY_DIVISOR = Decimal("26")

# Rounding precision for final monetary values.
TWO_DP = Decimal("0.01")


# ── Path A — Tier (Labour Skilled) ────────────────────────────────────────────

def calc_path_a_tier(
    days_present: Decimal,
    daily_rate: Decimal,
    ot_base_rate: Decimal,
    ot_hours: Decimal,
    undertime_hours: Decimal,
    standard_hours: Decimal,
) -> Decimal:
    """
    Path A:
      day_pay  = daily_rate × days_present   (daily_rate includes jobber allowance)
      per_hour = ot_base_rate / standard_hours
                 (ot_base_rate is the bare tier rate — jobber EXCLUDED)
      gross    = day_pay + (per_hour × ot_hours) - (per_hour × undertime_hours)

    The daily_rate is looked up from labour_tier_rates based on which tier
    the employee's total days_present falls into for the month.
    """
    per_hour = ot_base_rate / standard_hours if standard_hours > 0 else Decimal("0")

    gross = (
        (daily_rate * days_present)
        + (per_hour * ot_hours)
        - (per_hour * undertime_hours)
    )

    return gross.quantize(TWO_DP, rounding=ROUND_HALF_UP)


# ── Path B — Daily Flat (Trainee) ─────────────────────────────────────────────

def calc_path_b_daily_flat(days_present: Decimal, flat_daily_rate: Decimal) -> Decimal:
    """
    Path B: gross = flat_daily_rate × days_present.
    No components, no EPF. Net = gross minus manual deductions only.
    """
    return (flat_daily_rate * days_present).quantize(TWO_DP, rounding=ROUND_HALF_UP)


# ── Path C — Monthly (Maintenance + Staff) ────────────────────────────────────

def calc_path_c_monthly(
    per_day_salary: Decimal,
    days_present: Decimal,
    ot_hours: Decimal,
    undertime_hours: Decimal,
    standard_hours: Decimal,
) -> Decimal:
    """
    Path C:
      per_day  = per_day_salary  (stored directly on the employee; NOT derived from monthly)
      per_hour = per_day / standard_hours
      gross    = (per_day × days_present) + (per_hour × ot_hours) - (per_hour × undertime_hours)
    """
    per_day = per_day_salary
    per_hour = per_day / standard_hours if standard_hours > 0 else Decimal("0")

    gross = (
        (per_day * days_present)
        + (per_hour * ot_hours)
        - (per_hour * undertime_hours)
    )

    return gross.quantize(TWO_DP, rounding=ROUND_HALF_UP)


# ── Salary component calculator ──────────────────────────────────────────────

def apply_components(
    gross: Decimal,
    components: list[dict],
    epf_enrolled: bool,
) -> tuple[list[dict], Decimal]:
    """
    Iterate salary components in calculation_order and compute each value.

    Supported formula types:
      - percent_of_gross     → value = gross × (formula_value / 100)
      - percent_of_component → value = computed_values[ref_component_id] × (formula_value / 100)
      - fixed                → value = formula_value (flat rupee amount)

    EPF (type='deduction') is skipped if epf_enrolled is False.

    Returns:
      (component_rows, total_component_deductions)

    Where component_rows is a list of dicts ready for DB insert:
      {component_id, component_name, component_type, is_displayed, value}
    """
    computed_values: dict[str, Decimal] = {}  # component_id → computed value
    component_rows: list[dict] = []
    total_deductions = Decimal("0")

    for comp in components:
        comp_id = comp["id"]
        comp_name = comp["name"]
        comp_type = comp["type"]
        formula_type = comp["formula_type"]
        formula_value = Decimal(str(comp["formula_value"]))
        ref_id = comp.get("ref_component_id")
        is_displayed = comp["is_displayed"]

        # Skip EPF if employee is not enrolled
        if comp_type == "deduction" and not epf_enrolled:
            continue

        # Calculate value based on formula type
        if formula_type == "percent_of_gross":
            value = (gross * formula_value / Decimal("100")).quantize(
                TWO_DP, rounding=ROUND_HALF_UP
            )
        elif formula_type == "percent_of_component":
            ref_value = computed_values.get(ref_id, Decimal("0"))
            value = (ref_value * formula_value / Decimal("100")).quantize(
                TWO_DP, rounding=ROUND_HALF_UP
            )
        elif formula_type == "fixed":
            value = formula_value.quantize(TWO_DP, rounding=ROUND_HALF_UP)
        else:
            # Unknown formula type — skip rather than crash
            continue

        computed_values[comp_id] = value

        component_rows.append({
            "component_id": comp_id,
            "component_name": comp_name,
            "component_type": comp_type,
            "is_displayed": is_displayed,
            "value": value,
        })

        if comp_type == "deduction":
            total_deductions += value

    return component_rows, total_deductions
