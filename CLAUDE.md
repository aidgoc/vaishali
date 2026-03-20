# CLAUDE.md — Vaishali (DSPL Org OS)

## What This Is

Custom Frappe v15 app for **Dynamic Servitech Private Limited** (DSPL) — a crane/industrial equipment company. Vaishali is their AI-native ERP layer: a PWA for field staff, a View Engine for composable dashboards, and an AI agent (Claude) for natural language ERP queries.

**Live at:** https://dgoc.logstop.com/field (self-hosted AWS EC2)

## Architecture

```
Browser (PWA)  ──cookie──>  Frappe/ERPNext (gunicorn :8000)
                              ├── vaishali.api.field.*    (16 whitelist endpoints)
                              ├── vaishali.api.views.*    (View Engine)
                              ├── vaishali.api.chat.*     (AI chat)
                              └── vaishali.views.engine   (parallel data fetcher)

Browser (PWA)  ──cookie──>  nginx ──/api/ai/*──> FastAPI slim (:8443)
                              ├── ai/chat.py       (Claude brain loop)
                              ├── ai/tools.py      (5 ERP tool schemas)
                              ├── telegram/*        (notifications + linking)
                              └── forwards cookie to Frappe for auth
```

### Key Layers

| Layer | Tech | Purpose |
|-------|------|---------|
| **PWA** | Vanilla JS SPA, `el()` DOM builder | 26 screens, hash router, offline-capable |
| **Field API** | `@frappe.whitelist` in `api/field.py` | Attendance, DCR/Visits, Customers, Approvals, Team |
| **View Engine** | `views/registry.py` + `views/engine.py` | 14 composable views, role-filtered, parallel fetch |
| **AI Agent** | `agent/runner.py` (AsyncAnthropic) | Claude with 101 ERPNext tools |
| **FastAPI slim** | `~/dspl_erp/` on EC2 | Async AI chat + Telegram notifications |

## Company Context (CRITICAL)

- **Company:** Dynamic Servitech Private Limited (DSPL)
- **Business:** Crane rentals, industrial equipment sales/service, manufacturing
- **Departments:** Sales, Service, Production/Manufacturing, Accounts, Management
- **ERPNext apps:** frappe, erpnext, hrms, india_compliance, payments, vaishali
- **HSN items:** disable, never delete
- **Currency:** INR only, format ₹X,XX,XXX (en-IN locale)

## File Structure

```
vaishali/
├── api/
│   ├── field.py          # 16 whitelist endpoints (attendance, DCR, customers, etc.)
│   ├── views.py          # View Engine API (get_view)
│   └── chat.py           # AI chat endpoints
├── agent/
│   ├── runner.py          # Claude brain loop (AsyncAnthropic, max 15 rounds)
│   ├── tools.py           # 101 ERPNext tool schemas
│   ├── executor.py        # Tool execution via Frappe API
│   └── prompt.py          # System prompt builder
├── views/
│   ├── registry.py        # 14 view definitions as config dicts
│   └── engine.py          # Parallel fetcher with role filtering
├── public/field/
│   ├── app.js             # Route table (41 routes), login, startup
│   ├── router.js          # Hash-based SPA router with param parsing
│   ├── auth.js            # Session, roles, nav tiers (field/manager/admin)
│   ├── ui.js              # Component library (31 components)
│   ├── api.js             # API layer with path translation + IDB caching
│   ├── icons.js           # SVG icon sprites
│   ├── screens/           # 26 screen modules
│   │   ├── home.js        # Field home + Manager home (department-aware)
│   │   ├── attendance.js  # GPS check-in/check-out
│   │   ├── visits.js      # DCR list, new visit, visit detail
│   │   ├── service-dashboard.js  # Service engineer dashboard
│   │   ├── production.js  # Production dashboard
│   │   ├── pipeline.js    # Sales pipeline
│   │   ├── chat.js        # AI chat interface
│   │   └── ... (leave, expense, advance, salary, approvals, team, etc.)
│   └── features/          # Shared feature logic (leave, expense, advance, salary)
├── hooks.py               # Doc events, fixtures, website routes
├── notifications.py       # Telegram notification handlers
└── fixtures/
    └── custom_field.json  # telegram_chat_id on Employee
```

## UI Component Kit (`ui.js`)

All screens use `el()` DOM builder + `UI.*` components. Never use innerHTML or jQuery.

```js
// Core pattern
var el = UI.el;
el('div', { className: 'foo', onClick: handler }, [children])

// Components available
UI.page(title, backHash)          // Screen header with back button
UI.card(children, {accent, tappable, onClick})
UI.statCard(value, label)         // KPI number + label
UI.listCard({avatar, title, sub, right, onClick})
UI.pill(text, color)              // Status badge (green/orange/red/blue/gray)
UI.btn(text, {type, block, icon, onClick})  // type: primary/success/danger/outline
UI.grid(children, cols)           // CSS grid
UI.sectionHeading(text)           // Section divider
UI.skeleton(count)                // Loading placeholder
UI.empty(iconName, text)          // Empty state
UI.error(text)                    // Error box
UI.toast(text, type)              // Toast notification
UI.searchInput(placeholder, onInput)  // Debounced search
UI.tabs(items, activeValue, onChange)
UI.detailCard(rows)               // Key-value detail display
UI.bottomSheet(title, contentEl)  // Modal sheet
```

## View Engine Pattern

Adding a new view = adding a dict to `registry.py`. No new endpoint needed.

```python
# views/registry.py
"my_view": {
    "description": "What it shows",
    "context_doctype": None,  # or "Customer" for contextual views
    "sections": {
        "sales": ["section_a", "section_b"],  # role → visible sections
        "manager": ["*"],  # wildcard = all sections
    },
    "section_defs": {
        "section_a": {
            "doctype": "Sales Order",
            "fields": [...],
            "filters": [...],
            "order_by": "creation desc",
            "limit": 50,
        },
    },
}
```

**Special filter values:** `"today"`, `"month_start"`, `"fy_start"`, `"today_plus_7"`, `"{context}"`

## Auth Model

- **Browser → Frappe:** Cookie auth (native Frappe session)
- **FastAPI → Frappe:** API key pair (vaishali@frappeflo.com service account)
- **Nav tiers:** `field` (basic staff), `manager` (HR/Sales/Stock managers), `admin` (System Manager)
- **View Engine:** Role-based section filtering (sales, service, manufacturing, accounts, field, manager, admin)

## Screen Pattern (for new screens)

```js
(function () {
  'use strict';
  var api = window.fieldAPI;
  var el = UI.el;

  window.Screens = window.Screens || {};
  window.Screens.myScreen = function (appEl) {
    appEl.appendChild(UI.page('Title', '#/home'));
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/my_view').then(function (res) {
      // Remove skeleton, render stat cards + list cards
    }).catch(function () {
      appEl.appendChild(UI.error('Could not load data'));
    });
  };
})();
```

Then register in `app.js` route table:
```js
{ pattern: '#/my-screen', handler: function () { S().myScreen(appEl); }, tab: 'home' }
```

## API Path Translation (`api.js`)

The PWA uses clean paths that get translated to Frappe method paths:

| PWA Path | Frappe Method |
|----------|--------------|
| `GET /api/field/attendance/today` | `vaishali.api.field.attendance_today` |
| `POST /api/field/attendance` | `vaishali.api.field.create_checkin` |
| `GET /api/field/dcr?date=X` | `vaishali.api.field.get_dcrs?date_filter=X` |
| `POST /api/field/dcr` | `vaishali.api.field.create_dcr` |
| `GET /api/field/view/X` | `vaishali.api.views.get_view?view_name=X` |

## GPS Already Built

- **Attendance:** `getGPS()` → `latitude`/`longitude` on `Employee Checkin` doctype
- **Visits:** `getGPS()` → `check_in_gps`/`check_out_gps` as "lat,lng" strings on `Daily Call Report`
- **Prospect flow:** "New prospect?" toggle → free text fields → "Convert to Lead" button on completed visits

## Infrastructure (AWS EC2)

- **Instance:** i-08deae9f14e3cc99e (t3.medium, ap-south-1)
- **IP:** 35.154.17.172 → dgoc.logstop.com
- **Stack:** Ubuntu 22.04, Frappe v15, MariaDB, Redis, nginx, supervisor
- **FastAPI:** dspl-fastapi service on 127.0.0.1:8443, proxied via nginx at /api/ai/*
- **Backup:** s3://dspl-erp-backups (ap-south-1)

## Development Commands

```bash
# Local development
cd ~/vaishali
bench --site dgoc.logstop.com migrate    # After Python changes
bench build --app vaishali               # After JS changes (not needed for www/ assets)
bench clear-cache                        # Clear Redis cache

# Deploy to EC2
ssh -i ~/.ssh/heft-erp-key.pem ubuntu@35.154.17.172
# On EC2:
cd /home/frappe/frappe-bench
bench --site dgoc.logstop.com migrate
sudo supervisorctl restart all
```

## Testing

- PWA is at /field on the site
- Login as harsh@dgoc.in for admin/manager view
- Test field staff view by logging in as a non-manager employee
- All API endpoints are `@frappe.whitelist` — test via browser console or curl with session cookie

## Conventions

- **No jQuery, no React** — vanilla JS with `el()` builder only
- **No innerHTML** — always use `el()` or `textContent`
- **Status colors:** green=completed/closed, orange=in-progress/ongoing, red=open/overdue, blue=default
- **Currency:** Always `₹` + `toLocaleString('en-IN')`
- **Date format:** `DD Mon YYYY` (e.g., "20 Mar 2026")
- **Time format:** `HH:MM AM/PM`
- **Icons:** Use `icon('name')` from icons.js, never emoji in code
