# Email Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Google Workspace email (sales@, accounts@, service@dgoc.in) into the Vaishali ERP — outbound document-triggered drafts with human review gate, inbound threading, and AI-composed sending via Vaishali agent.

**Architecture:** Frappe's built-in `Communication` DocType is extended with a `vaishali_email_status` custom field to hold drafts. Each document event (Quotation submit, SO, SI, PO, Warranty Claim update, overdue SI reminder) creates a draft Communication instead of sending immediately. A desk form in ERPNext shows Send/Discard buttons. The Vaishali agent's existing `send_email` tool stub is implemented to send directly (manager/admin) or create a draft (user role).

**Tech Stack:** Frappe v15, ERPNext, Python 3, frappe.sendmail(), Google Workspace SMTP/IMAP (App Password), vanilla JS desk Client Script.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vaishali/fixtures/custom_field.json` | Modify | Add `vaishali_email_status` Select field on Communication |
| `vaishali/api/email_outbox.py` | Create | Whitelisted APIs: `send_draft`, `discard_draft`, `list_drafts` |
| `vaishali/notifications.py` | Modify | `_create_email_draft()` helper + `_get_customer_email()` + `_get_supplier_email()` + 6 event handlers |
| `vaishali/hooks.py` | Modify | Register `on_quotation_submit`, `on_warranty_claim_status_update`, `on_communication_receive`, add `communication.js` to `doctype_js` |
| `vaishali/public/js/communication.js` | Create | Send/Discard buttons on Communication form when status = Draft |
| `vaishali/agent/executor.py` | Modify | Implement `_execute_send_email()`, register in `TOOL_HANDLERS` |

---

## Task 1: Custom Field — `vaishali_email_status` on Communication

**Files:**
- Modify: `vaishali/fixtures/custom_field.json`

- [ ] **Step 1: Add custom field entry to fixtures JSON**

Open `vaishali/fixtures/custom_field.json`. Append this entry to the JSON array (before the closing `]`):

```json
{
  "doctype": "Custom Field",
  "name": "Communication-vaishali_email_status",
  "dt": "Communication",
  "fieldname": "vaishali_email_status",
  "fieldtype": "Select",
  "label": "Email Status",
  "options": "\nDraft\nSent\nDiscarded",
  "insert_after": "email_status",
  "in_list_view": 1,
  "in_standard_filter": 1,
  "search_index": 1,
  "module": "Vaishali"
}
```

- [ ] **Step 2: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('vaishali/fixtures/custom_field.json')); print('JSON valid')"
```

Expected: `JSON valid`

- [ ] **Step 3: Commit**

```bash
git add vaishali/fixtures/custom_field.json
git commit -m "feat(email): add vaishali_email_status custom field on Communication"
```

- [ ] **Step 4: Deploy and migrate on EC2**

```bash
# Run deploy command from conventions.md, then:
ssh ubuntu@35.154.17.172 -i /tmp/dspl-temp-key \
  "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com migrate'"
```

Expected: Migration runs without error. Verify in ERPNext desk: open any Communication record — "Email Status" field should appear.

---

## Task 2: Email Outbox API

**Files:**
- Create: `vaishali/api/email_outbox.py`

- [ ] **Step 1: Create the file**

Create `vaishali/api/email_outbox.py`:

```python
"""Email Outbox API — send, discard, and list draft Communication records."""
import frappe


@frappe.whitelist()
def list_drafts():
    """Return all draft email Communications pending review."""
    return frappe.get_all(
        "Communication",
        filters={"vaishali_email_status": "Draft"},
        fields=[
            "name", "recipients", "subject", "content",
            "reference_doctype", "reference_name",
            "sender", "creation",
        ],
        order_by="creation asc",
        limit_page_length=100,
    )


@frappe.whitelist()
def send_draft(name):
    """Send a draft email and mark it Sent."""
    comm = frappe.get_doc("Communication", name)

    if comm.vaishali_email_status != "Draft":
        frappe.throw(f"Cannot send: email is already {comm.vaishali_email_status}.")

    recipients = [r.strip() for r in (comm.recipients or "").split(",") if r.strip()]
    if not recipients:
        frappe.throw("No recipient email address on this draft. Add one before sending.")

    # Attach PDF if the referenced document has a print format
    attachments = []
    if comm.reference_doctype and comm.reference_name:
        try:
            pdf_content = frappe.get_print(
                comm.reference_doctype,
                comm.reference_name,
                as_pdf=True,
            )
            attachments = [{"fname": f"{comm.reference_name}.pdf", "fcontent": pdf_content}]
        except Exception:
            pass  # no print format configured — send without attachment

    frappe.sendmail(
        recipients=recipients,
        sender=comm.sender or frappe.db.get_single_value("Email Account", "email_id"),
        subject=comm.subject,
        message=comm.content,
        attachments=attachments,
        reference_doctype=comm.reference_doctype or None,
        reference_name=comm.reference_name or None,
    )

    comm.vaishali_email_status = "Sent"
    comm.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "message": f"Email sent to {comm.recipients}"}


@frappe.whitelist()
def discard_draft(name):
    """Mark a draft email as Discarded."""
    comm = frappe.get_doc("Communication", name)

    if comm.vaishali_email_status != "Draft":
        frappe.throw(f"Cannot discard: email is already {comm.vaishali_email_status}.")

    comm.vaishali_email_status = "Discarded"
    comm.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}
```

- [ ] **Step 2: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/api/email_outbox.py').read()); print('Syntax OK')"
```

Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add vaishali/api/email_outbox.py
git commit -m "feat(email): email outbox API — send_draft, discard_draft, list_drafts"
```

---

## Task 3: Email Draft Helper + Email Lookup Helpers in notifications.py

**Files:**
- Modify: `vaishali/notifications.py` (add after the imports at the top, before the first function)

- [ ] **Step 1: Add helpers to notifications.py**

Open `vaishali/notifications.py`. After the existing imports and before the first `def`, add:

```python
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
```

- [ ] **Step 2: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/notifications.py').read()); print('Syntax OK')"
```

Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
git add vaishali/notifications.py
git commit -m "feat(email): add _create_email_draft, _get_customer_email, _get_supplier_email helpers"
```

---

## Task 4: Document Event Handlers — Quotation, SO, SI, PO

**Files:**
- Modify: `vaishali/notifications.py` (add 4 new functions at the bottom)
- Modify: `vaishali/hooks.py` (register `on_quotation_submit`, extend SO and SI handlers)

- [ ] **Step 1: Add `on_quotation_submit` to notifications.py**

Append to end of `vaishali/notifications.py`:

```python
def on_quotation_submit(doc, method):
    """Create draft email to customer when Quotation is submitted."""
    if doc.quotation_to == "Customer":
        email = _get_customer_email(doc.party_name)
    else:
        email = frappe.db.get_value("Lead", doc.party_name, "email_id") or ""

    body = f"""Dear {doc.contact_person or doc.party_name},

Please find attached our Quotation {doc.name} dated {doc.transaction_date}.

Total Amount: ₹{doc.grand_total:,.2f}
Valid Till: {doc.valid_till or 'As discussed'}

Kindly review and revert with your confirmation at your earliest convenience.

Warm regards,
Dynamic Servitech Private Limited
+91-20-XXXXXXXX | sales@dgoc.in"""

    _create_email_draft(
        reference_doctype="Quotation",
        reference_name=doc.name,
        recipients=email,
        subject=f"Quotation {doc.name} — Dynamic Servitech",
        body=body,
        sender="sales@dgoc.in",
    )


def on_sales_order_email_draft(doc, method):
    """Create draft SO confirmation email to customer."""
    email = _get_customer_email(doc.customer)

    body = f"""Dear {doc.contact_person or doc.customer_name},

Thank you for your order. We are pleased to confirm Sales Order {doc.name}.

Order Date: {doc.transaction_date}
Delivery Date: {doc.delivery_date or 'To be confirmed'}
Total Amount: ₹{doc.grand_total:,.2f}

We will keep you informed about the dispatch schedule.

Warm regards,
Dynamic Servitech Private Limited"""

    _create_email_draft(
        reference_doctype="Sales Order",
        reference_name=doc.name,
        recipients=email,
        subject=f"Order Confirmation — {doc.name}",
        body=body,
        sender="sales@dgoc.in",
    )


def on_sales_invoice_email_draft(doc, method):
    """Create draft invoice email to customer."""
    email = _get_customer_email(doc.customer)

    body = f"""Dear {doc.contact_person or doc.customer_name},

Please find attached Sales Invoice {doc.name} for your records.

Invoice Date: {doc.posting_date}
Due Date: {doc.due_date or 'Upon receipt'}
Amount Due: ₹{doc.outstanding_amount:,.2f}

Payment details:
Account Name: Dynamic Servitech Private Limited
Bank: [Your bank details here]

Please feel free to contact us for any queries.

Warm regards,
Dynamic Servitech Private Limited
accounts@dgoc.in"""

    _create_email_draft(
        reference_doctype="Sales Invoice",
        reference_name=doc.name,
        recipients=email,
        subject=f"Invoice {doc.name} — Dynamic Servitech",
        body=body,
        sender="accounts@dgoc.in",
    )


def on_purchase_order_email_draft(doc, method):
    """Create draft PO email to supplier."""
    email = _get_supplier_email(doc.supplier)

    items_lines = "\n".join(
        f"  • {item.item_name} — Qty: {item.qty} {item.uom} @ ₹{item.rate:,.2f}"
        for item in doc.items[:10]
    )
    if len(doc.items) > 10:
        items_lines += f"\n  ... and {len(doc.items) - 10} more items"

    body = f"""Dear {doc.supplier_name},

Please find attached Purchase Order {doc.name}.

Order Date: {doc.transaction_date}
Expected Delivery: {doc.schedule_date or 'As discussed'}
Total Value: ₹{doc.grand_total:,.2f}

Items:
{items_lines}

Kindly acknowledge receipt and confirm delivery schedule.

Warm regards,
Dynamic Servitech Private Limited
accounts@dgoc.in"""

    _create_email_draft(
        reference_doctype="Purchase Order",
        reference_name=doc.name,
        recipients=email,
        subject=f"Purchase Order {doc.name} — Dynamic Servitech",
        body=body,
        sender="accounts@dgoc.in",
    )
```

- [ ] **Step 2: Register handlers in hooks.py**

Open `vaishali/hooks.py`. In the `doc_events` dict:

**For Quotation** (currently only has `on_update_after_submit`), change to:
```python
"Quotation": {
    "on_submit": "vaishali.notifications.on_quotation_submit",
    "on_update_after_submit": "vaishali.api.linking.on_quotation_status_change",
},
```

**For Sales Order** (currently has a list), add the email draft handler:
```python
"Sales Order": {
    "on_submit": [
        "vaishali.notifications.on_sales_order_submit",
        "vaishali.notifications.on_sales_order_submit_production",
        "vaishali.notifications.on_sales_order_email_draft",
    ],
},
```

**For Sales Invoice** (currently single string), change to list:
```python
"Sales Invoice": {
    "on_submit": [
        "vaishali.notifications.on_sales_invoice_submit",
        "vaishali.notifications.on_sales_invoice_email_draft",
    ],
},
```

**For Purchase Order** (currently single string), change to list:
```python
"Purchase Order": {
    "on_submit": [
        "vaishali.notifications.on_purchase_order_submit",
        "vaishali.notifications.on_purchase_order_email_draft",
    ],
},
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/notifications.py').read()); print('notifications OK')" && \
python3 -c "import ast; ast.parse(open('vaishali/hooks.py').read()); print('hooks OK')"
```

Expected: both lines print OK.

- [ ] **Step 4: Commit**

```bash
git add vaishali/notifications.py vaishali/hooks.py
git commit -m "feat(email): draft email handlers for Quotation, SO, SI, PO on submit"
```

---

## Task 5: Warranty Claim Email Draft + Payment Reminder Email Drafts

**Files:**
- Modify: `vaishali/notifications.py` (add 2 functions)
- Modify: `vaishali/hooks.py` (register Warranty Claim on_update_after_submit)

- [ ] **Step 1: Add Warranty Claim status update handler to notifications.py**

Append to `vaishali/notifications.py`:

```python
def on_warranty_claim_status_update(doc, method):
    """Create draft email to site contact when Warranty Claim status changes."""
    if not doc.has_value_changed("status"):
        return

    contact_email = doc.get("site_contact_phone") and ""  # phone field, not email
    # Try custom field or standard field
    contact_email = (
        frappe.db.get_value("Warranty Claim", doc.name, "contact_email")
        or frappe.db.get_value("Customer", doc.customer, "email_id")
        or ""
    )

    body = f"""Dear {doc.customer_name or doc.customer},

This is an update on your service request {doc.name}.

Product: {doc.item_name or doc.item_code}
Current Status: {doc.status}
Priority: {doc.get('priority', 'Standard')}

{f'Resolution Note: {doc.resolution_details}' if doc.status == 'Resolved' else 'Our team is working on your request and will update you shortly.'}

For urgent queries, please contact our service team at service@dgoc.in.

Warm regards,
Dynamic Servitech Private Limited — Service Team"""

    _create_email_draft(
        reference_doctype="Warranty Claim",
        reference_name=doc.name,
        recipients=contact_email,
        subject=f"Service Request {doc.name} — Status Update: {doc.status}",
        body=body,
        sender="service@dgoc.in",
    )
```

- [ ] **Step 2: Extend `check_overdue_sales_invoices` to also create email drafts**

Find `check_overdue_sales_invoices()` in `vaishali/notifications.py`. At the end of the function, after the existing Telegram notification logic, add:

```python
    # Create email drafts for customer payment reminders (one per customer)
    by_customer = {}
    for si in overdue:
        by_customer.setdefault(si.customer_name, []).append(si)

    for customer_name, invoices in by_customer.items():
        customer = frappe.db.get_value(
            "Sales Invoice", invoices[0].name, "customer"
        )
        email = _get_customer_email(customer)
        lines = "\n".join(
            f"  • {inv.name} — ₹{inv.outstanding_amount:,.2f} (due {inv.due_date})"
            for inv in invoices
        )
        total = sum(inv.outstanding_amount for inv in invoices)
        body = f"""Dear {customer_name},

This is a gentle reminder that the following invoices are outstanding:

{lines}

Total Outstanding: ₹{total:,.2f}

Please arrange payment at your earliest convenience. If payment has already been made, kindly ignore this reminder or share the payment details with us.

Warm regards,
Dynamic Servitech Private Limited
accounts@dgoc.in"""

        _create_email_draft(
            reference_doctype="Customer",
            reference_name=customer,
            recipients=email,
            subject=f"Payment Reminder — Outstanding Invoices ({len(invoices)} invoice{'s' if len(invoices) > 1 else ''})",
            body=body,
            sender="accounts@dgoc.in",
        )
```

- [ ] **Step 3: Register Warranty Claim handler in hooks.py**

In `doc_events`, the Warranty Claim entry currently has `validate` and `after_insert`. Add `on_update_after_submit`:

```python
"Warranty Claim": {
    "validate": "vaishali.complaint.on_warranty_claim_save",
    "after_insert": "vaishali.complaint.on_warranty_claim_update",
    "on_update_after_submit": "vaishali.notifications.on_warranty_claim_status_update",
},
```

- [ ] **Step 4: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/notifications.py').read()); print('OK')" && \
python3 -c "import ast; ast.parse(open('vaishali/hooks.py').read()); print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add vaishali/notifications.py vaishali/hooks.py
git commit -m "feat(email): draft emails for Warranty Claim status updates and payment reminders"
```

---

## Task 6: Telegram Notification on Inbound Email Reply

**Files:**
- Modify: `vaishali/notifications.py` (add 1 function)
- Modify: `vaishali/hooks.py` (register Communication after_insert)

- [ ] **Step 1: Add inbound reply handler to notifications.py**

Append to `vaishali/notifications.py`:

```python
def on_communication_receive(doc, method):
    """Notify document owner on Telegram when a customer replies by email."""
    if doc.communication_medium != "Email" or doc.sent_or_received != "Received":
        return
    if not doc.reference_doctype or not doc.reference_name:
        return

    # Find the owner of the referenced document
    owner = frappe.db.get_value(doc.reference_doctype, doc.reference_name, "owner")
    if not owner:
        return

    emp_id = frappe.db.get_value("Employee", {"user_id": owner, "status": "Active"}, "name")
    if not emp_id:
        return

    sender_name = doc.sender_full_name or doc.sender or "Customer"
    msg = (
        f"📧 Email reply from {sender_name}\n"
        f"Re: {doc.reference_doctype} {doc.reference_name}\n"
        f"Subject: {doc.subject or '(no subject)'}"
    )
    _notify(emp_id, msg)
```

- [ ] **Step 2: Register in hooks.py**

Add to `doc_events`:

```python
"Communication": {
    "after_insert": "vaishali.notifications.on_communication_receive",
},
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/notifications.py').read()); print('OK')" && \
python3 -c "import ast; ast.parse(open('vaishali/hooks.py').read()); print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add vaishali/notifications.py vaishali/hooks.py
git commit -m "feat(email): Telegram notification on inbound customer email reply"
```

---

## Task 7: Communication.js — Send/Discard Buttons on ERPNext Desk

**Files:**
- Create: `vaishali/public/js/communication.js`
- Modify: `vaishali/hooks.py` (add `Communication` to `doctype_js`)

- [ ] **Step 1: Create communication.js**

Create `vaishali/public/js/communication.js`:

```javascript
frappe.ui.form.on("Communication", {
    refresh(frm) {
        if (frm.doc.vaishali_email_status !== "Draft") return;

        frm.add_custom_button(__("Send Email"), () => {
            frappe.confirm(
                `Send this email to <b>${frm.doc.recipients || "(no recipient)"}</b>?`,
                () => {
                    frappe.call({
                        method: "vaishali.api.email_outbox.send_draft",
                        args: { name: frm.doc.name },
                        freeze: true,
                        freeze_message: "Sending...",
                        callback(r) {
                            if (!r.exc) {
                                frappe.show_alert({ message: "Email sent.", indicator: "green" });
                                frm.reload_doc();
                            }
                        },
                    });
                }
            );
        }, __("Email Outbox"));

        frm.add_custom_button(__("Discard Draft"), () => {
            frappe.confirm("Discard this draft? It cannot be recovered.", () => {
                frappe.call({
                    method: "vaishali.api.email_outbox.discard_draft",
                    args: { name: frm.doc.name },
                    callback(r) {
                        if (!r.exc) {
                            frappe.show_alert({ message: "Draft discarded.", indicator: "orange" });
                            frm.reload_doc();
                        }
                    },
                });
            });
        }, __("Email Outbox"));

        // Highlight draft status — warn prominently if no recipient
        if (!frm.doc.recipients || !frm.doc.recipients.trim()) {
            frm.set_intro(
                "⚠️ <b>No recipient email address.</b> Add one in the Recipients field before sending.",
                "red"
            );
        } else {
            frm.set_intro(
                `This email is <b>pending review</b>. Recipient: ${frm.doc.recipients}`,
                "orange"
            );
        }
    },
});
```

- [ ] **Step 2: Register in hooks.py `doctype_js`**

In `vaishali/hooks.py`, find the `doctype_js` dict and add:

```python
doctype_js = {
    "Quotation": "public/js/quotation.js",
    "Lead": "public/js/lead.js",
    "Customer": "public/js/customer.js",
    "Communication": "public/js/communication.js",   # ← add this line
}
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/hooks.py').read()); print('hooks OK')" && \
node -e "require('fs').readFileSync('vaishali/public/js/communication.js', 'utf8'); console.log('JS OK')"
```

Expected: both print OK.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/js/communication.js vaishali/hooks.py
git commit -m "feat(email): Send/Discard buttons on Communication form for draft emails"
```

---

## Task 8: Implement `send_email` Tool in Vaishali Agent

**Files:**
- Modify: `vaishali/agent/executor.py` (add `_execute_send_email` function + register)

- [ ] **Step 1: Add `_execute_send_email` function to executor.py**

Open `vaishali/agent/executor.py`. Add before the `# ── Dispatch Table` comment:

```python
def _execute_send_email(inp, user_role="user", employee_name="", user=None, **kw):
    """Send an email or create a draft depending on user role."""
    recipients = (inp.get("recipients") or "").strip()
    subject = (inp.get("subject") or "").strip()
    message = (inp.get("message") or "").strip()
    cc = (inp.get("cc") or "").strip()
    reference_doctype = inp.get("reference_doctype", "")
    reference_name = inp.get("reference_name", "")

    if not recipients or not subject or not message:
        return json.dumps({"error": "recipients, subject, and message are all required"})

    # Auto-select sender based on document type
    sender_map = {
        "Quotation": "sales@dgoc.in",
        "Sales Order": "sales@dgoc.in",
        "Lead": "sales@dgoc.in",
        "Opportunity": "sales@dgoc.in",
        "Sales Invoice": "accounts@dgoc.in",
        "Purchase Order": "accounts@dgoc.in",
        "Payment Entry": "accounts@dgoc.in",
        "Journal Entry": "accounts@dgoc.in",
        "Warranty Claim": "service@dgoc.in",
        "Maintenance Visit": "service@dgoc.in",
    }
    sender = sender_map.get(reference_doctype, "sales@dgoc.in")

    if user_role in ("admin", "manager"):
        frappe.sendmail(
            recipients=[r.strip() for r in recipients.split(",") if r.strip()],
            sender=sender,
            subject=subject,
            message=message,
            cc=[c.strip() for c in cc.split(",") if c.strip()] if cc else [],
            reference_doctype=reference_doctype or None,
            reference_name=reference_name or None,
        )
        return json.dumps({"success": True, "message": f"Email sent to {recipients} from {sender}"})

    # User role: create a draft for manager review
    from vaishali.notifications import _create_email_draft
    _create_email_draft(
        reference_doctype=reference_doctype or "Communication",
        reference_name=reference_name or "",
        recipients=recipients,
        subject=subject,
        body=message,
        sender=sender,
    )
    return json.dumps({
        "success": True,
        "message": f"Draft email created for manager review (your role cannot send directly). Recipient: {recipients}",
    })
```

- [ ] **Step 2: Register in `TOOL_HANDLERS` and `_ROLE_GATES`**

In `vaishali/agent/executor.py`, find the `TOOL_HANDLERS` dict. Add under the `# Write` section:

```python
    "send_email": _execute_send_email,
```

The `send_email` tool does NOT go in `_ROLE_GATES` — user role creates a draft (handled inside the function), manager/admin sends directly. No blanket gate needed.

- [ ] **Step 3: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('vaishali/agent/executor.py').read()); print('executor OK')"
```

- [ ] **Step 4: Commit**

```bash
git add vaishali/agent/executor.py
git commit -m "feat(email): implement send_email tool in Vaishali agent executor"
```

---

## Task 9: Deploy to EC2 + Configure Google Workspace Email Accounts

This task is infrastructure — it requires Google Workspace admin access and EC2 SSH.

- [ ] **Step 1: Generate App Passwords in Google Workspace**

Go to `admin.google.com` → Users → select `sales@dgoc.in` → Security → App passwords.
Generate one App Password per alias:
- `sales@dgoc.in` — label: "ERPNext SMTP"
- `accounts@dgoc.in` — label: "ERPNext SMTP"
- `service@dgoc.in` — label: "ERPNext SMTP"

Save each 16-character password securely — you'll enter them in ERPNext in the next step.

Also ensure IMAP is enabled for each alias: GMail settings → Forwarding and POP/IMAP → Enable IMAP.

- [ ] **Step 2: Check AWS Security Group allows outbound port 587**

```bash
aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=dspl-erp*" \
  --region ap-south-1 \
  --query "SecurityGroups[*].{ID:GroupId,Egress:IpPermissionsEgress}" \
  --output json | python3 -m json.tool | grep -A3 '"ToPort": 587'
```

If port 587 is not shown in egress rules, add it:
```bash
aws ec2 authorize-security-group-egress \
  --group-id <YOUR_SG_ID> \
  --protocol tcp --port 587 --cidr 0.0.0.0/0 \
  --region ap-south-1
```

- [ ] **Step 3: Deploy all code changes to EC2**

```bash
rm -f /tmp/dspl-temp-key /tmp/dspl-temp-key.pub && ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q \
  && aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1 \
  && ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
    "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main && cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com migrate && bench build --app vaishali' \
     && redis-cli FLUSHALL \
     && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com clear-cache' \
     && sudo supervisorctl restart all"
```

- [ ] **Step 4: Configure Email Accounts in ERPNext desk**

Log in to ERPNext → Settings → Email Account → New.

Create three Email Accounts with these values (repeat for each alias):

**Account 1:**
- Email ID: `sales@dgoc.in`
- Password: `<App Password from Step 1>`
- Service: Gmail
- SMTP Server: `smtp.gmail.com`, Port: `587`, Use TLS: Yes
- Enable Incoming: Yes, IMAP Server: `imap.gmail.com`, Port: `993`, Use SSL: Yes
- Default Outgoing: Yes (for sales@ only; leave unchecked for others)
- Append To: Quotation (optional — lets replies auto-link)

**Account 2:** `accounts@dgoc.in` — same settings, Append To: Sales Invoice

**Account 3:** `service@dgoc.in` — same settings, Append To: Warranty Claim

After saving each, click **"Send Test Email"** to verify SMTP connectivity.

- [ ] **Step 5: Verify end-to-end**

In ERPNext desk:
1. Submit a test Quotation → check Communication list filtered by `vaishali_email_status = Draft`
2. Open the draft Communication → confirm "Email Outbox" button group with Send/Discard appears
3. Click Send → email should arrive in the recipient inbox
4. Reply from recipient inbox → within 5 minutes, check Communication list for inbound record + Telegram notification

---

## Task 10: Smoke Test via Vaishali Agent

- [ ] **Step 1: Test send_email tool as manager**

In ERPNext desk, open a Vaishali chat session as a manager-role user. Type:

```
send an email to test@example.com with subject "Test from Vaishali" and body "This is a test email from the Vaishali AI agent."
```

Expected: Agent shows draft preview, on confirmation sends immediately, responds with success.

- [ ] **Step 2: Test send_email tool as user role**

Log in as a non-manager user. Same request.

Expected: Agent responds that a draft has been created for manager review (not sent directly).

- [ ] **Step 3: Verify draft appears in Communication list**

In ERPNext desk, go to Communication list, filter by `vaishali_email_status = Draft`. The draft from Step 2 should appear.

- [ ] **Step 4: Final commit and tag**

```bash
git tag v-email-integration-$(date +%Y%m%d)
git push upstream main --tags
```
