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
| **PWA** | Vanilla JS SPA, `el()` DOM builder | 31 screen modules, 49 routes, hash router, standalone HTML |
| **Field API** | `@frappe.whitelist` in `api/field.py` | 32 endpoints: Attendance, DCR, Customers, Leads, Quotations, Stock, Sales Targets, Funnel, Monthly Report |
| **View Engine** | `views/registry.py` + `views/engine.py` | 14+ composable views, role-filtered, linked doc enrichment (Address/Contact via Dynamic Link) |
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
- **Data:** 1,879 customers, 1,807 suppliers, 6,456 items, 8,242 contacts, 189 employees

## PWA Structure (Standalone HTML — HRMS Pattern)

The PWA at `/field` uses a **standalone HTML document** (not `{%- extends "templates/web.html" -%}`). Frappe renders `www/field.html` via `www/field.py` which injects CSRF token and boot context via Jinja.

### Three-Zone Flexbox Layout
```
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
#app-header  — fixed 56px, router renders back button + title
#app         — flex: 1, overflow-y: auto, 16px 20px padding, scrollable content
#bottom-nav  — fixed 64px, 3 tabs: Home, AI, Me
```

### Design System — "Notion-Inspired Flat"
- **Zero decorative shadows** — only input focus ring and toggle thumb
- **No scale transforms** on `:active` — use `opacity: 0.9` or background change
- **Typography hierarchy:** 24px/700 page title, 20px/700 data callout, 15px/600 card primary, 14px/500 body, 13px/400 secondary, 11px/600 section heading
- **Surface hierarchy:** Page (#F7F7F8), Surface (#FFF + 1px border), Inline (transparent)
- **Color discipline:** monochrome by default, `--dspl-red` for primary CTA + nav only, status colors in pills only
- **Tab bar:** underline-style (2px bottom border), not pill-shaped
- **HR grid:** Notion sidebar-style 2-column list (icon + text horizontal), not centered tile grid
- **Toasts:** bottom-center (80px up), white surface with colored left border

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
[Greeting (24px/700, no underline)]
[KPI Row: Team Present | Approvals | In Field (single flat card with dividers)]
[2x2 Action Cards: Check In/Out, New Visit, Leave, Expenses (flat, no shadow, no accent)]
[HR Services (Notion sidebar-style 2-col list): Leave, Salary, Expenses, Advances]
[Pending Approvals list]
[Tabbed Department Nav: Sales | Operations | Finance (underline tabs)]
```

### Chat Screen
Chat uses a special flex layout — sets `#app` to `display: flex; flex-direction: column; padding: 0` so the chat header pins to top, messages scroll, and input pins to bottom. `_renderRoute` resets these inline styles on navigation away.

## File Structure

```
vaishali/
├── api/
│   ├── field.py          # 32 whitelist endpoints
│   ├── views.py          # View Engine API
│   └── chat.py           # AI chat endpoints
├── agent/                 # AI agent (101 tools)
├── views/
│   ├── registry.py        # 14+ view definitions
│   └── engine.py          # Role-filtered fetcher + linked doc enrichment
├── public/field/
│   ├── app.js             # Router (49 routes), login, 3-tab nav, pull-to-refresh
│   ├── ui.js              # 34 components (see UI Kit below)
│   ├── api.js             # API path translation + IDB caching
│   ├── auth.js            # Session, roles, nav tiers
│   ├── style.css          # Three-zone layout + Notion-flat design system
│   ├── icons.js           # SVG sprites
│   ├── sw.js              # Service worker v17
│   └── screens/           # 31 screen modules
│       ├── home.js        # KPI row + action cards + tabbed department nav
│       ├── attendance.js  # GPS check-in/check-out
│       ├── visits.js      # DCR with department-aware form + inline validation
│       ├── lead.js        # Lead list + creation + inline validation
│       ├── quotation.js   # Quotation with item picker + inline validation
│       ├── stock.js       # Stock update with camera
│       ├── sales-target.js # Personal performance + product targets + progress bars
│       ├── monthly-report.js # Revenue, orders, visits, YTD progress
│       ├── pipeline.js    # Sales funnel + pipeline board
│       ├── follow-ups.js  # Quotation expiry tracking (flat sections, standard listCards)
│       ├── my-targets.js  # Personal targets with progress bars + kpiRow
│       ├── customer-search.js # Full customer list (1,879) with search
│       ├── customer-detail.js # Customer 360: info, GSTIN, addresses, contacts, tap-to-call, transactions
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
UI.card(children, opts)           // Surface card with border (flat, no shadow)
UI.statCard(value, label)         // KPI stat (20px/700 value)
UI.kpiRow(items)                  // Horizontal stats card with vertical dividers [{value, label}, ...]
UI.actionCard(opts)               // Flat card (icon, label, value, sub — no shadow, no accent)
UI.listCard(opts)                 // Full-width row with dividers
UI.detailRow(label, value)        // Label-value pair
UI.detailCard(rows)               // Card of label-value rows
UI.pill(text, color)              // Status badge (green/yellow/red/blue/gray)
UI.avatar(name, size)             // Initial circle (36px default)
UI.amount(value)                  // ₹ formatted currency
UI.btn(text, opts)                // Button (primary/success/danger/outline, no shadow)
UI.actionBar(buttons)             // Button row
UI.field(label, inputEl)          // Form field wrapper
UI.textInput(placeholder, opts)   // Text input
UI.dateInput(label, value)        // Date input
UI.textarea(placeholder, opts)    // Textarea
UI.select(label, options, value)  // Dropdown select
UI.searchInput(placeholder, fn)   // Debounced search
UI.toggle(label, checked, fn)     // Toggle switch
UI.grid(children, cols)           // CSS grid
UI.divider()                      // Horizontal line
UI.sectionHeading(text)           // 11px uppercase section divider
UI.tabs(items, active, onChange)   // Underline-style tab bar
UI.skeleton(count)                // Shimmer loading placeholder
UI.empty(icon, text, ctaOpts)     // Empty state (32px muted icon)
UI.error(text)                    // Error box
UI.toast(text, type)              // Bottom toast (white + colored left border)
UI.nav(tabs, active)              // Bottom navigation
UI.updateNavActive(tab)           // Update nav highlight
UI.fab(onClick)                   // Floating action button
UI.bottomSheet(title, content)    // Modal sheet
UI.fieldError(inputEl, message)   // Inline form validation (red border + error text)
```

## API Path Translation (`api.js`)

PWA uses clean paths translated to Frappe methods:

| PWA Path | Frappe Method |
|----------|--------------|
| `GET /api/field/attendance/today` | `vaishali.api.field.attendance_today` |
| `POST /api/field/attendance` | `vaishali.api.field.create_checkin` |
| `POST /api/field/dcr` | `vaishali.api.field.create_dcr` |
| `GET /api/field/customers` | `vaishali.api.field.get_customers` (all 1,879, no limit) |
| `GET /api/field/view/customer_360/{id}` | View Engine (overview + addresses + contacts + transactions) |
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
- **View Engine:** Role-based section filtering (sales/field/accounts/service/manager/admin)

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
- **No decorative shadows** — flat surfaces with 1px borders only
- **No scale transforms on :active** — use opacity or background change
- **Status colors:** green=completed, orange=in-progress, red=open/overdue, blue=default (pills only)
- **Currency:** Always `₹` + `toLocaleString('en-IN')`
- **Icons:** Use `icon('name')` from icons.js
- **Form validation:** Use `UI.fieldError(input, message)` for inline validation
- **Chat layout:** Overrides `#app` inline styles — must reset on navigation away
- **Cache busting:** Jinja `?v={{ _v }}` on all script/CSS tags (minute-level timestamp)
- **API limits:** Use `limit_page_length=0` for full lists (customers, quotations), reasonable caps for search endpoints

## Infrastructure

- **EC2 instance:** `dspl-erp-server` (use `aws ec2 describe-instances` to get current IP)
- **SSH key:** `~/.ssh/heft-erp-key.pem`, user `ubuntu`
- **Frappe Cloud:** `dcepl.logstop.com` (source of truth for data, synced to EC2)

## Development

```bash
# Local
cd ~/vaishali
bench --site <site> migrate          # After Python changes
bench build --app vaishali           # After JS changes (not needed for www/ assets)
bench clear-cache

# Deploy to EC2 (get IP first)
EC2_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=dspl-erp-server" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
ssh -i ~/.ssh/heft-erp-key.pem ubuntu@$EC2_IP
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main'
redis-cli FLUSHALL
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web dspl-fastapi
```
