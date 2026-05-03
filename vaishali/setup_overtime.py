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
    _ensure_pay_multiplier_field()
    flag_pirangut()
    frappe.db.commit()
    print("\n✓ Overtime infrastructure ready.\n")


# ── Custom Field: Overtime Log.pay_multiplier (1:1 default) ───────

def _ensure_pay_multiplier_field():
    """Pay multiplier on each OT Log row. Default 1.0 (Pirangut 1:1 policy);
    can be overridden per row if management approves a different rate
    (e.g. 1.5x for a specific holiday). The actual amount is derived by
    payroll from `ot_hours × pay_multiplier × hourly_rate`."""
    create_custom_field("Overtime Log", {
        "fieldname": "pay_multiplier",
        "label": "Pay multiplier",
        "fieldtype": "Float",
        "default": "1.0",
        "precision": "2",
        "insert_after": "is_holiday_work",
        "description": "1.0 = same hourly rate as regular pay (Pirangut policy). "
                       "Bump if management approves a higher multiplier for "
                       "a specific date.",
    })
    print("  Custom Field: Overtime Log.pay_multiplier ensured (default 1.0)")


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
    if frappe.db.exists("DocType", "Overtime Log"):
        print("  DocType: Overtime Log exists")
        return
    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Overtime Log",
        "module": "Vaishali",
        "custom": 1,
        "naming_rule": "Expression",
        "autoname": "format:OT-{employee}-{date}",
        "track_changes": 1,
        "fields": [
            {"fieldname": "employee", "label": "Employee", "fieldtype": "Link",
             "options": "Employee", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "employee_name", "label": "Employee Name", "fieldtype": "Data",
             "fetch_from": "employee.employee_name", "read_only": 1, "in_list_view": 1},
            {"fieldname": "date", "label": "Date", "fieldtype": "Date",
             "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "company", "label": "Company", "fieldtype": "Link",
             "options": "Company", "in_standard_filter": 1},
            {"fieldname": "section_break_times", "fieldtype": "Section Break",
             "label": "Times"},
            {"fieldname": "in_time", "label": "First In", "fieldtype": "Datetime"},
            {"fieldname": "out_time", "label": "Last Out", "fieldtype": "Datetime"},
            {"fieldname": "section_break_hours", "fieldtype": "Section Break",
             "label": "Hours"},
            {"fieldname": "total_hours", "label": "Total hours", "fieldtype": "Float",
             "in_list_view": 1, "precision": "2",
             "description": "(Last Out − First In) minus 1h lunch on a working day."},
            {"fieldname": "regular_hours", "label": "Regular hours", "fieldtype": "Float",
             "precision": "2"},
            {"fieldname": "ot_hours", "label": "OT hours", "fieldtype": "Float",
             "in_list_view": 1, "precision": "2"},
            {"fieldname": "is_holiday_work", "label": "Holiday work?",
             "fieldtype": "Check", "default": 0,
             "description": "On holidays, every hour worked counts as overtime."},
            {"fieldname": "section_break_status", "fieldtype": "Section Break",
             "label": "Status"},
            {"fieldname": "status", "label": "Status", "fieldtype": "Select",
             "options": "Open\nApproved\nPaid\nRejected", "default": "Open",
             "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "approved_by", "label": "Approved by", "fieldtype": "Link",
             "options": "User"},
            {"fieldname": "approval_remark", "label": "Approval remark",
             "fieldtype": "Small Text"},
        ],
        "permissions": [
            {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
            {"role": "HR User", "read": 1, "write": 1, "create": 1},
            {"role": "Service Manager", "read": 1, "write": 1},
            {"role": "Employee", "read": 1, "if_owner": 1},
        ],
    })
    doc.insert(ignore_permissions=True)
    print("  DocType: created Overtime Log")
