"""Overtime setup — Custom Field + DocType + scheduler hook.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_overtime.run

Pirangut workshop policy (CWS branch — DCEPL workshop crew + DSPL
service engineers):
- Saturdays are working days (Sundays + public holidays are off)
- Standard 9 working hours per day; anything beyond counts as overtime
- OT is paid at a 1:1 rate (one hour OT = one hour regular pay) — the
  pay_multiplier field on Overtime Log captures this so payroll can
  pick it up directly
- On a public holiday, every worked hour counts as overtime

This script:
- Adds Custom Field `Employee.overtime_eligible` (Check, default 0)
- Creates the custom DocType `Overtime Log` (one row per eligible
  employee per worked day, populated by
  `vaishali.api.attendance.compute_overtime`)
- flag_pirangut() flips overtime_eligible=1 for every active employee
  that fits the Pirangut policy (DCEPL/CWS shop-floor crew + DSPL/CWS
  service engineers)
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


# Pirangut workshop = CWS branch.
# - Every active DCEPL/CWS employee (the shop-floor crew — mechanics,
#   drivers, electricians, technicians, maintenance manager, stores) is
#   overtime-eligible.
# - DSPL/CWS service engineers (Service department only — not Sales BD)
#   are also OT-eligible per management direction; they share the
#   workshop and follow the same 1:1 OT pay rule.
PIRANGUT_FILTERS = [
    {
        "company": "Dynamic Crane Engineers Private Limited",
        "branch": "CWS",
        "status": "Active",
    },
    {
        "company": "Dynamic Servitech Private Limited",
        "branch": "CWS",
        "department": ["like", "SERVICE%"],
        "status": "Active",
    },
]


def run():
    print("\n=== Overtime Setup ===\n")
    _ensure_overtime_eligible_field()
    _ensure_overtime_log_doctype()
    _drop_legacy_pay_multiplier_custom_field()
    flag_pirangut()
    frappe.db.commit()
    print("\n✓ Overtime infrastructure ready.\n")


# ── Cleanup: drop legacy pay_multiplier Custom Field ──────────────

def _drop_legacy_pay_multiplier_custom_field():
    """Earlier setup added Overtime Log.pay_multiplier as a Custom Field on
    top of a custom=1 DocType. Now that Overtime Log ships as an App DocType
    (vaishali/vaishali/doctype/overtime_log/overtime_log.json) with
    pay_multiplier baked into the standard fields, the Custom Field record
    becomes a duplicate and must go."""
    cf = frappe.db.exists("Custom Field",
                          {"dt": "Overtime Log", "fieldname": "pay_multiplier"})
    if cf:
        frappe.delete_doc("Custom Field", cf, ignore_permissions=True)
        print("  Custom Field: removed legacy Overtime Log.pay_multiplier "
              "(now a standard field on the App DocType)")


def flag_pirangut():
    """Mark every employee that fits the Pirangut OT policy (DCEPL/CWS shop-
    floor + DSPL/CWS service engineers) as overtime_eligible. Idempotent —
    only flips employees whose flag is currently 0."""
    seen = set()
    matched = 0
    flipped = 0
    for filt in PIRANGUT_FILTERS:
        emps = frappe.get_all("Employee", filters=filt,
                              fields=["name", "employee_name", "overtime_eligible"])
        for e in emps:
            if e.name in seen:
                continue
            seen.add(e.name)
            matched += 1
            if not e.overtime_eligible:
                frappe.db.set_value("Employee", e.name, "overtime_eligible", 1)
                flipped += 1
    print(f"  Pirangut OT: {flipped} of {matched} employees newly flagged "
          f"(rest already on)")
    return {"matched": matched, "flipped": flipped}


# ── Custom Field: Employee.overtime_eligible ──────────────────────

def _ensure_overtime_eligible_field():
    create_custom_field("Employee", {
        "fieldname": "overtime_eligible",
        "label": "Overtime eligible",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "attendance_mode",
        "description": "When checked, daily overtime is computed and logged "
                       "for this employee (typically Pirangut service "
                       "engineering and shop-floor crews).",
    })
    print("  Custom Field: Employee.overtime_eligible ensured")


# ── DocType: Overtime Log ─────────────────────────────────────────

def _ensure_overtime_log_doctype():
    """Overtime Log is an App DocType under vaishali/vaishali/doctype/overtime_log/.
    On a fresh bench install, the JSON file is loaded by `bench migrate`.
    This function only handles legacy databases where the DocType was first
    created with custom=1 — flips the flag back to 0 so the app code is
    authoritative."""
    if not frappe.db.exists("DocType", "Overtime Log"):
        print("  DocType: Overtime Log missing — run `bench migrate`")
        return
    is_custom = frappe.db.get_value("DocType", "Overtime Log", "custom")
    if is_custom:
        frappe.db.set_value("DocType", "Overtime Log", "custom", 0)
        print("  DocType: Overtime Log flipped from custom=1 → custom=0")
    else:
        print("  DocType: Overtime Log in app code (custom=0)")
