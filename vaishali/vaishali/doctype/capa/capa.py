import frappe
from frappe.model.document import Document


class CAPA(Document):
    def validate(self):
        if self.recurrence_found and self.capa_status == "Verified Effective":
            frappe.throw("Cannot mark as Verified Effective when recurrence is found")

        if self.capa_status == "Verified Effective" and not self.reviewed_by:
            frappe.throw("Reviewed By is required to mark as Verified Effective")

    def on_submit(self):
        # Back-link to Warranty Claim
        if self.warranty_claim:
            frappe.db.set_value(
                "Warranty Claim", self.warranty_claim,
                "capa_reference", self.name,
                update_modified=False,
            )

    def on_update_after_submit(self):
        if self.capa_status == "Reopened" and self.recurrence_found:
            # Notify managers about recurrence
            from vaishali.notifications import _get_managers, _notify
            managers = _get_managers()
            msg = (
                f"CAPA {self.name} reopened — recurrence found.\n"
                f"Customer: {self.customer_name}\n"
                f"Item: {self.item_name or self.item}\n"
                f"Root Cause: {self.rca_category}\n"
                f"Escalation required."
            )
            for emp_id in managers:
                _notify(emp_id, msg)
