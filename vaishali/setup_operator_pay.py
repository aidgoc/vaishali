"""Operator pay setup — Salary Component + per-employee hourly rate.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_operator_pay.run

Operators (DCEPL/Operations - DCEPL field crew) get paid by billed
logsheet hours, not by check-in/out. Each operator has a personal hourly
rate stored on Employee.operator_pay_rate; the monthly payroll job in
`vaishali.api.payroll` reads approved + billed Operator Logsheets, sums
hours per operator, multiplies by rate, and emits Additional Salary
entries against the "Operator Logsheet Pay" component.

This script:
- Creates Salary Component "Operator Logsheet Pay" (Earning, taxable)
- Adds Custom Field `Employee.operator_pay_rate` (Currency, INR)
- Provides set_default_rate() to bulk-seed a placeholder rate on
  active DCEPL/Operations - DCEPL employees still at 0
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


SALARY_COMPONENT = "Operator Logsheet Pay"
OPERATOR_DEPARTMENT = "Operations - DCEPL"


def run():
    print("\n=== Operator Pay Setup ===\n")
    _ensure_salary_component()
    _ensure_operator_pay_rate_field()
    frappe.db.commit()
    print("\n✓ Operator pay infrastructure ready.\n")


# ── Salary Component: Operator Logsheet Pay ───────────────────────

def _ensure_salary_component():
    """Create the Earning Salary Component used by Additional Salary
    entries that compute_operator_pay() emits at month-end. Skips if it
    already exists; never overwrites manual edits the HR team has made
    on the desk."""
    if frappe.db.exists("Salary Component", SALARY_COMPONENT):
        print(f"  Salary Component: {SALARY_COMPONENT} already exists "
              f"— preserving desk edits")
        return

    abbr = "OLP"
    doc = frappe.new_doc("Salary Component")
    doc.salary_component = SALARY_COMPONENT
    doc.salary_component_abbr = abbr
    doc.type = "Earning"
    doc.depends_on_payment_days = 0
    doc.statistical_component = 0
    doc.is_tax_applicable = 1
    doc.do_not_include_in_total = 0
    doc.description = ("Per-hour pay to operators based on billed "
                       "Operator Logsheets. Populated via Additional "
                       "Salary by vaishali.api.payroll.")
    doc.insert(ignore_permissions=True)
    print(f"  Salary Component: {SALARY_COMPONENT} created (abbr={abbr})")


# ── Custom Field: Employee.operator_pay_rate ──────────────────────

def _ensure_operator_pay_rate_field():
    create_custom_field("Employee", {
        "fieldname": "operator_pay_rate",
        "label": "Operator pay rate (₹/hour)",
        "fieldtype": "Currency",
        "options": "INR",
        "default": "0",
        "insert_after": "overtime_eligible",
        "description": ("Hourly rate paid to the operator for billed "
                        "logsheet hours. Used by "
                        "vaishali.api.payroll.compute_operator_pay."),
    })
    print("  Custom Field: Employee.operator_pay_rate ensured")


# ── Helper: bulk-seed default rate ────────────────────────────────

def set_default_rate(rate=60):
    """Bulk-set operator_pay_rate to `rate` on every active DCEPL
    Operations - DCEPL employee whose rate is currently 0/null. Returns
    the count of employees flipped. Idempotent — never overwrites a
    rate someone has already set."""
    emps = frappe.get_all(
        "Employee",
        filters={
            "company": "Dynamic Crane Engineers Private Limited",
            "department": OPERATOR_DEPARTMENT,
            "status": "Active",
        },
        fields=["name", "employee_name", "operator_pay_rate"],
    )
    flipped = 0
    for e in emps:
        if not e.operator_pay_rate:
            frappe.db.set_value("Employee", e.name, "operator_pay_rate", rate)
            flipped += 1
    frappe.db.commit()
    print(f"  Default rate ₹{rate}/hr applied to {flipped} of {len(emps)} "
          f"DCEPL operators (rest had non-zero rate already)")
    return flipped
