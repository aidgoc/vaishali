import frappe
from frappe.model.document import Document


class ExpenseBudget(Document):
    def before_save(self):
        if not self.annual_budget:
            self.annual_budget = self.monthly_cap * 12
