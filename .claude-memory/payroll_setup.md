---
name: Payroll module setup (Mar 2026)
description: ERPNext Payroll module built from Mar 2026 Excel registers — 23 components, 4 structures, 103 slips. Code at vaishali/payroll/. Frappe formula-sandbox quirks documented.
type: project
originSessionId: dd85063d-0fe1-462d-90fc-7cbeba430cfe
---
**Date:** 2026-05-04. ~33 commits, all live on `dgoc.logstop.com`.

## What landed on prod

| Artifact | Count |
|---|---|
| Salary Component | 23 (13 earnings + 7 deductions + 3 operator-specific) |
| Salary Structure | 4 — Staff-DCEPL, Staff-DSPL, Operator-DCEPL, Overhead-DSPL |
| Employee Custom Fields | 6 — `legacy_emp_code`, `pf_applicable`, `esic_applicable`, `payroll_subgroup` (Standard\|VB), `base_basic_da`, `site_allowance` |
| Salary Structure Assignment | 103 (effective 2026-03-01) |
| Additional Salary | 147 (OT, arrears, deductions, advances) |
| Attendance | 2,487 records (Mar 2026, synthesised from Excel days_present) |
| Payroll Entry | 2 — `HR-PRUN-2026-00003` DCEPL (69 slips), `HR-PRUN-2026-00004` DSPL (34 slips) |
| Salary Slip | 103 submitted |

Reconciliation against Mar 2026 Excel: **17 exact matches, 85 off-by-rupees, 18 missing-slip, 1 no-excel-row.** Report at `/home/frappe/vaishali_data/2026-03/reconciliation.csv` on EC2.

## Formula sandbox gotchas (CRITICAL — recurring trap)

Frappe's `safe_eval` for Salary Structure formulas does NOT have these in scope:
- `min`, `max` — use ternary: `a if a < b else b`
- `month` — not a variable
- `start_date.month` — fails because `start_date` is a STRING, not a datetime, in the eval scope. Hardcode month-specific values for now (e.g. MLWF=0 for non-Jun/Dec months).

Available in scope: `base`, `gross_pay`, `start_date` (str), `end_date` (str), all Employee fields including custom fields like `pf_applicable`, `esic_applicable`, `base_basic_da`, `site_allowance`.

## HRMS Payroll Entry quirks (also recurring)

1. **`pe.submit()` does NOT create slips.** Must call module-level `hrms.payroll.doctype.payroll_entry.payroll_entry.create_salary_slips_for_employees(employees, args, publish_progress=False)` directly — `pe.create_salary_slips()` enqueues a background job for >30 employees and returns before slips exist.
2. **Always `frappe.db.commit()` immediately after `pe.submit()`** — otherwise any later ValidationError rolls back the parent Entry too.
3. **`Payroll Settings.payroll_based_on = "Attendance"` causes deadlocks** on this site. Stuck on `payroll_based_on = "Leave"` for now. Means partial-month workers don't pro-rate from Attendance — gives ~₹17k diffs in reconciliation.
4. **Mandatory `payroll_payable_account`** on Payroll Entry — Frappe doesn't auto-fetch from Company before validation. Read `Company.default_payroll_payable_account` and set explicitly.
5. **Idempotency check on `salary_structure` field crashes** — that field doesn't exist on parent `tabPayroll Entry`. Use (company, start_date, end_date, docstatus) as the dedup key. Consolidated 4 entries → 2 (1 per company); Frappe routes via SSA structure automatically.

## Excel → Employee mapping (88% match rate)

`vaishali.payroll.employees.populate_legacy_emp_code` uses fuzzy-match with `rapidfuzz.fuzz.token_set_ratio` at threshold 80, filtered by company. Out of 117 Excel rows: **104 matched, 13 unmatched** (real data debt — 11 employees missing from ERPNext, 4 Overhead "VB"-coded, 2 wrong-company sheet, 1 no-excel-row).

For "VB"-coded Overhead employees, parser falls back to NAME as resolution key. Same trick for the leave tracker (file 7) where 63/79 blocks have blank emp_code.

## File map at `vaishali/payroll/`

```
vaishali/payroll/
├── ingest/
│   ├── __init__.py            # EXCEL_DIR auto-detects EC2 vs Mac dev path
│   ├── staff_layout.py        # shared COLS for Staff (DCEPL+DSPL)
│   ├── parse_dcepl_staff.py   # 49-col, 23 employees
│   ├── parse_dspl_staff.py    # 49-col, 36 employees
│   ├── parse_dcepl_operator.py # main + OP/VB OP subgroup classifier
│   ├── parse_overhead.py      # 42-col, 4 employees
│   └── parse_leave_tracker.py # 6-row blocks, name-fallback
├── tests/                     # 21 pytest tests, all green
├── components.py              # 23 Salary Components
├── structures.py              # 4 Salary Structures + repair_formulas()
├── employees.py               # custom fields + populate_legacy_emp_code
├── ssa.py                     # bulk SSA from Excel
├── additional_salary.py       # OT/arrears/deductions/advances
├── attendance.py              # synthesise_all + force_synthesise_missing_pools
├── payroll_run.py             # 2 Payroll Entries, sync slip create+submit
├── reconcile.py               # CSV diff vs Excel
├── leave.py                   # FY 26-27 opening Leave Allocation (Task 20, NOT YET RUN)
└── setup.py                   # wipe_existing(confirm="YES_WIPE_PAYROLL")
```

## Critical operational notes

- **Directors are excluded from payroll** by design — Designation `DIRECTORS` / `DIRECTOR` / `MANAGING DIRECTOR` / etc. get no SSA. Their pay is via Director's Remuneration journal entry.
- **Re-running setup is idempotent** as long as `wipe_existing` isn't called. SSAs, Additional Salary, Attendance, slips all skip-if-exists.
- **`structures.repair_formulas()`** updates Salary Detail child rows in-place via `frappe.db.set_value`, bypassing parent submit-immutability. Use after editing formulas in `structures.py` without rebuilding entire structures.
- **Cache-clear required after structure changes:** `bench --site dgoc.logstop.com clear-cache && redis-cli FLUSHALL`. Frappe caches submitted Salary Structures.
- **Excel files staged at `/home/frappe/vaishali_data/2026-03/` on EC2.** Path resolver auto-detects: `VAISHALI_PAYROLL_EXCEL_DIR` env var > `/home/frappe/vaishali_data/2026-03/` > Mac dev path.

## What needs HR / next session

1. **Onboard 11 missing employees** (list in `/home/frappe/vaishali_data/2026-03/payroll_unmatched.json`), then re-run `populate_legacy_emp_code → assign_all → create_all` for them.
2. **Close the 85 off-by-rupees diffs** — ~70% are partial-month pro-rating gaps (need Attendance-based payroll without the deadlock), rest are per-row reconciliation.
3. **MLWF formula** — currently hardcoded 0. Before Jun 2026 payroll, write a safe-eval helper that parses `start_date` string to extract month.
4. **15 unmatched leave-tracker names** — `vaishali.payroll.leave.import_opening_balances` ran idempotently (35 skipped because Apr 30 system already created allocations, 29 zero-balance, 15 unmatched). The 15 are real data debt — names in tracker that don't fuzzy-match @ 80. Lower threshold or HR-side name cleanup needed.
