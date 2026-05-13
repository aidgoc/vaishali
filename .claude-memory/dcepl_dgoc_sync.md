---
name: DCEPL Cloud → DGOC EC2 sync (2026-05-04)
description: Re-runnable Cloud→EC2 CRM sync (Quotation/SO/DN/Customer + FK deps). Last run pulled 201 parents + 154 deps with set-diff approach. Inserter at /tmp/ec2_insert.py on EC2 preserves Cloud docstatus.
type: project
originSessionId: 9c5c5eb9-e45b-46bc-9b30-4da8de9903be
---
Latest sync: **2026-05-04**. Inserted on EC2: 1 Item, 37 Customer, 17 Lead (already there), 69 Address, 67 Contact, 129 Quotation, 31 Sales Order, 4 Delivery Note. Sales Invoice + Payment Entry counts already matched (1017/267).

**Why:** User asked to pull all CRM activity from Cloud after 6 weeks of drift since 2026-03-21 sync. Cloud is where desk users still create Quotations/SOs; EC2 is where the PWA + AI agent runs. One-way Cloud→EC2 keeps EC2 complete.

**How to apply:**
- Full playbook + scripts at `~/vaishali/data/dcepl_sync_2026-05-04/` (REPORT.md, sync_lib.py, 01_*..06_*.py).
- Re-run is idempotent — set-difference by `name`, inserter checks `frappe.db.exists()` before inserting.
- Auth: `harsh@dgoc.in` REST POST /api/method/login on Cloud; bench Python on EC2 via SSH.
- The inserter `/tmp/ec2_insert.py` strips server-managed fields, preserves Cloud `docstatus` (insert→submit, or insert→submit→cancel), and keeps original document name.
- Edge cases: SOs linked to cancelled Quotations need `prevdoc_docname` cleared (one such SO this run — `SO/2026-2027/0013`). `amended_from` chains are dropped (lossy but safe).
- Lead doctype on Cloud uses `CRM-LEAD-` naming series — these are standard `Lead`, not Frappe CRM's `CRM Lead` doctype.
- Don't auto-pull Lead/Contact/Address/Item — EC2 already has more (Apollo + PWA), Cloud is behind on those.
