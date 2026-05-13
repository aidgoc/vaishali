---
name: DCEPL ERS MRN HOD-approval gate
description: Wedge 4 of ERS Store SOP — Material Request needs HOD tick before any Material Issue Stock Entry can submit out of Stores - DCEPL
type: project
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
Wedge 4 of the DCEPL CWS Store SOP (signed off 25/03/2026). Live since 2026-05-08, commits `682fcb2` + `8a933cc`.

**What it does:**
- Material Request gains 3 fields: `mrn_hod_approved` (Check), `mrn_approved_by` (User, read-only), `mrn_approved_at` (Datetime, read-only).
- Validate hook on Material Request: ticking the box requires the **`DCEPL ERS HOD`** role; flips auto-stamp approver + timestamp; un-ticking clears them.
- before_submit hook on Stock Entry: refuses Material Issue from `dcepl_ers_warehouses` unless every source row's MR is `mrn_hod_approved=1`.
- Section is `depends_on` `company == DCEPL && material_request_type == "Material Issue"` so other companies / non-issue MRs see no extra UI.

**Why:** SOP rule "Store dispatches material as per the department head's instructions." Encodes the gate that's currently a verbal/WhatsApp handshake into a system-enforced approval with audit trail.

**How to apply:**
- HOD role-holders (as of 2026-05-08):
  - **Ramdas Avhad** (`sales1@dgoc.in`, MANAGER OP & SALES, Operations - DCEPL, Employee `RAMDAS SUKHDEV AVHAD`). Closest person to an ERS HOD — DCEPL has no formal one.
  - **Anirudha Bhide** (`operation1.dgoc@gmail.com`, ASSISTANT MANAGER OP & SALES, Employee `Anirudha Bhide` / number ST334, reports to Ramdas). Backup approver. Note: dgoc.in convention skipped here — Anirudha's email is a Gmail address per user direction.
- Both have the same Company default (DCEPL only) via User Permission `apply_to_all_doctypes=1, is_default=1`.
- Add more HODs by assigning the `DCEPL ERS HOD` role on their User record + a User Permission for Company=DCEPL.
- Code at `vaishali/mrn_approval_guard.py`. Hooks at `vaishali/hooks.py` lines 95-99 (Material Request `validate`) and 115-117 (Stock Entry `before_submit`).
- Kill switch: `site_config.dcepl_mrn_approval_enabled = false` disables both hooks.
- Scope same as wedges 1+3: company=DCEPL AND warehouse in `dcepl_ers_warehouses` (default `["Stores - DCEPL"]`).
- 5 custom fields exported to `vaishali/fixtures/custom_field.json` so fresh-bench installs and `bench update` are safe.
- Sales-flow MRNs (per SOP — "PO and invoice details are verified through email") still go through the same MR → HOD-approve → Stock Entry chain. The "Sales" branch differs in the *evidence* attached, not in the gate itself.

**Gotchas:**
- The `validate` hook reads the *previous* `mrn_hod_approved` value via `frappe.db.get_value` on `is_new()` check. If a script bulk-updates MRs by directly setting `mrn_hod_approved` via `frappe.db.set_value` (which bypasses validate), the auto-stamp won't fire. Always go through `frappe.get_doc(...).save()` for approvals.
- The Stock Entry guard only checks `it.s_warehouse` — not `t_warehouse`. Material Receipts INTO Stores - DCEPL are not blocked, only Issues OUT.
