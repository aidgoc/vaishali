import frappe
from frappe import _
from frappe.model.document import Document


class OperatorLogsheet(Document):
	def before_insert(self):
		self._ensure_approval_token()

	def validate(self):
		self._compute_totals()
		self._guard_required_fields()
		self._ensure_approval_token()  # safety net for legacy rows

	def _compute_totals(self):
		"""amount = total_hours * rate_per_hour."""
		hours = float(self.total_hours or 0)
		rate = float(self.rate_per_hour or 0)
		self.amount = round(hours * rate, 2)

	def _guard_required_fields(self):
		"""On submit, the operator must have proof of sign-off — either the
		photo of the paper logsheet, OR a digital approval recorded via the
		public approval URL. On draft we let it through so the PWA can save
		in stages."""
		if self.docstatus != 1:
			return
		has_paper_proof = bool(self.supervisor_signature and self.signed_by)
		has_digital_proof = (
			self.approval_status == "Approved"
			and self.signed_by
			and self.supervisor_signature
		)
		if not (has_paper_proof or has_digital_proof):
			frappe.throw(_(
				"Logsheet needs sign-off before submitting — either attach a "
				"photo of the signed paper, or send the approval link to the "
				"client and wait for their approval."
			), title=_("Sign-off Required"))

	def _ensure_approval_token(self):
		if not self.approval_token:
			# 22 chars of url-safe randomness — practically guess-proof
			self.approval_token = frappe.generate_hash(length=22)
