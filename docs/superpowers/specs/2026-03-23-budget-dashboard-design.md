# Expense Budget Dashboard — Design Spec

**Date:** 2026-03-23
**Author:** Vaishali AI
**Status:** Reviewed (v2 — all critical/major/minor issues from spec review addressed)
**App:** vaishali (DSPL Org OS)
**ERP:** ERPNext at dgoc.logstop.com

---

## 1. Problem

DCEP (Dynamic Crane Engineers Private Limited) and DSPL (Dynamic Servitech Private Limited) are related companies sharing the same ERPNext instance at dgoc.logstop.com. ERPNext has 189 employees — 136 in "Operations - DCEPL" plus staff in DSPL departments.

Historically, DCEP expenses were submitted via Krisp ERP (dgoc.krisperp.com). In FY 2025-26, actual expenses were ₹83.31L — 3.7x the budgeted ₹22.77L. There is no per-employee cap, no division-level budget, and no real-time budget-vs-actual visibility.

Going forward, **all expense submissions move to ERPNext + Vaishali PWA**. Krisp ERP will be decommissioned for expenses.

### 1.1 Vertical / Division Mapping

Krisp ERP uses a "Vertical" field with values EPS, ERS, ESS, ESS-BOSCH, OTHER. These are DCEP-specific divisions that do not currently exist in ERPNext. ERPNext has departments (Operations-DCEPL, SERVICE-DSPL, Sales-DSPL, etc.) which are a different axis.

**We will add a `vertical` Custom Field on Employee** and populate it from Krisp's Employee Register data. The mapping is:

| Krisp Vertical | Meaning | ERPNext Department (typical) |
|---------------|---------|------------------------------|
| EPS | Electronic Products & Safety | Sales-DSPL, SERVICE-DSPL, Production-DSPL |
| ERS | Equipment Rental & Services | Operations-DCEPL |
| ESS | Equipment Sales & Solutions | Operations-DCEPL, Sales-DSPL |
| OTHER | Admin, Management | Management-DSPL, Accounts |

Vertical is orthogonal to department — an employee in "Operations-DCEPL" can be EPS or ERS. This matches CLAUDE.md's note that DSPL has divisions EPS and MLR (MLR maps to ERS+ESS in Krisp's terminology).

## 2. Goals

1. Per-employee monthly expense caps with soft enforcement and Telegram escalation
2. Budget-vs-actual dashboard with three role-based views (field/manager/admin)
3. Per-vertical (EPS/ERS/ESS) budget tracking
4. Monthly burn-rate trend
5. Top-spender visibility
6. Expense-to-revenue ratio tracking (admin view)

### 2.1 Deferred Goals (v2)

- Per-equipment/product-category cost tracking (requires adding a `product_category` custom field to Expense Claim — deferred to avoid schema changes in v1)

## 3. Non-Goals

- Hard-blocking expense submission (soft warning + escalation only)
- Migrating historical Krisp ERP data into ERPNext (optional one-time import, not required for dashboard)
- Replacing ERPNext's built-in Budget module
- Payroll/salary budgeting

## 4. Data Layer

### 4.1 Custom Field on Employee

| Field | Type | Options | Purpose |
|-------|------|---------|---------|
| `vertical` | Select | EPS\nERS\nESS\nOTHER | Division. Populated from Krisp Employee Register. |

Added via `frappe.custom_field` (not modifying Employee DocType source).

### 4.2 New DocType: Expense Budget

**Module:** Vaishali
**Is Submittable:** No
**Naming Rule:** `EXB-.fiscal_year.-.vertical.-.####`
**Path:** `vaishali/vaishali/doctype/expense_budget/` (standard Frappe v15 DocType path)

| Field | Fieldtype | Options / Default | Required | Description |
|-------|-----------|-------------------|----------|-------------|
| `fiscal_year` | Link | Fiscal Year | Yes | e.g. "2025-2026" |
| `vertical` | Select | EPS\nERS\nESS\nOTHER | Yes | Division |
| `employee` | Link | Employee | No | If set = per-employee cap. If blank = vertical-level budget. |
| `monthly_cap` | Currency | | Yes | Monthly limit in ₹ |
| `annual_budget` | Currency | | No | If blank, controller sets to monthly_cap × 12 in `before_save`. |
| `alert_threshold` | Percent | 80 | Yes | Show warning at this % |
| `escalate_threshold` | Percent | 100 | Yes | Telegram alert to manager at this % |

**Removed from v1:** `product_category` and `budget_type` — these have no matching field on Expense Claim, so they cannot be enforced or aggregated. Deferred to v2 when we add custom fields to Expense Claim.

**Controller (`expense_budget.py`):**
```python
def before_save(self):
    if not self.annual_budget:
        self.annual_budget = self.monthly_cap * 12
```

**Matching logic:**
1. Employee-specific: `vertical + employee + fiscal_year`
2. Vertical fallback: `vertical + fiscal_year` (employee is blank)
3. No match → no cap enforcement, dashboard shows "No budget set"

### 4.3 Expense Claim — No Schema Changes

Budget comparison queries Expense Claims by:
- `employee` → look up their `vertical`
- `posting_date` → determine month and fiscal year
- `total_claimed_amount` → sum for budget comparison

### 4.4 Employee Advance — Handling

Employee Advances are **not included** in budget spend calculations to avoid double-counting. The flow is: Advance is given → employee spends it → submits Expense Claim referencing the advance. The Expense Claim amount is what counts against the budget. Advances that are returned (not spent) don't count.

If an employee has advances that are never claimed against, this is a separate reconciliation issue outside the budget dashboard scope.

## 5. API Layer

All endpoints in `vaishali/api/field.py`. PWA path translations added to `vaishali/public/field/api.js`.

### 5.1 `get_budget_summary` (GET)

**Access:** All authenticated users
**Params:** `fiscal_year` (optional, defaults to current FY)
**PWA path:** `GET /api/field/budget-summary` → `vaishali.api.field.get_budget_summary`
**Returns:** Role-appropriate budget data

**For field staff:**
```json
{
  "my_budget": {
    "monthly_cap": 15000,
    "spent_this_month": 12400,
    "annual_budget": 180000,
    "spent_ytd": 156000,
    "pct_month": 82.7,
    "pct_ytd": 86.7,
    "status": "warning",
    "by_type": [
      {"type": "Travel Fare", "amount": 5200},
      {"type": "Food Expenses", "amount": 3800},
      {"type": "Accommodation Exp", "amount": 2100},
      {"type": "Other Travel Exp", "amount": 1300}
    ]
  }
}
```

**Additional fields for manager+:**
```json
{
  "my_budget": { "..." : "..." },
  "vertical": {
    "name": "EPS",
    "annual_budget": 3000000,
    "spent_ytd": 2871344,
    "pct": 95.7,
    "employee_count": 16,
    "over_cap_count": 3,
    "employees": [
      {"name": "Vishal Deshpande", "employee": "HR-EMP-00043", "spent_month": 18200, "cap": 15000, "status": "exceeded"},
      {"name": "Suraj Divekar", "employee": "HR-EMP-00172", "spent_month": 16800, "cap": 15000, "status": "exceeded"}
    ]
  },
  "trend": [
    {"month": "Apr 25", "budget": 250000, "actual": 239000}
  ]
}
```

**Additional fields for admin:**
```json
{
  "my_budget": { "..." : "..." },
  "verticals": [
    {"name": "EPS", "budget": 3000000, "spent": 2871344, "pct": 95.7, "employees": 16, "over_cap": 3},
    {"name": "ERS", "budget": 2800000, "spent": 2801685, "pct": 100.1, "employees": 29, "over_cap": 5},
    {"name": "ESS", "budget": 800000, "spent": 610138, "pct": 76.3, "employees": 2, "over_cap": 0}
  ],
  "expense_to_revenue": {
    "total_expenses": 8330923,
    "total_revenue": 70000000,
    "ratio_pct": 11.9
  },
  "trend": [],
  "top_spenders": [
    {"name": "Rajendra Kudale", "vertical": "ERS", "spent_ytd": 1144542, "cap_annual": 180000}
  ]
}
```

**Spend calculation:** Sums `total_claimed_amount` from `Expense Claim` where `docstatus=1` (submitted) AND `approval_status != 'Rejected'`. Employee Advances are excluded (see Section 4.4).

### 5.2 `get_budget_detail` (GET, Manager+)

**Params:** `vertical` (required), `employee` (optional), `month` (optional), `fiscal_year` (optional)
**PWA path:** `GET /api/field/budget-detail` → `vaishali.api.field.get_budget_detail`
**Returns:** Drill-down — per-employee breakdown within a vertical, or per-claim list for an employee.

### 5.3 `set_budget` (POST, Admin only)

**PWA path:** `POST /api/field/budget` → `vaishali.api.field.set_budget`
**Params:** All Expense Budget fields + optional `name` for updates.
**Upsert logic:**
- If `name` is provided → update that record
- If `name` is not provided → look for existing record matching `fiscal_year + vertical + employee`. If found, update it. If not, create new.
- Validates: `fiscal_year` exists, `monthly_cap > 0`

## 6. PWA Screen: `budget-dashboard.js`

**Route:** `#/budget`
**Title:** Dynamic — set in handler based on `Auth.getNavTier()`: "My Budget" for field, "Team Budget" for manager, "Budget Dashboard" for admin
**Back:** `#/home`
**Tab:** home

### 6.1 Field Staff View

1. **Monthly budget card** — progress bar showing spent/cap with color coding
   - Green: <80% of cap
   - Yellow: 80-95%
   - Red: >95%
2. **Expense type breakdown** — list cards showing spend by type for current month
3. **YTD progress** — bar showing annual spend vs annual budget
4. **Quick action** — "+ New Expense" button at bottom

**Empty/error states:**
- No vertical set: show `UI.empty('alert', 'Your division has not been assigned. Contact HR.')`
- No budget record: show spend data with note "No budget cap set for your division"
- API error: show `UI.error('Could not load budget data.')`

### 6.2 Manager View

1. **KPI row** — 4 stats: MTD spend/budget, YTD total, employee count, over-cap count
2. **Team table** — employees sorted by current month spend (descending), warning icon for those over cap. Tap → drill down to their breakdown.
3. **Monthly trend** — horizontal bar chart (built with `el()`, no chart library) showing last 12 months actual vs budget
4. **"View My Budget"** link — switches to personal field-staff view

### 6.3 Admin View

1. **KPI row** — total expenses, revenue target, expense/revenue ratio, employee count
2. **Vertical cards** — EPS/ERS/ESS with progress bars showing budget vs actual
3. **Tabs** — Vertical | Employee | Trend (underline-style tabs per design system)
4. **"Set Budgets"** button → opens a bottom sheet for budget CRUD

### 6.4 UI Components Used

All from existing `ui.js` — no new components needed:
- `UI.kpiRow()`, `UI.statCard()`, `UI.card()`, `UI.listCard()`
- `UI.tabs()`, `UI.pill()`, `UI.sectionHeading()`
- `UI.btn()`, `UI.bottomSheet()`, `UI.skeleton()`
- `UI.field()`, `UI.select()`, `UI.textInput()` (for budget CRUD form)
- `UI.empty()`, `UI.error()` (for empty/error states)

## 7. Cap Enforcement Hook

### 7.1 Hook Registration (hooks.py)

Modify the **existing** `Expense Claim` entry in `doc_events` to add `before_submit`:

```python
"Expense Claim": {
    "before_submit": "vaishali.budget.check_budget_cap",
    "on_submit": "vaishali.notifications.on_expense_claim_submit",
    "on_update": "vaishali.notifications.on_expense_claim_update",
},
```

Using `before_submit` (not `before_save`) so budget checks only fire when the claim is being finalized, not on every draft edit.

### 7.2 `vaishali/budget.py` — `check_budget_cap(doc, method)`

1. Get employee's vertical: `frappe.db.get_value("Employee", doc.employee, "vertical")`
2. If no vertical, return silently (no enforcement possible)
3. Get current fiscal year via `frappe.defaults.get_defaults().fiscal_year`
4. Find matching Expense Budget (employee-specific first, then vertical fallback)
5. If no budget found, return silently
6. Sum submitted Expense Claims for this employee in the current month (`docstatus=1`, exclude current doc by `name != doc.name` if `doc.name` is set and not a hash)
7. Calculate projected total: existing + doc.total_claimed_amount
8. If projected > escalate_threshold % of monthly_cap:
   - Add comment: "Budget cap exceeded: ₹{spent}/₹{cap}"
   - Send Telegram to `reports_to` manager via `notifications._notify()`
9. Else if projected > alert_threshold % of monthly_cap:
   - Add comment: "Approaching budget limit: ₹{spent}/₹{cap} ({pct}%)"

**Does NOT throw/block** — submission always proceeds.

**Known limitation:** If two claims are submitted concurrently, both may pass the cap check. This is acceptable for soft enforcement.

## 8. Company Fix in expense.js

Line 7 of `expense.js` hardcodes:
```js
var COMPANY = 'Dynamic Servitech Private Limited';
```

**Fix:** Replace with dynamic lookup from the logged-in employee's record:
```js
var emp = Auth.getEmployee() || {};
var COMPANY = emp.company || 'Dynamic Servitech Private Limited';
```

This allows DCEP employees (company = "Dynamic Crane Engineers Private Limited") to submit expenses correctly. Falls back to DSPL for existing users.

## 9. One-Time Setup Script: `setup_budget.py`

Executed via: `bench --site dgoc.logstop.com execute vaishali.setup_budget.setup`

1. **Add vertical Custom Field** on Employee (if not exists)
2. **Populate vertical** for all 189 employees using a mapping dict derived from Krisp Employee Register data
3. **Create Expense Budget records** for FY 2026-27:
   - Per-vertical budgets (EPS ₹30L, ERS ₹28L, ESS ₹8L annual)
   - Default per-employee caps (₹15K/month for field staff, ₹25K/month for senior staff)
4. Idempotent — safe to re-run

## 10. Files to Create/Modify

| File | Action | Lines (est.) |
|------|--------|-------------|
| `vaishali/vaishali/doctype/expense_budget/expense_budget.json` | **New** DocType definition | ~80 |
| `vaishali/vaishali/doctype/expense_budget/expense_budget.py` | **New** controller (before_save for annual calc) | ~20 |
| `vaishali/vaishali/doctype/expense_budget/__init__.py` | **New** empty init | 0 |
| `vaishali/budget.py` | **New** cap check logic | ~60 |
| `vaishali/setup_budget.py` | **New** one-time setup | ~80 |
| `vaishali/public/field/screens/budget-dashboard.js` | **New** PWA screen (3 role views) | ~350 |
| `vaishali/api/field.py` | **Edit** add 3 endpoints | +120 |
| `vaishali/public/field/api.js` | **Edit** add 3 path translations | +6 |
| `vaishali/public/field/app.js` | **Edit** add `#/budget` route | +3 |
| `vaishali/www/field.html` | **Edit** add `<script defer>` for budget-dashboard.js | +1 |
| `vaishali/public/field/screens/expense.js` | **Fix** dynamic company (line 7) | ~3 |
| `vaishali/public/field/screens/hr-hub.js` | **Edit** add Budget tile | +5 |
| `vaishali/public/field/screens/home.js` | **Edit** add Budget action card for manager+ | +10 |
| `vaishali/hooks.py` | **Edit** add `before_submit` to existing Expense Claim entry | +1 |
| `vaishali/notifications.py` | **Edit** add budget exceeded notification helper | +20 |

**Total new code:** ~590 lines
**Total modifications:** ~170 lines

## 11. Testing Plan

1. **Setup script:** Run on test site, verify vertical field populated, budget records created
2. **API — field:** Call `get_budget_summary` as field staff — verify only `my_budget` returned
3. **API — manager:** Call as manager — verify `vertical` + `employees` returned
4. **API — admin:** Call as admin — verify `verticals` + `expense_to_revenue` returned
5. **API — fiscal year:** Call with `fiscal_year=2024-2025` — verify empty/historical data
6. **Dashboard:** Navigate to `#/budget` as each role — verify correct view renders
7. **Cap enforcement:** Submit expense that exceeds cap — verify comment added + Telegram sent
8. **Company fix:** Login as DCEP employee — verify expense submission uses "Dynamic Crane Engineers Private Limited"
9. **Edge cases:**
   - Employee with no vertical set → "Division not assigned" message
   - No budget record exists → spend shown but "No budget cap set" note
   - API error → error state shown
   - `set_budget` upsert → update existing record, create new

## 12. Migration Path

1. Deploy DocType + custom field + setup script
2. Run `bench migrate` + `bench --site dgoc.logstop.com execute vaishali.setup_budget.setup`
3. Deploy PWA changes (`bench build --app vaishali`)
4. Clear cache: `bench clear-cache` + `redis-cli FLUSHALL` on EC2
5. Field staff begin submitting via PWA instead of Krisp ERP
6. After 1 month of parallel running, decommission Krisp expense module
