---
name: Data sync status — Frappe Cloud to EC2
description: As of 2026-03-21, both instances are fully synced. Sync was done via REST API record migration.
type: project
---

Both instances (dcepl.logstop.com → dgoc.logstop.com) fully synced as of 2026-03-21.

Key counts: 1,879 customers, 1,807 suppliers, 6,456 items, 8,242 contacts, 189 employees, 1,017 invoices, 267 payments, 223 BOMs.

**Why:** User needs complete data in the self-hosted EC2 for the PWA. The Frappe Cloud instance is the source of truth where desk users create records.

**How to apply:** When data gaps are suspected, compare counts via `frappe.client.get_count` on both instances, then migrate missing records. Watch for linked doc dependencies (Contact, Address, Terms templates) that must be synced before parent docs (Quotation, Sales Order).
