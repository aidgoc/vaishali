"""Operator payroll — derive Additional Salary entries from billed
Operator Logsheets.

Revenue side: monthly Sales Invoices per (customer × equipment × month),
emitted by the rental-billing job.

Cost side (this module): for each operator who filed approved + billed
Operator Logsheets in the period, sum total_hours × Employee.operator_pay_rate
and create one Additional Salary doc against the "Operator Logsheet Pay"
Salary Component. Payroll Entry then picks them up automatically.

Whitelist endpoints
-------------------
- compute_operator_pay(employee, period_from, period_to)
    Read-only. Returns {employee, employee_name, total_hours,
    rate_per_hour, amount, logsheet_count, logsheet_names: [...]}.
- compute_operator_pay_for_all(period_from, period_to)
    Read-only. Same payload for every DCEPL/Operations - DCEPL active
    operator with at least one billed logsheet in the window.
- create_additional_salaries(period_from, period_to, payroll_date=None)
    POST-only. Submits one Additional Salary per operator. Idempotent —
    skips operators that already have an Additional Salary submitted
    against this component for the same payroll_date.

Permission gate: HR Manager / Accounts Manager / Payroll Manager /
System Manager only. Mirrors the role-check pattern used elsewhere in
vaishali/api/.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta

import frappe
from frappe import _
from frappe.utils import flt, getdate


SALARY_COMPONENT = "Operator Logsheet Pay"
OPERATOR_DEPARTMENT = "Operations - DCEPL"
OPERATOR_COMPANY = "Dynamic Crane Engineers Private Limited"

ALLOWED_ROLES = {
    "HR Manager",
    "Accounts Manager",
    "Payroll Manager",
    "System Manager",
    "Administrator",
}


# ── Authorization ─────────────────────────────────────────────────

def _check_payroll_role(user: str | None = None) -> None:
    """Raise PermissionError unless the caller has a payroll-admin role.
    Mirrors the role-check pattern from vaishali/api/field._get_nav_tier."""
    if not user:
        user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if not (roles & ALLOWED_ROLES):
        frappe.throw(
            _("You do not have permission to run operator payroll. "
              "Contact HR / Accounts."),
            frappe.PermissionError,
        )


# ── Period helpers ────────────────────────────────────────────────

def _parse_period(period_from, period_to):
    pf = getdate(period_from)
    pt = getdate(period_to)
    if pt < pf:
        frappe.throw(_("period_to must be on or after period_from"))
    return pf, pt


def _default_payroll_date(period_from: date) -> date:
    """Last calendar day of the month containing period_from."""
    last_day = calendar.monthrange(period_from.year, period_from.month)[1]
    return date(period_from.year, period_from.month, last_day)


# ── Core computation ──────────────────────────────────────────────

def _compute_for(emp_name: str, period_from: date, period_to: date) -> dict:
    """Return {employee, employee_name, period_from, period_to, total_hours,
    rate_per_hour, amount, logsheet_count, logsheet_names}. No DB writes.
    Caller is responsible for the role gate."""
    emp = frappe.db.get_value(
        "Employee", emp_name,
        ["name", "employee_name", "operator_pay_rate", "department",
         "company", "status"],
        as_dict=True,
    )
    if not emp:
        frappe.throw(_("Employee {0} not found").format(emp_name))

    rate = flt(emp.operator_pay_rate or 0)

    logs = frappe.get_all(
        "Operator Logsheet",
        filters={
            "operator": emp_name,
            "docstatus": 1,
            "status": "Billed",
            "log_date": ["between", [period_from, period_to]],
        },
        fields=["name", "total_hours", "log_date"],
        order_by="log_date asc",
        limit_page_length=0,
    )
    total_hours = sum(flt(r.total_hours or 0) for r in logs)
    amount = flt(total_hours * rate, 2)

    return {
        "employee": emp.name,
        "employee_name": emp.employee_name,
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "total_hours": flt(total_hours, 2),
        "rate_per_hour": rate,
        "amount": amount,
        "logsheet_count": len(logs),
        "logsheet_names": [r.name for r in logs],
    }


# ── Whitelist: compute (single) ───────────────────────────────────

@frappe.whitelist()
def compute_operator_pay(employee, period_from, period_to):
    """Read-only — return the operator's pay calculation for the period.
    No documents are written."""
    _check_payroll_role()
    pf, pt = _parse_period(period_from, period_to)
    return _compute_for(employee, pf, pt)


# ── Whitelist: compute (all operators) ────────────────────────────

@frappe.whitelist()
def compute_operator_pay_for_all(period_from, period_to):
    """Read-only — return pay calculations for every active DCEPL
    operator who has at least one billed logsheet in the window.
    Order: highest amount first."""
    _check_payroll_role()
    pf, pt = _parse_period(period_from, period_to)

    # Limit candidate pool to operators with at least one billed
    # logsheet in the window — avoids iterating the full department.
    operator_names = frappe.get_all(
        "Operator Logsheet",
        filters={
            "docstatus": 1,
            "status": "Billed",
            "log_date": ["between", [pf, pt]],
        },
        fields=["operator"],
        group_by="operator",
        limit_page_length=0,
    )
    candidates = {row.operator for row in operator_names if row.operator}

    # Restrict to active DCEPL/Operations operators (defensive — a
    # logsheet from another company shouldn't get a DCEPL salary line).
    active = set(frappe.get_all(
        "Employee",
        filters={
            "name": ["in", list(candidates)] if candidates else ["=", ""],
            "company": OPERATOR_COMPANY,
            "department": OPERATOR_DEPARTMENT,
            "status": "Active",
        },
        pluck="name",
        limit_page_length=0,
    ))

    results = [_compute_for(n, pf, pt) for n in sorted(active)]
    results = [r for r in results if r["logsheet_count"] > 0]
    results.sort(key=lambda r: r["amount"], reverse=True)
    return results


# ── Whitelist: create Additional Salary docs ──────────────────────

@frappe.whitelist(methods=["POST"])
def create_additional_salaries(period_from, period_to, payroll_date=None):
    """For every operator in the period, submit one Additional Salary
    against SALARY_COMPONENT for their computed amount. Idempotent —
    operators that already have a submitted Additional Salary for this
    component on `payroll_date` are skipped.

    Returns {created: [...], skipped: [...], errors: [...]}."""
    _check_payroll_role()
    pf, pt = _parse_period(period_from, period_to)
    pay_date = getdate(payroll_date) if payroll_date else _default_payroll_date(pf)

    rows = compute_operator_pay_for_all(pf.isoformat(), pt.isoformat())

    created, skipped, errors = [], [], []

    for row in rows:
        if row["amount"] <= 0:
            skipped.append({
                "employee": row["employee"],
                "reason": ("Zero amount (rate=0 or no hours)"
                           if row["rate_per_hour"] == 0
                           else "Zero hours"),
            })
            continue

        existing = frappe.db.exists("Additional Salary", {
            "employee": row["employee"],
            "salary_component": SALARY_COMPONENT,
            "payroll_date": pay_date,
            "docstatus": 1,
        })
        if existing:
            skipped.append({
                "employee": row["employee"],
                "reason": f"already submitted ({existing})",
            })
            continue

        try:
            doc = frappe.new_doc("Additional Salary")
            doc.employee = row["employee"]
            doc.salary_component = SALARY_COMPONENT
            doc.amount = row["amount"]
            doc.payroll_date = pay_date
            doc.company = OPERATOR_COMPANY
            doc.overwrite_salary_structure_amount = 0
            doc.ref_doctype = "Operator Logsheet"
            doc.ref_docname = (row["logsheet_names"][0]
                               if row["logsheet_names"] else None)
            doc.notes = (
                f"Operator pay for {pf.isoformat()} → {pt.isoformat()}: "
                f"{row['total_hours']}h × ₹{row['rate_per_hour']}/h "
                f"across {row['logsheet_count']} billed logsheets."
            )
            doc.insert(ignore_permissions=True)
            doc.submit()
            # Commit per operator — without this, an exception on the Nth
            # operator would roll back every Additional Salary created
            # earlier in the loop (caller sees `created` populated but the
            # writes never landed).
            frappe.db.commit()
            created.append({
                "employee": row["employee"],
                "additional_salary": doc.name,
                "amount": row["amount"],
                "hours": row["total_hours"],
                "logsheet_count": row["logsheet_count"],
            })
        except Exception:
            # Roll back this operator's failed insert, log, continue with
            # the rest of the batch. Earlier successful operators stay
            # committed thanks to the per-iteration commit above.
            frappe.db.rollback()
            frappe.log_error(
                title=f"Operator pay: Additional Salary failed for {row['employee']}",
                message=frappe.get_traceback(),
            )
            errors.append({
                "employee": row["employee"],
                "error": str(frappe.get_traceback(with_context=False))[:500],
            })
            continue
    return {
        "period_from": pf.isoformat(),
        "period_to": pt.isoformat(),
        "payroll_date": pay_date.isoformat(),
        "salary_component": SALARY_COMPONENT,
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }


def run_monthly_payroll_cron():
    """Scheduler entry point — runs on the 1st of every month for the
    previous calendar month. Bypasses the role gate by setting Administrator
    as the calling user. Wraps `create_additional_salaries`."""
    from frappe.utils import get_first_day, get_last_day, add_months, today

    last_month_anchor = add_months(today(), -1)
    period_from = str(get_first_day(last_month_anchor))
    period_to = str(get_last_day(last_month_anchor))

    original_user = frappe.session.user
    try:
        frappe.set_user("Administrator")
        return create_additional_salaries(
            period_from=period_from,
            period_to=period_to,
        )
    finally:
        frappe.set_user(original_user)
