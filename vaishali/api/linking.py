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


def _resolve_customer(doc):
    """Try to resolve customer Link from customer_name if customer is not set."""
    if doc.customer:
        return
    name = doc.customer_name
    if not name:
        return
    match = frappe.db.get_value("Customer", {"customer_name": name}, "name")
    if match:
        doc.db_set("customer", match, update_modified=False)
        doc.customer = match


def _ensure_lead(doc):
    """Create or find a Lead from prospect/customer data. Returns lead name or None."""
    if doc.lead:
        return doc.lead
    lead_name_val = doc.prospect_name or doc.customer_name
    if not lead_name_val:
        return None
    # Check for existing lead
    existing = frappe.db.get_value("Lead", {"lead_name": lead_name_val}, "name")
    if existing:
        doc.db_set("lead", existing, update_modified=False)
        doc.lead = existing
        return existing
    # Create new lead
    lead = frappe.new_doc("Lead")
    lead.lead_name = lead_name_val
    lead.company_name = doc.get("prospect_company") or ""
    lead.mobile_no = doc.get("prospect_phone") or ""
    lead.source = "Campaign"
    lead.append("notes", {"note": f"Auto-created from visit {doc.name} on {doc.date}"})
    lead.insert(ignore_permissions=True)
    doc.db_set("lead", lead.name, update_modified=False)
    doc.lead = lead.name
    if not doc.conversion_status or doc.conversion_status == "Open":
        doc.db_set("conversion_status", "Lead Created", update_modified=False)
    return lead.name


def on_dcr_update(doc, method):
    """Auto-create Lead/Opportunity on DCR completion with outcome checkboxes."""
    if doc.status != "Completed":
        return

    # Resolve customer Link from customer_name
    _resolve_customer(doc)

    # Lead creation (checkbox-driven, or implied by opportunity_generated)
    if (doc.lead_generated or doc.opportunity_generated) and not doc.lead:
        _ensure_lead(doc)

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
            # Last resort: ensure a lead from prospect/customer data
            lead_name = _ensure_lead(doc)
            if not lead_name:
                return  # Can't create opportunity without any party
            opp.opportunity_from = "Lead"
            opp.party_name = lead_name
        opp.source = "Campaign"
        opp.append("notes", {"note": f"From visit {doc.name} on {doc.date}"})
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


def setup_production_so_access():
    """Grant Manufacturing User/Manager read-only access to Sales Order with financial fields hidden.

    Uses Frappe permlevel system: financial fields set to permlevel=1, manufacturing roles
    only get permlevel=0 read access. Sales/Accounts roles get permlevel=0+1.

    Run: bench --site dgoc.logstop.com execute vaishali.api.linking.setup_production_so_access
    """
    # ── 1. Add DocPerm for Manufacturing roles (permlevel=0, read-only) ──
    for role in ("Manufacturing User", "Manufacturing Manager"):
        existing = frappe.db.exists("DocPerm", {
            "parent": "Sales Order", "role": role, "permlevel": 0
        })
        if not existing:
            so_meta = frappe.get_doc("DocType", "Sales Order")
            so_meta.append("permissions", {
                "role": role,
                "permlevel": 0,
                "read": 1, "write": 0, "create": 0, "submit": 0,
                "cancel": 0, "amend": 0, "delete": 0,
                "print": 1, "email": 0, "report": 1,
                "share": 0, "export": 1,
            })
            so_meta.save(ignore_permissions=True)
            print(f"  Added DocPerm: {role} → Sales Order (read-only, permlevel=0)")
        else:
            print(f"  DocPerm already exists: {role} → Sales Order")

    frappe.db.commit()

    # ── 2. Set permlevel=1 on financial fields via Property Setter ──
    so_financial_fields = [
        "total", "net_total", "grand_total", "rounded_total", "rounding_adjustment",
        "discount_amount", "base_total", "base_net_total", "base_grand_total",
        "base_rounded_total", "base_discount_amount", "total_taxes_and_charges",
        "base_total_taxes_and_charges", "in_words", "base_in_words",
        "conversion_rate", "currency", "price_list_currency", "plc_conversion_rate",
        "selling_price_list", "payment_terms_template", "tc_name", "terms",
        "payment_schedule",
        # Section breaks for financial areas
        "totals", "base_total_field", "currency_and_price_list",
        "payment_terms_section", "terms_section_break",
    ]

    soi_financial_fields = [
        "rate", "amount", "net_rate", "net_amount",
        "base_rate", "base_amount", "base_net_rate", "base_net_amount",
        "price_list_rate", "discount_percentage", "discount_amount",
        "margin_type", "margin_rate_or_amount", "rate_with_margin",
        "pricing_rules",
    ]

    # Sales Taxes and Charges — hide entire child table
    tax_fields = [
        "charge_type", "account_head", "description", "rate",
        "tax_amount", "total", "base_tax_amount", "base_total",
        "tax_amount_after_discount_amount",
    ]

    def _set_permlevel(doc_type, fieldname, permlevel=1):
        ps_name = frappe.db.get_value("Property Setter", {
            "doc_type": doc_type, "field_name": fieldname, "property": "permlevel"
        })
        if ps_name:
            frappe.db.set_value("Property Setter", ps_name, "value", str(permlevel))
        else:
            ps = frappe.new_doc("Property Setter")
            ps.doctype_or_field = "DocField"
            ps.doc_type = doc_type
            ps.field_name = fieldname
            ps.property = "permlevel"
            ps.property_type = "Int"
            ps.value = str(permlevel)
            ps.save(ignore_permissions=True)

    set_count = 0
    for fn in so_financial_fields:
        if frappe.db.exists("DocField", {"parent": "Sales Order", "fieldname": fn}):
            _set_permlevel("Sales Order", fn)
            set_count += 1

    for fn in soi_financial_fields:
        if frappe.db.exists("DocField", {"parent": "Sales Order Item", "fieldname": fn}):
            _set_permlevel("Sales Order Item", fn)
            set_count += 1

    for fn in tax_fields:
        if frappe.db.exists("DocField", {"parent": "Sales Taxes and Charges", "fieldname": fn}):
            _set_permlevel("Sales Taxes and Charges", fn)
            set_count += 1

    # Also hide the taxes section in Sales Order
    if frappe.db.exists("DocField", {"parent": "Sales Order", "fieldname": "taxes_section"}):
        _set_permlevel("Sales Order", "taxes_section")
        set_count += 1
    if frappe.db.exists("DocField", {"parent": "Sales Order", "fieldname": "taxes"}):
        _set_permlevel("Sales Order", "taxes")
        set_count += 1

    print(f"  Set permlevel=1 on {set_count} financial fields")

    # ── 3. Grant permlevel=1 read to sales/accounts roles (so they still see everything) ──
    for role in ("Sales User", "Sales Manager", "Accounts User", "Accounts Manager"):
        existing = frappe.db.exists("DocPerm", {
            "parent": "Sales Order", "role": role, "permlevel": 1
        })
        if not existing:
            so_meta = frappe.get_doc("DocType", "Sales Order")
            so_meta.append("permissions", {
                "role": role,
                "permlevel": 1,
                "read": 1, "write": 1,
            })
            so_meta.save(ignore_permissions=True)
            print(f"  Added DocPerm: {role} → Sales Order (permlevel=1, read+write)")
        else:
            print(f"  DocPerm already exists: {role} → Sales Order permlevel=1")

    frappe.db.commit()
    frappe.clear_cache(doctype="Sales Order")
    print("  Done. Sales Order permissions updated.")
