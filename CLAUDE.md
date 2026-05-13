# Vaishali — DSPL Org OS (Frappe v15 + PWA)

Frappe v15 + ERPNext, Python. No jQuery/React — vanilla JS with `el()` DOM builder only.
EC2: `dspl-erp-server`, `35.154.17.172`, `i-08deae9f14e3cc99e`, ap-south-1. SSH via EC2 Instance Connect.

## Critical Rules

- **⛔ NEVER rotate `site_config.json::encryption_key`.** Locked permanently. Rotation breaks every encrypted password (Email Account, Connected App, GST api_secret) and there is no automatic recovery. If a tool/migration/restore wants to change it, stop and ask.
- No innerHTML — always `el()` or `textContent`
- No card borders — whitespace separation
- No decorative shadows — flat surfaces only
- No UPPERCASE headings — always sentence case
- Status colors: green=completed, orange=in-progress, red=open/overdue, blue=default
- Currency: always `₹` + `toLocaleString('en-IN')`
- Cache bust: bump `?v=` in hooks.py + SW version in sw.js + `bench build` + nginx restart on CSS changes
- **Number Card / Dashboard Chart filters: 5-element `[doctype, field, op, value, is_dynamic_bool]`.** 3-element form is accepted on save but explodes at render. `dynamic_filters_json` expressions run in the **browser** — use `frappe.datetime.*` not `frappe.utils.*`.
- **Aggregates need raw SQL.** `frappe.db.get_value` with `SUM()` returns the first row; `frappe.get_all` with `SUM()` adds implicit `GROUP BY name`. Use `frappe.db.sql("SELECT COALESCE(SUM(x),0) FROM tab... WHERE ...")` for real aggregates.
- **`Quotation Item.item_group` (and SO/DN/SI Item) is `fetch_from` — cached at row insert, never refreshed.** Renaming or deleting an Item Group silently breaks amend/save on every historical document that referenced it (`Could not find Row #1: Item Group: X`). Before any Item Group rename/delete, scan `tabQuotation Item / tabSales Order Item / tabDelivery Note Item / tabSales Invoice Item` for the old name. Hit 2026-05-12 on Arti's amend of `22/2026-2027/0009-6` — fix was to re-create `ELECTRIC SCISSOR (BLF01)` under `03. Finished Products EPS (BL)` and move BLF01001–BLF01014 back into it.
- **Frappe File doctype has NO `description` field.** Tag metadata by prefixing `file_name`. To stage a file without a parent doc, use `save_file(dt=None, dn=None, ...)` or PWA `fieldAPI.uploadFile(file, '', '')` — re-parent on submit.

## Sibling repos

- **`~/dspl_erp`** → `https://github.com/aidgoc/DSPL_ERP` — FastAPI sidecar (AI chat proxy, Telegram bot, director notifications). Deployed at `/home/frappe/dspl_erp/` on the EC2 box. Deploy: `git push origin main` locally → `sudo -u frappe git -C /home/frappe/dspl_erp pull origin main && sudo supervisorctl restart dspl-fastapi`.

@.claude/rules/conventions.md
