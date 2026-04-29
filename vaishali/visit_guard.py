"""Field-only visit creation guard for Daily Call Report.

Policy: visits must be created via the PWA (which captures GPS at the
exact moment of check-in). The desk can edit existing visits — adding
remarks, next-action, status, and follow-up links — but cannot create
new ones, and cannot edit the GPS fields once captured.

Implementation: the PWA endpoints in `vaishali.api.field` set
`frappe.local.flags.from_pwa = True` before saving. The hook here
rejects any insert without that flag, and reverts any GPS-field edits
made from a non-PWA path.
"""

import frappe
from frappe import _

_GPS_FIELDS = ("check_in_gps", "check_out_gps")


def _from_pwa() -> bool:
	return bool(getattr(frappe.local, "flags", None) and frappe.local.flags.get("from_pwa"))


def enforce(doc, method=None):
	# Block new DCRs that didn't come through the PWA.
	if doc.is_new():
		if not _from_pwa():
			frappe.throw(
				_(
					"Daily Call Reports must be created from the field app, "
					"which captures GPS at check-in. Use https://dgoc.logstop.com/field "
					"on the rep's phone."
				),
				title=_("Visit creation blocked"),
			)
		return

	# Existing doc: GPS fields are PWA-only.
	if _from_pwa():
		return

	original = doc.get_doc_before_save()
	if not original:
		return
	for field in _GPS_FIELDS:
		if (doc.get(field) or "") != (original.get(field) or ""):
			# Silently revert — don't error, since the user may be saving other
			# fields legitimately. Surface a hint via msgprint.
			doc.set(field, original.get(field))
			frappe.msgprint(
				_("GPS fields can only be set by the field app and were not changed."),
				indicator="orange",
				alert=True,
			)
