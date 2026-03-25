# DCR-to-Sales Order Linking — Design Spec (v2)

**Date:** 2026-03-25
**Status:** Approved
**Author:** Claude (Vaishali project)
**Review:** v2 — addressed spec review findings

## Problem

Daily Call Reports (DCR) are disconnected from downstream sales documents. There's no way to trace a field visit through to a sales order. The team currently tracks this in an Excel template ("Sales Field Report.xlsx") with structured outcome questions per visit.

## Goal

Digitize the Excel-based Sales Field Report flow into ERPNext + Vaishali PWA. Enable automatic linking: Visit → Lead → Opportunity → Quotation → Sales Order. Surface the full chain on desk, PWA, and as a conversion funnel dashboard.

## Approach

Custom fields on DCR + doc_event hooks for auto-linking. No new DocTypes — uses existing ERPNext Lead, Opportunity, Quotation, Sales Order. Matches the team's existing Excel workflow.

## 1. New Fields on Daily Call Report

DCR already has a `lead` Link field (idx 11) and `remarks` (idx 30). We keep both — `discussion_remarks` captures per-visit outcome notes while `remarks` remains the general checkout field.

| Field | Fieldname | Type | Options | After | Notes |
|---|---|---|---|---|---|
| Visit Outcome | `outcome_section` | Section Break | — | `section_notes` | Groups all outcome fields |
| Lead generated? | `lead_generated` | Check | — | `outcome_section` | `depends_on: eval:["Cold Call / New Enquiry","Lead Follow-up"].includes(doc.visit_purpose)` |
| Opportunity generated? | `opportunity_generated` | Check | — | `lead_generated` | `depends_on: eval:["Cold Call / New Enquiry","Lead Follow-up","Opportunity Follow-up"].includes(doc.visit_purpose)` |
| Order received? | `order_received` | Check | — | `opportunity_generated` | `depends_on: eval:doc.visit_purpose=="Quotation Follow-up"` |
| Discussion / Remark | `discussion_remarks` | Text | — | `order_received` | Always visible. Text (not Small Text) for longer sales notes. |
| Next action | `next_action` | Small Text | — | `discussion_remarks` | Always visible |
| Next action date | `next_action_date` | Date | — | `next_action` | Always visible |
| Column Break | `col_break_outcome` | Column Break | — | `next_action_date` | — |
| Opportunity | `opportunity` | Link | Opportunity | `col_break_outcome` | Auto-set by hooks, read_only: 1 |
| Quotation | `quotation` | Link | Quotation | `opportunity` | Auto-set by hooks, read_only: 1 |
| Sales Order | `sales_order` | Link | Sales Order | `quotation` | Auto-set by hooks, read_only: 1 |
| Conversion Status | `conversion_status` | Select | Open\nLead Created\nOpportunity\nQuoted\nWon\nLost | `sales_order` | Auto-updated by hooks, read_only: 1 |

**Visit purpose update:** Add "Opportunity Follow-up" to the existing Select options:
```
Cold Call / New Enquiry
Lead Follow-up
Opportunity Follow-up    ← NEW
Quotation Follow-up
Order Follow-up
Recovery
Relationship Building
```

## 2. Quotation Status Fields

Add Custom Fields on Quotation DocType:

| Field | Fieldname | Type | Options | Insert After | Default | Notes |
|---|---|---|---|---|---|---|
| Quotation Temperature | `quotation_temperature` | Select | New\nHot\nWarm\nCold\nWill take time\nWon\nLost\nClosed\nModified | `status` | New | Not mandatory |
| Lost Reason | `lost_reason_category` | Select | Price\nTechnical\nBudget related\nOther | `quotation_temperature` | — | `depends_on: eval:doc.quotation_temperature=="Lost"` |
| Lost Remark | `lost_remark` | Small Text | — | `lost_reason_category` | — | `depends_on: eval:doc.quotation_temperature=="Lost"` |

When temperature is set to "Lost", the lost reason and remark fields appear. Matches the updated "Quotation status report" Excel sheet which breaks Lost into: Price / Technical / Budget related / Other + Remark.

**Note:** ERPNext Quotation already has a "Mark as Lost" dialog (our `quotation.js` client script) with `lost_reason` and `lost_to_competitor` fields. The new `lost_reason_category` provides structured categorization (Price/Technical/Budget/Other) while the existing fields capture free-text detail.

## 3. Auto-linking Hook Logic

### Removing existing `on_dcr_update` hook

The current `on_dcr_update` (field.py:471) auto-creates Leads implicitly on any completed DCR with a prospect. This is replaced by the explicit checkbox-driven approach below. Remove `on_dcr_update` from hooks.py doc_events and delete the function.

### hooks.py doc_events registration

```python
doc_events = {
    "Daily Call Report": {
        "on_update": "vaishali.api.linking.on_dcr_update"
    },
    "Quotation": {
        "on_submit": "vaishali.api.linking.link_quotation_to_dcr"
    },
    "Sales Order": {
        "on_submit": "vaishali.api.linking.link_sales_order_to_dcr"
    },
    "Customer": {
        "after_insert": "vaishali.api.linking.on_customer_created"
    }
}
```

New file: `vaishali/api/linking.py` — all auto-linking logic lives here.

### 3a. On DCR checkout (enhanced `checkout_dcr` in `field.py`)

Expand `checkout_dcr` signature to accept outcome fields:

```python
def checkout_dcr(dcr_id, check_out_time=None, check_out_gps=None, remarks=None,
                 status="Completed", lead_generated=0, opportunity_generated=0,
                 order_received=0, discussion_remarks=None, next_action=None,
                 next_action_date=None):
```

After saving the doc, the `on_update` doc_event triggers `linking.on_dcr_update` which handles auto-creation:

### 3b. `linking.on_dcr_update` — Auto-create Lead/Opportunity

```python
def on_dcr_update(doc, method):
    if doc.status != "Completed":
        return

    # Lead creation (checkbox-driven, replaces old implicit logic)
    if doc.lead_generated and not doc.lead:
        if doc.prospect_name and not frappe.db.exists("Lead", {"lead_name": doc.prospect_name}):
            lead = frappe.new_doc("Lead")
            lead.lead_name = doc.prospect_name
            lead.company_name = doc.get("prospect_company") or ""
            lead.mobile_no = doc.get("prospect_phone") or ""
            lead.source = "Campaign"
            lead.notes = f"Auto-created from visit {doc.name} on {doc.date}"
            lead.insert(ignore_permissions=True)
            doc.db_set("lead", lead.name)
            doc.db_set("conversion_status", "Lead Created")

    # Opportunity creation
    if doc.opportunity_generated and not doc.opportunity:
        opp = frappe.new_doc("Opportunity")
        opp.opportunity_from = "Lead" if doc.lead else "Customer"
        opp.party_name = doc.lead if doc.lead else doc.customer
        opp.source = "Campaign"
        opp.notes = f"From visit {doc.name} on {doc.date}"
        opp.insert(ignore_permissions=True)
        doc.db_set("opportunity", opp.name)
        doc.db_set("conversion_status", "Opportunity")

    # Order received
    if doc.order_received and doc.conversion_status not in ("Won",):
        doc.db_set("conversion_status", "Won")

    # Default status
    if not doc.conversion_status:
        doc.db_set("conversion_status", "Open")

    frappe.db.commit()
```

**Precedence for Opportunity creation when no Lead or Customer:**
1. If `lead` field is set → `opportunity_from = "Lead"`
2. If `customer` field is set → `opportunity_from = "Customer"`
3. If only prospect info → auto-create Lead first (set `lead_generated`), then create Opportunity from that Lead

### 3c. `linking.link_quotation_to_dcr` — On Quotation submit

```python
def link_quotation_to_dcr(doc, method):
    # Primary: match via Opportunity
    if doc.opportunity:
        dcrs = frappe.get_all("Daily Call Report",
            filters={"opportunity": doc.opportunity, "quotation": ["is", "not set"]},
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "quotation": doc.name,
                "conversion_status": "Quoted"
            })
        if dcrs:
            return

    # Fallback: customer + 90-day window before quotation date
    if doc.party_name:
        dcrs = frappe.get_all("Daily Call Report",
            filters={
                "customer": doc.party_name,
                "quotation": ["is", "not set"],
                "date": [">=", frappe.utils.add_days(doc.transaction_date, -90)]
            },
            order_by="date desc",
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "quotation": doc.name,
                "conversion_status": "Quoted"
            })
```

**90-day window clarified:** 90 days backwards from the quotation's `transaction_date`. Links ALL matching DCRs (not just the most recent) since multiple visits may have contributed to one quotation.

**Multiple quotations from one Opportunity:** Each new quotation links to any DCRs that don't already have a quotation set. If all DCRs are already linked, the new quotation gets no DCR links (which is correct — the visits led to the first quotation, not the revised one).

### 3d. `linking.link_sales_order_to_dcr` — On Sales Order submit

```python
def link_sales_order_to_dcr(doc, method):
    # Primary: match via linked Quotation items
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
            })
        if dcrs:
            return

    # Fallback: customer + 90 days before SO date
    if doc.customer:
        dcrs = frappe.get_all("Daily Call Report",
            filters={
                "customer": doc.customer,
                "sales_order": ["is", "not set"],
                "date": [">=", frappe.utils.add_days(doc.transaction_date, -90)]
            },
            order_by="date desc",
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, {
                "sales_order": doc.name,
                "conversion_status": "Won"
            })
```

### 3e. `linking.on_customer_created` — Retroactive linking on Lead conversion

Lead conversion in ERPNext creates a Customer doc. We hook into `Customer.after_insert` and trace back to the Lead:

```python
def on_customer_created(doc, method):
    # Find lead that was converted to this customer
    lead_name = frappe.db.get_value("Lead", {
        "lead_name": doc.customer_name,
        "status": "Converted"
    }, "name")

    if not lead_name:
        return

    # Retroactively set customer on all DCRs linked to this lead
    dcrs = frappe.get_all("Daily Call Report",
        filters={"lead": lead_name, "customer": ["is", "not set"]},
        pluck="name")
    for dcr_name in dcrs:
        frappe.db.set_value("Daily Call Report", dcr_name, "customer", doc.name)
```

### 3f. On Quotation status change — Lost handling

When a quotation is marked as Lost (via the existing "Mark as Lost" dialog in `quotation.js`), update linked DCRs:

```python
# In hooks.py doc_events, add:
"Quotation": {
    "on_submit": "vaishali.api.linking.link_quotation_to_dcr",
    "on_update_after_submit": "vaishali.api.linking.on_quotation_status_change"
}
```

```python
def on_quotation_status_change(doc, method):
    if doc.status == "Lost":
        dcrs = frappe.get_all("Daily Call Report",
            filters={"quotation": doc.name, "conversion_status": ["!=", "Won"]},
            pluck="name")
        for dcr_name in dcrs:
            frappe.db.set_value("Daily Call Report", dcr_name, "conversion_status", "Lost")
```

### 3g. Conditional field visibility

| Visit Purpose | Visible Outcome Fields |
|---|---|
| Cold Call / New Enquiry | `lead_generated`, `opportunity_generated` |
| Lead Follow-up | `lead_generated`, `opportunity_generated` |
| Opportunity Follow-up | `opportunity_generated`, `order_received` |
| Quotation Follow-up | `order_received` |
| Order Follow-up | — |
| Recovery | — |
| Relationship Building | — |

All purposes: `discussion_remarks`, `next_action`, `next_action_date`, plus the read-only link fields and `conversion_status`.

**Desk:** `depends_on` eval expressions on Custom Fields (listed in Section 1 table).
**PWA:** Conditional rendering in `visits.js` checkout flow — show/hide fields based on `visit_purpose` value.

## 4. Desk: Customer Timeline

Client script on Customer DocType (`public/js/customer.js`, extend existing). Adds an HTML section in the dashboard area.

Fetches via 5 parallel API calls:
- DCRs: `filters={"customer": customer_name}`, limit 50, order by date desc
- Leads: `filters={"company_name": customer_name}` or dynamic link
- Opportunities: `filters={"party_name": customer_name}`
- Quotations: `filters={"party_name": customer_name}`, limit 50
- Sales Orders: `filters={"customer": customer_name}`, limit 50

Merges all results, sorts by date descending, renders as timeline. Hard limit: 50 most recent events to avoid performance issues on high-volume customers.

```
━━ Visit (DCR-2026-03-00221) ─ 20 Mar 2026 ━━
   Cold Call by Aniket · 2h 15m · Lead Created

━━ Lead (LEAD-00045) ─ 20 Mar 2026 ━━
   Auto-created from visit

━━ Opportunity (OPP-00012) ─ 22 Mar 2026 ━━
   ACD DTC 3300 PRO · From Lead LEAD-00045

━━ Quotation (QTN-00089) ─ 28 Mar 2026 ━━
   ₹4,50,000 · Hot

━━ Sales Order (SO-00012) ─ 10 Apr 2026 ━━
   ₹4,50,000 · Won
```

## 5. PWA: Customer History Screen

**Route:** `#/customer-history/:id`
**Access:** From `customer-detail.js` via "Sales Timeline" button.

Renders the same chronological timeline in Notion-inspired PWA style:
- Each entry is a `UI.listCard` with:
  - Left: icon (visit=person, lead=target, opportunity=lightbulb, quotation=doc, order=check)
  - Center: title + subtitle (purpose, remarks, amount)
  - Right: date + conversion status pill
- Tapping expands inline details (remarks, next action, amounts)
- Skeleton loading while fetching

Uses a new API endpoint `get_customer_timeline(customer_id)` in `field.py` that returns all 5 doc types in one call (avoids 5 separate PWA requests).

## 6. Conversion Funnel Dashboard

### View Engine view: `conversion_funnel`

```
Visits (this month)     → 45
  ↓ Lead Created        → 12  (27%)
  ↓ Opportunity         →  8  (67%)
  ↓ Quoted              →  5  (63%)
  ↓ Won                 →  2  (40%)
```

Counts based on `conversion_status` field on DCR records, filtered by date range. Percentages are stage-to-stage conversion rates.

Filterable by: employee, date range (month/quarter/FY), department.

### Desk: DSPL Sales workspace

Add Number Cards:
- Visits This Month (count of DCRs this month)
- Leads Generated (count where conversion_status in Lead Created, Opportunity, Quoted, Won)
- Opportunities Created (count where conversion_status in Opportunity, Quoted, Won)
- Visit-to-Win Rate (Won / total visits × 100)

### PWA: Added to `#/monthly-report`

Add funnel section to existing monthly report using `UI.kpiRow` for the stage counts.

## 7. Data Migration

For the 11 existing DCR records:
- Set `conversion_status = "Open"` on all
- No retroactive linking needed (too few records, all test data)

## 8. PWA Checkout Flow Changes

The `visits.js` checkout flow currently shows: status, remarks, GPS. After this change:

1. Status selection (Completed)
2. **Outcome section** (conditional on visit_purpose):
   - Checkboxes: Lead generated? / Opportunity generated? / Order received?
3. Discussion / Remark (text area)
4. Next action + Next action date
5. Existing: Remarks, GPS

The `checkout_dcr` API call expands to include all new fields.

## Non-goals

- Not building a full CRM pipeline view (use ERPNext Opportunity pipeline for that)
- Not replacing the Quotation list view — just adding temperature field
- Not building notifications for next action dates (future enhancement — would show "Overdue Follow-ups" view)
- "Opportunity Follow-up" purpose is available for all departments (Sales and Service both follow up on opportunities)
