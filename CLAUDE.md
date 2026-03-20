# CLAUDE.md — Vaishali (DSPL Org OS)

## What This Is

Custom Frappe v15 app for **Dynamic Servitech Private Limited** (DSPL) — a crane rental, industrial equipment sales/service, and manufacturing company. Vaishali is their AI-native ERP layer: a PWA for field staff, a View Engine for composable dashboards, and an AI agent (Claude) for natural language ERP queries.

**Live at:** https://dgoc.logstop.com/field (self-hosted AWS EC2)
**ERPNext desk:** https://dgoc.logstop.com/app

## Architecture

```
Browser (PWA)  ──cookie──>  Frappe/ERPNext (gunicorn :8000)
                              ├── vaishali.api.field.*    (30+ whitelist endpoints)
                              ├── vaishali.api.views.*    (View Engine)
                              ├── vaishali.api.chat.*     (AI chat)
                              └── vaishali.views.engine   (parallel data fetcher)

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
| **PWA** | Vanilla JS SPA, `el()` DOM builder | 35+ screens, hash router, standalone HTML |
| **Field API** | `@frappe.whitelist` in `api/field.py` | Attendance, DCR, Customers, Leads, Quotations, Stock, Sales Targets, Funnel, Monthly Report |
| **View Engine** | `views/registry.py` + `views/engine.py` | 14 composable views, role-filtered, parallel fetch |
| **AI Agent** | `agent/runner.py` (AsyncAnthropic) | Claude with 101 ERPNext tools, knows full ABP |
| **FastAPI slim** | `~/dspl_erp/` on EC2 | Async AI chat + Telegram notifications |

## Company Context (CRITICAL)

- **Company:** Dynamic Servitech Private Limited (DSPL)
- **Business:** Crane safety electronics (SLIs, load monitors, IoT), equipment rental, wire rope testing
- **Divisions:** EPS (Electronic Products & Safety), MLR (Machine Lifting & Rentals)
- **Products:** ACD, DRM-3400, DJ-1005, E-DASH, F-Dash, WWSI, MRT Systems, TPS
- **Annual Target:** ₹10.09 Crore (FY 2026-27)
- **Sales Team:** Raghuvir, Aniket, NJG, BNG (Bangalore)
- **ERPNext apps:** frappe, erpnext, hrms, india_compliance, payments, vaishali
- **HSN items:** disable, never delete
- **Currency:** INR only, format ₹X,XX,XXX (en-IN locale)

## PWA Structure (Standalone HTML — HRMS Pattern)

The PWA at `/field` uses a **standalone HTML document** (not `{%- extends "templates/web.html" -%}`). Frappe renders `www/field.html` via `www/field.py` which injects CSRF token and boot context via Jinja.

### Three-Zone Flexbox Layout
```
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
#app-header  — fixed 56px, router renders back button + title
#app         — flex: 1, overflow-y: auto, 20px padding, scrollable content
#bottom-nav  — fixed 64px, 3 tabs: Home, AI, Me
```

### Router Owns the Header
Screens do NOT render their own headers. Each route has `title` and `back`:
```js
{ pattern: '#/attendance', title: 'Attendance', back: '#/home', handler: ... }
```
`_renderRoute()` renders the header, clears `#app`, resets inline styles (for chat layout), and calls the screen handler.

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
[Greeting + KPI chips (Team Present, Approvals, In Field)]
[2x2 Action Cards: Check In/Out, New Visit, Leave, HR Services]
[HR Services tiles: Leave, Salary, Expenses, Advances]
[Pending Approvals list]
[Tabbed Department Nav: Sales | Operations | Finance]
```

### Chat Screen
Chat uses a special flex layout — sets `#app` to `display: flex; flex-direction: column; padding: 0` so the chat header pins to top, messages scroll, and input pins to bottom. `_renderRoute` resets these inline styles on navigation away.

## File Structure

```
vaishali/
├── api/
│   ├── field.py          # 30+ whitelist endpoints
│   ├── views.py          # View Engine API
│   └── chat.py           # AI chat endpoints
├── agent/                 # AI agent (101 tools)
├── views/
│   ├── registry.py        # 14 view definitions
│   └── engine.py          # Parallel fetcher
├── public/field/
│   ├── app.js             # Router (47 routes), login, 3-tab nav, pull-to-refresh
│   ├── ui.js              # 32 components including actionCard()
│   ├── api.js             # API path translation + IDB caching
│   ├── auth.js            # Session, roles, nav tiers
│   ├── style.css          # Three-zone layout + Quiet Authority design
│   ├── icons.js           # SVG sprites
│   ├── sw.js              # Service worker v17
│   └── screens/           # 35 screen modules
│       ├── home.js        # Action cards + tabbed department nav
│       ├── attendance.js  # GPS check-in/check-out
│       ├── visits.js      # DCR with department-aware form (sales/service split)
│       ├── lead.js        # Lead list + creation
│       ├── quotation.js   # Quotation with item picker
│       ├── stock.js       # Stock update with camera
│       ├── sales-target.js # Personal performance + product targets + progress bars
│       ├── monthly-report.js # Revenue, orders, visits, YTD progress
│       ├── pipeline.js    # Sales funnel + pipeline board
│       ├── chat.js        # Vaishali AI (120s timeout)
│       └── ... (leave, expense, advance, salary, approvals, team, etc.)
├── hooks.py               # Doc events, fixtures, website routes
├── notifications.py       # Telegram notification handlers
├── fixtures/
│   └── custom_field.json  # telegram_chat_id on Employee
└── www/
    ├── field.html         # Standalone HTML (HRMS pattern), Jinja cache-busting
    └── field.py           # CSRF + boot context
```

## UI Component Kit (`ui.js`)

```js
UI.el(tag, attrs, children)       // Core DOM builder
UI.card(children, opts)           // Surface card with border
UI.statCard(value, label)         // Left-aligned KPI
UI.actionCard(opts)               // 2x2 grid card with shadow (icon, label, value, sub, accent)
UI.listCard(opts)                 // Full-width row with dividers
UI.pill(text, color)              // Status badge
UI.btn(text, opts)                // Button (primary/success/danger/outline)
UI.grid(children, cols)           // CSS grid
UI.sectionHeading(text)           // Section divider
UI.skeleton(count)                // Loading placeholder
UI.empty(icon, text, ctaOpts)     // Empty state with optional CTA button
UI.error(text)                    // Error box
UI.toast(text, type)              // Toast notification
UI.tabs(items, active, onChange)   // Tab bar
UI.searchInput(placeholder, fn)   // Debounced search
UI.bottomSheet(title, content)    // Modal sheet
```

## API Path Translation (`api.js`)

PWA uses clean paths translated to Frappe methods:

| PWA Path | Frappe Method |
|----------|--------------|
| `GET /api/field/attendance/today` | `vaishali.api.field.attendance_today` |
| `POST /api/field/attendance` | `vaishali.api.field.create_checkin` |
| `POST /api/field/dcr` | `vaishali.api.field.create_dcr` |
| `GET /api/field/view/X` | `vaishali.api.views.get_view?view_name=X` |
| `POST /api/field/lead` | `vaishali.api.field.create_lead` |
| `POST /api/field/quotations` | `vaishali.api.field.create_quotation` |
| `GET /api/field/sales-targets` | `vaishali.api.field.get_sales_targets` |
| `GET /api/field/sales-funnel` | `vaishali.api.field.get_sales_funnel` |
| `GET /api/field/monthly-report` | `vaishali.api.field.get_monthly_report` |
| `POST /api/ai/chat` | FastAPI (nginx proxy, 120s timeout) |

## Auth Model

- **Browser → Frappe:** Cookie auth (native Frappe session)
- **FastAPI → Frappe:** API key pair + Host header (vaishali@frappeflo.com service account)
- **Nav tiers:** `field` (basic staff), `manager` (HR/Sales/Stock managers), `admin` (System Manager)
- **Bottom nav:** 3 tabs for everyone (Home, AI, Me)
- **View Engine:** Role-based section filtering

## ERPNext Customizations

### Custom Fields
| DocType | Field | Purpose |
|---------|-------|---------|
| Item | ABP Product (Select) | Map to business plan products |
| Item | ABP Category (Select) | Tower Crane, EOT, MRT, Mobile, etc. |
| Quotation | Lost Reason (Select) | Track why quotations are lost |
| Quotation | Lost To Competitor (Data) | Who won the deal |
| Lead | Zone (Select) | North/South/East/West/Central |
| Customer | Zone (Select) | Geographic presence |
| Customer | ICP Score (Rating) | Ideal Customer Profile match |

### Notifications
- Quotation expiring (3 days before valid_till)
- New Sales Order submitted
- Overdue Invoice (7 days after due)
- Lead assigned to new owner

### DSPL Sales Workspace
Number cards: Open Quotations, Orders This Month, Outstanding Receivables, Active Leads

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
- **Status colors:** green=completed, orange=in-progress, red=open/overdue, blue=default
- **Currency:** Always `₹` + `toLocaleString('en-IN')`
- **Icons:** Use `icon('name')` from icons.js
- **Chat layout:** Overrides `#app` inline styles — must reset on navigation away
- **Cache busting:** Jinja `?v={{ _v }}` on all script/CSS tags (minute-level timestamp)

## Development

```bash
# Local
cd ~/vaishali
bench --site <site> migrate          # After Python changes
bench build --app vaishali           # After JS changes (not needed for www/ assets)
bench clear-cache

# Deploy to EC2
ssh -i ~/.ssh/heft-erp-key.pem ubuntu@<ip>
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main'
redis-cli FLUSHALL
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web dspl-fastapi
```
