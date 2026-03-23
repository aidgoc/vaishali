"""Expense budget cap enforcement.

Hooked into Expense Claim before_submit. Checks if the employee's
projected monthly spend exceeds their budget cap. If so, adds a comment
and sends a Telegram alert to their manager. Never blocks submission.
"""
import frappe
from frappe import _


def check_budget_cap(doc, method):
    """Soft-enforce budget caps on Expense Claim submission."""
    if not doc.employee:
        return

    vertical = frappe.db.get_value("Employee", doc.employee, "vertical")
    if not vertical:
        return

    fy = frappe.defaults.get_defaults().get("fiscal_year")
    if not fy:
        return

    budget = _get_budget(vertical, doc.employee, fy)
    if not budget:
        return

    # Sum submitted claims this month (exclude current doc)
    month_start, month_end = _get_month_range(doc.posting_date)
    existing = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0) as total
        FROM `tabExpense Claim`
        WHERE employee = %s
          AND posting_date BETWEEN %s AND %s
          AND docstatus = 1
          AND approval_status != 'Rejected'
          AND name != %s
    """, (doc.employee, month_start, month_end, doc.name or ""), as_dict=True)[0].total

    projected = existing + (doc.total_claimed_amount or 0)
    cap = budget.monthly_cap
    if not cap or cap <= 0:
        return

    pct = projected / cap * 100

    if pct >= budget.escalate_threshold:
        doc.add_comment("Comment",
            f"Budget cap exceeded: ₹{projected:,.0f} / ₹{cap:,.0f} ({pct:.0f}%)")
        _alert_manager(doc, projected, cap, pct)
    elif pct >= budget.alert_threshold:
        doc.add_comment("Comment",
            f"Approaching budget limit: ₹{projected:,.0f} / ₹{cap:,.0f} ({pct:.0f}%)")


def _get_budget(vertical, employee, fiscal_year):
    """Find matching budget: employee-specific first, then vertical fallback."""
    # Employee-specific
    budget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "employee": employee},
        ["monthly_cap", "alert_threshold", "escalate_threshold"],
        as_dict=True)
    if budget:
        return budget

    # Vertical fallback
    budget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "vertical": vertical, "employee": ["in", ["", None]]},
        ["monthly_cap", "alert_threshold", "escalate_threshold"],
        as_dict=True)
    return budget


def _get_month_range(posting_date):
    """Return first and last day of the month for a given date."""
    from datetime import date
    import calendar
    if isinstance(posting_date, str):
        parts = posting_date.split("-")
        y, m = int(parts[0]), int(parts[1])
    else:
        y, m = posting_date.year, posting_date.month
    last_day = calendar.monthrange(y, m)[1]
    return date(y, m, 1).isoformat(), date(y, m, last_day).isoformat()


def _alert_manager(doc, spent, cap, pct):
    """Send Telegram alert to employee's reporting manager."""
    from vaishali.notifications import _notify, _get_managers

    reports_to = frappe.db.get_value("Employee", doc.employee, "reports_to")
    if reports_to:
        msg = (f"⚠ Budget Alert: {doc.employee_name} has exceeded their "
               f"monthly expense cap.\n"
               f"Spent: ₹{spent:,.0f} / Cap: ₹{cap:,.0f} ({pct:.0f}%)\n"
               f"Claim: {doc.name} for ₹{doc.total_claimed_amount:,.0f}")
        _notify(reports_to, msg)
    else:
        # Fallback to default managers
        for mgr in _get_managers():
            msg = (f"⚠ Budget Alert: {doc.employee_name} has exceeded their "
                   f"monthly expense cap.\n"
                   f"Spent: ₹{spent:,.0f} / Cap: ₹{cap:,.0f} ({pct:.0f}%)")
            _notify(mgr, msg)
