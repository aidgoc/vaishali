"""One-time setup: DSPL Leave Policy + Period + Types + bulk Assignment.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_leave_policy.run

Builds the FY 2026-27 leave plumbing:
- Leave Types: Paid Leave (12/yr earned monthly), Sick Leave (6/yr earned monthly),
  Leave Without Pay (verifies existing).
- Leave Period: FY 2026-27 (1 Apr 2026 – 31 Mar 2027).
- Leave Policy: DSPL Standard (Paid 12 + Sick 6).
- Leave Policy Assignment: bulk-assigned to every active Employee.
- Holiday List: reuses existing list assigned to DSPL company; assigns it to every
  Employee that doesn't already have one.
- Default Leave Approver: ai.dgoc@gmail.com (System Manager) — set per-Employee
  only when blank, never overwrites a human-set approver.
"""
import frappe
from frappe.utils import getdate
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

COMPANY = "Dynamic Servitech Private Limited"
LEAVE_PERIOD = "FY 2026-27"
LEAVE_PERIOD_FROM = "2026-04-01"
LEAVE_PERIOD_TO = "2027-03-31"
LEAVE_POLICY = "DSPL Standard"

PAID_LEAVE = "Paid Leave"
SICK_LEAVE = "Sick Leave"
LWP = "Leave Without Pay"

DEFAULT_APPROVER = "ai.dgoc@gmail.com"
HR_EMAIL = "info@dgoc.in"


def run():
    """Entry point — runs every step in order, prints a summary."""
    print(f"\n=== DSPL Leave Policy Setup — {LEAVE_PERIOD} ===\n")
    holiday_list = _resolve_holiday_list()
    _ensure_leave_types()
    _ensure_leave_period()
    _ensure_leave_policy()
    _ensure_cancellation_reason_field()
    assigned, allocated = _bulk_assign_employees(holiday_list)
    _ensure_hr_cc_on_notifications()
    frappe.db.commit()
    print(f"\n✓ Done. Policy assigned to {assigned} employees, "
          f"{allocated} new leave allocations created.\n")


# ── Holiday List ──────────────────────────────────────────────────

def _resolve_holiday_list():
    """Find the Holiday List already linked to DSPL or its default."""
    company_default = frappe.db.get_value("Company", COMPANY, "default_holiday_list")
    if company_default and frappe.db.exists("Holiday List", company_default):
        print(f"  Holiday List: using company default → {company_default}")
        return company_default
    candidates = frappe.get_all(
        "Holiday List",
        filters=[["from_date", "<=", LEAVE_PERIOD_TO],
                 ["to_date", ">=", LEAVE_PERIOD_FROM]],
        order_by="creation desc",
        limit=1,
        pluck="name",
    )
    if candidates:
        print(f"  Holiday List: using period-overlapping → {candidates[0]}")
        return candidates[0]
    raise frappe.ValidationError(
        "No Holiday List found that covers FY 2026-27. "
        "Create one in ERPNext > HR > Holiday List, then re-run."
    )


# ── Leave Types ───────────────────────────────────────────────────

def _ensure_leave_types():
    _upsert_leave_type(
        name=PAID_LEAVE,
        max_leaves_allowed=12,
        is_earned_leave=1,
        earned_leave_frequency="Monthly",
        rounding="0.5",
        is_carry_forward=0,
        is_lwp=0,
        include_holiday=0,
        allow_negative=0,
    )
    _upsert_leave_type(
        name=SICK_LEAVE,
        max_leaves_allowed=6,
        is_earned_leave=1,
        earned_leave_frequency="Monthly",
        rounding="0.5",
        is_carry_forward=0,
        is_lwp=0,
        include_holiday=0,
        allow_negative=0,
    )
    if not frappe.db.exists("Leave Type", LWP):
        doc = frappe.new_doc("Leave Type")
        doc.leave_type_name = LWP
        doc.is_lwp = 1
        doc.include_holiday = 0
        doc.allow_negative = 1
        doc.insert(ignore_permissions=True)
        print(f"  Leave Type: created {LWP}")
    else:
        print(f"  Leave Type: {LWP} exists")


def _upsert_leave_type(name, **fields):
    if frappe.db.exists("Leave Type", name):
        doc = frappe.get_doc("Leave Type", name)
        action = "updated"
    else:
        doc = frappe.new_doc("Leave Type")
        doc.leave_type_name = name
        action = "created"
    for k, v in fields.items():
        doc.set(k, v)
    doc.save(ignore_permissions=True)
    print(f"  Leave Type: {action} {name} "
          f"(max={fields['max_leaves_allowed']}, earned={fields['is_earned_leave']})")


# ── Leave Period ──────────────────────────────────────────────────

def _ensure_leave_period():
    if frappe.db.exists("Leave Period", LEAVE_PERIOD):
        print(f"  Leave Period: {LEAVE_PERIOD} exists")
        return
    doc = frappe.new_doc("Leave Period")
    doc.name = LEAVE_PERIOD
    doc.from_date = LEAVE_PERIOD_FROM
    doc.to_date = LEAVE_PERIOD_TO
    doc.company = COMPANY
    doc.is_active = 1
    doc.insert(ignore_permissions=True)
    print(f"  Leave Period: created {LEAVE_PERIOD} ({LEAVE_PERIOD_FROM} → {LEAVE_PERIOD_TO})")


# ── Leave Policy ──────────────────────────────────────────────────

def _ensure_leave_policy():
    if frappe.db.exists("Leave Policy", LEAVE_POLICY):
        doc = frappe.get_doc("Leave Policy", LEAVE_POLICY)
        doc.leave_policy_details = []
        action = "updated"
    else:
        doc = frappe.new_doc("Leave Policy")
        doc.title = LEAVE_POLICY
        action = "created"
    doc.append("leave_policy_details", {"leave_type": PAID_LEAVE, "annual_allocation": 12})
    doc.append("leave_policy_details", {"leave_type": SICK_LEAVE, "annual_allocation": 6})
    doc.save(ignore_permissions=True)
    if not doc.docstatus:
        doc.submit()
    print(f"  Leave Policy: {action} {LEAVE_POLICY} (Paid 12 + Sick 6)")


# ── Bulk Assignment ───────────────────────────────────────────────

def _bulk_assign_employees(holiday_list):
    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "holiday_list", "leave_approver"],
    )
    assigned = 0
    allocated = 0
    for emp in employees:
        # Holiday list — set if blank
        if not emp.holiday_list:
            frappe.db.set_value("Employee", emp.name, "holiday_list", holiday_list)
        # Leave approver — set if blank
        if not emp.leave_approver and frappe.db.exists("User", DEFAULT_APPROVER):
            frappe.db.set_value("Employee", emp.name, "leave_approver", DEFAULT_APPROVER)
        # Skip if already assigned for this period
        already = frappe.db.exists(
            "Leave Policy Assignment",
            {"employee": emp.name, "leave_period": LEAVE_PERIOD, "docstatus": 1},
        )
        if already:
            continue
        try:
            assignment = frappe.new_doc("Leave Policy Assignment")
            assignment.employee = emp.name
            assignment.assignment_based_on = "Leave Period"
            assignment.leave_policy = LEAVE_POLICY
            assignment.leave_period = LEAVE_PERIOD
            assignment.effective_from = LEAVE_PERIOD_FROM
            assignment.effective_to = LEAVE_PERIOD_TO
            assignment.insert(ignore_permissions=True)
            assignment.submit()
            assigned += 1
            # Submit triggers Leave Allocation creation; count what landed
            allocs = frappe.get_all(
                "Leave Allocation",
                filters={"employee": emp.name, "leave_period": LEAVE_PERIOD, "docstatus": 1},
            )
            allocated += len(allocs)
        except Exception as e:
            print(f"  ! {emp.name} ({emp.employee_name}): {e}")
            frappe.db.rollback()
            continue
    return assigned, allocated


# ── Custom field: cancellation_reason ─────────────────────────────

def _ensure_cancellation_reason_field():
    create_custom_field("Leave Application", {
        "fieldname": "cancellation_reason",
        "label": "Cancellation Reason",
        "fieldtype": "Small Text",
        "insert_after": "description",
        "depends_on": "eval:doc.status==\"Cancelled\"",
        "description": "Required when cancelling an already-approved leave.",
    })
    print("  Custom Field: Leave Application.cancellation_reason ensured")


# ── HR CC on Leave-Application notifications ─────────────────────

def _ensure_hr_cc_on_notifications():
    """Add HR_EMAIL to the recipients (channel=Email, type=CC) of every
    Notification whose document_type is 'Leave Application'."""
    notifications = frappe.get_all(
        "Notification",
        filters={"document_type": "Leave Application", "enabled": 1},
        pluck="name",
    )
    for nname in notifications:
        ndoc = frappe.get_doc("Notification", nname)
        existing = [r for r in ndoc.recipients
                    if r.receiver_by_role == "" and r.cc == HR_EMAIL]
        if existing:
            continue
        ndoc.append("recipients", {"cc": HR_EMAIL})
        ndoc.save(ignore_permissions=True)
    print(f"  HR CC: ensured on {len(notifications)} Leave-Application notifications")
