# DCR-to-Sales Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link Daily Call Reports to the sales chain (Lead → Opportunity → Quotation → Sales Order) with auto-linking hooks, customer timeline, and conversion funnel dashboard.

**Architecture:** Custom Fields on DCR + Quotation, new `linking.py` module for doc_event hooks, enhanced checkout flow in PWA, customer timeline on desk + PWA, conversion funnel in View Engine + monthly report.

**Tech Stack:** Frappe v15 (Python), vanilla JS PWA with `el()` builder, ERPNext DocTypes

**Spec:** `docs/superpowers/specs/2026-03-25-dcr-sales-linking-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `vaishali/api/linking.py` | All auto-linking doc_event hooks |
| Modify | `vaishali/hooks.py` | Register new doc_events, remove old DCR hook |
| Modify | `vaishali/api/field.py` | Enhanced `checkout_dcr`, new `get_customer_timeline` endpoint, remove `on_dcr_update` |
| Modify | `vaishali/views/registry.py` | Add `conversion_funnel` view |
| Modify | `vaishali/public/js/customer.js` | Customer timeline sidebar on desk |
| Modify | `vaishali/public/js/quotation.js` | Integrate lost_reason_category into Mark as Lost dialog |
| Modify | `vaishali/public/field/screens/visits.js` | Outcome fields in checkout flow |
| Create | `vaishali/public/field/screens/customer-timeline.js` | PWA customer history screen |
| Modify | `vaishali/public/field/screens/monthly-report.js` | Conversion funnel section |
| Modify | `vaishali/public/field/app.js` | Add `#/customer-timeline/:id` route |
| Modify | `vaishali/public/field/screens/customer-detail.js` | Add "Sales Timeline" button |
| Modify | `vaishali/setup_workspace.py` | Add funnel Number Cards to DSPL Sales workspace |

---

## Task 1: Add Custom Fields to DCR

**Files:**
- Create: `vaishali/api/linking.py` (empty placeholder for now)
- Modify: `vaishali/hooks.py`

This task adds the new outcome fields, link fields, and conversion_status to the Daily Call Report DocType via a setup script run on the server. Also updates the visit_purpose options to include "Opportunity Follow-up".

- [ ] **Step 1: Create the field setup script**

Create `vaishali/api/linking.py` with a `setup_dcr_fields()` function:

```python
"""
linking.py — Auto-linking hooks for DCR → Lead → Opportunity → Quotation → Sales Order chain.
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

    # Custom fields to add
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
```

- [ ] **Step 2: Create Quotation custom fields in same function**

Add to `linking.py`:

```python
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
```

- [ ] **Step 3: Set conversion_status on existing DCR records**

Add to `linking.py`:

```python
def migrate_existing_dcrs():
    """Set conversion_status='Open' on all existing DCR records."""
    frappe.db.sql("""
        UPDATE `tabDaily Call Report`
        SET conversion_status = 'Open'
        WHERE conversion_status IS NULL OR conversion_status = ''
    """)
    frappe.db.commit()
    print("Existing DCRs migrated.")
```

- [ ] **Step 4: Deploy to server and run setup**

SSH into EC2, pull code, run:
```bash
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_dcr_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_quotation_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.migrate_existing_dcrs
bench --site dgoc.logstop.com clear-cache
```

- [ ] **Step 5: Verify fields exist on desk**

Open https://dgoc.logstop.com/app/daily-call-report and confirm outcome fields appear. Open a Quotation and confirm temperature field appears.

- [ ] **Step 6: Commit**

```bash
git add vaishali/api/linking.py
git commit -m "feat: add DCR outcome fields + quotation temperature custom fields"
```

---

## Task 2: Auto-linking Hook Logic

**Files:**
- Modify: `vaishali/api/linking.py` — add all hook functions
- Modify: `vaishali/hooks.py` — register doc_events
- Modify: `vaishali/api/field.py` — remove old `on_dcr_update`

- [ ] **Step 1: Add `on_dcr_update` hook to `linking.py`**

```python
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
```

- [ ] **Step 2: Add `link_quotation_to_dcr` hook**

```python
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
```

- [ ] **Step 3: Add `link_sales_order_to_dcr` hook**

```python
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
```

- [ ] **Step 4: Add `on_customer_created` and `on_quotation_status_change` hooks**

```python
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
```

- [ ] **Step 5: Update `hooks.py` — register new events, remove old DCR hook**

In `vaishali/hooks.py`, replace the doc_events block:

```python
doc_events = {
    "Daily Call Report": {
        "on_update": "vaishali.api.linking.on_dcr_update",
    },
    "Quotation": {
        "on_submit": "vaishali.api.linking.link_quotation_to_dcr",
        "on_update_after_submit": "vaishali.api.linking.on_quotation_status_change",
    },
    "Sales Order": {
        "on_submit": "vaishali.api.linking.link_sales_order_to_dcr",
    },
    "Customer": {
        "after_insert": "vaishali.api.linking.on_customer_created",
    },
    "Leave Application": {
        "on_submit": "vaishali.notifications.on_leave_application_submit",
        "on_update": "vaishali.notifications.on_leave_application_update",
    },
    "Expense Claim": {
        "before_submit": "vaishali.budget.check_budget_cap",
        "on_submit": "vaishali.notifications.on_expense_claim_submit",
        "on_update": "vaishali.notifications.on_expense_claim_update",
    },
    "Employee Advance": {
        "on_submit": "vaishali.notifications.on_employee_advance_submit",
        "on_update": "vaishali.notifications.on_employee_advance_update",
    },
}
```

- [ ] **Step 6: Remove old `on_dcr_update` from `field.py`**

Delete the `on_dcr_update` function (lines 471-486 in `vaishali/api/field.py`).

- [ ] **Step 7: Deploy and verify**

SSH, pull, migrate, clear cache. Test by creating a DCR via desk with `lead_generated` checked → verify Lead is auto-created and `dcr.lead` is set.

- [ ] **Step 8: Commit**

```bash
git add vaishali/api/linking.py vaishali/hooks.py vaishali/api/field.py
git commit -m "feat: add auto-linking hooks for DCR → Lead → Opportunity → Quotation → SO"
```

---

## Task 3: Enhanced PWA Checkout Flow

**Files:**
- Modify: `vaishali/api/field.py` — expand `checkout_dcr` signature
- Modify: `vaishali/public/field/screens/visits.js` — outcome fields in checkout UI

- [ ] **Step 1: Expand `checkout_dcr` API in `field.py`**

Update the function signature and body at `field.py:137`:

```python
@frappe.whitelist(methods=["POST"])
def checkout_dcr(dcr_id, check_out_time=None, check_out_gps=None, remarks=None,
                 status="Completed", lead_generated=0, opportunity_generated=0,
                 order_received=0, discussion_remarks=None, next_action=None,
                 next_action_date=None):
    emp = _get_employee()
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.employee != emp.name:
        frappe.throw(_("You do not have access to this visit"), frappe.PermissionError)
    if doc.status == "Completed":
        frappe.throw(_("DCR already completed"))
    doc.status = status
    if check_out_time: doc.check_out_time = check_out_time
    if check_out_gps: doc.check_out_gps = check_out_gps
    if remarks: doc.remarks = remarks
    # Outcome fields
    doc.lead_generated = int(lead_generated)
    doc.opportunity_generated = int(opportunity_generated)
    doc.order_received = int(order_received)
    if discussion_remarks: doc.discussion_remarks = discussion_remarks
    if next_action: doc.next_action = next_action
    if next_action_date: doc.next_action_date = next_action_date
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()
```

- [ ] **Step 2: Update visits.js checkout UI**

In `visits.js`, replace the simple checkout button (around line 678) with an outcome form that appears before confirming checkout. The form shows conditional fields based on `visit_purpose`:

- For "Cold Call / New Enquiry" or "Lead Follow-up": show lead_generated + opportunity_generated toggles
- For "Opportunity Follow-up": show opportunity_generated + order_received toggles
- For "Quotation Follow-up": show order_received toggle
- All: show discussion_remarks textarea + next_action textarea + next_action_date input

The checkout flow becomes:
1. User taps "Check out"
2. A bottom sheet (`UI.bottomSheet`) appears with outcome fields
3. User fills outcomes, taps "Confirm checkout"
4. GPS captured, PUT sent with all fields

- [ ] **Step 3: Update `get_dcr` and `get_dcrs` to return new fields**

In `field.py`, add the new fields to the `fields` list in `get_dcrs` (line 99) and ensure `get_dcr` returns them (it already returns `doc.as_dict()`).

Add to `get_dcrs` fields list:
```python
"lead_generated", "opportunity_generated", "order_received",
"discussion_remarks", "next_action", "next_action_date",
"opportunity", "quotation", "sales_order", "conversion_status"
```

- [ ] **Step 4: Deploy, test checkout with outcome fields**

- [ ] **Step 5: Commit**

```bash
git add vaishali/api/field.py vaishali/public/field/screens/visits.js
git commit -m "feat: add outcome fields to PWA checkout flow"
```

---

## Task 4: Desk Customer Timeline

**Files:**
- Modify: `vaishali/public/js/customer.js`

- [ ] **Step 1: Add timeline section to Customer form**

Extend `customer.js` to add a "Sales Timeline" HTML section in the form dashboard. On `refresh`, fetch 5 doc types in parallel (DCRs, Leads, Opportunities, Quotations, Sales Orders for this customer), merge, sort by date, render as timeline HTML.

```javascript
frappe.ui.form.on('Customer', {
    refresh(frm) {
        if (frm.doc.__islocal) return;

        // ... existing lifetime value + outstanding indicators ...

        // Sales Timeline
        render_sales_timeline(frm);
    }
});

function render_sales_timeline(frm) {
    let customer = frm.doc.name;
    let customer_name = frm.doc.customer_name;

    Promise.all([
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Daily Call Report', filters: { customer: customer },
            fields: ['name', 'date', 'visit_purpose', 'employee_name', 'status',
                     'conversion_status', 'check_in_time', 'check_out_time'],
            order_by: 'date desc', limit_page_length: 30
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Opportunity', filters: { party_name: customer },
            fields: ['name', 'creation', 'opportunity_amount', 'status', 'source'],
            order_by: 'creation desc', limit_page_length: 20
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Quotation', filters: { party_name: customer, docstatus: ['<', 2] },
            fields: ['name', 'transaction_date', 'grand_total', 'status', 'quotation_temperature'],
            order_by: 'transaction_date desc', limit_page_length: 20
        }}),
        frappe.call({ method: 'frappe.client.get_list', args: {
            doctype: 'Sales Order', filters: { customer: customer, docstatus: 1 },
            fields: ['name', 'transaction_date', 'grand_total', 'status'],
            order_by: 'transaction_date desc', limit_page_length: 20
        }})
    ]).then(([dcrs, opps, quotes, orders]) => {
        let events = [];
        // Map each to {date, type, name, summary, status_color}
        // ... (merge and sort by date desc) ...
        // Render as HTML in frm.dashboard or a custom section
        let html = build_timeline_html(events);
        // Add to form
        if (!frm.timeline_section) {
            frm.timeline_section = frm.add_custom_section('Sales Timeline');
        }
        $(frm.timeline_section).html(html);
    });
}
```

Full implementation details: each event type renders with an icon, title, subtitle, date, and status pill. Timeline is capped at 50 events.

- [ ] **Step 2: Deploy, verify on desk**

Open a customer with DCR visits → confirm timeline shows.

- [ ] **Step 3: Commit**

```bash
git add vaishali/public/js/customer.js
git commit -m "feat: add sales timeline to Customer desk form"
```

---

## Task 5: Quotation Lost Reason Integration

**Files:**
- Modify: `vaishali/public/js/quotation.js`

- [ ] **Step 1: Update Mark as Lost dialog**

In `quotation.js`, update the "Mark as Lost" dialog to also set `quotation_temperature`, `lost_reason_category`, and `lost_remark`:

Replace the `lost_reason` field options with the new categories, and add `lost_remark`. On submit, set `quotation_temperature = "Lost"` alongside `status = "Lost"`.

```javascript
fields: [
    {
        fieldname: 'lost_reason_category',
        label: 'Lost Reason',
        fieldtype: 'Select',
        options: '\nPrice\nTechnical\nBudget related\nOther',
        reqd: 1
    },
    {
        fieldname: 'competitor',
        label: 'Lost To Competitor',
        fieldtype: 'Data'
    },
    {
        fieldname: 'lost_remark',
        label: 'Remarks',
        fieldtype: 'Small Text'
    }
],
primary_action(values) {
    let update_fields = {
        'status': 'Lost',
        'quotation_temperature': 'Lost'
    };
    if (frm.fields_dict.lost_reason_category) {
        update_fields['lost_reason_category'] = values.lost_reason_category;
    }
    if (frm.fields_dict.lost_remark) {
        update_fields['lost_remark'] = values.lost_remark || '';
    }
    if (frm.fields_dict.lost_to_competitor) {
        update_fields['lost_to_competitor'] = values.competitor || '';
    }
    // ... frappe.call to set_value ...
}
```

- [ ] **Step 2: Commit**

```bash
git add vaishali/public/js/quotation.js
git commit -m "feat: integrate lost reason categories into Mark as Lost dialog"
```

---

## Task 6: PWA Customer Timeline Screen

**Files:**
- Create: `vaishali/public/field/screens/customer-timeline.js`
- Modify: `vaishali/public/field/app.js` — add route
- Modify: `vaishali/public/field/screens/customer-detail.js` — add button
- Modify: `vaishali/api/field.py` — add `get_customer_timeline` endpoint
- Modify: `vaishali/www/field.html` — add script tag

- [ ] **Step 1: Add `get_customer_timeline` API endpoint**

In `field.py`, add:

```python
@frappe.whitelist()
def get_customer_timeline(customer_id):
    """Get merged timeline of visits, leads, opportunities, quotations, orders for a customer."""
    events = []

    # DCR visits
    dcrs = frappe.get_list("Daily Call Report",
        filters={"customer": customer_id},
        fields=["name", "date", "visit_purpose", "employee_name", "status",
                "conversion_status", "check_in_time", "check_out_time",
                "discussion_remarks", "next_action"],
        order_by="date desc", limit_page_length=50)
    for d in dcrs:
        events.append({"type": "visit", "date": str(d.date), "data": d})

    # Opportunities
    opps = frappe.get_list("Opportunity",
        filters={"party_name": customer_id},
        fields=["name", "creation", "opportunity_amount", "status", "source"],
        order_by="creation desc", limit_page_length=20)
    for o in opps:
        events.append({"type": "opportunity", "date": str(o.creation)[:10], "data": o})

    # Quotations
    quotes = frappe.get_list("Quotation",
        filters={"party_name": customer_id, "docstatus": ["<", 2]},
        fields=["name", "transaction_date", "grand_total", "status", "quotation_temperature"],
        order_by="transaction_date desc", limit_page_length=20)
    for q in quotes:
        events.append({"type": "quotation", "date": str(q.transaction_date), "data": q})

    # Sales Orders
    orders = frappe.get_list("Sales Order",
        filters={"customer": customer_id, "docstatus": 1},
        fields=["name", "transaction_date", "grand_total", "status"],
        order_by="transaction_date desc", limit_page_length=20)
    for so in orders:
        events.append({"type": "order", "date": str(so.transaction_date), "data": so})

    # Sort by date descending
    events.sort(key=lambda e: e["date"], reverse=True)
    return events[:50]
```

- [ ] **Step 2: Create `customer-timeline.js` PWA screen**

New file at `vaishali/public/field/screens/customer-timeline.js`. Uses `UI.listCard` with icons for each event type, conversion status pills, expandable details.

- [ ] **Step 3: Add route in `app.js`**

After the `#/customer/:id` route:

```javascript
{ pattern: '#/customer-timeline/:id', handler: function (p) { S().customerTimeline(appEl, p); }, tab: 'home', title: 'Sales Timeline', back: function(p) { return '#/customer/' + p.id; } },
```

- [ ] **Step 4: Add "Sales Timeline" button in `customer-detail.js`**

After the info card section, add:

```javascript
appEl.appendChild(UI.btn('Sales Timeline', {
  type: 'outline',
  block: true,
  onClick: function () { location.hash = '#/customer-timeline/' + encodeURIComponent(customerId); }
}));
```

- [ ] **Step 5: Add script tag in `field.html`**

Add `<script defer src="/assets/vaishali/field/screens/customer-timeline.js?v={{ _v }}"></script>`

- [ ] **Step 6: Deploy, test PWA customer timeline**

- [ ] **Step 7: Commit**

```bash
git add vaishali/api/field.py vaishali/public/field/screens/customer-timeline.js \
       vaishali/public/field/app.js vaishali/public/field/screens/customer-detail.js \
       vaishali/www/field.html
git commit -m "feat: add customer sales timeline screen to PWA"
```

---

## Task 7: Conversion Funnel — View Engine + Monthly Report + Workspace

**Files:**
- Modify: `vaishali/views/registry.py` — add `conversion_funnel` view
- Modify: `vaishali/api/field.py` — add `get_conversion_funnel` endpoint for PWA
- Modify: `vaishali/public/field/screens/monthly-report.js` — add funnel section
- Modify: `vaishali/setup_workspace.py` — add funnel Number Cards

- [ ] **Step 1: Add `conversion_funnel` view to registry**

In `registry.py`, add a new view that counts DCRs by conversion_status:

```python
"conversion_funnel": {
    "description": "Sales conversion funnel — visits to wins by stage",
    "context_doctype": None,
    "sections": {
        "sales": ["funnel_data"],
        "manager": ["funnel_data"],
        "admin": ["*"],
    },
    "section_defs": {
        "funnel_data": {
            "doctype": "Daily Call Report",
            "fields": ["name", "date", "conversion_status", "employee_name",
                       "customer", "visit_purpose", "department"],
            "filters": [["date", ">=", "month_start"]],
            "order_by": "date desc",
            "limit": 500,
            "skip_company_filter": True,
        },
    },
},
```

- [ ] **Step 2: Add `get_conversion_funnel` API endpoint**

In `field.py`:

```python
@frappe.whitelist()
def get_conversion_funnel(period="month", employee=None, department=None):
    """Get conversion funnel counts for DCR visits."""
    from frappe.utils import today, get_first_day, getdate, add_months

    filters = {}
    if period == "month":
        filters["date"] = [">=", get_first_day(today())]
    elif period == "quarter":
        # Last 3 months
        filters["date"] = [">=", add_months(get_first_day(today()), -2)]
    elif period == "fy":
        fy_start = "2026-04-01" if getdate(today()).month >= 4 else "2025-04-01"
        filters["date"] = [">=", fy_start]

    if employee:
        filters["employee"] = employee
    if department:
        filters["department"] = department

    total = frappe.db.count("Daily Call Report", filters)
    leads = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Lead Created", "Opportunity", "Quoted", "Won"]]})
    opportunities = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Opportunity", "Quoted", "Won"]]})
    quoted = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Quoted", "Won"]]})
    won = frappe.db.count("Daily Call Report", {**filters, "conversion_status": "Won"})
    lost = frappe.db.count("Daily Call Report", {**filters, "conversion_status": "Lost"})

    return {
        "visits": total,
        "leads": leads,
        "opportunities": opportunities,
        "quoted": quoted,
        "won": won,
        "lost": lost,
    }
```

- [ ] **Step 3: Add funnel section to `monthly-report.js`**

After the existing KPI section, add a "Conversion Funnel" section that calls `get_conversion_funnel` and renders using `UI.kpiRow` + simple bar visualization.

- [ ] **Step 4: Add Number Cards to DSPL Sales workspace**

In `setup_workspace.py`, add:
- "Visits This Month" Number Card (count DCR where date >= month_start)
- "Leads Generated" Number Card (count DCR where conversion_status in relevant statuses)
- "Win Rate" Number Card (Won / total * 100)

- [ ] **Step 5: Deploy, verify funnel on desk + PWA**

- [ ] **Step 6: Commit**

```bash
git add vaishali/views/registry.py vaishali/api/field.py \
       vaishali/public/field/screens/monthly-report.js vaishali/setup_workspace.py
git commit -m "feat: add conversion funnel to View Engine, PWA monthly report, and desk workspace"
```

---

## Task 8: Bump SW Cache + Final Deploy

**Files:**
- Modify: `vaishali/public/field/sw.js` — bump CACHE_NAME version

- [ ] **Step 1: Bump SW version**

In `sw.js`, increment the CACHE_NAME from current version (v24) to v25.

- [ ] **Step 2: Full deploy to EC2**

```bash
# SSH in
aws ec2-instance-connect send-ssh-public-key ...
ssh ...

# Deploy
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com migrate'
redis-cli FLUSHALL
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web

# Run setup scripts
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.api.linking.setup_dcr_fields'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.api.linking.setup_quotation_fields'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.api.linking.migrate_existing_dcrs'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.setup_workspace.setup'
redis-cli FLUSHALL
```

- [ ] **Step 3: End-to-end test**

1. Create a DCR visit via PWA → check out with "Lead generated" checked → verify Lead created
2. Create Opportunity from that Lead → verify DCR linked
3. Create Quotation from Opportunity → verify DCR updated to "Quoted"
4. Submit Sales Order from Quotation → verify DCR shows "Won"
5. Check customer timeline on desk + PWA
6. Check conversion funnel in monthly report

- [ ] **Step 4: Final commit**

```bash
git add vaishali/public/field/sw.js
git commit -m "chore: bump SW to v25 for DCR sales linking release"
```
