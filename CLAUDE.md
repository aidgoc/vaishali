# CLAUDE.md — Vaishali (DSPL Org OS)

## What This Is

Custom Frappe v15 app for **Dynamic Servitech Private Limited** (DSPL) — a crane rental, industrial equipment sales/service, and manufacturing company. Vaishali is their AI-native ERP layer: a PWA for field staff, a View Engine for composable dashboards, and an AI agent (Claude) for natural language ERP queries.

**Live at:** https://dgoc.logstop.com/field (self-hosted AWS EC2)
**ERPNext desk:** https://dgoc.logstop.com/app
**Frappe Cloud (source):** https://dcepl.logstop.com (data synced to EC2)

## Architecture

```
Browser (PWA)  ──cookie──>  Frappe/ERPNext (gunicorn :8000)
                              ├── vaishali.api.field.*    (32 whitelist endpoints)
                              ├── vaishali.api.views.*    (View Engine)
                              ├── vaishali.api.chat.*     (AI chat)
                              └── vaishali.views.engine   (role-filtered data fetcher)

Browser (PWA)  ──cookie──>  nginx ──/api/ai/*──> FastAPI slim (:8443)
                              ├── ai/chat.py       (Claude brain loop, 120s timeout)
                              ├── ai/tools.py      (5 ERP tool schemas)
                              ├── ai/executor.py   (tool → Frappe API with Host header)
                              ├── ai/prompt.py     (system prompt with full ABP data)
                              ├── telegram/*        (notifications + linking)
                              └── forwards cookie to Frappe for auth
```

### Key Layers

| Layer | Tech | Purpose |
|-------|------|---------|
| **PWA** | Vanilla JS SPA, `el()` DOM builder | 37 screen modules, 58 routes, hash router, standalone PWA |
| **Field API** | `@frappe.whitelist` in `api/field.py` | 42 endpoints with ownership/role checks |
| **Linking** | `api/linking.py` doc_events | DCR → Lead → Opportunity auto-creation + SO/Quotation backlink |
| **View Engine** | `views/registry.py` + `views/engine.py` | 14+ composable views, role-filtered, linked doc enrichment |
| **AI Agent** | `agent/runner.py` (AsyncAnthropic) | Claude with 101 ERPNext tools, knows full ABP |
| **FastAPI slim** | `~/dspl_erp/` on EC2 | Async AI chat + Telegram notifications |

## Company Context (CRITICAL)

- **Company:** Dynamic Servitech Private Limited (DSPL)
- **Business:** Crane safety electronics (SLIs, load monitors, IoT), equipment rental, wire rope testing
- **Products:** ACD, DRM-3400, DJ-1005, E-DASH, F-Dash, WWSI, MRT Systems, TPS
- **BOM Item Prefixes:** Both DSPL and DCEPL use Krisp-derived BK*/BL* codes in BOMs; no EPS/ESS/ERS prefixes
- **Annual Target:** ₹10.09 Crore (FY 2026-27)
- **Sales Team:** Raghuvir, Aniket, NJG, BNG (Bangalore)
- **ERPNext apps:** frappe, erpnext, hrms, india_compliance, payments, vaishali
- **HSN items:** disable, never delete
- **Currency:** INR only, format ₹X,XX,XXX (en-IN locale)
- **Data:** 1,896 customers, 1,807 suppliers, 6,456 items, 8,242 contacts, 189 employees

## BOM Migration from Krisp (2026-03-30)
- Migrated 229 Krisp recipes to ERPNext multi-level BOMs
- Final: 244 BOMs (112 multi-level, 130 flat), 601 sub-assembly links
- ERPNext requires child BOMs to be SUBMITTED before linking via bom_no
- Krisp data: operproditems.bson=recipes, store field->invstoreitems (E* codes)
- Sub-assembly code mapping: Krisp K* -> ERPNext BK* (prefix B), or name match
- Scripts at /tmp/bom_migration.py, /tmp/bom_multilevel.py, /tmp/bom_fix_remaining.py

### BOM Rate Validation Complete (2026-03-30)
**Status:** Production-ready recommendation with HIGH confidence

**Validation Approach:** Spot-checked 12 recipes across 8 product categories (61% coverage) using Path B methodology — cost reasonableness vs. component complexity analysis.

**Sample Coverage:** LOAD (3), D SERIES (2), ANGLE (2), WIND (1), ATB (1), E-DASH (1), E-SLI (1), LR-TM (1)

**Key Findings:**
- Cost range: ₹94.00 (3-component PCB) to ₹11,367.72 (66-component Line Rider)
- All costs proportional to component count and material type
- 10 of 12 recipes submitted BOMs, 2 draft (no cost concerns)
- Zero outliers or suspicious rates detected
- Krisp unsuitable baseline (98.8% zero-rate systemic issue in settsalerates.bson)
- ERPNext confirmed as authoritative source for DSPL operations

**Operational Use:**
- ✅ Quotations and Sales Orders pricing
- ✅ Manufacturing cost tracking
- ✅ Margin analysis and decision-making
- ⚠️ NOT for component-level supplier negotiations (requires supplier invoice data)

**Next Steps:**
1. Submit BKD07001 (₹2,875.72) and BKJ05001 (₹11,367.72) draft BOMs before manufacturing
2. Document BKJ05001 sub-assembly structure
3. Establish supplier cost baseline module for future validations

**Validation Deliverables:**
- `docs/validation/selected_recipes.json` — Recipe selection rationale and sample
- `docs/validation/extracted_boms.json` — Complete BOM component details (2,692 lines)
- `docs/validation/validation_findings.md` — Per-recipe operational context analysis
- `docs/validation/validation_findings.json` — Structured validation data
- `docs/validation/COMPREHENSIVE_VALIDATION_REPORT.md` — Executive summary report (1,450 words)

**Recommendation:** PROCEED WITH CONDITIONS — ERPNext BOM rates production-ready for DSPL operations.

## PWA Structure (Installable Standalone App)

The PWA at `/field` uses a **standalone HTML document** (not `{%- extends "templates/web.html" -%}`). Frappe renders `www/field.html` via `www/field.py` which injects CSRF token and boot context via Jinja.

### Installability
- **Manifest:** `/assets/vaishali/field/manifest.json` with `display: standalone`, `scope: /`, `start_url: /field`
- **Service Worker:** `/assets/vaishali/field/sw.js` registered with `{ scope: '/' }` — nginx sends `Service-Worker-Allowed: /` header
- **SW version:** v25, precaches core + 5 critical screens, stale-while-revalidate with `ignoreSearch: true` for cache-busted URLs
- **Apple PWA:** `apple-mobile-web-app-capable`, `apple-touch-icon`, safe-area insets on header/nav
- **Splash screen:** Branded loading with animated progress bar, dismisses on boot
- **All scripts use `defer`** — non-blocking HTML parsing

### Three-Zone Flexbox Layout
```
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
#app-header  — fixed 56px + safe-area-inset-top, router renders back button + title
#app         — flex: 1, overflow-y: auto, 20px 16px padding, scrollable content
#bottom-nav  — fixed 64px + safe-area-inset-bottom, 3 tabs: Home, AI, Me
```

### Design System — "Notion-Inspired Clean"
- **White page background** (`#FFFFFF`), cards use `--surface-1` (`#F8F8F8`) for contrast
- **No card borders** — whitespace separation; when borders exist: `rgba(0,0,0,0.04)`
- **No decorative shadows** — only input focus ring and toggle thumb
- **No scale transforms on `:active`** — use `background: rgba(0,0,0,0.04)` or `filter: brightness()`
- **Typography:** `-0.04em` letter-spacing on headings, `15px` body text, `12px/500` sentence-case section labels (NOT uppercase)
- **Button radius:** `8px` (not 12px — less bubbly)
- **Tab bar:** underline-style (2px bottom border), not pill-shaped
- **Toasts:** dark floating pill (no colored left border)
- **Avatars:** Notion-style tinted color palette (8 pastels), rounded-square shape, deterministic from name
- **Skeletons:** thin horizontal bars at varying widths (80%, 60%, 40%), not card-shaped blocks
- **Focus indicators:** `:focus-visible` red outline (2px, 2px offset) for keyboard users
- **Contrast:** `--ink-tertiary: #6B6B70` (WCAG AA 4.5:1 on white)

### Transitions & Gestures
- **iOS-style navigation:** two-layer ghost transition (old screen parallax-slides left 30% while new slides in from right), Apple ease-out curve
- **Edge-swipe back:** swipe from left 24px edge, circular chevron indicator, 80px threshold
- **Pull-to-refresh:** SVG circular arc progress, rubber-band resistance (0.45x), spinning/done states, spring-back
- **Header crossfade** on route changes
- **Staggered content reveal:** each child cascades in with 40ms delay (excluded for `.ptr-container`)
- **Nav dot:** spring-animated active indicator
- **`prefers-reduced-motion`** disables all animations

### Router Owns the Header
Screens do NOT render their own headers. Each route has `title` and `back`:
```js
{ pattern: '#/attendance', title: 'Attendance', back: '#/home', handler: ... }
```
`_renderRoute()` renders the header with crossfade, creates ghost snapshot for transitions, clears `#app`, resets inline styles, and calls the screen handler.

### Screen Pattern
```js
(function () {
  'use strict';
  var api = window.fieldAPI;
  var el = UI.el;
  window.Screens = window.Screens || {};
  window.Screens.myScreen = function (appEl) {
    appEl.appendChild(UI.skeleton(3));
    api.apiCall('GET', '/api/field/my-endpoint').then(function (res) {
      appEl.textContent = '';
      // render content
    });
  };
})();
```

**DO NOT use `UI.page()` — it was removed. The router handles all headers.**

### Home Screen Layout (Manager)
```
[Greeting (28px/700) with time + date + department]
[KPI Row: Team Present | Approvals | Visits Today]
[2x2 Action Cards: Check In/Out, New Visit, Leave, Expenses]
[HR services (sentence-case heading): Leave, Salary, Expenses, Advances grid]
[Pending approvals: list cards with tinted avatars]
[Departments: Sales | Operations | Finance (underline tabs)]
```

### Chat Screen
Chat uses a special flex layout — sets `#app` to `display: flex; flex-direction: column; padding: 0` so the chat header pins to top, messages scroll, and input pins to bottom. `_renderRoute` resets these inline styles on navigation away.

## File Structure

```
vaishali/
├── api/
│   ├── field.py          # 35 whitelist endpoints (with ownership/role checks)
│   ├── linking.py        # DCR-to-Sales auto-linking hooks + setup functions
│   ├── views.py          # View Engine API
│   └── chat.py           # AI chat endpoints
├── agent/                 # AI agent (101 tools)
├── views/
│   ├── registry.py        # 14+ view definitions
│   └── engine.py          # Role-filtered fetcher + linked doc enrichment
├── public/
│   ├── css/
│   │   └── vaishali.css   # Desk theme (571 lines, Notion-inspired, scoped to light mode)
│   ├── js/
│   │   ├── quotation.js   # Mark as Lost dialog, auto valid_till, customer count
│   │   ├── lead.js        # Lead age indicator, Convert to Customer, auto lead_name
│   │   └── customer.js    # Lifetime value, outstanding amount indicators
│   └── field/
│       ├── app.js             # Router (49 routes), transitions, PTR, edge-swipe, splash
│       ├── ui.js              # 34 components with ARIA accessibility
│       ├── api.js             # API path translation + IDB caching
│       ├── auth.js            # Session, roles, nav tiers
│       ├── style.css          # Notion-inspired design system + transitions
│       ├── icons.js           # SVG sprites (aria-hidden)
│       ├── sw.js              # Service worker v25 (stale-while-revalidate, ignoreSearch)
│       ├── manifest.json      # PWA manifest (standalone, scope: /)
│   └── screens/           # 33 screen modules
│       ├── home.js        # KPI row + action cards + tabbed department nav
│       ├── attendance.js  # GPS "Location captured" + check-in/check-out
│       ├── visits.js      # DCR with department-aware form + outcome bottom sheet on checkout
│       ├── lead.js        # Lead list + creation + inline validation
│       ├── quotation.js   # Quotation with item picker + inline validation
│       ├── stock.js       # Stock update with camera
│       ├── sales-target.js # Personal performance + product targets + progress bars
│       ├── monthly-report.js # Revenue, orders, visits, YTD progress
│       ├── pipeline.js    # Sales funnel + pipeline board
│       ├── follow-ups.js  # Quotation expiry tracking
│       ├── my-targets.js  # Personal targets with progress bars + kpiRow
│       ├── customer-search.js # Full customer list (1,896) with search
│       ├── customer-detail.js # Customer 360: info, GSTIN, addresses, contacts, tap-to-call
│       ├── customer-timeline.js # Sales timeline: DCRs, Opportunities, Quotations, SOs by customer
│       ├── monthly-report.js # Revenue, orders, visits, YTD progress, conversion funnel
│       ├── chat.js        # Vaishali AI (120s timeout)
│       ├── profile.js     # Work/Contact sections, sign-out confirmation, Telegram
│       ├── hr-hub.js      # List cards with descriptions (Leave, Expenses, Advances, Salary)
│       └── ... (leave, expense, advance, salary, approvals, team, etc.)
├── setup_workspace.py     # Creates Number Cards, Charts, updates DSPL Sales/Operations workspaces
├── hooks.py               # Doc events (DCR/Quotation/SO/Customer linking + Leave/Expense/Advance notifications), fixtures, website routes, app_include_css, doctype_js
├── notifications.py       # Telegram notification handlers
├── fixtures/
│   └── custom_field.json  # telegram_chat_id on Employee
└── www/
    ├── field.html         # Standalone HTML, defer scripts, Jinja cache-busting
    └── field.py           # CSRF + boot context
```

## UI Component Kit (`ui.js`)

```js
UI.el(tag, attrs, children)       // Core DOM builder
UI.card(children, opts)           // Surface card (borderless on white page)
UI.statCard(value, label)         // KPI stat (22px/700 value, 12px sentence-case label)
UI.kpiRow(items)                  // Horizontal stats card with vertical dividers
UI.actionCard(opts)               // Card with 32px icon container + label + value
UI.listCard(opts)                 // Full-width row with dividers
UI.detailRow(label, value)        // Label-value pair
UI.detailCard(rows)               // Card of label-value rows
UI.pill(text, color)              // Status badge (green/yellow/red/blue/gray)
UI.avatar(name, size)             // Tinted rounded-square initials (8-color palette)
UI.amount(value)                  // ₹ formatted currency
UI.btn(text, opts)                // Button (8px radius, primary/success/danger/outline)
UI.actionBar(buttons)             // Button row
UI.field(label, inputEl)          // Form field wrapper with <label>
UI.textInput(placeholder, opts)   // Text input
UI.dateInput(label, value)        // Date input
UI.textarea(placeholder, opts)    // Textarea
UI.select(label, options, value)  // Dropdown select
UI.searchInput(placeholder, fn)   // Debounced search
UI.toggle(label, checked, fn)     // Toggle switch (role=switch, aria-checked, keyboard)
UI.grid(children, cols)           // CSS grid
UI.divider()                      // Horizontal line
UI.sectionHeading(text)           // 12px sentence-case section label (NOT uppercase)
UI.tabs(items, active, onChange)   // Underline-style tab bar
UI.skeleton(count)                // Thin shimmer bars at varying widths
UI.empty(icon, text, ctaOpts)     // Empty state (minimal text, optional CTA)
UI.error(text)                    // Error box
UI.toast(text, type)              // Dark floating pill (role=alert)
UI.nav(tabs, active)              // Bottom navigation
UI.updateNavActive(tab)           // Update nav highlight
UI.fab(onClick)                   // Floating action button (aria-label)
UI.bottomSheet(title, content)    // Modal sheet (role=dialog, Escape key, focus trap)
UI.fieldError(inputEl, message)   // Inline form validation (red border + error text)
```

## ERPNext Desk Customization

### Theme (`public/css/vaishali.css`)
Loaded via `app_include_css` in hooks.py. 571-line CSS override scoped to `body[data-theme="light"]`:
- White page, `rgba(0,0,0,0.04)` borders, 10px card radius, `-0.04em` headings
- Red primary (`#E60005`), 8px button radius, sentence-case everywhere
- Covers: navbar, sidebar, workspace, cards, list view, form view, buttons, pills, modals, kanban

### Client Scripts (`public/js/`)
Registered via `doctype_js` in hooks.py:
- **Quotation:** "Mark as Lost" dialog (lost_reason_category: Price/Technical/Budget/Other + lost_remark, sets quotation_temperature=Lost), auto `valid_till` (30 days), customer quotation count indicator
- **Lead:** Age indicator (days, color-coded), "Convert to Customer" button, auto `lead_name` from company
- **Customer:** Lifetime value indicator (sum of invoices), outstanding amount indicator, sales timeline (DCRs + Opps + Quotations + SOs)

### Workspaces (`setup_workspace.py`)
Created via `bench --site dgoc.logstop.com execute vaishali.setup_workspace.setup` (idempotent):
- **DSPL Sales:** 7 Number Cards (Open Quotations, Orders This Month, Outstanding Receivables, Active Leads, Visits This Month, Leads Generated, Visits Won) + Monthly Revenue bar chart + Quotation Pipeline donut + Lead Source Breakdown pie
- **DSPL Operations:** 3 ops cards (Work Orders, Deliveries, Stock Below Reorder) + 2 HR cards (Team Present, Pending Approvals) + Monthly Orders line chart
- 12 Number Cards + 4 Dashboard Charts total, all prefixed "DSPL"

#### Frappe v15 Workspace Gotchas (CRITICAL for programmatic creation)
1. **Number Card autonames from `label`** — the explicit `name` field is ignored; set `label` to desired doc name
2. **Dashboard Chart autonames from `chart_name`** — same pattern; `name` is ignored
3. **Content JSON blocks need `id` fields** — random 10-char alphanumeric strings (Editor.js requirement)
4. **Content JSON headers use `<span class="h4"><b>...</b></span>`** format (not raw `<b>` tags)
5. **Child tables required alongside content JSON** — workspace has both `content` (layout positioning) and child tables (`number_cards`, `charts`, `shortcuts`) that register widgets; content alone = blank
6. **Child table `label` must exactly match content JSON `block_name`** — `block.js` looks up widgets via `obj.label == __(block_name)`; mismatched labels silently skip the widget
7. **Commit between card creation and workspace save** — `frappe.db.commit()` needed so link validation can find newly created cards; also use `workspace.flags.ignore_links = True` as safety

## API Security Model

All endpoints in `field.py` enforce:
- **Ownership checks:** `get_dcr()`, `checkout_dcr()` verify `doc.employee == current_employee`
- **Role gates:** `create_stock_entry()` blocked for field tier; `create_quotation()` requires sales/marketing dept or manager+
- **Approver verification:** `process_approval()` checks `doc.leave_approver`/`doc.expense_approver`/reporting hierarchy
- **Data scoping:** `get_approvals()` Employee Advances filtered by direct reports only
- **Service-only endpoints:** `verify_telegram_token()` restricted to service account

## API Path Translation (`api.js`)

PWA uses clean paths translated to Frappe methods:

| PWA Path | Frappe Method |
|----------|--------------|
| `GET /api/field/attendance/today` | `vaishali.api.field.attendance_today` |
| `POST /api/field/attendance` | `vaishali.api.field.create_checkin` |
| `POST /api/field/dcr` | `vaishali.api.field.create_dcr` |
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
| `POST /api/field/dcr/{id}/checkout` | `vaishali.api.field.checkout_dcr` (extracts dcr_id from path) |
| `POST /api/ai/chat` | FastAPI (nginx proxy, 120s timeout) |
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

## Auth Model

- **Browser → Frappe:** Cookie auth (native Frappe session)
- **FastAPI → Frappe:** API key pair + Host header (vaishali@frappeflo.com service account)
- **Nav tiers:** `field` (basic staff), `manager` (HR/Sales/Stock managers), `admin` (System Manager)
- **Bottom nav:** 3 tabs for everyone (Home, AI, Me)
- **View Engine:** Role-based section filtering (sales/field/accounts/service/manager/admin)

## DCR-to-Sales Linking (`api/linking.py`)

Auto-links Daily Call Reports through the full sales chain: Visit → Lead → Opportunity → Quotation → Sales Order.

### How It Works
- **DCR checkout** captures outcome checkboxes (lead_generated, opportunity_generated, order_received) + discussion/next-action fields via bottom sheet in PWA
- **on_dcr_update** hook auto-creates Lead (if lead_generated=1) and Opportunity (if opportunity_generated=1), sets conversion_status
- **link_quotation_to_dcr** on Quotation submit backlinks to matching DCR via Opportunity or customer+90-day window
- **link_sales_order_to_dcr** on SO submit backlinks via linked Quotation or customer+90-day fallback
- **on_customer_created** retroactively links new Customer to recent DCR visits
- **on_quotation_status_change** updates DCR conversion_status when Quotation wins/loses

### DCR Custom Fields (12 fields)
`lead_generated`, `opportunity_generated`, `order_received` (checkboxes), `discussion_remarks`, `next_action`, `next_action_date`, `lead`, `opportunity`, `quotation`, `sales_order` (Link fields), `conversion_status` (Select: Open/Lead Created/Opportunity/Quoted/Won/Lost)

### Quotation Custom Fields (3 fields)
`quotation_temperature` (Select: Hot/Warm/Cold/Lost), `lost_reason_category` (Select: Price/Technical/Budget/Other), `lost_remark` (Small Text)

### Setup Functions (idempotent)
```bash
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_dcr_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.setup_quotation_fields
bench --site dgoc.logstop.com execute vaishali.api.linking.migrate_existing_dcrs
```

### Conversion Funnel API
`get_conversion_funnel(period, employee, department)` — counts DCRs by conversion_status stage, returns `{visits, leads, opportunities, quoted, won, lost}`. Used by monthly-report.js and View Engine `conversion_funnel` view.

### Gotcha: Lead/Opportunity `notes` Field
`notes` is a **child table** (Table field) in Lead and Opportunity. Use `doc.append("notes", {"note": "..."})`, NOT `doc.notes = "..."`. The latter causes `'str' object has no attribute 'modified'`.

## ERPNext Customizations

### Custom Fields
| DocType | Field | Purpose |
|---------|-------|---------|
| Item | ABP Product (Select) | Map to business plan products |
| Item | ABP Category (Select) | Tower Crane, EOT, MRT, Mobile, etc. |
| Quotation | Lost Reason (Select) | Track why quotations are lost |
| Quotation | Lost To Competitor (Data) | Who won the deal |
| Quotation | quotation_temperature (Select) | Hot/Warm/Cold/Lost temperature |
| Quotation | lost_reason_category (Select) | Price/Technical/Budget/Other |
| Quotation | lost_remark (Small Text) | Detail on why quotation was lost |
| Lead | Zone (Select) | North/South/East/West/Central |
| Customer | Zone (Select) | Geographic presence |
| Customer | ICP Score (Rating) | Ideal Customer Profile match |
| Daily Call Report | 12 fields | See DCR-to-Sales Linking section above |

### Notifications
- Quotation expiring (3 days before valid_till)
- New Sales Order submitted
- Overdue Invoice (7 days after due)
- Lead assigned to new owner

### DSPL Sales Workspace
Number cards: Open Quotations, Orders This Month, Outstanding Receivables, Active Leads, Visits This Month, Leads Generated, Visits Won

## AI (Vaishali) Configuration

- **Model:** claude-sonnet-4-6 (Anthropic direct)
- **Max tool rounds:** 15
- **Browser timeout:** 120s (chat.js)
- **nginx timeout:** 300s
- **System prompt:** Includes full ABP (products, targets, CBIs, KSFs, ICP, vision, mission)
- **Tools:** search_records, get_record, get_count, create_record, update_record, get_view

## Conventions

- **No jQuery, no React** — vanilla JS with `el()` builder only
- **No innerHTML** — always use `el()` or `textContent`
- **No UI.page()** — router handles all headers
- **No card borders** — whitespace separation on white page
- **No decorative shadows** — flat surfaces only
- **No scale transforms on :active** — use `background: rgba(0,0,0,0.04)` or `filter: brightness()`
- **No UPPERCASE section headings** — always sentence case ("Pending approvals" not "PENDING APPROVALS")
- **Status colors:** green=completed, orange=in-progress, red=open/overdue, blue=default (pills only)
- **Currency:** Always `₹` + `toLocaleString('en-IN')`
- **Icons:** Use `icon('name')` from icons.js — all icons have `aria-hidden="true"`
- **Form validation:** Use `UI.fieldError(input, message)` for inline validation
- **Chat layout:** Overrides `#app` inline styles — must reset on navigation away
- **Cache busting:** Jinja `?v={{ _v }}` on all script/CSS tags (minute-level timestamp)
- **API limits:** Use `limit_page_length=0` for full lists (customers, quotations), reasonable caps for search endpoints
- **Accessibility:** `:focus-visible` outlines, ARIA roles on interactive components, `prefers-reduced-motion` support
- **Timer cleanup:** All `setInterval` calls must track timers and clear on `hashchange` navigation

## Infrastructure

- **EC2 instance:** `dspl-erp-server`, instance ID `i-08deae9f14e3cc99e`, IP `35.154.17.172`, region `ap-south-1`
- **SSH:** EC2 Instance Connect (no PEM key on this machine). Pattern:
  ```bash
  ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q
  aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1
  ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172
  ```
  Keys expire in ~60s — chain SCP+SSH in one command.
- **Server git remote:** `upstream` (not `origin`)
- **Frappe Cloud:** `dcepl.logstop.com` (source of truth for data, synced to EC2)
- **nginx:** `Service-Worker-Allowed: /` header on sw.js, gzip enabled

## Project Memory

Read `.claude-memory/` for persistent context across sessions — user profile, working preferences, data inventory across 3 systems (ERPNext, Frappe Cloud, Krisp ERP), EPS revenue data, and roadmap. Credentials are redacted — ask the user when needed.

## Development

```bash
# Local
cd ~/vaishali
bench --site <site> migrate          # After Python changes
bench build --app vaishali           # After JS changes (not needed for www/ assets)
bench clear-cache

# Deploy to EC2 via Instance Connect
rm -f /tmp/dspl-temp-key /tmp/dspl-temp-key.pub && ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q \
  && aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1 \
  && ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
    "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main' \
     && redis-cli FLUSHALL \
     && sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web dspl-fastapi"

# After workspace/number card/chart changes (on server):
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.setup_workspace.setup'
redis-cli FLUSHALL

# After hooks.py changes — MUST clear cache + restart ALL (frappe caches hooks in Redis):
redis-cli FLUSHALL && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com clear-cache' && sudo supervisorctl restart all

# Running Python scripts on server (frappe context):
# Write to /tmp, SCP to server, run with: sudo -u frappe /home/frappe/frappe-bench/env/bin/python3 /tmp/script.py
# Script MUST start with: import os; os.chdir('/home/frappe/frappe-bench/sites')
# Then: import frappe; frappe.init(site='dgoc.logstop.com'); frappe.connect()
```
