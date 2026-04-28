# Vaishali — DSPL Org OS (Frappe v15 + PWA)

Frappe v15 + ERPNext, Python. No jQuery/React — vanilla JS with `el()` DOM builder only.
EC2: `dspl-erp-server`, `35.154.17.172`, `i-08deae9f14e3cc99e`, ap-south-1. SSH via EC2 Instance Connect.

## Critical Rules

- No innerHTML — always `el()` or `textContent`
- No card borders — whitespace separation
- No decorative shadows — flat surfaces only
- No UPPERCASE headings — always sentence case
- Status colors: green=completed, orange=in-progress, red=open/overdue, blue=default
- Currency: always `₹` + `toLocaleString('en-IN')`
- Cache bust: bump `?v=` in hooks.py + SW version in sw.js + `bench build` + nginx restart on CSS changes

@.claude/rules/conventions.md
