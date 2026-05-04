"""Salary Structures — 4 total:
  - Staff - DCEPL  (used by 23 DCEPL Employee rows)
  - Staff - DSPL   (used by 36 DSPL Employee rows)
  - Operator - DCEPL (used by 47 DCEPL Operators)
  - Overhead - DSPL  (used by 4 Overhead employees)

Idempotent: re-running deletes-and-recreates the structure (cancelling SSAs first).
The wipe step is destructive but the `ensure_*` flow assumes wipe has already
been run (i.e., zero structures exist when this runs).
"""
from __future__ import annotations
import frappe

DCEPL = "Dynamic Crane Engineers Private Limited"
DSPL = "Dynamic Servitech Private Limited"


# ── Component formulas shared across structures ──────────────────
# (component_name, formula | None, amount | None, condition | None,
#  amount_based_on_formula 1|0, statistical 1|0)

STAFF_EARNINGS = [
    ("Basic + DA",         "base * 0.40",                                None, None, 1, 0),
    ("HRA",                "base * 0.20",                                None, None, 1, 0),
    ("Medical Allowance",  None,                                         1250, None, 0, 0),
    ("LTA",                None,                                         1250, None, 0, 0),
    ("Conveyance",         None,                                         1600, None, 0, 0),
    ("Children Education", None,                                         200,  None, 0, 0),
    ("Food Allowance",     None,                                         1170, None, 0, 0),
    ("Statutory Bonus",    "base * 0.40 * 0.0833",                       None, None, 1, 0),
    # Special Allowance balances the rest. Frappe doesn't have a "balance"
    # mode on a single row, so we compute it as:
    #   base - (basic + hra + 1250+1250+1600+200+1170 + stat_bonus)
    #   = base * (1 - 0.4 - 0.2 - 0.40*0.0833) - 5470
    #   = base * 0.36668 - 5470
    ("Special Allowance",  "base * 0.36668 - 5470",                      None, None, 1, 0),
]

STAFF_DEDUCTIONS = [
    ("Provident Fund",      "min(base * 0.40 * 0.12, 1800)", None,
        "pf_applicable",                                       1, 0),
    ("ESIC",                "gross_pay * 0.0075",            None,
        "esic_applicable and gross_pay <= 21000",              1, 0),
    ("Professional Tax",    None, None, None, 0, 0),  # Frappe's standard PT
    ("MLWF",                "6 if month in (6, 12) else 0",  None,
        None,                                                  1, 0),
]

OPERATOR_EARNINGS = [
    # Basic+DA capped at the employee's min-wage anchor (base_basic_da).
    # HRA = residual. base_basic_da is set per-employee from the Excel.
    ("Basic + DA",      "min(base, base_basic_da)",                      None, None, 1, 0),
    ("HRA",             "max(0, base - base_basic_da)",                  None, None, 1, 0),
    ("Site Allowance",  "site_allowance",                                None, None, 1, 0),
]

OPERATOR_DEDUCTIONS = [
    ("Provident Fund",   "min(base_basic_da * 0.12, 1800)", None,
        "pf_applicable",                                     1, 0),
    ("ESIC",             "gross_pay * 0.0075",              None,
        "esic_applicable",                                   1, 0),
    # Operator ESIC has no 21k cap because already-enrolled members
    # continue contributing past the threshold (DINESH ADEY at gross
    # 21,842 still being deducted, per the Excel).
    ("Professional Tax", None, None, None, 0, 0),
    ("MLWF",             "6 if month in (6, 12) else 0", None, None, 1, 0),
]

OVERHEAD_EARNINGS = [
    ("Basic + DA",            "base * 0.40",  None, None, 1, 0),
    ("HRA",                   "base * 0.184", None, None, 1, 0),
    ("Attendance Allowance",  "base * 0.152", None, None, 1, 0),
    ("Food Allowance",        "base * 0.16",  None, None, 1, 0),
    ("SP Allowance",          "base * 0.104", None, None, 1, 0),
]

OVERHEAD_DEDUCTIONS = [
    ("Professional Tax", None, None, None, 0, 0),
    ("MLWF", "6 if month in (6, 12) else 0", None, None, 1, 0),
]


def _build_structure(name: str, company: str,
                     earnings: list, deductions: list) -> None:
    """Create + submit one Salary Structure. Skips silently if it already
    exists (idempotent). Wipe must have run if you want a fresh build."""
    if frappe.db.exists("Salary Structure", name):
        print(f"  Salary Structure: {name} already exists — preserving")
        return

    doc = frappe.new_doc("Salary Structure")
    doc.name = name
    doc.salary_structure_name = name
    doc.company = company
    doc.is_active = "Yes"
    doc.payroll_frequency = "Monthly"
    doc.currency = "INR"
    doc.flags.name_set = True

    for comp_name, formula, amount, condition, amt_based, statistical in earnings:
        row = doc.append("earnings", {})
        row.salary_component = comp_name
        if formula:
            row.formula = formula
            row.amount_based_on_formula = 1
        if amount is not None:
            row.amount = amount
            row.amount_based_on_formula = 0
        if condition:
            row.condition = condition
        row.statistical_component = statistical

    for comp_name, formula, amount, condition, amt_based, statistical in deductions:
        row = doc.append("deductions", {})
        row.salary_component = comp_name
        if formula:
            row.formula = formula
            row.amount_based_on_formula = 1
        if amount is not None:
            row.amount = amount
            row.amount_based_on_formula = 0
        if condition:
            row.condition = condition
        row.statistical_component = statistical

    doc.insert(ignore_permissions=True, set_name=name)
    doc.submit()
    print(f"  Salary Structure: {name} ({company})")


def ensure_staff():
    _build_structure("Staff - DCEPL", DCEPL, STAFF_EARNINGS, STAFF_DEDUCTIONS)
    _build_structure("Staff - DSPL",  DSPL,  STAFF_EARNINGS, STAFF_DEDUCTIONS)


def ensure_operator():
    _build_structure("Operator - DCEPL", DCEPL, OPERATOR_EARNINGS, OPERATOR_DEDUCTIONS)


def ensure_overhead():
    _build_structure("Overhead - DSPL", DSPL, OVERHEAD_EARNINGS, OVERHEAD_DEDUCTIONS)


def ensure_all():
    ensure_staff()
    ensure_operator()
    ensure_overhead()
    frappe.db.commit()
