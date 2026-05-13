---
name: DCEPL Outward Gate Pass
description: Wedge 5 of ERS Store SOP — submittable DocType for the gate guard's outward register, with returnable-tools workflow
type: project
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
Wedge 5 of the DCEPL CWS Store SOP (signed off 25/03/2026). Live since 2026-05-08, commit `27ab18a`. Wraps up the 5-wedge programme.

**What it does:**
- New submittable DocType `Outward Gate Pass` (autoname `GP-.YYYY.-.#####`) under the Vaishali module — full app-managed (not custom=1), so `doctype_js` and `doctype_list_js` work without bundle imports.
- Captures every material movement leaving the workshop gate: date/time, vehicle no, driver, source warehouse, destination type (Site / CSW / Customer / Vendor / Internal / Other), carrier employee, returnable flag, expected return, source-doc reference (Stock Entry / Delivery Note / Material Request) + MRN link, items table, status (Draft / Out / Returned / Closed).
- Child DocType `Outward Gate Pass Item` (item, qty, uom, serial, batch, description).
- Lifecycle in `outward_gate_pass.py`: `validate` requires items + qty>0 + return-date when returnable; `before_submit` flips status→Out; `mark_returned()` whitelist method stamps `returned_at` + status→Returned; `on_cancel` reverts to Draft.
- UX: `outward_gate_pass.js` adds a "Mark Returned" button on submitted returnable docs (uses `frm.call('mark_returned')`). `outward_gate_pass_list.js` indicators: red Draft, orange Out, green Returned, blue Closed.

**Roles & Permissions:**
- `DCEPL Gate Guard` role created (idempotent via `vaishali.setup_gate_pass.ensure_role`). Currently unassigned — need to map gate guards to User records and grant this role.
- Grants: read+write+create+submit (no cancel/delete/amend) for guards. Stock Manager has full powers; Stock User has create+submit but not amend.

**Why:** Closes the SOP control point: "Entry in the outward register at the gate is mandatory for all issued materials (which will go out of the workshop)." Reconcilable against Stock Entry / Delivery Note via the `reference_doctype`+`reference_name` Dynamic Link.

**How to apply / extend:**
- Code at `vaishali/vaishali/doctype/outward_gate_pass/` (parent) and `outward_gate_pass_item/` (child).
- DocType is plain JSON files installed via `bench migrate` — fresh-bench installs work without fixtures.
- For deployment of any new app-managed DocType edits: must run `bench --site dgoc.logstop.com migrate` (NOT just clear-cache).
- For client-side JS changes (`.js` next to `.json`): must run `bench build --app vaishali`.
- Future: could auto-create a Gate Pass from Stock Entry on_submit if any source warehouse is in `dcepl_ers_warehouses` — defer until guards demonstrate the manual flow works.

**Action required:**
- Assign `DCEPL Gate Guard` role to actual gate-guard User accounts.
- Optional: add a desk Workspace tile for quick "+ Outward Gate Pass" from the Stores landing page.
