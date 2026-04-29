"""PWA-only Service Call creation guard.

Policy: service calls must be logged via the field app so the engineer
captures the call as it happens (or right after). The desk can edit
existing calls — adding remarks, updating direction/duration/device/
warranty_claim/contact — but cannot create new ones, and cannot edit
the truth-fields once captured.

The PWA endpoints in `vaishali.api.field` set `frappe.local.flags.from_pwa
= True` before saving. This hook rejects any insert without that flag
and reverts truth-field edits made from a non-PWA path.
"""

import frappe
from frappe import _

_TRUTH_FIELDS = ("customer", "channel", "outcome", "call_datetime", "employee")


def _from_pwa() -> bool:
	return bool(getattr(frappe.local, "flags", None) and frappe.local.flags.get("from_pwa"))


def enforce(doc, method=None):
	if doc.is_new():
		if not _from_pwa():
			frappe.throw(
				_(
					"Service Calls must be logged from the field app. "
					"Use https://dgoc.logstop.com/field on your phone."
				),
				title=_("Logging blocked"),
			)
		return

	if _from_pwa():
		return

	original = doc.get_doc_before_save()
	if not original:
		return

	reverted = False
	for field in _TRUTH_FIELDS:
		old_val = original.get(field) or ""
		new_val = doc.get(field) or ""
		if str(new_val) != str(old_val):
			doc.set(field, original.get(field))
			reverted = True

	if reverted:
		frappe.msgprint(
			_("Truth fields (Customer, Channel, Outcome, Call Date/Time, Employee) can only be set by the field app and were not changed."),
			indicator="orange",
			alert=True,
		)
