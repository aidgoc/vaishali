# Vaishali — DSPL Org OS

Custom Frappe v15 app for **Dynamic Servitech Private Limited** (DSPL) — crane safety electronics, equipment rental, wire rope testing. AI-native ERP layer: PWA for field staff, View Engine for dashboards, AI agent (Claude) for natural language ERP queries.

**Live:** https://dgoc.logstop.com/field | **Desk:** https://dgoc.logstop.com/app | **Frappe Cloud:** https://dcepl.logstop.com

## Architecture

```
Browser (PWA)  ──cookie──>  Frappe/ERPNext (gunicorn :8000)
                              ├── vaishali.api.field.*    (57 whitelist endpoints)
                              ├── vaishali.api.views.*    (View Engine: 15 composable views)
                              ├── vaishali.api.chat.*     (AI chat v2: 6 endpoints)
                              └── vaishali.views.engine   (role-filtered data fetcher)

Browser (PWA)  ──cookie──>  nginx ──/api/ai/*──> FastAPI slim (:8443)
                              ├── ai/chat.py       (Claude brain loop, 120s timeout)
                              ├── ai/tools.py      (5 ERP tool schemas)
                              ├── ai/executor.py   (tool → Frappe API with Host header)
                              ├── ai/prompt.py     (system prompt with full ABP data)
                              ├── telegram/*        (notifications + linking)
                              └── forwards cookie to Frappe for auth
```

| Layer | Tech | Purpose |
|-------|------|---------|
| **PWA** | Vanilla JS SPA, `el()` DOM builder | 40 screens, 66 routes, hash router, standalone PWA |
| **Field API** | `@frappe.whitelist` in `api/field.py` | 57 endpoints with ownership/role checks |
| **Linking** | `api/linking.py` doc_events | DCR → Lead → Opportunity auto-creation + SO/Quotation backlink |
| **View Engine** | `views/registry.py` + `views/engine.py` | 15 composable views, role-filtered |
| **AI Agent** | `agent/runner.py` (Bedrock) | Claude with 101 tools, persistent memory, slash commands |
| **FastAPI slim** | `~/dspl_erp/` on EC2 | Async AI chat + Telegram notifications |

**Detailed docs per layer:**
- PWA design system, UI kit, screen patterns → `vaishali/public/field/CLAUDE.md`
- AI agent config, tools, role gates → `vaishali/agent/CLAUDE.md`
- API security, path translation, DCR linking → `vaishali/api/CLAUDE.md`

**Slash commands:** `/deploy`, `/health-check`, `/apollo-sync`, `/setup`

## Company Context

- **Products:** ACD, DRM-3400, DJ-1005, E-DASH, F-Dash, WWSI, MRT Systems, TPS
- **BOM Item Prefixes:** Krisp-derived BK*/BL* codes; no EPS/ESS/ERS prefixes
- **Annual Target:** ₹10.09 Crore (FY 2026-27, Apr–Mar)
- **Sales Team:** Raghuvir, Aniket, NJG, BNG (Bangalore)
- **ERPNext apps:** frappe, erpnext, hrms, india_compliance, payments, vaishali
- **HSN items:** disable, never delete
- **Currency:** INR only, format ₹X,XX,XXX (en-IN locale)
- **System:** 201 accounts, 4 cost centers, 9+8 tax templates, 2 price lists, 14 warehouses

## ERPNext Customizations

### Custom Fields
| DocType | Field | Purpose |
|---------|-------|---------|
| Item | ABP Product / ABP Category (Select) | Business plan product mapping |
| Quotation | quotation_temperature (Select) | Hot/Warm/Cold/Lost |
| Quotation | lost_reason_category / lost_remark | Price/Technical/Budget/Other + detail |
| Lead | Zone (Select) | North/South/East/West/Central |
| Customer | Zone (Select), ICP Score (Rating) | Geographic presence, ideal customer match |
| Daily Call Report | 14 custom fields | DCR-to-Sales linking (see `vaishali/api/CLAUDE.md`) |
| Employee | telegram_chat_id (fixture) | Telegram notification linking |

### Desk Client Scripts (`public/js/`, registered via `doctype_js` in hooks.py)
- **Quotation:** "Mark as Lost" dialog (lost_reason_category + lost_remark, sets temperature=Lost), auto `valid_till` (30 days), customer quotation count indicator
- **Lead:** Age indicator (days, color-coded), "Convert to Customer" button, auto `lead_name` from company
- **Customer:** Lifetime value indicator (sum of invoices), outstanding amount, sales timeline

### Desk Theme (`public/css/vaishali.css`)
571-line CSS override scoped to `body[data-theme="light"]`:
- White page, `rgba(0,0,0,0.04)` borders, 10px card radius, `-0.04em` headings
- Red primary (`#E60005`), 8px button radius, sentence-case everywhere
- Covers: navbar, sidebar, workspace, cards, list/form view, buttons, pills, modals, kanban

### Workspaces (`setup_workspace.py`)
Run: `bench --site dgoc.logstop.com execute vaishali.setup_workspace.setup` (idempotent)
- **DSPL Sales:** 7 Number Cards + Monthly Revenue bar + Quotation Pipeline donut + Lead Source pie
- **DSPL Operations:** 7 Number Cards + Monthly Orders chart + 4 shortcuts
- **DSPL Finance:** 3 Number Cards + 2 charts + 3 shortcuts
- 17 Number Cards + 5 Dashboard Charts total, all prefixed "DSPL"

#### Workspace Gotchas (Frappe v15)
1. Number Card autonames from `label` — explicit `name` field is ignored
2. Dashboard Chart autonames from `chart_name` — same pattern
3. Content JSON blocks need `id` fields (random 10-char alphanum, Editor.js requirement)
4. Content JSON headers: `<span class="h4"><b>...</b></span>` format
5. Both content JSON AND child tables (`number_cards`, `charts`, `shortcuts`) required — content alone = blank
6. Child table `label` must exactly match content JSON `block_name`
7. `frappe.db.commit()` between card creation and workspace save
8. Number Card `filters_json` does NOT evaluate `"today"` — use `dynamic_filters_json`
9. Static `/assets/` cached 1 year — need `bench build` + restart after changes

### Notifications (hooks.py)
- Quotation expiring (3 days before valid_till)
- New Sales Order submitted (managers get financial, production team gets items only)
- Overdue Invoice (7 days after due)
- Lead assigned to new owner

### Production Team SO Access
Manufacturing User/Manager roles have read-only access to Sales Order with financial fields hidden (permlevel=1 on 54 fields). Setup: `vaishali.api.linking.setup_production_so_access`

## Apollo.io Integration (`api/apollo.py`)

Lead enrichment and import via Apollo.io API. Config in site_config: `apollo_api_key`, `apollo_list_id`, `apollo_sync_enabled`.

| Feature | Endpoint | Trigger |
|---------|----------|---------|
| Enrich Lead | `vaishali.api.apollo.enrich_lead` | "Enrich from Apollo" button on Lead form |
| Import contact | `vaishali.api.apollo.import_from_apollo` | "Import from Apollo" dialog on Lead list |
| Bulk enrich | `vaishali.api.apollo.bulk_enrich_leads` | Scheduler (every 30min), 10 leads/run |
| List sync | `vaishali.api.apollo.sync_apollo_list` | Scheduler (every 30min), "Push to CRM" list |

Custom fields on Lead: `apollo_id`, `designation`, `apollo_website`, `apollo_industry`, `linkedin_url`, `apollo_enriched`. Lead Source: "Apollo".

## BOM Management

**NEVER cancel submitted BOMs** — they link to Work Orders, Production Plans, parent BOMs. Cancelling cascades.

| Fix Type | Procedure |
|----------|-----------|
| **Wrong rates** | Fix Item master `valuation_rate` → click "Update Cost" on the BOM (works on submitted BOMs, no cancel) |
| **Bulk rate fix** | Fix Item prices → Manufacturing > BOM Update Tool > "Update latest price in all BOMs" |
| **Structural (add/remove/swap items)** | Create new BOM → BOM Update Tool to replace old→new across parents |
| **Last resort amend** | Cancel → Amend (creates copy with `amended_from`). Only if BOM Update Tool won't work |

**`rm_cost_as_per`** controls rate source: Valuation Rate (default, falls back to Item.valuation_rate) | Last Purchase Rate | Price List

**DSPL context:** 0 Purchase Orders → valuation rates use Item master's static `valuation_rate` (level 3 fallback). To fix rates: update Item.valuation_rate → Update Cost on BOM.

## Conventions

- **No jQuery, no React** — vanilla JS with `el()` builder only
- **No innerHTML** — always `el()` or `textContent`
- **No UI.page()** — router handles all headers (removed)
- **No card borders** — whitespace separation on white page
- **No decorative shadows** — flat surfaces only
- **No scale transforms on :active** — use `background: rgba(0,0,0,0.04)` or `filter: brightness()`
- **No UPPERCASE section headings** — always sentence case ("Pending approvals" not "PENDING APPROVALS")
- **Status colors:** green=completed, orange=in-progress, red=open/overdue, blue=default (pills only)
- **Currency:** Always `₹` + `toLocaleString('en-IN')`
- **Icons:** `icon('name')` from icons.js — all `aria-hidden="true"`
- **Form validation:** `UI.fieldError(input, message)` for inline validation
- **Cache busting:** Jinja `?v={{ _v }}` on all script/CSS tags (minute-level timestamp)
- **API limits:** `limit_page_length=0` for full lists, reasonable caps for search
- **Accessibility:** `:focus-visible` outlines, ARIA roles, `prefers-reduced-motion` support
- **Timer cleanup:** All `setInterval` must track timers and clear on `hashchange` navigation

## CSS/Asset Cache Chain (CRITICAL)

Three layers cache desk CSS — ALL must be busted when updating `vaishali.css`:
1. **nginx:** `max-age=31536000` on `/assets/` — restart nginx
2. **Service Worker:** `ignoreSearch: true` caches CSS ignoring `?v=` params — bump `CACHE_NAME` in `sw.js`
3. **Browser:** disk cache — change `app_include_css` query param in `hooks.py`

**After CSS changes:** bump `?v=` in hooks.py + bump SW version in sw.js + `bench build` + restart nginx + flush Redis.

## Infrastructure

- **EC2:** `dspl-erp-server`, ID `i-08deae9f14e3cc99e`, IP `35.154.17.172`, region `ap-south-1`
- **SSH:** EC2 Instance Connect (no PEM key). Keys expire in ~60s — chain SCP+SSH in one command.
- **Server git remote:** `upstream` (not `origin`)
- **Frappe Cloud:** `dcepl.logstop.com` (source of truth for data, synced to EC2)
- **nginx:** `Service-Worker-Allowed: /` header on sw.js, gzip enabled
- **SW version:** v26 (`dspl-field-v26`), scope `/`, `ignoreSearch: true`

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

## Project Memory

Read `.claude-memory/` for persistent context: user profile, data inventory, EPS revenue, roadmap.
