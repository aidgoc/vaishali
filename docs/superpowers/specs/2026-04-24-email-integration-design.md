# Email Integration Design — Vaishali / DSPL ERP

**Date:** 2026-04-24
**Status:** Approved — pending implementation plan
**Scope:** Full email integration for dgoc.in on ERPNext (Frappe v15), with human-review gate and AI-composed sending via Vaishali agent.

---

## 1. Goals

- Send outbound emails from company aliases (`sales@dgoc.in`, `accounts@dgoc.in`, `service@dgoc.in`) directly from ERPNext
- Receive inbound replies threaded back to the originating ERP document
- No email leaves without a human reviewing and approving it
- AI agent (Vaishali) can draft and send ad-hoc emails from chat with inline review

---

## 2. Email Accounts

Three Frappe Email Accounts configured on the EC2 server:

| Alias | Role | Documents it covers |
|---|---|---|
| `sales@dgoc.in` | Customer-facing sales | Quotation, Sales Order |
| `accounts@dgoc.in` | Finance | Sales Invoice, Purchase Order, payment reminders |
| `service@dgoc.in` | Service / support | Warranty Claim updates |

**Setup method:** Google Workspace App Password per alias (not OAuth2 — simpler, fully supported by Frappe v15 IMAP/SMTP).

**SMTP:** `smtp.gmail.com:587` (STARTTLS)
**IMAP:** `imap.gmail.com:993` (SSL), polling every 5 minutes.

Inbound replies are automatically threaded to their originating document via Frappe's `Communication` DocType (Frappe matches on email subject containing the document name).

---

## 3. Document-Triggered Emails (Draft Mode)

Every document event below triggers a `doc_events` handler in `notifications.py` that creates a **draft** `Communication` record — it does NOT send automatically. A reviewer must approve from the Email Outbox on ERPNext desk. (Frappe's built-in Notification DocType sends immediately and cannot be used for draft mode — custom handlers are required.)

| Trigger | From | To | Attachment |
|---|---|---|---|
| Quotation submitted | sales@ | Customer email | Quotation PDF |
| Sales Order confirmed | sales@ | Customer email | SO PDF |
| Sales Invoice submitted | accounts@ | Customer email | SI PDF |
| Purchase Order submitted | accounts@ | Supplier email | PO PDF |
| Warranty Claim status updated | service@ | Site contact email | — |
| Payment reminder (daily 9am, overdue SI > 7 days) | accounts@ | Customer email | SI PDF |

Payment reminders batch into the outbox every morning — reviewer approves the batch, not one by one.

---

## 4. Email Outbox (ERPNext Desk)

A filtered **Communication** list view on the ERPNext desk showing `sent_or_received = Sent` + `email_status = Draft`.

**Columns:** To, Subject, Linked Document, Created At.

**Actions per row:**
- **Send** — fires the email immediately, marks Communication as Sent
- **Edit** — opens body for inline editing before sending
- **Discard** — marks the draft as "Discarded" (kept for audit trail; filtered out of outbox list)

Reviewer is typically the Sales Manager (for sales@), Accounts Manager (for accounts@), or Service Head (for service@). No role restriction enforced in code — access is via ERPNext desk which already requires login.

---

## 5. AI-Composed Emails (Vaishali Chat)

New `send_email` tool added to the Vaishali agent (category: `communication`).

**Flow:**
1. User asks: "send a follow-up to Tata Steel" or "email this PO to the supplier"
2. Vaishali looks up the relevant document (most recent matching quotation, PO, etc.)
3. Claude drafts a professional email body in Indian English, contextual to the document
4. Vaishali shows a preview in chat:
   ```
   📧 Draft Email
   To: contact@tata.com
   Subject: Follow-up: Quotation DSPL-QTN-2026-00123
   Body: [full draft]
   Attachment: Quotation PDF
   
   Type 'send' to send, 'edit [change]' to modify, or 'discard' to cancel.
   ```
5. User types `send` → email fires immediately (inline review already done)
6. User types `edit remove the second paragraph` → Claude revises, shows new preview
7. User types `discard` → draft deleted

**From address selection (automatic):**
- CRM docs (Quotation, SO, Lead) → `sales@dgoc.in`
- Finance docs (SI, PO, PE) → `accounts@dgoc.in`
- Service docs (Warranty Claim, Maintenance Visit) → `service@dgoc.in`

**Role gate:** Manager and Admin roles can send. User role gets draft-only (email saved to outbox for manager approval).

---

## 6. Inbound Threading

When a customer replies to any email sent from ERPNext:
- IMAP poller picks it up within 5 minutes
- Frappe creates a `Communication` record linked to the originating document
- Telegram notification fires to the document owner: "Reply from [Customer] on [Quotation/SI/etc.]"

No custom code needed — this is Frappe's built-in email threading behaviour.

---

## 7. Implementation Boundaries

**In scope:**
- Configure 3 Frappe Email Accounts (SMTP + IMAP) on EC2
- Custom `doc_events` handlers in `notifications.py` for all 6 document triggers (create draft Communication records)
- Email Outbox list view on ERPNext desk (filtered Communication list)
- `send_email` tool in Vaishali agent (`communication` category)
- Telegram notification on inbound reply

**Out of scope:**
- OAuth2 (App Password sufficient)
- Email templates with heavy branding/HTML (plain professional text is fine)
- Bulk marketing emails
- Email scheduling beyond daily payment reminders

---

## 8. Edge Cases

- If a Customer or Supplier has no `email_id` on file, the draft is still created but flagged with a warning in the outbox ("No email on file — add before sending")
- If the document has no PDF print format, the email is created without an attachment (not blocked)

---

## 9. Dependencies

- Google Workspace admin access to generate App Passwords for 3 aliases
- EC2 outbound port 587 must be open (check AWS security group)
- Each alias must have IMAP enabled in Google Workspace admin console
