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


# ── Doc Event Hooks ──────────────────────────────────────────────


def on_dcr_update(doc, method):
    """Auto-create Lead/Opportunity on DCR completion with outcome checkboxes."""
    if doc.status != "Completed":
        return

    # Lead creation (checkbox-driven)
    if doc.lead_generated and not doc.lead:
        lead_name_val = doc.prospect_name or doc.customer_name
        if lead_name_val and not frappe.db.exists("Lead", {"lead_name": lead_name_val}):
            lead = frappe.new_doc("Lead")
            lead.lead_name = lead_name_val
            lead.company_name = doc.get("prospect_company") or ""
            lead.mobile_no = doc.get("prospect_phone") or ""
            lead.source = "Campaign"
            lead.notes = f"Auto-created from visit {doc.name} on {doc.date}"
            lead.insert(ignore_permissions=True)
            doc.db_set("lead", lead.name, update_modified=False)
            doc.db_set("conversion_status", "Lead Created", update_modified=False)

    # Opportunity creation
    if doc.opportunity_generated and not doc.opportunity:
        opp = frappe.new_doc("Opportunity")
        if doc.lead:
            opp.opportunity_from = "Lead"
            opp.party_name = doc.lead
        elif doc.customer:
            opp.opportunity_from = "Customer"
            opp.party_name = doc.customer
        else:
            return  # Can't create opportunity without lead or customer
        opp.source = "Campaign"
        opp.notes = f"From visit {doc.name} on {doc.date}"
        opp.insert(ignore_permissions=True)
        doc.db_set("opportunity", opp.name, update_modified=False)
        doc.db_set("conversion_status", "Opportunity", update_modified=False)

    # Order received
    if doc.order_received and doc.conversion_status not in ("Won",):
        doc.db_set("conversion_status", "Won", update_modified=False)

    # Default status if nothing set
    if not doc.conversion_status:
        doc.db_set("conversion_status", "Open", update_modified=False)


def link_quotation_to_dcr(doc, method):
    """On Quotation submit, link to matching DCR visits."""
    # Primary: match via Opportunity
    if doc.opportunity:
        dcrs = frappe.get_all("Daily Call Report",
            filters={"opportunity": doc.opportunity, "quotation": ["is", "not set"]},
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "quotation": doc.name,
                "conversion_status": "Quoted"
            }, update_modified=False)
        if dcrs:
            return

    # Fallback: customer + 90-day window
    if doc.party_name:
        dcrs = frappe.get_all("Daily Call Report",
            filters={
                "customer": doc.party_name,
                "quotation": ["is", "not set"],
                "date": [">=", add_days(doc.transaction_date, -90)]
            },
            order_by="date desc",
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "quotation": doc.name,
                "conversion_status": "Quoted"
            }, update_modified=False)


def link_sales_order_to_dcr(doc, method):
    """On Sales Order submit, link to matching DCR visits."""
    # Primary: match via linked Quotation
    quotations = set()
    for item in doc.items:
        if item.prevdoc_docname:
            quotations.add(item.prevdoc_docname)

    if quotations:
        dcrs = frappe.get_all("Daily Call Report",
            filters={"quotation": ["in", list(quotations)], "sales_order": ["is", "not set"]},
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "sales_order": doc.name,
                "conversion_status": "Won"
            }, update_modified=False)
        if dcrs:
            return

    # Fallback: customer + 90-day window
    if doc.customer:
        dcrs = frappe.get_all("Daily Call Report",
            filters={
                "customer": doc.customer,
                "sales_order": ["is", "not set"],
                "date": [">=", add_days(doc.transaction_date, -90)]
            },
            order_by="date desc",
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "sales_order": doc.name,
                "conversion_status": "Won"
            }, update_modified=False)


def on_customer_created(doc, method):
    """On Customer insert, retroactively link DCR visits from converted Lead."""
    lead_name = frappe.db.get_value("Lead", {
        "lead_name": doc.customer_name,
        "status": "Converted"
    }, "name")
    if not lead_name:
        return
    dcrs = frappe.get_all("Daily Call Report",
        filters={"lead": lead_name, "customer": ["is", "not set"]},
        pluck="name")
    for dcr_name in dcrs:
        frappe.db.set_value("Daily Call Report", dcr_name, "customer", doc.name,
                           update_modified=False)


def on_quotation_status_change(doc, method):
    """On Quotation status change to Lost, update linked DCR conversion_status."""
    if doc.status == "Lost":
        dcrs = frappe.get_all("Daily Call Report",
            filters={"quotation": doc.name, "conversion_status": ["!=", "Won"]},
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, "conversion_status", "Lost",
                               update_modified=False)
