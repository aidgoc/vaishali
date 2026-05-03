"""Per-company Attendance setup: Shift Type, attendance_mode, Late Mark.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_attendance.run
    bench --site dgoc.logstop.com execute vaishali.setup_attendance.run --kwargs "{'company': 'Dynamic Crane Engineers Private Limited'}"

With no `company` kwarg, classifies employees across all companies.

- Creates Shift Type "Office Hours" 09:00–18:00, 30-min late-entry grace (global).
- Adds custom field `attendance_mode` (Select Field/Office) on Employee, default Office (global).
- Creates custom DocType "Late Mark" (global).
- Classifies employees in scope: Sales + Service + Operations → Field, others → Office.
- Assigns Office shift to every Office-mode employee that has none.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

SHIFT_NAME = "Office Hours"
# Department prefixes that work in the field — case-insensitive, ignore "- COMPANY" suffix.
# Operations - DCEPL = labour at customer sites; SERVICE / Sales - DSPL = field staff.
FIELD_PREFIXES = {"sales", "service", "operations"}


def run(company=None):
    """Run setup. If company is None, classifies employees across all companies."""
    scope = company or "all companies"
    print(f"\n=== Attendance Setup — {scope} ===\n")
    _ensure_shift_type()
    _ensure_attendance_mode_field()
    _ensure_late_mark_doctype()
    classified = _classify_employees(company)
    frappe.db.commit()
    print(f"\n✓ Done ({scope}). {classified['field']} Field, {classified['office']} Office.\n")


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
    """Late Mark is now an App DocType under vaishali/vaishali/doctype/late_mark/.
    On a fresh bench install, `bench install-app vaishali` picks up the JSON
    automatically. This function only handles legacy databases that still
    have a custom=1 record for Late Mark — flips it back to custom=0 so the
    app code wins on the next `bench migrate`."""
    if not frappe.db.exists("DocType", "Late Mark"):
        # The DocType JSON ships with the app; bench install-app or
        # bench migrate creates it. If it's missing here, the migrate
        # step hasn't run yet — surfaced via the bench restart pipeline.
        print("  DocType: Late Mark missing — run `bench migrate`")
        return
    is_custom = frappe.db.get_value("DocType", "Late Mark", "custom")
    if is_custom:
        frappe.db.set_value("DocType", "Late Mark", "custom", 0)
        print("  DocType: Late Mark flipped from custom=1 → custom=0")
    else:
        print("  DocType: Late Mark in app code (custom=0)")


# ── Classify employees ────────────────────────────────────────────

def _is_field_dept(dept):
    """True if dept name's prefix (before ' - ') matches a field-team prefix."""
    if not dept:
        return False
    prefix = dept.split(" - ")[0].strip().lower()
    return prefix in FIELD_PREFIXES


def _classify_employees(company=None):
    filters = {"status": "Active"}
    if company:
        filters["company"] = company
    employees = frappe.get_all(
        "Employee",
        filters=filters,
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
