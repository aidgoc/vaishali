"""Salary Components — 13 earnings + 7 deductions = 20 base + 3 operator-
specific = 23 total.

Formulas live on the Salary Structure (which references the component +
overrides amount/formula per structure). Components themselves only carry
type/abbr/depends_on_payment_days/tax-applicable metadata.

Idempotent — preserves existing records on re-run.
"""
from __future__ import annotations
import frappe


COMPONENTS = [
    # name, abbr, type, depends_on_payment_days, is_tax_applicable, statistical
    # ─ Earnings ─────────────────────────────────────────────────
    ("Basic + DA",            "BD",   "Earning",   1, 1, 0),
    ("HRA",                   "HRA",  "Earning",   1, 1, 0),
    ("Medical Allowance",     "MED",  "Earning",   1, 1, 0),
    ("LTA",                   "LTA",  "Earning",   1, 1, 0),
    ("Conveyance",            "CONV", "Earning",   1, 1, 0),
    ("Children Education",    "CHEDU","Earning",   1, 1, 0),
    ("Food Allowance",        "FOOD", "Earning",   1, 1, 0),
    ("Statutory Bonus",       "SB",   "Earning",   1, 1, 0),
    ("Special Allowance",     "SA",   "Earning",   1, 1, 0),
    ("Attendance Allowance",  "AA",   "Earning",   1, 1, 0),
    ("SP Allowance",          "SP",   "Earning",   1, 1, 0),
    ("DA Arrears",            "DAA",  "Earning",   0, 1, 0),
    ("Site Allowance",        "SITE", "Earning",   0, 1, 0),
    ("Overtime",              "OT",   "Earning",   0, 1, 0),
    ("Operator Logsheet Pay", "OLP",  "Earning",   0, 1, 0),
    ("Salary Arrears",        "ARR",  "Earning",   0, 1, 0),
    # ─ Deductions ───────────────────────────────────────────────
    ("Provident Fund",        "PF",   "Deduction", 1, 0, 0),
    ("ESIC",                  "ESIC", "Deduction", 1, 0, 0),
    ("Professional Tax",      "PT",   "Deduction", 1, 0, 0),
    ("MLWF",                  "MLWF", "Deduction", 0, 0, 0),
    ("TDS",                   "TDS",  "Deduction", 0, 0, 0),
    ("Other Deductions",      "OD",   "Deduction", 0, 0, 0),
    ("Salary / Other Advance","SADV", "Deduction", 0, 0, 0),
]


def ensure_all():
    created, preserved = 0, 0
    for name, abbr, type_, dop, taxable, statistical in COMPONENTS:
        if frappe.db.exists("Salary Component", name):
            preserved += 1
            continue
        doc = frappe.new_doc("Salary Component")
        doc.salary_component = name
        doc.salary_component_abbr = abbr
        doc.type = type_
        doc.depends_on_payment_days = dop
        doc.is_tax_applicable = taxable
        doc.statistical_component = statistical
        doc.do_not_include_in_total = 0
        doc.insert(ignore_permissions=True)
        created += 1
    frappe.db.commit()
    print(f"  Salary Components: {created} created, {preserved} preserved (total target: {len(COMPONENTS)})")
