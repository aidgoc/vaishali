import frappe
from frappe import _
from frappe.model.document import Document


class OperatorLogsheet(Document):
	def validate(self):
		self._compute_totals()
		self._guard_required_fields()

	def _compute_totals(self):
		"""amount = total_hours * rate_per_hour."""
		hours = float(self.total_hours or 0)
		rate = float(self.rate_per_hour or 0)
		self.amount = round(hours * rate, 2)

	def _guard_required_fields(self):
		"""On submit, the supervisor signature photo and signed_by name are
		mandatory — that's the whole point of the logsheet (proof for
		billing). On draft we let it through so PWA can save in stages."""
		if self.docstatus != 1:
			return
		if not self.supervisor_signature:
			frappe.throw(_("Attach the photo of the signed paper logsheet before submitting."),
				title=_("Signature Photo Required"))
		if not self.signed_by:
			frappe.throw(_("Enter the name of the client site supervisor who signed."),
				title=_("Signer Name Required"))
