"""Outward Gate Pass — DCEPL ERS Store SOP wedge 5.

Captures every material movement leaving the workshop gate so the
guard's outward register is in the system and reconcilable against
Stock Entry / Delivery Note issues.
"""
import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class OutwardGatePass(Document):
    def validate(self):
        if not self.items:
            frappe.throw("At least one item is required.")
        for row in self.items:
            if not row.qty or row.qty <= 0:
                frappe.throw(f"Row {row.idx}: qty must be greater than zero.")
        if self.returnable and not self.expected_return_date:
            frappe.throw("Expected Return Date is required when 'Returnable' is ticked.")
        if not self.guard_user:
            self.guard_user = frappe.session.user

    def before_submit(self):
        self.status = "Out"

    def on_cancel(self):
        self.status = "Draft"

    @frappe.whitelist()
    def mark_returned(self):
        if self.docstatus != 1:
            frappe.throw("Only submitted Gate Passes can be marked Returned.")
        if not self.returnable:
            frappe.throw("This Gate Pass is not returnable.")
        if self.status == "Returned":
            frappe.throw("Already marked Returned.")
        self.db_set("status", "Returned")
        self.db_set("returned_at", now_datetime())
        return {"status": self.status, "returned_at": self.returned_at}
