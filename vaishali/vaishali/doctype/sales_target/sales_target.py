"""Sales Target controller."""
import frappe
from frappe.model.document import Document


class SalesTarget(Document):
    def before_save(self):
        if self.annual_target and not self.quarterly_target:
            self.quarterly_target = self.annual_target / 4
