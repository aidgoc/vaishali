# Sales Interaction DocType — Design Spec

**Date:** 2026-04-03
**Status:** Draft
**Author:** Claude (Vaishali project)
**Builds on:** DCR-to-Sales Linking spec (2026-03-25)

---

## Problem

Daily Call Reports (DCR) only capture **physical visits** (GPS check-in/check-out). But most sales follow-ups happen via **phone calls, emails, and WhatsApp** — these interactions are invisible in the system. There's no way to:

1. Log a phone call that advances a deal from "Quoted" to "Verbal Commitment"
2. Track that an email follow-up moved a cold lead to warm
3. Forecast orders based on interaction frequency and outcomes
4. See a complete timeline of ALL touchpoints with a customer (not just visits)

**Current gap:** The conversion funnel (Open → Lead → Opportunity → Quoted → Won) only updates on physical visits. A sales rep who closes a deal over 3 phone calls and 1 visit shows only 1 touchpoint.

---

## Goal

Lightweight `Sales Interaction` DocType that:
- Logs phone/email/WhatsApp follow-ups with the same outcome model as DCR
- Feeds into the existing DCR→Lead→Opportunity→Quotation→SO chain
- Enables order forecasting via conversion stages + temperature
- Shows in a unified timeline alongside DCR visits
- Works in the PWA for field reps logging calls on the go

---

## Why NOT extend Communication DocType

Communication was considered (Option C) but rejected:

| Issue | Impact |
|-------|--------|
| Auto-creates for every system email | Sales interactions buried in noise |
| No Employee link | Breaks DCR→Employee ownership chain |
| Single `reference_doctype` link | Can't link one call to both Lead + Opportunity |
| No docstatus (not submittable) | No approval workflow possible |
| HTML Text Editor for content | Overkill for "called customer, wants revised quote" |

---

## Design

### 1. Sales Interaction DocType

**Module:** Vaishali
**Is Submittable:** Yes (provides audit trail, prevents edits after submission)
**Quick Entry:** Yes
**Track Changes:** Yes
**Naming:** `SI-.YYYY.-.#####` (e.g. SI-2026-00042)

#### Fields

| Field | Fieldname | Type | Options | Required | Notes |
|-------|-----------|------|---------|----------|-------|
| **Interaction Section** | | | | | |
| Date | `date` | Date | | Yes | Defaults to today |
| Channel | `channel` | Select | Phone Call\nEmail\nWhatsApp\nVideo Call\nIn Person | Yes | "In Person" auto-creates from DCR |
| Direction | `direction` | Select | Outgoing\nIncoming | Yes | Did we call them or they call us? |
| Employee | `employee` | Link | Employee | Yes | Auto-set from logged-in user |
| Employee Name | `employee_name` | Data | | | Read-only, fetch from employee |
| Duration (min) | `duration_minutes` | Int | | | Optional — for calls/meetings |
| **Customer Section** | | | | | |
| Customer | `customer` | Link | Customer | | One of customer/lead required |
| Customer Name | `customer_name` | Data | | | Read-only, fetch from customer |
| Lead | `lead` | Link | Lead | | For prospects not yet customers |
| Lead Name | `lead_name` | Data | | | Read-only |
| Contact Person | `contact` | Link | Contact | | Who did you speak with? |
| Contact Phone | `contact_phone` | Data | | | Fetch from contact, tap-to-call in PWA |
| **Outcome Section** | | | | | |
| Purpose | `purpose` | Select | Follow-up\nNew Enquiry\nQuotation Discussion\nNegotiation\nOrder Confirmation\nPayment Follow-up\nRelationship\nComplaint\nOther | Yes | What was the call about? |
| Summary | `summary` | Small Text | | Yes | What was discussed (2-3 lines) |
| Outcome | `outcome` | Select | Positive\nNeutral\nNegative\nNo Response | | Quick classification |
| **Pipeline Section** | | | | | |
| Opportunity | `opportunity` | Link | Opportunity | | Link to existing or auto-created |
| Quotation | `quotation` | Link | Quotation | | Link to active quotation |
| Sales Order | `sales_order` | Link | Sales Order | | Set when order confirmed |
| Conversion Stage | `conversion_stage` | Select | Open\nLead Created\nOpportunity\nProposal Sent\nNegotiation\nVerbal Commitment\nQuoted\nWon\nLost\nStalled | | Auto-updated + manual override |
| Win Probability | `win_probability` | Percent | | | Auto-set from stage, manual override |
| **Next Steps Section** | | | | | |
| Next Action | `next_action` | Small Text | | | What to do next |
| Next Action Date | `next_action_date` | Date | | | When to follow up |
| Follow-up Reminder | `reminder_sent` | Check | | | System: reminder notification sent? |
| **Linking Section** | | | | | |
| Daily Call Report | `daily_call_report` | Link | Daily Call Report | | If this interaction is from a DCR |
| Amended From | `amended_from` | Link | Sales Interaction | | If this corrects a previous entry |

#### Auto-set Win Probability by Stage

| Stage | Default Probability |
|-------|-------------------|
| Open | 5% |
| Lead Created | 10% |
| Opportunity | 20% |
| Proposal Sent | 35% |
| Negotiation | 50% |
| Verbal Commitment | 80% |
| Quoted | 40% |
| Won | 100% |
| Lost | 0% |
| Stalled | 10% |

---

### 2. Conversion Stage Expansion

Current DCR `conversion_status` values are a subset. The new stages add forecasting granularity:

```
Current DCR:    Open → Lead Created → Opportunity → Quoted → Won/Lost
New (expanded): Open → Lead Created → Opportunity → Proposal Sent → Negotiation → Verbal Commitment → Won
                                                                                                    ↓
                                                                                                   Lost
                                                                         (any stage) → Stalled
```

**Backward compatible:** DCR keeps its existing 6 values. Sales Interaction uses the expanded 10 values. The conversion funnel API aggregates both.

---

### 3. DCR Integration

When a DCR is checked out with outcomes:
- Auto-create a `Sales Interaction` record with:
  - `channel = "In Person"`
  - `daily_call_report = dcr.name`
  - `customer = dcr.customer`
  - `employee = dcr.employee`
  - `summary = dcr.discussion_remarks`
  - `next_action = dcr.next_action`
  - `conversion_stage` mapped from `dcr.conversion_status`
- This ensures visits appear in the unified interaction timeline

**DCR remains the primary visit document.** Sales Interaction is the unified timeline view.

---

### 4. Forecasting Model

Value comes from the **linked Quotation** (or Opportunity), not from the interaction itself. No duplicate data entry.

```
Weighted Pipeline = Σ (quotation_amount × win_probability) for all open interactions with linked quotations
```

**Value resolution order:**
1. Linked Quotation → `grand_total`
2. Linked Opportunity → `opportunity_amount`
3. No link → excluded from forecast (interaction exists but no value attached)

**API endpoint:** `vaishali.api.field.get_sales_forecast`

```python
def get_sales_forecast(period="month", employee=None, department=None):
    """Returns weighted pipeline forecast.
    Value pulled from linked Quotation/Opportunity, NOT stored on interaction."""
    # For each open interaction with a linked quotation:
    #   forecast_value = quotation.grand_total × interaction.win_probability
    # Group by stage, employee, product
    # Compare to sales targets
    return {
        "total_pipeline": 1500000,      # Sum of linked quotation values
        "weighted_forecast": 525000,    # Sum of value × probability
        "by_stage": {
            "Opportunity": {"count": 8, "value": 400000, "weighted": 80000},
            "Negotiation": {"count": 3, "value": 600000, "weighted": 300000},
            "Verbal Commitment": {"count": 2, "value": 500000, "weighted": 400000},
        },
        "target": 840000,              # From Sales Target DocType
        "forecast_vs_target": 62.5,    # weighted / target %
    }
```

---

### 5. PWA Screens

#### New: Interactions List (`#/interactions`)
- Filter by: All / My / Team (manager)
- Sort by: Date (newest first)
- Each card: channel icon + customer + summary + outcome pill + next action date
- FAB: "+ Log Interaction"

#### New: Log Interaction Form (`#/interactions/new`)
- Quick form: Channel → Customer/Lead → Purpose → Summary → Outcome → Next Action
- Pre-fill from context: if navigating from customer detail, pre-fill customer
- Pre-fill from follow-up: if coming from a follow-up reminder, pre-fill all links

#### Updated: Customer Timeline (`#/customer-timeline/:id`)
- Currently shows: DCRs, Opportunities, Quotations, SOs
- Add: Sales Interactions (phone/email/WhatsApp icons)
- Unified chronological view of ALL touchpoints

#### Updated: Pipeline Screen (`#/pipeline`)
- Add forecasting bar: "Weighted Pipeline: ₹5.25L / ₹8.4L target (62%)"
- Stage cards show interaction count + value

#### Updated: Home Screen
- New KPI: "Follow-ups Due Today" (interactions with next_action_date = today)

---

### 6. Notification Hooks

| Trigger | Action |
|---------|--------|
| `next_action_date` = today | Push notification + Telegram: "Follow up with {customer} about {summary}" |
| `next_action_date` overdue by 2 days | Escalate to manager |
| `conversion_stage` → Verbal Commitment | Notify sales manager: "Likely order from {customer} ₹{value}" |
| `conversion_stage` → Stalled (no interaction in 14 days) | Auto-set by cron, notify rep |

---

### 7. AI Agent Integration

Add 3 tools to Vaishali AI:

| Tool | Purpose |
|------|---------|
| `log_interaction` | Create Sales Interaction from natural language: "I called Tata Projects, they want revised quote by Friday" |
| `get_interactions` | Fetch interaction history for a customer/lead |
| `get_forecast` | "What's our pipeline looking like this month?" |

Slash command: `/forecast` — shows weighted pipeline vs target

---

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| **Phase 1** | DocType + basic CRUD API + PWA form | 1 day |
| **Phase 2** | DCR auto-creation hook + customer timeline integration | 0.5 day |
| **Phase 3** | Forecasting API + pipeline screen update | 0.5 day |
| **Phase 4** | Notifications + follow-up reminders | 0.5 day |
| **Phase 5** | AI agent tools + /forecast command | 0.5 day |

**Total: ~3 days**

---

## Decisions (2026-04-03)

1. **Submittable:** Yes — provides audit trail, prevents post-submission edits
2. **Backfill:** No — existing DCRs stay as-is, new interactions start fresh
3. **Deal value:** Pulled from linked Quotation/Opportunity — no duplicate field on interaction
4. **Stalled threshold:** 14 days no interaction → auto-Stalled (confirmed for DSPL sales cycle)
