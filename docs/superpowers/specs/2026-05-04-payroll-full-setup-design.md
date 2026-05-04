# Payroll module — full setup from Mar 2026 Excel registers

**Date:** 2026-05-04
**Status:** Draft, pending user review
**Scope:** Build the ERPNext Payroll module from scratch using the four Mar 2026 Excel salary registers as the source of truth, so Apr 2026 onwards runs natively in ERPNext.

---

## Context

The Vaishali instance has scattered payroll artefacts (18 components, 3 structures, 356 SSAs, 23 slips, 3 Payroll Entries) accumulated from earlier exploratory scripts. The user has confirmed payroll is "not yet set up" — these artefacts are scratch and will be wiped before the new build.

Source of truth — four Excel files at `~/vaishali/data/`:

| File | People | Entity | Pay model |
|---|---|---|---|
| 1. DCEPL Employee | 23 | DCEPL | Staff structure (9-component) |
| 2. DSPL Employee | 36 | DSPL | Staff structure (9-component) |
| 3. DCEPL Operator | 47 | DCEPL | Operator structure (flat gross + PF/ESIC, two pools: OP + VB OP) |
| 4. Overhead | 4 | DSPL/NA | Overhead structure (5-component, no PF/ESIC) |
| 7. Leave Tracker | ~38 | Mixed (HO + Pirangut) | 12-month earned/taken/balance per employee |

Total: ~110 paid people across 2 active companies (DCEPL, DSPL).

## Goals

1. **March 2026 fidelity:** Every generated Salary Slip's `net_pay` ties to the Excel `Net Salary` to ±₹2 (FP rounding tolerance). Anything outside is a reconciliation defect to fix.
2. **April 2026 readiness:** Salary Structures and Assignments persist so the next Payroll Entry runs without spreadsheet input.
3. **Leave continuity:** Apr 2026 starts with each employee's Mar 2026 closing leave balance from file 7.
4. **Idempotent setup:** Every script in this build is re-runnable safely. No destructive operations without explicit confirmation flag.

## Non-goals

- TDS computation. The Excel files have no TDS column populated for Mar 2026 (all blank). We honour that for Mar; TDS becomes a future-month concern.
- Director's Remuneration. Directors are paid via journal entry, not payroll. Excluded.
- Provident Fund / ESIC statutory return file generation. ERPNext can produce these; out of scope for this setup.
- Salary register PDF format matching the accountant's Excel layout. Standard ERPNext payslip PDF is acceptable for Mar 2026 reconciliation; a custom Salary Register print format is a separate future task if asked.

---

## Architecture

```
                 ┌─────────────────────────────┐
                 │  4 Excel files (Mar 2026)   │
                 └─────────────┬───────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  ingest/parse_*.py (read-only)     │
              │  Returns dict[emp_code → row]      │
              └────────────────┬───────────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  setup_payroll.py (idempotent)     │
              │  1. Wipe existing (with --confirm) │
              │  2. Create Salary Components       │
              │  3. Create 3 Salary Structures     │
              │  4. Resolve Excel emp_code → ERP   │
              │     Employee.name                  │
              │  5. Create per-employee SSA        │
              │  6. Create per-employee            │
              │     Additional Salary for OT       │
              │     and other one-offs             │
              └────────────────┬───────────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  Mar 2026 Payroll Entry × 3        │
              │   - DCEPL Staff (23 emps)          │
              │   - DCEPL Operator (47 emps)       │
              │   - DSPL Staff (36 + 4 overhead)   │
              └────────────────┬───────────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  reconcile_mar2026.py              │
              │  Diff slip.net_pay vs Excel        │
              │  net_pay. Report misses.           │
              └────────────────┬───────────────────┘
                               ▼
              ┌────────────────────────────────────┐
              │  import_leave_balances.py          │
              │  Mar closing → Leave Allocation    │
              │  for FY 26-27                      │
              └────────────────────────────────────┘
```

All scripts live under `vaishali/payroll/` (new package). Setup is invoked via `bench --site dgoc.logstop.com execute vaishali.payroll.setup.run`. Reconciliation report is a `frappe.whitelist` endpoint surfaced on a desk page so HR can re-run it without bench access.

---

## Salary Components

19 components total. Earnings on top, deductions below.

### Earnings (12)

| Name | Abbr | Type | Depends on payment days | Formula / value | Used by |
|---|---|---|---|---|---|
| Basic + DA | BD | Earning | Yes | `base * 0.40` | Staff, Overhead |
| HRA | HRA | Earning | Yes | `base * 0.20` (Staff) / `base * 0.184` (Overhead) | Staff, Overhead |
| Medical Allowance | MED | Earning | Yes | 1250 (fixed) | Staff |
| LTA | LTA | Earning | Yes | 1250 (fixed) | Staff |
| Conveyance | CONV | Earning | Yes | 1600 (fixed) | Staff |
| Children Education | CHEDU | Earning | Yes | 200 (fixed) | Staff |
| Food Allowance | FOOD | Earning | Yes | 1170 (Staff) / `base * 0.16` (Overhead) | Staff, Overhead |
| Statutory Bonus | SB | Earning | Yes | `BD * 0.0833` | Staff |
| Special Allowance | SA | Earning | Yes | `base - (BD + HRA + MED + LTA + CONV + CHEDU + FOOD + SB)` (Staff) | Staff |
| Attendance Allowance | AA | Earning | Yes | `base * 0.152` | Overhead |
| SP Allowance | SP | Earning | Yes | `base * 0.104` | Overhead |
| Overtime | OT | Earning | No (Additional Salary) | per-employee monthly amount | All (when applicable) |
| Operator Logsheet Pay | OLP | Earning | No (Additional Salary) | (kept from existing setup_operator_pay.py) | Operator opt-in |
| Salary Arrears | ARR | Earning | No | per-employee monthly amount | All (when applicable) |

### Deductions (7)

| Name | Abbr | Formula |
|---|---|---|
| Provident Fund | PF | `min(BD * 0.12, 1800)` only if `Employee.pf_applicable = 1` |
| ESIC | ESIC | `gross_pay * 0.0075` only if `gross_pay <= 21000` and `Employee.esic_applicable = 1` |
| Professional Tax | PT | India PT formula (₹200 standard, ₹300 in Feb) — already exists |
| MLWF | MLWF | ₹6 employee + ₹18 employer, half-yearly (Jun + Dec). Otherwise ₹0. |
| TDS | TDS | (deferred — manual via Additional Salary if needed for Mar 2026) |
| Other Deductions | OD | per-employee monthly via Additional Salary |
| Salary / Other Advance | SADV | per-employee monthly via Additional Salary |

**Note on PF/ESIC applicability:** the Excel files have explicit `PF applicable Y/N` and `ESIC applicable Y/N` columns. We mirror those onto two new `Employee` Custom Fields (`pf_applicable`, `esic_applicable`) and condition the components on them. This avoids hard-coded company logic.

---

## Salary Structures (3)

### 1. `Staff - DCEPL` and `Staff - DSPL`

Same formula, separate structures so the company filter on Salary Structure Assignment validates correctly.

Earnings: Basic + DA, HRA, Medical, LTA, Conveyance, Children Edu, Food, Stat Bonus, Special Allowance.
Deductions: PF, ESIC, PT, MLWF.

Used by 23 DCEPL Employee + 36 DSPL Employee = **59 employees**.

### 2. `Operator - DCEPL`

The Operator file (`OP Salary Mar 2026` sheet) uses a **minimum-wage-anchored** breakdown rather than a percentage one. Sample row (DINESH ADEY, Gross ₹19,000):

| Component | Amount | Pattern |
|---|---|---|
| Basic Salary | ₹10,350 | Maharashtra minimum-wage Basic (skilled grade) |
| DA | ₹5,964 | VDA (revised periodically by Maharashtra labour dept) |
| DA Arrears | ₹0 | retro adjustment when VDA notification arrives mid-period |
| HRA | ₹2,686 | balance = Gross − Basic − DA |
| Attendance Allowance, Food, SP | ₹0 | populated only for some operators |
| OT (col 32) | ₹852.56 | 14 hrs × ₹60.90/hr |
| Site allowance (col 35) | ₹1,990 | per-operator monthly |

So Earnings on the structure: Basic Salary, DA, DA Arrears, HRA (balance), Attendance Allowance, Food Allowance, SP Allowance, Site Allowance.

**Formula:**
- `Basic + DA` is read directly from the Excel for each operator (becomes their `SSA.base_basic_da` Custom Field on Employee — *Maharashtra minimum-wage anchor*, doesn't scale with gross).
- `HRA = base − basic_da` (balance).
- Other allowances (Attendance / Food / SP / Site) are read row-by-row from Excel and stored on the Employee record as fixed monthly amounts.

Deductions: PF (1800 cap on Basic+DA), ESIC (0.75% on `total_gross including OT + SA` for already-enrolled members regardless of 21k threshold — see DINESH at 21,842 still being deducted), PT, MLWF.

Used by 47 DCEPL operators (27 OP + 20 VB OP).

The "VB OP" sub-pool is an internal payment-route distinction within DCEPL (operators paid via Victory Bharat-routed account, not a separate company on ERPNext). We mark them via a new `Employee.payroll_subgroup` Select field with values `Standard | VB`. *Confirm with user during spec review.*

### 3. `Overhead - DSPL`

Earnings: Basic + DA, HRA (18.4%), Attendance Allowance (15.2%), Food (16%), SP Allowance (10.4%). All percentage-based, sum to 100%.
Deductions: MLWF only (no PF, no ESIC).

Used by 4 employees (1 actually DSPL-tagged, 2 with `NA` company in the Excel — *user to confirm correct company for Santosh, Sulbha during spec review*).

---

## Excel-to-Employee mapping

The Excel `Emp Code` column (e.g. `ST109`, `OP309`) is the linking key. We add a new `Employee.legacy_emp_code` Custom Field (Data, indexed) and pre-populate it for every active employee using a lookup table generated from the 4 files.

**Mismatches:** for any Excel row whose `Emp Code` doesn't resolve to an active Employee, the setup script:
1. Logs the row to a JSON report at `~/vaishali/data/payroll_2026-03_unmatched.json`.
2. Skips that row (does not create an SSA).
3. Returns the report path in stdout so we can fix matches manually before re-running.

**Rejection check:** if more than 5 unmatched rows in any file, abort the setup with the report path. 5 is a noise tolerance; bigger gaps indicate a structural bug.

---

## Per-employee inputs from Excel

For each row, we capture:

| Excel column | Maps to | Notes |
|---|---|---|
| `Salary Gross` (col 12 in salary sheet) | `SSA.base` | Pre-attendance gross |
| `PF applicable` | `Employee.pf_applicable` | Y/N → 1/0 |
| `ESIC applicable` | `Employee.esic_applicable` | Y/N → 1/0 |
| `OT Applicable` | `Employee.ot_eligible` | Already exists as `overtime_eligible` from setup_overtime.py |
| `Days Worked` | `Salary Slip.payment_days` | Computed by ERPNext from attendance — we set Attendance instead so ERPNext derives this |
| `OT Amount` | Additional Salary against `Overtime` component, payroll_date = 2026-03-31 |
| `Other Deductions` | Additional Salary against `Other Deductions`, signed negative |
| `Salary Arrears` | Additional Salary against `Salary Arrears` |
| `Salary / other advance deduction` | Additional Salary against `Salary / Other Advance` |
| Bank A/c, IFSC | `Employee.bank_account_no`, `Employee.ifsc_code` | Already-standard fields |

## Attendance import for Mar 2026

ERPNext computes `payment_days` for a Salary Slip from submitted Attendance records in the period. To make Mar 2026 slips compute correctly, we create one synthetic Attendance record per (employee × day) for Mar 1-31 based on the Excel attendance sheet's "Days Worked" + "Unpaid Leaves" + "Days Deducted for Late Marks". Status mapping:

| Excel category | ERPNext Attendance status |
|---|---|
| Days Present | Present |
| Weekly Offs | (no Attendance record — handled by ERPNext holiday list) |
| Paid Holidays | (handled by Holiday List) |
| Paid Leaves | On Leave (with leave_type set) |
| Unpaid Leaves | On Leave (leave_type = "Leave Without Pay") |
| Late Mark days | Half Day (when ½-day deduction) or Present |
| Absent | Absent |

Existing setup may already populate Mar 2026 Attendance — the script first checks `frappe.db.count("Attendance", {"attendance_date": ["between", ["2026-03-01","2026-03-31"]]})`. If > 50, we skip Attendance creation and trust what's there; otherwise we synthesize from Excel.

---

## Payroll Entry execution

3 Payroll Entries for Mar 2026, in order:

1. **DCEPL Staff** — `start_date=2026-03-01`, `end_date=2026-03-31`, `payroll_payable_account = "Salary Payable - DCEPL"`, branch filter optional.
2. **DCEPL Operator** — same period, separate entry to keep ledger lines clean.
3. **DSPL Staff + Overhead** — same period, both structures pulled in via Employee filter (department NOT IN Operations).

Each Payroll Entry: create → submit (auto-creates draft Salary Slips) → submit Salary Slips in batch → make Bank Entry (skipped — accountant uses bank file generated outside ERP).

## Reconciliation

`vaishali.payroll.reconcile.run_mar2026()` produces a CSV at `~/vaishali/data/payroll_2026-03_reconciliation.csv`:

| emp_code | name | excel_net | erp_net | diff | status |
|---|---|---|---|---|---|

`status ∈ {match, off-by-rupees, missing-slip, no-excel-row}`. Any row with `|diff| > 2` is an `off-by-rupees`. Goal: 0 mismatches before sign-off.

---

## Leave balance import (file 7)

For each employee in HO + Pirangut sheets:
1. Read closing balance from col 18 (`Sanctioned`) and col 17 (`MAR`).
2. Map to ERPNext Employee via `legacy_emp_code`.
3. Create one `Leave Allocation` doc:
   - `from_date = 2026-04-01`
   - `to_date = 2027-03-31`
   - `leave_type = "Privilege Leave"` (the company's earned leave type)
   - `new_leaves_allocated = closing_bal_from_excel`
   - `description = "FY 26-27 opening balance imported from Mar 2026 leave tracker"`
4. Skip employees not found in either ERPNext or sheet — log to the same unmatched report.

The 1.5/month accrual rate continues from FY 26-27 onwards via existing leave policy (`vaishali.api.attendance` already has the accrual logic).

---

## Wipe step (destructive — explicit confirmation)

`vaishali.payroll.setup.wipe_existing(confirm="YES_WIPE_PAYROLL")`:
- Cancel all submitted Salary Slips (23) → delete all Salary Slips
- Cancel all submitted Payroll Entries (3) → delete
- Cancel all submitted Salary Structure Assignments (356) → delete
- Cancel all submitted Salary Structures (3) → delete
- Delete all 18 Salary Components
- Delete `Operator Logsheet Pay` if present (recreated by new setup)
- Preserve: Employee records, Leave Allocations, Holiday Lists, Department records.

If `confirm` argument doesn't match the literal string, the function aborts and prints the count of what would be deleted. The setup script does NOT call wipe automatically — operator must invoke wipe explicitly first.

---

## Custom fields (new)

| DocType | Field | Type | Default | Purpose |
|---|---|---|---|---|
| Employee | legacy_emp_code | Data (indexed) | "" | Excel `Emp Code` linkage |
| Employee | pf_applicable | Check | 0 | PF eligibility flag |
| Employee | esic_applicable | Check | 0 | ESIC eligibility flag |
| Employee | payroll_subgroup | Select (Standard\|VB) | Standard | Operator routing |
| Employee | base_basic_da | Currency | 0 | Operator min-wage anchor (Basic+DA) |
| Employee | site_allowance | Currency | 0 | Operator monthly site allowance |

All four go into `vaishali/fixtures/custom_field.json` after creation, so a fresh bench install rebuilds them.

## Error handling

- Excel parse errors abort with the cell coordinate. No partial ingestion.
- Salary Component create on a name that already exists from prior run → preserve the existing record (idempotent), do not overwrite.
- SSA submit failure → log to `frappe.log_error("PayrollSetup")` and continue with the next employee. Final count includes errors.
- Payroll Entry submit failure → abort, leave the entry as Draft for manual inspection.
- Reconciliation mismatch is reported, not raised. Operator decides next action.

## Testing

- **Unit:** parser tests for each of the 4 file shapes — read 3 known rows per file, assert dict matches.
- **Integration:** dry-run mode in `setup_payroll.py` that returns the planned operations as a list (`would_create_components`, `would_create_ssa`, etc.) without writing.
- **End-to-end:** Mar 2026 reconciliation — every employee's slip ties to ±₹2 of Excel net.
- **PWA verify:** existing `#/salary` screen renders the new slips correctly. Smoke-test with two employees post-deploy.

## Rollout sequence

1. Write parsers + dry-run (no DB writes) — validate Excel reads.
2. Run wipe step on prod — explicit user-typed confirmation in this conversation.
3. Run setup_payroll.py — components, structures, SSAs, additional salaries.
4. Create Mar 2026 Attendance from Excel (if not already there).
5. Submit 3 Payroll Entries → submit Salary Slips.
6. Run reconciliation — fix until 0 mismatches.
7. Import leave allocations.
8. Smoke test PWA `#/salary` screen.
9. Commit fixtures + scripts. Update `CLAUDE.md` payroll gotchas section.

## File layout (new)

```
vaishali/payroll/
├── __init__.py
├── ingest/
│   ├── __init__.py
│   ├── parse_dcepl_staff.py
│   ├── parse_dspl_staff.py
│   ├── parse_dcepl_operator.py
│   ├── parse_overhead.py
│   └── parse_leave_tracker.py
├── components.py        # Salary Component creation
├── structures.py        # 3 Salary Structures
├── employees.py         # legacy_emp_code mapping + custom fields
├── ssa.py               # Salary Structure Assignment bulk create
├── attendance.py        # Mar 2026 Attendance synthesis
├── additional_salary.py # OT, arrears, deductions, advances
├── payroll_run.py       # 3 Payroll Entries
├── reconcile.py         # diff vs Excel
├── leave.py             # FY 26-27 opening balances
└── setup.py             # orchestrator + wipe_existing
```

The existing `vaishali/setup_salary_structure.py`, `setup_operator_pay.py`, and `vaishali/api/payroll.py` are kept (they handle hourly operator logsheet pay which is a separate live system). The new `vaishali/payroll/` package is the canonical setup; the old files become utility modules called from the new orchestrator.

---

## Open items for user review

1. **VB sub-pool in Operator file:** confirm "VB OP" operators are still DCEPL employees (just paid via a different bank route), not a separate ERPNext company. Default in this spec: `Employee.payroll_subgroup = "VB"`, company stays DCEPL.
2. **Overhead employee company:** Santosh Mokashi and Sulbha Kadam show `Company = NA` in the Excel; spec defaults them to DSPL alongside Snehal and Sheetal. Confirm.
3. **MLWF schedule:** spec assumes ₹6 employee + ₹18 employer, half-yearly Jun + Dec. The Mar 2026 Excel shows MLWF column blank for all rows — confirms it's not deducted in Mar. Marking the formula `if month in (6, 12) then 6 else 0`.
4. **PT for Mar 2026:** all rows show ₹200 PT (not ₹300). India's special-month is Feb, so Mar = ₹200 is correct. No action.
5. **TDS for Mar 2026:** column blank for all rows. Confirm we skip TDS for Mar 2026 entirely (deferred to a future polish task).
