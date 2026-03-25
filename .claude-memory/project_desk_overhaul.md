---
name: ERPNext Desk UI Overhaul
description: Planned desk overhaul — custom theme matching Notion PWA style, DSPL workspaces, number cards, charts
type: project
---

ERPNext desk UI overhaul planned for next session.

**Why:** Current desk is stock ERPNext — bare DSPL Sales workspace with just Quick Access links, no number cards, no charts, no visual identity. Doesn't match the Notion-inspired PWA quality.

**How to apply:** Three workstreams:
1. **Custom theme** — CSS override via `vaishali/public/css/vaishali.css` (loaded via hooks.py `app_include_css`). Match PWA tokens: white background, -0.04em headings, 8px radius, sentence-case, borderless cards, tinted avatars.
2. **DSPL Workspaces** — Rich workspaces for Sales, Service, Production, Finance with Number Cards (Open Quotations, MTD Revenue, Outstanding, Active Leads), Charts (monthly trends, funnel), and Shortcuts grouped logically.
3. **Form customizations** — Client scripts for key doctypes (Quotation, Lead, Customer) to improve UX.

**Current state (2026-03-21):**
- DSPL Sales workspace exists with Quick Access (Quotation 157, Sales Order 70, Lead 61, Customer 1879, Sales Invoice 1017, Item 6456) + Reports link
- DSPL Guide workspace exists
- 20+ standard Frappe workspaces in sidebar (Accounting, Buying, Selling, etc.)
- No custom CSS theme applied
- No number cards or charts on any workspace
