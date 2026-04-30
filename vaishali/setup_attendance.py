"""One-time setup: Shift Type, Employee.attendance_mode field, Late Mark DocType.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_attendance.run

- Creates Shift Type "Office Hours" 09:00–18:00, 30-min late-entry grace.
- Adds custom field `attendance_mode` (Select Field/Office) on Employee, default Office.
- Auto-classifies existing employees: Sales + Service → Field, others → Office.
- Assigns Office shift to every Office-mode employee.
- Creates custom DocType "Late Mark" — single-row log per (employee, date).
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

SHIFT_NAME = "Office Hours"
# Department prefixes that work in the field — case-insensitive, ignore "- COMPANY" suffix.
# Operations - DCEPL = labour at customer sites; SERVICE / Sales - DSPL = field staff.
FIELD_PREFIXES = {"sales", "service", "operations"}


def run():
    print("\n=== DSPL Attendance Setup ===\n")
    _ensure_shift_type()
    _ensure_attendance_mode_field()
    _ensure_late_mark_doctype()
    classified = _classify_employees()
    frappe.db.commit()
    print(f"\n✓ Done. {classified['field']} Field, {classified['office']} Office.\n")


# ── Shift Type ────────────────────────────────────────────────────

def _ensure_shift_type():
    if frappe.db.exists("Shift Type", SHIFT_NAME):
        doc = frappe.get_doc("Shift Type", SHIFT_NAME)
        action = "updated"
    else:
        doc = frappe.new_doc("Shift Type")
        doc.name = SHIFT_NAME
        action = "created"
    doc.start_time = "09:00:00"
    doc.end_time = "18:00:00"
    doc.late_entry_grace_period = 30
    doc.early_exit_grace_period = 30
    doc.enable_auto_attendance = 0
    doc.save(ignore_permissions=True)
    print(f"  Shift Type: {action} {SHIFT_NAME} (09:00–18:00, 30 min grace)")


# ── attendance_mode custom field ──────────────────────────────────

def _ensure_attendance_mode_field():
    create_custom_field(
        "Employee",
        {
            "fieldname": "attendance_mode",
            "label": "Attendance Mode",
            "fieldtype": "Select",
            "options": "Office\nField",
            "default": "Office",
            "insert_after": "department",
            "description": "Field staff check in from anywhere; Office staff geofenced.",
        },
    )
    print("  Custom Field: Employee.attendance_mode ensured")


# ── Late Mark DocType ─────────────────────────────────────────────

def _ensure_late_mark_doctype():
    if frappe.db.exists("DocType", "Late Mark"):
        print("  DocType: Late Mark exists")
        return
    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "Late Mark",
        "module": "Vaishali",
        "custom": 1,
        "naming_rule": "Expression",
        "autoname": "format:LM-{employee}-{date}",
        "track_changes": 1,
        "fields": [
            {"fieldname": "employee", "label": "Employee", "fieldtype": "Link",
             "options": "Employee", "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "employee_name", "label": "Employee Name", "fieldtype": "Data",
             "fetch_from": "employee.employee_name", "read_only": 1, "in_list_view": 1},
            {"fieldname": "date", "label": "Date", "fieldtype": "Date",
             "reqd": 1, "in_list_view": 1, "in_standard_filter": 1},
            {"fieldname": "checkin_time", "label": "Check-in Time", "fieldtype": "Datetime",
             "in_list_view": 1},
            {"fieldname": "minutes_late", "label": "Minutes Late", "fieldtype": "Int",
             "in_list_view": 1},
            {"fieldname": "rolled_into_half_day", "label": "Rolled into Half Day",
             "fieldtype": "Check", "default": 0,
             "description": "Set when this Late Mark has been counted toward a monthly half-day deduction."},
        ],
        "permissions": [
            {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
            {"role": "HR User", "read": 1, "write": 1, "create": 1},
            {"role": "Employee", "read": 1, "if_owner": 1},
        ],
    })
    doc.insert(ignore_permissions=True)
    print("  DocType: created Late Mark")


# ── Classify employees ────────────────────────────────────────────

def _is_field_dept(dept):
    """True if dept name's prefix (before ' - ') matches a field-team prefix."""
    if not dept:
        return False
    prefix = dept.split(" - ")[0].strip().lower()
    return prefix in FIELD_PREFIXES


def _classify_employees():
    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "department", "default_shift", "attendance_mode"],
    )
    counts = {"field": 0, "office": 0}
    for emp in employees:
        mode = "Field" if _is_field_dept(emp.department) else "Office"
        if emp.attendance_mode != mode:
            frappe.db.set_value("Employee", emp.name, "attendance_mode", mode)
        if mode == "Office" and not emp.default_shift:
            frappe.db.set_value("Employee", emp.name, "default_shift", SHIFT_NAME)
        counts["field" if mode == "Field" else "office"] += 1
    return counts
