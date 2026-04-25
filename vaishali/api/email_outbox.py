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
