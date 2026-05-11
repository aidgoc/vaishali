"""Director-only Telegram alerts for high-value events.

Subscribers: every Employee whose user_id is one of the three directors
(harsh@dgoc.in, njg@dgoc.in, bng@dgoc.in). We resolve subscribers lazily
on each event so adding/removing a director from the DSPL Director role
takes effect immediately.

Thresholds are in module-level constants and intentionally not made
configurable — directors will calibrate them after a week of use.
"""

import frappe
from frappe.utils import flt

from .notifications import _notify

# Tuning constants
ADVANCE_ALERT_THRESHOLD = 25000       # ₹ — advance request worth notifying
SO_ALERT_THRESHOLD = 500000            # ₹ — sales order worth notifying
INVOICE_OVERDUE_ALERT_DAYS = 90        # days past due before a single notification
INVOICE_OVERDUE_MIN_AMOUNT = 50000     # ₹ — ignore tiny overdues so signal stays high


def _director_employee_ids():
    """Return the Employee IDs for the three directors that have an
    Employee record AND a telegram_chat_id (else nothing to send to)."""
    rows = frappe.db.sql("""
        SELECT name FROM `tabEmployee`
        WHERE user_id IN ('harsh@dgoc.in', 'njg@dgoc.in', 'bng@dgoc.in')
          AND status = 'Active'
          AND IFNULL(telegram_chat_id, '') != ''
    """, as_dict=True) or []
    return [r["name"] for r in rows]


def _broadcast(message):
    for emp_id in _director_employee_ids():
        _notify(emp_id, message)


def _money(n):
    n = flt(n)
    if n >= 1e7:
        return f"₹{n/1e7:.2f} Cr"
    if n >= 1e5:
        return f"₹{n/1e5:.2f} L"
    return f"₹{n:,.0f}"


# ── Event handlers ──────────────────────────────────────────────────

def on_advance_create(doc, method=None):
    """Fires on Employee Advance after_insert. Notify directors when the
    requested amount crosses the threshold so they know to expect an
    approval request."""
    if doc.doctype != "Employee Advance":
        return
    if flt(doc.advance_amount) < ADVANCE_ALERT_THRESHOLD:
        return
    requester = doc.employee_name or doc.employee
    purpose = (doc.purpose or "")[:80]
    msg = (
        f"💸 *Advance request*: {requester} — {_money(doc.advance_amount)}\n"
        f"_{purpose or 'No purpose stated'}_\n"
        f"Approve in PWA → /field/#/approvals"
    )
    _broadcast(msg)


def on_sales_order_submit(doc, method=None):
    """Fires on Sales Order on_submit. Notify directors for large orders."""
    if doc.doctype != "Sales Order":
        return
    if flt(doc.grand_total) < SO_ALERT_THRESHOLD:
        return
    customer = doc.customer_name or doc.customer or "—"
    msg = (
        f"📦 *Sales Order submitted*: {customer}\n"
        f"{doc.name} — {_money(doc.grand_total)}\n"
        f"Delivery: {doc.delivery_date or 'TBC'}"
    )
    _broadcast(msg)


def on_issue_create(doc, method=None):
    """Customer complaint logged — directors should know fast."""
    if doc.doctype != "Issue":
        return
    customer = doc.customer or "—"
    subject = (doc.subject or "No subject")[:120]
    msg = (
        f"⚠️ *Complaint logged*: {customer}\n"
        f"{doc.name}: _{subject}_\n"
        f"Open in desk → /app/issue/{doc.name}"
    )
    _broadcast(msg)


# ── Daily sweep for chronically-overdue invoices ────────────────────

def daily_overdue_sweep():
    """Fires once per day (scheduler). Lists overdue invoices that have
    crossed INVOICE_OVERDUE_ALERT_DAYS and are above the min amount, but
    only flag ones we haven't flagged before to avoid spam."""
    from frappe.utils import nowdate
    rows = frappe.db.sql("""
        SELECT name, customer, customer_name, outstanding_amount,
               DATEDIFF(%s, due_date) AS days_overdue
        FROM `tabSales Invoice`
        WHERE docstatus = 1
          AND outstanding_amount >= %s
          AND DATEDIFF(%s, due_date) >= %s
        ORDER BY outstanding_amount DESC
        LIMIT 5
    """, (nowdate(), INVOICE_OVERDUE_MIN_AMOUNT, nowdate(),
          INVOICE_OVERDUE_ALERT_DAYS), as_dict=True) or []
    if not rows:
        return
    lines = ["🔔 *Top overdue invoices (>90 days)*"]
    for r in rows:
        cust = r["customer_name"] or r["customer"]
        lines.append(f"• {cust}: {_money(r['outstanding_amount'])} "
                     f"({int(r['days_overdue'])}d) — {r['name']}")
    _broadcast("\n".join(lines))
