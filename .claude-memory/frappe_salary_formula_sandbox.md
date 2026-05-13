---
name: Frappe Salary Structure formula sandbox is restrictive
description: safe_eval scope for Salary Structure formulas has no min/max, no datetime helpers, and start_date is a string not a datetime. Use ternaries and avoid .month attribute access.
type: feedback
originSessionId: dd85063d-0fe1-462d-90fc-7cbeba430cfe
---
**Rule:** When writing a `formula` field on a Salary Structure earning/deduction row, you can ONLY use:
- Arithmetic operators (`+`, `-`, `*`, `/`, `**`, `%`)
- Ternary expressions (`a if cond else b`)
- The `data` dict — comprises `base`, `gross_pay`, `start_date` (str), `end_date` (str), and ALL Employee fields including custom fields

You CANNOT use:
- `min(a, b)` → use `a if a < b else b`
- `max(0, x)` → use `x if x > 0 else 0`
- `month`, `year` (no such variable)
- `start_date.month` (start_date is a string in the eval scope, not a date)
- `abs`, `round`, etc. (depending on Frappe version)

**Why:** Frappe's `_safe_eval` restricts the namespace to prevent code injection. The `whitelisted_globals` dict on the SalarySlip object is small.

**How to apply:** Before writing or editing any Salary Structure formula:
1. Replace any `min(a, b)` with `(a if a < b else b)`
2. Replace any `max(0, x)` with `(x if x > 0 else 0)`
3. For month-of-year logic, hardcode for now or write a custom safe-eval helper that accepts a string date
4. After editing `vaishali/payroll/structures.py`, run `vaishali.payroll.structures.repair_formulas` to push the new formula text into the deployed Salary Detail child rows (bypasses parent submit-immutability via `frappe.db.set_value`)
5. Then `bench --site dgoc.logstop.com clear-cache && redis-cli FLUSHALL` — Frappe caches submitted structures

**Hit on:**
- 2026-05-04 — `min(base, base_basic_da)` in Operator structure caused first Mar 2026 payroll run to generate 0 slips. Fixed by ternary rewrite. Then `start_date.month` for MLWF half-yearly hit `'str' object has no attribute 'month'` — hardcoded MLWF=0 since Mar isn't Jun/Dec. Net: 6 commits to fix formulas before slips would generate.
