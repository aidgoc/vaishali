import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime


class ServiceCall(Document):
	def validate(self):
		self._guard_call_datetime()

	def _guard_call_datetime(self):
		# Cannot move call_datetime more than 24h from its original value
		# (prevents desk users from backdating beyond legitimate "I forgot
		# to log this earlier today" range).
		if self.is_new():
			return
		previous = self.get_doc_before_save()
		if not previous or not previous.call_datetime:
			return
		new_dt = get_datetime(self.call_datetime)
		old_dt = get_datetime(previous.call_datetime)
		delta = abs((new_dt - old_dt).total_seconds())
		if delta > 24 * 3600:
			frappe.throw(
				_("Call Date/Time cannot be moved more than 24 hours from its original value."),
				title=_("Edit blocked"),
			)
