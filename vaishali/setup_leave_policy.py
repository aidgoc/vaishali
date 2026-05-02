"""Per-company Leave Policy + Period + Types + bulk Assignment.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_leave_policy.run
    bench --site dgoc.logstop.com execute vaishali.setup_leave_policy.run --kwargs "{'company': 'Dynamic Crane Engineers Private Limited'}"

With no `company` kwarg, runs for every company in COMPANIES.

Builds the FY 2026-27 leave plumbing per company:
- Leave Types (global): Paid Leave (12/yr earned monthly), Sick Leave (6/yr earned
  monthly), Leave Without Pay.
- Leave Period: FY 2026-27 (1 Apr 2026 – 31 Mar 2027), per company.
- Leave Policy: "<COMPANY_ABBR> Standard" (Paid 12 + Sick 6).
- Leave Policy Assignment: bulk-assigned to every active Employee in the company.
- Holiday List: uses the company's default; assigns it to every Employee that
  doesn't have one.
- Default Leave Approver + Expense Approver: ai.dgoc@gmail.com (System Manager)
  — set per-Employee only when blank, never overwrites a human-set approver.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

LEAVE_PERIOD = "FY 2026-27"
LEAVE_PERIOD_FROM = "2026-04-01"
LEAVE_PERIOD_TO = "2027-03-31"

PAID_LEAVE = "Paid Leave"
SICK_LEAVE = "Sick Leave"
LWP = "Leave Without Pay"

DEFAULT_APPROVER = "ai.dgoc@gmail.com"
HR_EMAIL = "info@dgoc.in"

COMPANIES = {
    "Dynamic Servitech Private Limited": "DSPL Standard",
    "Dynamic Crane Engineers Private Limited": "DCEPL Standard",
}


def run(company=None):
    """Entry point — runs setup for one company, or all companies if None."""
    # Globals are idempotent; call once
    _ensure_leave_types()
    _ensure_cancellation_reason_field()
    _ensure_hr_cc_on_notifications()
    frappe.db.commit()

    if company is None:
        for c in COMPANIES:
            _run_for(c)
        return
    if company not in COMPANIES:
        frappe.throw(f"Unknown company: {company}. Add it to COMPANIES first.")
    _run_for(company)


def _run_for(company):
    policy_title = COMPANIES[company]
    print(f"\n=== Leave Policy Setup — {company} / {LEAVE_PERIOD} ===\n")
    holiday_list = _resolve_holiday_list(company)
    period_name = _ensure_leave_period(company)
    policy_name = _ensure_leave_policy(policy_title)
    frappe.db.commit()
    assigned, allocated = _bulk_assign_employees(company, holiday_list, policy_name, period_name)
    frappe.db.commit()
    print(f"\n✓ {company}: Policy {policy_name} / Period {period_name} → "
          f"{assigned} new assignments, {allocated} new allocations.\n")


# ── Holiday List ──────────────────────────────────────────────────

def _resolve_holiday_list(company):
    """Find the Holiday List linked to the company or covering the period."""
    company_default = frappe.db.get_value("Company", company, "default_holiday_list")
    if company_default and frappe.db.exists("Holiday List", company_default):
        print(f"  Holiday List: company default → {company_default}")
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
        print(f"  Holiday List: period-overlapping → {candidates[0]}")
        return candidates[0]
    raise frappe.ValidationError(
        f"No Holiday List found that covers {LEAVE_PERIOD} for {company}. "
        "Create one in HR > Holiday List, then re-run."
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

def _ensure_leave_period(company):
    """Resolve or create the FY 2026-27 Leave Period for the company."""
    existing = frappe.db.get_value("Leave Period", {
        "from_date": LEAVE_PERIOD_FROM,
        "to_date": LEAVE_PERIOD_TO,
        "company": company,
    }, "name")
    if existing:
        print(f"  Leave Period: reusing {existing} ({LEAVE_PERIOD_FROM} → {LEAVE_PERIOD_TO})")
        return existing
    doc = frappe.new_doc("Leave Period")
    doc.from_date = LEAVE_PERIOD_FROM
    doc.to_date = LEAVE_PERIOD_TO
    doc.company = company
    doc.is_active = 1
    doc.insert(ignore_permissions=True)
    print(f"  Leave Period: created {doc.name} ({LEAVE_PERIOD_FROM} → {LEAVE_PERIOD_TO})")
    return doc.name


# ── Leave Policy ──────────────────────────────────────────────────

def _ensure_leave_policy(policy_title):
    """Resolve or create the named Leave Policy (submitted); return its actual name."""
    submitted = frappe.db.get_value("Leave Policy",
        {"title": policy_title, "docstatus": 1}, "name")
    if submitted:
        print(f"  Leave Policy: reusing submitted {submitted} (title={policy_title})")
        return submitted
    doc = frappe.new_doc("Leave Policy")
    doc.title = policy_title
    doc.append("leave_policy_details", {"leave_type": PAID_LEAVE, "annual_allocation": 12})
    doc.append("leave_policy_details", {"leave_type": SICK_LEAVE, "annual_allocation": 6})
    doc.insert(ignore_permissions=True)
    doc.submit()
    print(f"  Leave Policy: created {doc.name} (title={policy_title}, Paid 12 + Sick 6)")
    return doc.name


# ── Bulk Assignment ───────────────────────────────────────────────

def _bulk_assign_employees(company, holiday_list, policy_name, period_name):
    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active", "company": company},
        fields=["name", "employee_name", "holiday_list",
                "leave_approver", "expense_approver"],
    )
    assigned = 0
    allocated = 0
    errors = []
    have_default_user = frappe.db.exists("User", DEFAULT_APPROVER)
    for emp in employees:
        # Holiday list — set if blank
        if not emp.holiday_list:
            frappe.db.set_value("Employee", emp.name, "holiday_list", holiday_list)
        # Approvers — set if blank, never overwrite
        if have_default_user:
            if not emp.leave_approver:
                frappe.db.set_value("Employee", emp.name, "leave_approver", DEFAULT_APPROVER)
            if not emp.expense_approver:
                frappe.db.set_value("Employee", emp.name, "expense_approver", DEFAULT_APPROVER)
        # Skip if already assigned for this period
        already = frappe.db.exists(
            "Leave Policy Assignment",
            {"employee": emp.name, "leave_period": period_name, "docstatus": 1},
        )
        if already:
            continue
        try:
            assignment = frappe.new_doc("Leave Policy Assignment")
            assignment.employee = emp.name
            assignment.assignment_based_on = "Leave Period"
            assignment.leave_policy = policy_name
            assignment.leave_period = period_name
            assignment.effective_from = LEAVE_PERIOD_FROM
            assignment.effective_to = LEAVE_PERIOD_TO
            assignment.insert(ignore_permissions=True)
            assignment.submit()
            assigned += 1
            allocs = frappe.get_all(
                "Leave Allocation",
                filters={"employee": emp.name, "leave_period": period_name, "docstatus": 1},
            )
            allocated += len(allocs)
            if assigned % 25 == 0:
                frappe.db.commit()
                print(f"  … {assigned} assignments committed")
        except Exception as e:
            errors.append((emp.name, emp.employee_name, str(e).split('\n')[0][:140]))
            continue
    if errors:
        print(f"\n  {len(errors)} assignments failed (sample):")
        for n, en, msg in errors[:5]:
            print(f"    ! {en} ({n}): {msg}")
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
