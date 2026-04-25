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


# ── Email Draft Helpers ───────────────────────────────────────────

def _get_customer_email(customer_name):
    """Get primary email for a customer (Customer record first, then linked Contact)."""
    email = frappe.db.get_value("Customer", customer_name, "email_id")
    if not email:
        contact_name = frappe.db.get_value(
            "Dynamic Link",
            {"link_doctype": "Customer", "link_name": customer_name, "parenttype": "Contact"},
            "parent",
        )
        if contact_name:
            email = frappe.db.get_value("Contact", contact_name, "email_id")
    return (email or "").strip()


def _get_supplier_email(supplier_name):
    """Get primary email for a supplier."""
    email = frappe.db.get_value("Supplier", supplier_name, "email_id")
    if not email:
        contact_name = frappe.db.get_value(
            "Dynamic Link",
            {"link_doctype": "Supplier", "link_name": supplier_name, "parenttype": "Contact"},
            "parent",
        )
        if contact_name:
            email = frappe.db.get_value("Contact", contact_name, "email_id")
    return (email or "").strip()


def _create_email_draft(reference_doctype, reference_name, recipients, subject, body, sender="sales@dgoc.in"):
    """Create a draft Communication record in the Email Outbox.

    If recipients is empty, draft is still created with a blank To field so the
    reviewer can fill it in before sending.
    """
    try:
        comm = frappe.new_doc("Communication")
        comm.communication_type = "Communication"
        comm.communication_medium = "Email"
        comm.sent_or_received = "Sent"
        comm.subject = subject
        comm.content = body
        comm.reference_doctype = reference_doctype
        comm.reference_name = reference_name
        comm.recipients = recipients
        comm.sender = sender
        comm.vaishali_email_status = "Draft"
        comm.insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception:
        frappe.log_error(frappe.get_traceback(), f"Email draft creation failed: {reference_doctype} {reference_name}")


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


# ── Manufacturing Notifications ─────────────────────────────


def on_work_order_submit(doc, method):
    """Notify production team when a Work Order is submitted."""
    production_staff = _get_users_with_role("Manufacturing User", "Manufacturing Manager")
    if not production_staff:
        production_staff = _get_managers()

    msg = (
        f"Work Order {doc.name} submitted\n"
        f"Item: {doc.item_name or doc.production_item}\n"
        f"Qty: {doc.qty} {doc.stock_uom}\n"
        f"BOM: {doc.bom_no}\n"
        f"Start: {doc.planned_start_date or 'Not set'}"
    )
    for emp_id in production_staff:
        _notify(emp_id, msg)


def on_work_order_complete(doc, method):
    """Notify managers when a Work Order is completed (all qty manufactured)."""
    if doc.status != "Completed":
        return
    managers = _get_managers()
    msg = (
        f"Work Order {doc.name} completed\n"
        f"Item: {doc.item_name or doc.production_item}\n"
        f"Qty produced: {doc.produced_qty} / {doc.qty}"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_stock_entry_submit(doc, method):
    """Notify production team on Manufacture stock entries."""
    if doc.stock_entry_type != "Manufacture":
        return
    production_staff = _get_users_with_role("Manufacturing User", "Manufacturing Manager")
    if not production_staff:
        production_staff = _get_managers()

    items_list = []
    for item in doc.items[:8]:
        if item.is_finished_item:
            items_list.append(f"  [FG] {item.item_name or item.item_code} x {item.qty}")
    items_text = "\n".join(items_list) if items_list else "  (see Stock Entry for details)"

    msg = (
        f"Manufacturing entry {doc.name}\n"
        f"Work Order: {doc.work_order or 'N/A'}\n"
        f"Finished goods:\n{items_text}"
    )
    for emp_id in production_staff:
        _notify(emp_id, msg)


def on_production_plan_submit(doc, method):
    """Notify production team when a Production Plan is submitted."""
    production_staff = _get_users_with_role("Manufacturing User", "Manufacturing Manager")
    if not production_staff:
        production_staff = _get_managers()

    items_count = len(doc.po_items) if hasattr(doc, 'po_items') else 0
    msg = (
        f"Production Plan {doc.name} submitted\n"
        f"Posting date: {doc.posting_date}\n"
        f"Items to manufacture: {items_count}\n"
        f"Get items from: {doc.get_items_from or 'Manual'}"
    )
    for emp_id in production_staff:
        _notify(emp_id, msg)


# ── Scheduled: Manufacturing Alerts ─────────────────────────


def check_overdue_work_orders():
    """Run daily at 9 AM. Alert production about Work Orders past planned start date."""
    from frappe.utils import today, date_diff

    today_date = today()

    overdue = frappe.get_all(
        "Work Order",
        filters={
            "docstatus": 1,
            "status": ["in", ["Not Started", "In Process"]],
            "planned_start_date": ["<", today_date],
        },
        fields=["name", "production_item", "item_name", "qty",
                "produced_qty", "planned_start_date", "status"],
        limit_page_length=50,
    )

    if not overdue:
        return

    production_staff = _get_users_with_role("Manufacturing Manager")
    if not production_staff:
        production_staff = _get_managers()

    lines = []
    for wo in overdue:
        days = date_diff(today_date, wo.planned_start_date)
        progress = f"{wo.produced_qty}/{wo.qty}" if wo.produced_qty else "not started"
        lines.append(
            f"  {wo.name} - {wo.item_name or wo.production_item} "
            f"({progress}) - {days}d overdue"
        )

    msg = f"Overdue Work Orders ({len(overdue)}):\n" + "\n".join(lines)
    for emp_id in production_staff:
        _notify(emp_id, msg)


# ── Inventory & Quality Notifications ───────────────────────


def on_stock_entry_general(doc, method):
    """Notify on non-Manufacture stock entries (Material Receipt, Issue, Transfer)."""
    if doc.stock_entry_type == "Manufacture":
        return  # handled by on_stock_entry_submit
    if doc.stock_entry_type not in ("Material Receipt", "Material Issue", "Material Transfer"):
        return

    managers = _get_managers()
    items_list = []
    for item in doc.items[:8]:
        items_list.append(f"  {item.item_name or item.item_code} x {item.qty} ({item.uom})")
    items_text = "\n".join(items_list)
    if len(doc.items) > 8:
        items_text += f"\n  ... and {len(doc.items) - 8} more"

    msg = (
        f"Stock Entry {doc.name} ({doc.stock_entry_type})\n"
        f"Items:\n{items_text}"
    )
    for emp_id in managers:
        _notify(emp_id, msg)


def on_quality_inspection_submit(doc, method):
    """Notify production + managers on Quality Inspection results."""
    production_staff = _get_users_with_role("Manufacturing Manager", "Quality Manager")
    if not production_staff:
        production_staff = _get_managers()

    status_emoji = "PASS" if doc.status == "Accepted" else "FAIL"
    msg = (
        f"Quality Inspection {doc.name} — {status_emoji}\n"
        f"Item: {doc.item_name or doc.item_code}\n"
        f"Type: {doc.inspection_type}\n"
        f"Status: {doc.status}\n"
        f"Reference: {doc.reference_type} {doc.reference_name}"
    )
    if doc.status == "Rejected" and doc.remarks:
        msg += f"\nRemarks: {doc.remarks[:200]}"

    for emp_id in production_staff:
        _notify(emp_id, msg)

    # Also notify managers on rejection
    if doc.status == "Rejected":
        managers = _get_managers()
        for emp_id in managers:
            if emp_id not in production_staff:
                _notify(emp_id, msg)


# ── Finance Notifications ───────────────────────────────────


def on_journal_entry_submit(doc, method):
    """Notify accounts team when a Journal Entry is submitted."""
    accounts_staff = _get_users_with_role("Accounts Manager")
    if not accounts_staff:
        accounts_staff = _get_managers()

    msg = (
        f"Journal Entry {doc.name} submitted\n"
        f"Entry type: {doc.voucher_type}\n"
        f"Total debit: ₹{doc.total_debit:,.0f}\n"
        f"Remark: {(doc.remark or '')[:200]}"
    )
    for emp_id in accounts_staff:
        _notify(emp_id, msg)


# ── Scheduled: Finance Alerts ───────────────────────────────


def check_overdue_sales_invoices():
    """Run daily at 9 AM. Alert sales owners about overdue Sales Invoices (7+ days past due)."""
    from frappe.utils import today, date_diff, add_days

    today_date = today()
    threshold = add_days(today_date, -7)

    overdue = frappe.get_all(
        "Purchase Invoice" if False else "Sales Invoice",
        filters={
            "docstatus": 1,
            "outstanding_amount": [">", 0],
            "due_date": ["<", threshold],
        },
        fields=["name", "customer_name", "outstanding_amount", "due_date", "owner"],
        order_by="due_date asc",
        limit_page_length=50,
    )

    if not overdue:
        return

    # Notify sales owners (grouped)
    by_owner = {}
    for si in overdue:
        by_owner.setdefault(si.owner, []).append(si)

    for owner, invoices in by_owner.items():
        emp_id = frappe.db.get_value("Employee", {"user_id": owner, "status": "Active"}, "name")
        if not emp_id:
            continue
        lines = []
        for si in invoices:
            days = date_diff(today_date, si.due_date)
            lines.append(f"  {si.name} - {si.customer_name} - ₹{si.outstanding_amount:,.0f} ({days}d overdue)")
        msg = f"Overdue invoices ({len(invoices)}):\n" + "\n".join(lines)
        _notify(emp_id, msg)

    # Summary to accounts/managers
    accounts_staff = _get_users_with_role("Accounts Manager", "Accounts User")
    if not accounts_staff:
        accounts_staff = _get_managers()

    total = sum(si.outstanding_amount for si in overdue)
    all_lines = []
    for si in overdue[:20]:
        days = date_diff(today_date, si.due_date)
        all_lines.append(f"  {si.name} - {si.customer_name} - ₹{si.outstanding_amount:,.0f} ({days}d)")
    if len(overdue) > 20:
        all_lines.append(f"  ... and {len(overdue) - 20} more")

    msg = (
        f"Overdue Sales Invoices ({len(overdue)}) - "
        f"Total: ₹{total:,.0f}:\n" + "\n".join(all_lines)
    )
    for emp_id in accounts_staff:
        _notify(emp_id, msg)


def check_draft_documents_reminder():
    """Run weekly (Monday 9 AM). Remind about draft SIs and PEs that need action."""
    draft_si = frappe.db.count("Sales Invoice", {"docstatus": 0})
    draft_pe = frappe.db.count("Payment Entry", {"docstatus": 0})

    if draft_si == 0 and draft_pe == 0:
        return

    managers = _get_managers()
    lines = []
    if draft_si:
        lines.append(f"  Draft Sales Invoices: {draft_si}")
    if draft_pe:
        lines.append(f"  Draft Payment Entries: {draft_pe}")

    msg = (
        "Weekly finance cleanup reminder:\n" +
        "\n".join(lines) +
        "\n\nDraft documents don't create GL entries. "
        "Submit or delete to keep your books accurate."
    )
    for emp_id in managers:
        _notify(emp_id, msg)
