"""Public (allow_guest=True) endpoints — no Frappe login required.

Currently houses the Operator Logsheet daily-approval flow:

    Operator fills logsheet → tells the PWA to "send for client approval"
        → PWA generates the public URL with the row's approval_token
        → operator shares it via WhatsApp / SMS / shows a QR to the
          site supervisor on the spot
    Site supervisor opens the URL on their phone (no install, no login)
        → sees the logsheet
        → enters their name, optionally draws a signature on a canvas,
          taps Approve or Reject
        → that decision is recorded against the logsheet

The flow replaces the paper logsheet's daily collect/sign/return cycle.
By design these endpoints accept any token-bearing request — security
relies on the 22-char random token being unguessable and bound to one
specific logsheet. We do NOT expose tokens via search; only the operator
who owns the logsheet sees it (via the PWA detail screen).
"""
import json

import frappe
from frappe import _
from frappe.utils import now_datetime


def _get_logsheet_by_token(token):
	if not token:
		frappe.throw(_("Missing approval token"), frappe.PermissionError)
	name = frappe.db.get_value("Operator Logsheet", {"approval_token": token}, "name")
	if not name:
		frappe.throw(_("Approval link is invalid or has expired"), frappe.PermissionError)
	return frappe.get_doc("Operator Logsheet", name)


@frappe.whitelist(allow_guest=True)
def fetch_logsheet_for_approval(token):
	"""Public — return a sanitised view of the logsheet for the approval page.

	Only the fields the site supervisor needs to make a sign-off decision
	are exposed; nothing financial (no rate, no amount, no internal IDs)."""
	doc = _get_logsheet_by_token(token)

	return {
		"name": doc.name,
		"operator_name": doc.operator_name,
		"log_date": str(doc.log_date) if doc.log_date else None,
		"customer_name": doc.customer_name,
		"site_name": doc.site_name,
		"equipment_label": doc.equipment_label,
		"work_type": doc.work_type,
		"shift": doc.shift,
		"total_hours": doc.total_hours,
		"idle_hours": doc.idle_hours,
		"remarks": doc.remarks,
		"approval_status": doc.approval_status,
		"signed_by": doc.signed_by,
		"approval_decided_at": str(doc.approval_decided_at) if doc.approval_decided_at else None,
		"company_name": _company_short_name(doc.company),
	}


def _company_short_name(company):
	"""'Dynamic Crane Engineers Private Limited' → 'Dynamic Crane Engineers'."""
	if not company:
		return ""
	return company.replace("Private Limited", "").replace("Pvt Ltd", "").strip()


@frappe.whitelist(allow_guest=True, methods=["POST"])
def approve_logsheet(token, decision, signed_by, signature_data_url=None,
                     remark=None):
	"""Public — record the site supervisor's Approve/Reject decision.

	`decision` must be 'approve' or 'reject'.
	`signed_by` is the supervisor's printed name.
	`signature_data_url` is optional — a 'data:image/png;base64,...' string
		from the canvas signature pad; saved as the supervisor_signature
		image on the logsheet. If absent, the printed name alone is taken
		as the digital sign-off.
	`remark` is optional and stored on the logsheet for context.
	"""
	doc = _get_logsheet_by_token(token)

	if doc.docstatus == 2:
		frappe.throw(_("This logsheet has been cancelled"), frappe.PermissionError)
	if doc.approval_status in ("Approved", "Rejected"):
		frappe.throw(_("This logsheet has already been {0}").format(doc.approval_status.lower()),
			frappe.PermissionError)

	decision = (decision or "").strip().lower()
	if decision not in ("approve", "reject"):
		frappe.throw(_("Invalid decision"), frappe.ValidationError)
	signed_by = (signed_by or "").strip()
	if not signed_by:
		frappe.throw(_("Please enter your name to sign off"), frappe.ValidationError)

	doc.signed_by = signed_by
	if remark:
		doc.remarks = (doc.remarks or "")
		if doc.remarks:
			doc.remarks += "\n\n"
		doc.remarks += f"Client remark: {remark}"

	# Save the canvas drawing as a File attached to the logsheet
	if signature_data_url and signature_data_url.startswith("data:image/"):
		try:
			file_url = _save_signature_image(doc, signature_data_url)
			doc.supervisor_signature = file_url
		except Exception as e:
			# Non-fatal — printed name + decision still recorded
			frappe.log_error(f"Signature save failed for {doc.name}: {e}",
				"Logsheet Approval Signature")

	if decision == "approve":
		doc.approval_status = "Approved"
	else:
		doc.approval_status = "Rejected"

	doc.approval_decided_at = now_datetime()
	doc.approval_ip = frappe.local.request_ip if hasattr(frappe.local, "request_ip") else None

	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return {"status": doc.approval_status, "name": doc.name}


def _save_signature_image(doc, data_url):
	"""Decode a data: URL and save it as a File row attached to the logsheet."""
	import base64
	header, _, b64 = data_url.partition(",")
	# header looks like 'data:image/png;base64'
	mime = "image/png"
	if "image/" in header:
		mime = header.split("data:")[1].split(";")[0] or "image/png"
	ext = mime.split("/")[-1] or "png"
	content = base64.b64decode(b64)

	file_doc = frappe.get_doc({
		"doctype": "File",
		"file_name": f"signature_{doc.name}.{ext}",
		"attached_to_doctype": "Operator Logsheet",
		"attached_to_name": doc.name,
		"attached_to_field": "supervisor_signature",
		"is_private": 0,
		"content": content,
	}).insert(ignore_permissions=True)
	return file_doc.file_url
