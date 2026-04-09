# API Layer

57 whitelist endpoints in `field.py`, View Engine in `views.py`, AI chat in `chat.py`, DCR-to-Sales linking in `linking.py`.

## Security Model

All endpoints in `field.py` enforce:
- **Ownership checks:** `get_dcr()`, `checkout_dcr()` verify `doc.employee == current_employee`
- **Role gates:** `create_stock_entry()` blocked for field tier; `create_quotation()` requires sales/marketing dept or manager+
- **Approver verification:** `process_approval()` checks `doc.leave_approver`/`doc.expense_approver`/reporting hierarchy
- **Data scoping:** `get_approvals()` Employee Advances filtered by direct reports only
- **Service-only endpoints:** `verify_telegram_token()` restricted to service account

## Auth Model

- **Browser → Frappe:** Cookie auth (native Frappe session)
- **FastAPI → Frappe:** API key pair + Host header (vaishali@frappeflo.com service account)
- **Nav tiers:** `field` (basic staff), `manager` (HR/Sales/Stock managers), `admin` (System Manager)
- **View Engine:** Role-based section filtering (sales/field/accounts/service/manager/admin)

## API Path Translation

PWA uses clean paths translated to Frappe methods in `api.js`:

| PWA Path | Frappe Method |
|----------|--------------|
| `GET /api/field/attendance/today` | `vaishali.api.field.attendance_today` |
| `POST /api/field/attendance` | `vaishali.api.field.create_checkin` |
| `POST /api/field/dcr` | `vaishali.api.field.create_dcr` |
| `POST /api/field/dcr/{id}/checkout` | `vaishali.api.field.checkout_dcr` (extracts dcr_id from path) |
| `GET /api/field/customers` | `vaishali.api.field.get_customers` (all 1,896, no limit) |
| `GET /api/field/view/customer_360/{id}` | View Engine (overview + addresses + contacts + transactions) |
| `GET /api/field/view/X` | `vaishali.api.views.get_view?view_name=X` |
| `POST /api/field/lead` | `vaishali.api.field.create_lead` |
| `POST /api/field/quotations` | `vaishali.api.field.create_quotation` |
| `GET /api/field/sales-targets` | `vaishali.api.field.get_sales_targets` |
| `GET /api/field/sales-funnel` | `vaishali.api.field.get_sales_funnel` |
| `GET /api/field/monthly-report` | `vaishali.api.field.get_monthly_report` |
| `GET /api/field/customer-timeline/{id}` | `vaishali.api.field.get_customer_timeline` |
| `GET /api/field/conversion-funnel` | `vaishali.api.field.get_conversion_funnel` |
| `GET /api/field/sales-orders` | `vaishali.api.field.get_sales_orders` |
| `POST /api/field/sales-orders` | `vaishali.api.field.create_sales_order_from_quotation` |
| `GET /api/field/submitted-quotations` | `vaishali.api.field.get_submitted_quotations` |
| `GET /api/field/delivery-notes` | `vaishali.api.field.get_delivery_notes` |
| `POST /api/field/delivery-notes` | `vaishali.api.field.create_delivery_note_from_so` |
| `GET /api/field/pending-delivery-orders` | `vaishali.api.field.get_pending_delivery_orders` |
| `GET /api/field/sales-invoices` | `vaishali.api.field.get_sales_invoices` |
| `POST /api/field/sales-invoices` | `vaishali.api.field.create_sales_invoice` |
| `GET /api/field/billable-documents` | `vaishali.api.field.get_billable_documents` |
| `GET /api/field/unpaid-invoices` | `vaishali.api.field.get_unpaid_invoices` |
| `POST /api/field/payments` | `vaishali.api.field.create_payment_entry` |
| `GET /api/field/customer-open-items` | `vaishali.api.field.get_customer_open_items` |
| `GET /api/field/opportunities` | `vaishali.api.field.get_opportunities` |
| `POST /api/field/opportunities` | `vaishali.api.field.create_opportunity_from_lead` |
| `GET /api/field/opportunity/:id` | `vaishali.api.field.get_opportunity` |
| `GET /api/field/lead-sources` | `vaishali.api.field.get_lead_sources` |
| `GET /api/field/interactions` | `vaishali.api.field.get_interactions` |
| `POST /api/field/interactions` | `vaishali.api.field.create_interaction` |
| `GET /api/field/interaction/:id` | `vaishali.api.field.get_interaction` |
| `POST /api/ai/chat` | FastAPI (nginx proxy, 120s timeout) |

## DCR-to-Sales Linking (`linking.py`)

Auto-links Daily Call Reports through the full sales chain: Visit → Lead → Opportunity → Quotation → Sales Order.

### How It Works
- **DCR checkout** captures outcome checkboxes (lead_generated, opportunity_generated, order_received) + discussion/next-action fields via bottom sheet in PWA
- **on_dcr_update** hook auto-creates Lead (if lead_generated=1) and Opportunity (if opportunity_generated=1), sets conversion_status
- **link_quotation_to_dcr** on Quotation submit backlinks to matching DCR via Opportunity or customer+90-day window
- **link_sales_order_to_dcr** on SO submit backlinks via linked Quotation or customer+90-day fallback
- **on_customer_created** retroactively links new Customer to recent DCR visits
- **on_quotation_status_change** updates DCR conversion_status when Quotation wins/loses

### DCR Custom Fields (14 fields)
`lead_generated`, `opportunity_generated`, `order_received` (checkboxes), `discussion_remarks`, `next_action`, `next_action_date`, `lead`, `opportunity`, `quotation`, `sales_order` (Link fields), `conversion_status` (Select: Open/Lead Created/Opportunity/Quoted/Won/Lost), `follow_up_doctype`, `follow_up_name` (Data, hidden — set when rep picks a lead/opp/quote to follow up on during visit creation; auto-wires to corresponding Link field)

### Quotation Custom Fields (3 fields)
`quotation_temperature` (Select: Hot/Warm/Cold/Lost), `lost_reason_category` (Select: Price/Technical/Budget/Other), `lost_remark` (Small Text)

### CRM Flow: DCR Follow-up Linking
When a field rep creates a follow-up visit (purpose contains "Follow-up") and selects a customer, the PWA fetches `get_customer_open_items` showing open leads/quotations/opportunities. The rep picks which one they're visiting about. On check-in:
- `follow_up_doctype` + `follow_up_name` are set (Data fields, hidden)
- The corresponding Link field (`lead`/`opportunity`/`quotation`) is also set automatically
- This connects the visit to the existing `linking.py` conversion chain

**Lead → Opportunity:** `create_opportunity_from_lead` uses `erpnext.crm.doctype.lead.lead.make_opportunity`
**Opportunity → Quotation:** Navigates to `#/quotations/new?opportunity=X&customer=Y` with pre-fill
**Lead → Quotation:** Navigates to `#/quotations/new?lead=X&lead_name=Y` with pre-fill

### Conversion Funnel API
`get_conversion_funnel(period, employee, department)` — counts DCRs by conversion_status stage, returns `{visits, leads, opportunities, quoted, won, lost}`. Used by monthly-report.js and View Engine `conversion_funnel` view.

### Setup Functions (idempotent)
```bash
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_dcr_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_quotation_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.migrate_existing_dcrs
```

## Gotchas

- **Lead/Opportunity `notes` field** is a **child table** (Table field). Use `doc.append("notes", {"note": "..."})`, NOT `doc.notes = "..."`. The latter causes `'str' object has no attribute 'modified'`.
- **`doc.set(field, value)`** silently ignores fields not on the DocType — always verify custom fields exist before relying on persistence
- **Number Card `filters_json`** does NOT evaluate `"today"` — use `dynamic_filters_json` with `"frappe.datetime.nowdate()"`
- **Lead Source** is a DocType (not a Select) — dropdown must fetch from `get_lead_sources` API, not hardcode
- **DCR department validation** only accepts Sales/Service/Office; admin users with other departments need fallback
