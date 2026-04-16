"""Telegram notification doc event handlers for DSPL ERP.

Each handler fires a POST to the internal FastAPI service at
http://127.0.0.1:8443/api/ai/notify.  All calls are fire-and-forget via
_notify(), which catches every exception so Frappe is never blocked.
"""
import frappe
import requests


NOTIFY_URL = "http://127.0.0.1:8443/api/ai/notify"
MANAGER_USERS = ["harsh@dgoc.in", "bng@dgoc.in"]


# ── Internal helpers ─────────────────────────────────────────────

def _notify(employee_id, message):
    """Fire-and-forget POST to FastAPI. Never raises."""
    try:
        requests.post(
            NOTIFY_URL,
            json={"employee_id": employee_id, "message": message},
            timeout=3,
        )
    except Exception:
        pass


def _get_managers():
    """Return employee IDs for the two default managers."""
    managers = []
    for user in MANAGER_USERS:
        emp_id = frappe.db.get_value("Employee", {"user_id": user}, "name")
        if emp_id:
            managers.append(emp_id)
    return managers


def _get_users_with_role(*roles):
    """Return employee IDs for all active users with any of the given roles."""
    emp_ids = []
    for role in roles:
        users = frappe.get_all("Has Role",
            filters={"role": role, "parenttype": "User"},
            pluck="parent")
        for user in users:
            if user in ("Administrator", "Guest"):
                continue
            emp_id = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
            if emp_id and emp_id not in emp_ids:
                emp_ids.append(emp_id)
    return emp_ids


def _get_leave_approvers(employee):
    """Return employee IDs of department-level leave approvers.

    Falls back to _get_managers() if no department approvers are found.
    """
    dept = frappe.db.get_value("Employee", employee, "department")
    approvers = []
    if dept:
        rows = frappe.db.sql(
            """
            SELECT DISTINCT e.name
            FROM `tabEmployee` e
            JOIN `tabDepartment Approver` da ON da.approver = e.user_id
            WHERE da.parent = %s
              AND da.parentfield = 'leave_approvers'
              AND e.status = 'Active'
            """,
            dept,
            as_dict=True,
        )
        approvers = [r["name"] for r in rows]
    return approvers if approvers else _get_managers()


# ── Leave Application ────────────────────────────────────────────

def on_leave_application_submit(doc, method):
    """Notify leave approvers when an application is submitted."""
    approvers = _get_leave_approvers(doc.employee)
    msg = (
        f"New leave request from {doc.employee_name}: "
        f"{doc.leave_type} {doc.from_date} – {doc.to_date} "
        f"({doc.total_leave_days} day(s)). Please review."
    )
    for emp_id in approvers:
        _notify(emp_id, msg)


def on_leave_application_update(doc, method):
    """Notify the applicant when their leave status changes."""
    if doc.status not in ("Approved", "Rejected"):
        return
    msg = (
        f"Your leave request ({doc.leave_type} {doc.from_date} – {doc.to_date}) "
        f"has been {doc.status.lower()}."
    )
    _notify(doc.employee, msg)


# ── Expense Claim ────────────────────────────────────────────────

def on_expense_claim_submit(doc, method):
    """Notify managers when an expense claim is submitted."""
    managers = _get_managers()
    msg = (
        f"New expense claim from {doc.employee_name}: "
        f"₹{doc.total_claimed_amount}. Please review."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_expense_claim_update(doc, method):
    """Notify the applicant when their expense claim approval_status changes."""
    if doc.approval_status not in ("Approved", "Rejected"):
        return
    msg = (
        f"Your expense claim of ₹{doc.total_claimed_amount} "
        f"has been {doc.approval_status.lower()}."
    )
    _notify(doc.employee, msg)


# ── Employee Advance ─────────────────────────────────────────────

def on_employee_advance_submit(doc, method):
    """Notify managers when an employee advance is submitted."""
    managers = _get_managers()
    msg = (
        f"New advance request from {doc.employee_name}: "
        f"₹{doc.advance_amount}. Please review."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_employee_advance_update(doc, method):
    """Notify the applicant when their advance status changes."""
    if doc.status not in ("Paid", "Claimed", "Cancelled"):
        return
    msg = (
        f"Your advance request of ₹{doc.advance_amount} "
        f"status is now: {doc.status}."
    )
    _notify(doc.employee, msg)


# ── Sales Cycle Notifications ────────────────────────────────

def on_sales_order_submit(doc, method):
    """Notify managers when a Sales Order is submitted."""
    managers = _get_managers()
    msg = (
        f"New Sales Order {doc.name} submitted: "
        f"{doc.customer_name} — ₹{doc.grand_total:,.0f}."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_sales_order_submit_production(doc, method):
    """Notify production team when a Sales Order is submitted. No financial data."""
    production_staff = _get_users_with_role("Manufacturing User", "Manufacturing Manager")
    if not production_staff:
        return

    items_list = []
    for item in doc.items:
        items_list.append(f"  • {item.item_name or item.item_code} — {item.qty} {item.uom}")
    items_text = "\n".join(items_list[:10])
    if len(doc.items) > 10:
        items_text += f"\n  ... and {len(doc.items) - 10} more items"

    msg = (
        f"New Sales Order {doc.name}\n"
        f"Customer: {doc.customer_name}\n"
        f"Delivery: {doc.delivery_date or 'Not set'}\n"
        f"Items:\n{items_text}"
    )
    for emp_id in production_staff:
        _notify(emp_id, msg)


def on_delivery_note_submit(doc, method):
    """Notify managers when a Delivery Note is submitted."""
    managers = _get_managers()
    msg = (
        f"Delivery Note {doc.name} submitted: "
        f"{doc.customer_name} — ₹{doc.grand_total:,.0f}."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_sales_invoice_submit(doc, method):
    """Notify managers when a Sales Invoice is submitted."""
    managers = _get_managers()
    msg = (
        f"Sales Invoice {doc.name} submitted: "
        f"{doc.customer_name} — ₹{doc.grand_total:,.0f}."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_payment_entry_submit(doc, method):
    """Notify managers when a Payment Entry is submitted."""
    if doc.payment_type != "Receive":
        return
    managers = _get_managers()
    msg = (
        f"Payment received: ₹{doc.paid_amount:,.0f} from "
        f"{doc.party_name} ({doc.name})."
    )
    for emp_id in managers:
        _notify(emp_id, msg)


# ── Scheduled: Quotation Expiry Alerts ──────────────────────


def check_expiring_quotations():
    """Run daily at 9 AM. Alert sales owners about quotations expiring within 3 days."""
    from frappe.utils import today, add_days

    today_date = today()
    threshold = add_days(today_date, 3)

    expiring = frappe.get_all(
        "Quotation",
        filters={
            "status": "Open",
            "docstatus": 1,
            "valid_till": ["between", [today_date, threshold]],
        },
        fields=["name", "party_name", "grand_total", "valid_till", "owner"],
        limit_page_length=50,
    )

    if not expiring:
        return

    # Group by owner for batched notifications
    by_owner = {}
    for q in expiring:
        by_owner.setdefault(q.owner, []).append(q)

    for owner, quotes in by_owner.items():
        emp_id = frappe.db.get_value("Employee", {"user_id": owner, "status": "Active"}, "name")
        if not emp_id:
            continue

        lines = []
        for q in quotes:
            from frappe.utils import date_diff
            days_left = date_diff(q.valid_till, today_date)
            urgency = "TODAY" if days_left == 0 else f"in {days_left}d"
            lines.append(f"  {q.name} — {q.party_name} — ₹{q.grand_total:,.0f} (expires {urgency})")

        msg = f"Quotation expiry alert ({len(quotes)}):\n" + "\n".join(lines)
        _notify(emp_id, msg)

    # Also notify managers with the full list
    managers = _get_managers()
    all_lines = []
    for q in expiring:
        from frappe.utils import date_diff
        days_left = date_diff(q.valid_till, today_date)
        urgency = "TODAY" if days_left == 0 else f"in {days_left}d"
        all_lines.append(f"  {q.name} — {q.party_name} — ₹{q.grand_total:,.0f} (expires {urgency})")

    msg = f"Quotation expiry alert ({len(expiring)}):\n" + "\n".join(all_lines)
    for emp_id in managers:
        _notify(emp_id, msg)


# ── Purchase Cycle Notifications ────────────────────────────


def on_material_request_submit(doc, method):
    """Notify managers when a Material Request is submitted."""
    managers = _get_managers()
    items_list = []
    for item in doc.items[:10]:
        items_list.append(f"  {item.item_name or item.item_code} x {item.qty} {item.uom}")
    items_text = "\n".join(items_list)
    if len(doc.items) > 10:
        items_text += f"\n  ... and {len(doc.items) - 10} more"

    msg = (
        f"Material Request {doc.name} submitted\n"
        f"Type: {doc.material_request_type}\n"
        f"Requested by: {doc.owner}\n"
        f"Items:\n{items_text}"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_purchase_order_submit(doc, method):
    """Notify managers when a Purchase Order is submitted."""
    managers = _get_managers()
    msg = (
        f"Purchase Order {doc.name} submitted\n"
        f"Supplier: {doc.supplier_name}\n"
        f"Amount: ₹{doc.grand_total:,.0f}\n"
        f"Expected delivery: {doc.schedule_date or 'Not set'}"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_purchase_receipt_submit(doc, method):
    """Notify managers when goods are received."""
    managers = _get_managers()
    items_list = []
    for item in doc.items[:8]:
        items_list.append(f"  {item.item_name or item.item_code} x {item.qty}")
    items_text = "\n".join(items_list)
    if len(doc.items) > 8:
        items_text += f"\n  ... and {len(doc.items) - 8} more"

    msg = (
        f"Goods received: {doc.name}\n"
        f"Supplier: {doc.supplier_name}\n"
        f"Items:\n{items_text}"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_purchase_invoice_submit(doc, method):
    """Notify accounts team when a Purchase Invoice is submitted."""
    accounts_staff = _get_users_with_role("Accounts Manager", "Accounts User")
    if not accounts_staff:
        accounts_staff = _get_managers()

    msg = (
        f"Purchase Invoice {doc.name} submitted\n"
        f"Supplier: {doc.supplier_name}\n"
        f"Amount: ₹{doc.grand_total:,.0f}\n"
        f"Due date: {doc.due_date or 'Not set'}"
    )
    for emp_id in accounts_staff:
        _notify(emp_id, msg)


def on_supplier_payment_submit(doc, method):
    """Notify managers when a supplier payment is made."""
    if doc.payment_type != "Pay":
        return
    managers = _get_managers()
    msg = (
        f"Supplier payment: ₹{doc.paid_amount:,.0f} to "
        f"{doc.party_name} ({doc.name})"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


# ── Scheduled: Purchase Alerts ──────────────────────────────


def check_overdue_purchase_orders():
    """Run daily at 9 AM. Alert managers about POs past expected delivery date."""
    from frappe.utils import today, date_diff

    today_date = today()

    overdue = frappe.get_all(
        "Purchase Order",
        filters={
            "docstatus": 1,
            "status": ["in", ["To Receive and Bill", "To Receive"]],
            "schedule_date": ["<", today_date],
        },
        fields=["name", "supplier_name", "grand_total", "schedule_date"],
        limit_page_length=50,
    )

    if not overdue:
        return

    managers = _get_managers()
    lines = []
    for po in overdue:
        days = date_diff(today_date, po.schedule_date)
        lines.append(
            f"  {po.name} - {po.supplier_name} - "
            f"₹{po.grand_total:,.0f} ({days}d overdue)"
        )

    msg = f"Overdue Purchase Orders ({len(overdue)}):\n" + "\n".join(lines)
    for emp_id in managers:
        _notify(emp_id, msg)


def check_pending_purchase_invoices():
    """Run daily at 9 AM. Alert accounts about unpaid Purchase Invoices past due."""
    from frappe.utils import today, date_diff

    today_date = today()

    overdue = frappe.get_all(
        "Purchase Invoice",
        filters={
            "docstatus": 1,
            "outstanding_amount": [">", 0],
            "due_date": ["<", today_date],
        },
        fields=["name", "supplier_name", "outstanding_amount", "due_date"],
        limit_page_length=50,
    )

    if not overdue:
        return

    accounts_staff = _get_users_with_role("Accounts Manager", "Accounts User")
    if not accounts_staff:
        accounts_staff = _get_managers()

    lines = []
    total = 0
    for pi in overdue:
        days = date_diff(today_date, pi.due_date)
        total += pi.outstanding_amount
        lines.append(
            f"  {pi.name} - {pi.supplier_name} - "
            f"₹{pi.outstanding_amount:,.0f} ({days}d overdue)"
        )

    msg = (
        f"Overdue Supplier Payments ({len(overdue)}) - "
        f"Total: ₹{total:,.0f}:\n" + "\n".join(lines)
    )
    for emp_id in accounts_staff:
        _notify(emp_id, msg)
