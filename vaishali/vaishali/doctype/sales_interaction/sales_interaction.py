"""Sales Interaction controller."""
import frappe
from frappe.model.document import Document

STAGE_PROBABILITY = {
    "Open": 5,
    "Lead Created": 10,
    "Opportunity": 20,
    "Proposal Sent": 35,
    "Negotiation": 50,
    "Verbal Commitment": 80,
    "Quoted": 40,
    "Won": 100,
    "Lost": 0,
    "Stalled": 10,
}


class SalesInteraction(Document):
    def validate(self):
        if not self.customer and not self.lead:
            frappe.throw("Either Customer or Lead is required")

    def before_save(self):
        if self.conversion_stage and not self.flags.keep_probability:
            default_prob = STAGE_PROBABILITY.get(self.conversion_stage)
            if default_prob is not None and not self._doc_before_save:
                self.win_probability = default_prob
            elif default_prob is not None and self._doc_before_save:
                old_stage = self._doc_before_save.conversion_stage
                if old_stage != self.conversion_stage:
                    self.win_probability = default_prob
