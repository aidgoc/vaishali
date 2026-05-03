"""www controller for /logsheet_approve — public token-based approval page.

The page is rendered server-side with the logsheet detail (so even if
JS fails the supervisor sees the data); the Approve/Reject form posts
back to vaishali.api.public.approve_logsheet.
"""
import frappe
from frappe import _


no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False
	context.title = "Approve Logsheet"

	token = (frappe.form_dict.get("t") or "").strip()
	context.token = token

	if not token:
		context.error = "Missing approval token in the URL."
		return context

	row = frappe.db.get_value(
		"Operator Logsheet",
		{"approval_token": token},
		[
			"name", "operator_name", "log_date", "customer_name",
			"site_name", "equipment_label", "work_type", "shift",
			"total_hours", "idle_hours", "remarks",
			"approval_status", "signed_by", "approval_decided_at",
			"company", "docstatus",
		],
		as_dict=True,
	)

	if not row:
		context.error = "This approval link is invalid or has been retired."
		return context

	if row.docstatus == 2:
		context.error = "This logsheet has been cancelled."
		return context

	context.logsheet = row
	context.company_short = (row.company or "").replace(
		"Private Limited", ""
	).replace("Pvt Ltd", "").strip()
	context.already_decided = row.approval_status in ("Approved", "Rejected")

	return context
