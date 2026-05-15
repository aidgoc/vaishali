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

## Sibling repos

- **`~/dspl_erp`** → `https://github.com/aidgoc/DSPL_ERP` — FastAPI sidecar (AI chat proxy, Telegram bot, director notifications). Deployed at `/home/frappe/dspl_erp/` on the EC2 box. Deploy: `git push origin main` locally → `sudo -u frappe git -C /home/frappe/dspl_erp pull origin main && sudo supervisorctl restart dspl-fastapi`.

## Rules (split by topic)

@.claude/rules/deploy.md
@.claude/rules/frappe-gotchas.md
@.claude/rules/email-and-auth.md
@.claude/rules/pwa-and-attendance.md
@.claude/rules/hrms-expense.md
@.claude/rules/status-log.md
