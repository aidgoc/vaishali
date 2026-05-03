"""Overtime setup — Custom Field + DocType + scheduler hook.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_overtime.run

Pirangut service-engineering staff (and anyone else management opts in)
need overtime tracking. This script:
- Adds Custom Field `Employee.overtime_eligible` (Check, default 0)
- Creates the custom DocType `Overtime Log` (one row per eligible
  employee per worked day, populated by
  `vaishali.api.attendance.compute_overtime`)

Marking employees eligible is left as a desk action — the field appears
just under `attendance_mode` on the Employee form.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


# Pirangut workshop = CWS branch under DCEPL. Every active CWS-DCEPL
# employee is overtime-eligible per management policy (mechanics, drivers,
# electricians, service technicians, maintenance — the shop-floor crew).
PIRANGUT_FILTER = {
    "company": "Dynamic Crane Engineers Private Limited",
    "branch": "CWS",
    "status": "Active",
}


def run():
    print("\n=== Overtime Setup ===\n")
    _ensure_overtime_eligible_field()
    _ensure_overtime_log_doctype()
    flag_pirangut()
    frappe.db.commit()
    print("\n✓ Overtime infrastructure ready.\n")


def flag_pirangut():
    """Idempotently mark every active DCEPL employee in branch CWS (Pirangut
    workshop) as overtime_eligible. Re-runnable: only flips employees whose
    flag is currently 0; never touches anyone outside the filter."""
    emps = frappe.get_all("Employee", filters=PIRANGUT_FILTER,
                          fields=["name", "employee_name", "overtime_eligible"])
    flipped = 0
    for e in emps:
        if not e.overtime_eligible:
            frappe.db.set_value("Employee", e.name, "overtime_eligible", 1)
            flipped += 1
    print(f"  Pirangut OT: {flipped} of {len(emps)} DCEPL/CWS employees flagged "
          f"(rest already on)")
    return {"matched": len(emps), "flipped": flipped}


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
