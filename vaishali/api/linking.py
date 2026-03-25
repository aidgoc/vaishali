"""
linking.py — Auto-linking hooks for DCR → Lead → Opportunity → Quotation → Sales Order chain.

Setup functions (run once via bench execute):
    bench --site dgoc.logstop.com execute vaishali.api.linking.setup_dcr_fields
    bench --site dgoc.logstop.com execute vaishali.api.linking.setup_quotation_fields
    bench --site dgoc.logstop.com execute vaishali.api.linking.migrate_existing_dcrs
"""
import frappe
from frappe.utils import add_days


def setup_dcr_fields():
    """Add outcome + linking fields to Daily Call Report. Idempotent."""
    dt = "Daily Call Report"

    # Update visit_purpose to include Opportunity Follow-up
    vp_field = frappe.get_doc("DocField", {"parent": dt, "fieldname": "visit_purpose"})
    new_options = "Cold Call / New Enquiry\nLead Follow-up\nOpportunity Follow-up\nQuotation Follow-up\nOrder Follow-up\nRecovery\nRelationship Building"
    if vp_field and vp_field.options != new_options:
        vp_field.options = new_options
        vp_field.save(ignore_permissions=True)

    fields = [
        {"dt": dt, "fieldname": "outcome_section", "fieldtype": "Section Break",
         "label": "Visit Outcome", "insert_after": "section_notes"},
        {"dt": dt, "fieldname": "lead_generated", "fieldtype": "Check",
         "label": "Lead generated?", "insert_after": "outcome_section",
         "depends_on": 'eval:["Cold Call / New Enquiry","Lead Follow-up"].includes(doc.visit_purpose)'},
        {"dt": dt, "fieldname": "opportunity_generated", "fieldtype": "Check",
         "label": "Opportunity generated?", "insert_after": "lead_generated",
         "depends_on": 'eval:["Cold Call / New Enquiry","Lead Follow-up","Opportunity Follow-up"].includes(doc.visit_purpose)'},
        {"dt": dt, "fieldname": "order_received", "fieldtype": "Check",
         "label": "Order received?", "insert_after": "opportunity_generated",
         "depends_on": 'eval:doc.visit_purpose=="Quotation Follow-up"'},
        {"dt": dt, "fieldname": "discussion_remarks", "fieldtype": "Text",
         "label": "Discussion / Remark", "insert_after": "order_received"},
        {"dt": dt, "fieldname": "next_action", "fieldtype": "Small Text",
         "label": "Next action", "insert_after": "discussion_remarks"},
        {"dt": dt, "fieldname": "next_action_date", "fieldtype": "Date",
         "label": "Next action date", "insert_after": "next_action"},
        {"dt": dt, "fieldname": "col_break_outcome", "fieldtype": "Column Break",
         "insert_after": "next_action_date"},
        {"dt": dt, "fieldname": "opportunity", "fieldtype": "Link",
         "label": "Opportunity", "options": "Opportunity",
         "insert_after": "col_break_outcome", "read_only": 1},
        {"dt": dt, "fieldname": "quotation", "fieldtype": "Link",
         "label": "Quotation", "options": "Quotation",
         "insert_after": "opportunity", "read_only": 1},
        {"dt": dt, "fieldname": "sales_order", "fieldtype": "Link",
         "label": "Sales Order", "options": "Sales Order",
         "insert_after": "quotation", "read_only": 1},
        {"dt": dt, "fieldname": "conversion_status", "fieldtype": "Select",
         "label": "Conversion Status",
         "options": "Open\nLead Created\nOpportunity\nQuoted\nWon\nLost",
         "insert_after": "sales_order", "read_only": 1, "default": "Open"},
    ]

    for f in fields:
        if not frappe.db.exists("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]}):
            doc = frappe.new_doc("Custom Field")
            for k, v in f.items():
                doc.set(k, v)
            doc.insert(ignore_permissions=True)

    frappe.db.commit()
    print("DCR fields setup complete.")


def setup_quotation_fields():
    """Add temperature + lost reason fields to Quotation. Idempotent."""
    dt = "Quotation"
    fields = [
        {"dt": dt, "fieldname": "quotation_temperature", "fieldtype": "Select",
         "label": "Quotation Temperature",
         "options": "New\nHot\nWarm\nCold\nWill take time\nWon\nLost\nClosed\nModified",
         "insert_after": "status", "default": "New"},
        {"dt": dt, "fieldname": "lost_reason_category", "fieldtype": "Select",
         "label": "Lost Reason",
         "options": "\nPrice\nTechnical\nBudget related\nOther",
         "insert_after": "quotation_temperature",
         "depends_on": 'eval:doc.quotation_temperature=="Lost"'},
        {"dt": dt, "fieldname": "lost_remark", "fieldtype": "Small Text",
         "label": "Lost Remark", "insert_after": "lost_reason_category",
         "depends_on": 'eval:doc.quotation_temperature=="Lost"'},
    ]

    for f in fields:
        if not frappe.db.exists("Custom Field", {"dt": f["dt"], "fieldname": f["fieldname"]}):
            doc = frappe.new_doc("Custom Field")
            for k, v in f.items():
                doc.set(k, v)
            doc.insert(ignore_permissions=True)

    frappe.db.commit()
    print("Quotation fields setup complete.")


def migrate_existing_dcrs():
    """Set conversion_status='Open' on all existing DCR records."""
    frappe.db.sql("""
        UPDATE `tabDaily Call Report`
        SET conversion_status = 'Open'
        WHERE conversion_status IS NULL OR conversion_status = ''
    """)
    frappe.db.commit()
    print("Existing DCRs migrated.")
