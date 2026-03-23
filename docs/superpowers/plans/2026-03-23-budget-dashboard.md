# Budget Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-employee expense budget caps with a role-based dashboard to the vaishali PWA, with soft enforcement via Telegram alerts.

**Architecture:** New Expense Budget DocType for budget data, 3 new API endpoints in field.py for budget-vs-actual queries, a new budget-dashboard.js PWA screen with field/manager/admin views, and a before_submit hook on Expense Claim for cap enforcement with Telegram escalation.

**Tech Stack:** Frappe v15 (Python), vanilla JS with el() DOM builder, ERPNext Expense Claim doctype, Telegram Bot API for alerts.

**Spec:** `docs/superpowers/specs/2026-03-23-budget-dashboard-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `vaishali/vaishali/doctype/expense_budget/expense_budget.json` | DocType schema |
| `vaishali/vaishali/doctype/expense_budget/expense_budget.py` | Controller (annual_budget auto-calc) |
| `vaishali/vaishali/doctype/expense_budget/__init__.py` | Empty init |
| `vaishali/budget.py` | Cap enforcement logic (check_budget_cap) |
| `vaishali/setup_budget.py` | One-time setup: vertical field + seed budgets |
| `vaishali/public/field/screens/budget-dashboard.js` | PWA dashboard screen |
| `vaishali/api/field.py` | 3 new endpoints (get_budget_summary, get_budget_detail, set_budget) |
| `vaishali/public/field/api.js` | Path translations for new endpoints |
| `vaishali/public/field/app.js` | Route registration for #/budget |
| `vaishali/www/field.html` | Script tag for budget-dashboard.js |
| `vaishali/public/field/screens/expense.js` | Fix hardcoded company |
| `vaishali/public/field/screens/hr-hub.js` | Add Budget tile |
| `vaishali/public/field/screens/home.js` | Add Budget action card |
| `vaishali/hooks.py` | Add before_submit hook |
| `vaishali/notifications.py` | Budget exceeded notification helper |

---

### Task 1: Create Expense Budget DocType

**Files:**
- Create: `vaishali/vaishali/doctype/expense_budget/__init__.py`
- Create: `vaishali/vaishali/doctype/expense_budget/expense_budget.json`
- Create: `vaishali/vaishali/doctype/expense_budget/expense_budget.py`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p vaishali/vaishali/doctype/expense_budget
touch vaishali/vaishali/doctype/expense_budget/__init__.py
```

- [ ] **Step 2: Write DocType JSON**

Create `vaishali/vaishali/doctype/expense_budget/expense_budget.json` with fields:
- `fiscal_year` (Link → Fiscal Year, reqd)
- `vertical` (Select: EPS/ERS/ESS/OTHER, reqd)
- `employee` (Link → Employee, optional)
- `monthly_cap` (Currency, reqd)
- `annual_budget` (Currency, optional — auto-calculated)
- `alert_threshold` (Percent, default 80, reqd)
- `escalate_threshold` (Percent, default 100, reqd)

Set `module: "Vaishali"`, `autoname: "EXB-.fiscal_year.-.vertical.-.####"`, `is_submittable: 0`.

- [ ] **Step 3: Write controller**

Create `vaishali/vaishali/doctype/expense_budget/expense_budget.py`:

```python
import frappe
from frappe.model.document import Document

class ExpenseBudget(Document):
    def before_save(self):
        if not self.annual_budget:
            self.annual_budget = self.monthly_cap * 12
```

- [ ] **Step 4: Run bench migrate to register DocType**

```bash
bench --site dgoc.logstop.com migrate
```

Expected: No errors. DocType "Expense Budget" appears in ERPNext.

- [ ] **Step 5: Verify via API**

```bash
bench --site dgoc.logstop.com execute "frappe.get_meta('Expense Budget').as_dict().get('fields')" | head -20
```

Expected: Shows field list including fiscal_year, vertical, employee, monthly_cap.

- [ ] **Step 6: Commit**

```bash
git add vaishali/vaishali/doctype/expense_budget/
git commit -m "feat: add Expense Budget DocType for per-employee/vertical caps"
```

---

### Task 2: Setup Script (Vertical Field + Seed Budgets)

**Files:**
- Create: `vaishali/setup_budget.py`

- [ ] **Step 1: Write setup_budget.py**

Create `vaishali/setup_budget.py`:

```python
"""One-time setup: add vertical Custom Field on Employee, populate verticals, seed budgets.

Usage: bench --site dgoc.logstop.com execute vaishali.setup_budget.setup
"""
import frappe

# Mapping from Krisp Employee Register (emp_id → vertical)
# Derived from the Employee Register xlsx we downloaded from Krisp ERP
VERTICAL_MAP = {
    # EPS employees (from Krisp register where Vertical = EPS)
    # Key = employee_name (uppercase, matching ERPNext Employee.name)
    # This mapping should be populated from the Krisp data
}

# Default vertical assignment by ERPNext department
DEPT_VERTICAL_DEFAULT = {
    "Operations - DCEPL": "ERS",
    "SERVICE - DSPL": "EPS",
    "Sales - DSPL": "EPS",
    "SALES AND MARKETING - DSPL": "EPS",
    "Production - DSPL": "EPS",
    "R AND D - DSPL": "EPS",
    "Management - DSPL": "OTHER",
    "Accounts": "OTHER",
    "Human Resources": "OTHER",
    "Purchase": "OTHER",
    "Marketing": "EPS",
}

def setup():
    _add_vertical_field()
    _populate_verticals()
    _seed_budgets()
    frappe.db.commit()
    print("Setup complete.")

def _add_vertical_field():
    """Add vertical Custom Field on Employee if not exists."""
    if frappe.db.exists("Custom Field", {"dt": "Employee", "fieldname": "vertical"}):
        print("vertical field already exists.")
        return

    doc = frappe.get_doc({
        "doctype": "Custom Field",
        "dt": "Employee",
        "fieldname": "vertical",
        "label": "Vertical",
        "fieldtype": "Select",
        "options": "EPS\nERS\nESS\nOTHER",
        "insert_after": "department",
    })
    doc.insert(ignore_permissions=True)
    print("Added vertical Custom Field on Employee.")

def _populate_verticals():
    """Set vertical for all employees based on mapping or department default."""
    employees = frappe.get_all("Employee",
        fields=["name", "employee_name", "department"],
        filters={"status": "Active"},
        limit_page_length=0)

    updated = 0
    for emp in employees:
        # Check explicit mapping first
        vertical = VERTICAL_MAP.get(emp.name)
        if not vertical:
            vertical = DEPT_VERTICAL_DEFAULT.get(emp.department, "OTHER")

        current = frappe.db.get_value("Employee", emp.name, "vertical")
        if current != vertical:
            frappe.db.set_value("Employee", emp.name, "vertical", vertical, update_modified=False)
            updated += 1

    print(f"Updated vertical for {updated}/{len(employees)} employees.")

def _seed_budgets():
    """Create default Expense Budget records for FY 2025-2026."""
    fy = "2025-2026"

    # Vertical-level budgets
    vertical_budgets = {
        "EPS": 250000,   # ₹2.5L/month
        "ERS": 233000,   # ₹2.33L/month
        "ESS": 67000,    # ₹67K/month
        "OTHER": 50000,  # ₹50K/month
    }

    for vertical, monthly in vertical_budgets.items():
        name = f"EXB-{fy}-{vertical}-0001"
        if frappe.db.exists("Expense Budget", {"fiscal_year": fy, "vertical": vertical, "employee": ""}):
            print(f"Budget for {vertical} already exists.")
            continue
        doc = frappe.get_doc({
            "doctype": "Expense Budget",
            "fiscal_year": fy,
            "vertical": vertical,
            "monthly_cap": monthly,
            "alert_threshold": 80,
            "escalate_threshold": 100,
        })
        doc.insert(ignore_permissions=True)
        print(f"Created budget for {vertical}: ₹{monthly}/month")

    # Per-employee default caps (₹15K for field, ₹25K for senior)
    senior_designations = ["Manager", "Sr. Manager", "Head", "Director"]
    employees = frappe.get_all("Employee",
        fields=["name", "vertical", "designation"],
        filters={"status": "Active", "vertical": ["!=", ""]},
        limit_page_length=0)

    created = 0
    for emp in employees:
        if frappe.db.exists("Expense Budget", {"fiscal_year": fy, "employee": emp.name}):
            continue
        is_senior = emp.designation in senior_designations if emp.designation else False
        cap = 25000 if is_senior else 15000
        doc = frappe.get_doc({
            "doctype": "Expense Budget",
            "fiscal_year": fy,
            "vertical": emp.vertical or "OTHER",
            "employee": emp.name,
            "monthly_cap": cap,
            "alert_threshold": 80,
            "escalate_threshold": 100,
        })
        doc.insert(ignore_permissions=True)
        created += 1

    print(f"Created {created} per-employee budgets.")
```

- [ ] **Step 2: Run on test site and verify**

```bash
bench --site dgoc.logstop.com execute vaishali.setup_budget.setup
```

Expected: "Added vertical Custom Field on Employee. Updated vertical for X/189 employees. Created budget for EPS/ERS/ESS/OTHER. Created N per-employee budgets. Setup complete."

- [ ] **Step 3: Verify via API**

```bash
bench --site dgoc.logstop.com execute "frappe.db.count('Expense Budget')"
bench --site dgoc.logstop.com execute "frappe.db.sql('select vertical, count(*) from tabEmployee where vertical is not null group by vertical')"
```

Expected: Budget count > 0. Employee vertical counts match EPS/ERS/ESS/OTHER distribution.

- [ ] **Step 4: Commit**

```bash
git add vaishali/setup_budget.py
git commit -m "feat: add setup script for vertical field and seed expense budgets"
```

---

### Task 3: Budget Cap Enforcement Hook

**Files:**
- Create: `vaishali/budget.py`
- Modify: `vaishali/hooks.py:34-37`
- Modify: `vaishali/notifications.py` (add helper)

- [ ] **Step 1: Write budget.py**

Create `vaishali/budget.py`:

```python
"""Expense budget cap enforcement.

Hooked into Expense Claim before_submit. Checks if the employee's
projected monthly spend exceeds their budget cap. If so, adds a comment
and sends a Telegram alert to their manager. Never blocks submission.
"""
import frappe
from frappe import _


def check_budget_cap(doc, method):
    """Soft-enforce budget caps on Expense Claim submission."""
    if not doc.employee:
        return

    vertical = frappe.db.get_value("Employee", doc.employee, "vertical")
    if not vertical:
        return

    fy = frappe.defaults.get_defaults().get("fiscal_year")
    if not fy:
        return

    budget = _get_budget(vertical, doc.employee, fy)
    if not budget:
        return

    # Sum submitted claims this month (exclude current doc)
    month_start, month_end = _get_month_range(doc.posting_date)
    existing = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0) as total
        FROM `tabExpense Claim`
        WHERE employee = %s
          AND posting_date BETWEEN %s AND %s
          AND docstatus = 1
          AND name != %s
    """, (doc.employee, month_start, month_end, doc.name or ""), as_dict=True)[0].total

    projected = existing + (doc.total_claimed_amount or 0)
    cap = budget.monthly_cap
    if not cap or cap <= 0:
        return

    pct = projected / cap * 100

    if pct >= budget.escalate_threshold:
        doc.add_comment("Comment",
            f"Budget cap exceeded: ₹{projected:,.0f} / ₹{cap:,.0f} ({pct:.0f}%)")
        _alert_manager(doc, projected, cap, pct)
    elif pct >= budget.alert_threshold:
        doc.add_comment("Comment",
            f"Approaching budget limit: ₹{projected:,.0f} / ₹{cap:,.0f} ({pct:.0f}%)")


def _get_budget(vertical, employee, fiscal_year):
    """Find matching budget: employee-specific first, then vertical fallback."""
    # Employee-specific
    budget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "employee": employee},
        ["monthly_cap", "alert_threshold", "escalate_threshold"],
        as_dict=True)
    if budget:
        return budget

    # Vertical fallback
    budget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "vertical": vertical, "employee": ["in", ["", None]]},
        ["monthly_cap", "alert_threshold", "escalate_threshold"],
        as_dict=True)
    return budget


def _get_month_range(posting_date):
    """Return first and last day of the month for a given date."""
    from datetime import date
    import calendar
    if isinstance(posting_date, str):
        parts = posting_date.split("-")
        y, m = int(parts[0]), int(parts[1])
    else:
        y, m = posting_date.year, posting_date.month
    last_day = calendar.monthrange(y, m)[1]
    return date(y, m, 1).isoformat(), date(y, m, last_day).isoformat()


def _alert_manager(doc, spent, cap, pct):
    """Send Telegram alert to employee's reporting manager."""
    from vaishali.notifications import _notify, _get_managers

    reports_to = frappe.db.get_value("Employee", doc.employee, "reports_to")
    if reports_to:
        msg = (f"⚠ Budget Alert: {doc.employee_name} has exceeded their "
               f"monthly expense cap.\n"
               f"Spent: ₹{spent:,.0f} / Cap: ₹{cap:,.0f} ({pct:.0f}%)\n"
               f"Claim: {doc.name} for ₹{doc.total_claimed_amount:,.0f}")
        _notify(reports_to, msg)
    else:
        # Fallback to default managers
        for mgr in _get_managers():
            msg = (f"⚠ Budget Alert: {doc.employee_name} has exceeded their "
                   f"monthly expense cap.\n"
                   f"Spent: ₹{spent:,.0f} / Cap: ₹{cap:,.0f} ({pct:.0f}%)")
            _notify(mgr, msg)
```

- [ ] **Step 2: Add before_submit hook to hooks.py**

In `vaishali/hooks.py`, modify the existing Expense Claim entry (line 34-37) to add `before_submit`:

```python
"Expense Claim": {
    "before_submit": "vaishali.budget.check_budget_cap",
    "on_submit": "vaishali.notifications.on_expense_claim_submit",
    "on_update": "vaishali.notifications.on_expense_claim_update",
},
```

- [ ] **Step 3: Verify hook loads without error**

```bash
bench --site dgoc.logstop.com console
>>> import vaishali.budget
>>> print("OK")
```

Expected: "OK" — no import errors.

- [ ] **Step 4: Commit**

```bash
git add vaishali/budget.py vaishali/hooks.py
git commit -m "feat: add budget cap enforcement hook with Telegram escalation"
```

---

### Task 4: API Endpoints

**Files:**
- Modify: `vaishali/api/field.py` (add 3 endpoints)
- Modify: `vaishali/public/field/api.js` (add path translations)

- [ ] **Step 1: Add get_budget_summary endpoint**

Add to `vaishali/api/field.py` after the existing `get_pending_expenses` function:

```python
@frappe.whitelist()
def get_budget_summary(fiscal_year=None):
    """Budget vs actual summary. Returns role-appropriate data."""
    employee = _get_employee()
    tier = _get_nav_tier()

    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year", "2025-2026")

    fy_start, fy_end = frappe.db.get_value("Fiscal Year", fiscal_year, ["year_start_date", "year_end_date"])

    result = {}

    # My budget (all users)
    result["my_budget"] = _get_employee_budget(employee.name, employee.vertical, fiscal_year, fy_start, fy_end)

    # Manager: team view
    if tier in ("manager", "admin"):
        vertical = employee.vertical or frappe.db.get_value("Employee", employee.name, "vertical")
        if vertical:
            result["vertical"] = _get_vertical_budget(vertical, fiscal_year, fy_start, fy_end)
        result["trend"] = _get_expense_trend(fiscal_year, fy_start, fy_end, vertical if tier == "manager" else None)

    # Admin: all verticals
    if tier == "admin":
        result["verticals"] = []
        for v in ["EPS", "ERS", "ESS", "OTHER"]:
            vdata = _get_vertical_budget(v, fiscal_year, fy_start, fy_end)
            if vdata["employee_count"] > 0:
                result["verticals"].append(vdata)

        total_expenses = sum(v["spent_ytd"] for v in result["verticals"])
        result["expense_to_revenue"] = {
            "total_expenses": total_expenses,
            "total_revenue": 70000000,  # TODO: pull from Sales Order
            "ratio_pct": round(total_expenses / 70000000 * 100, 1) if total_expenses else 0
        }

        result["top_spenders"] = _get_top_spenders(fiscal_year, fy_start, fy_end, limit=10)

    return result


def _get_employee_budget(employee_name, vertical, fiscal_year, fy_start, fy_end):
    """Get budget vs actual for a single employee."""
    from vaishali.budget import _get_budget, _get_month_range
    from datetime import date

    today = date.today()
    month_start, month_end = _get_month_range(today.isoformat())

    # Spent this month
    spent_month = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0)
        FROM `tabExpense Claim`
        WHERE employee = %s AND posting_date BETWEEN %s AND %s AND docstatus = 1
    """, (employee_name, month_start, month_end))[0][0]

    # Spent YTD
    spent_ytd = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0)
        FROM `tabExpense Claim`
        WHERE employee = %s AND posting_date BETWEEN %s AND %s AND docstatus = 1
    """, (employee_name, fy_start, fy_end))[0][0]

    # Budget
    budget = _get_budget(vertical or "", employee_name, fiscal_year)
    cap = budget.monthly_cap if budget else 0
    annual = budget.get("annual_budget") or (cap * 12) if budget else 0

    pct_month = round(spent_month / cap * 100, 1) if cap else 0
    pct_ytd = round(spent_ytd / annual * 100, 1) if annual else 0

    status = "ok"
    if cap and pct_month >= 100: status = "exceeded"
    elif cap and pct_month >= 80: status = "warning"

    # Breakdown by expense type
    by_type = frappe.db.sql("""
        SELECT ed.expense_type as type, SUM(ed.amount) as amount
        FROM `tabExpense Claim Detail` ed
        JOIN `tabExpense Claim` ec ON ec.name = ed.parent
        WHERE ec.employee = %s AND ec.posting_date BETWEEN %s AND %s AND ec.docstatus = 1
        GROUP BY ed.expense_type
        ORDER BY amount DESC
    """, (employee_name, month_start, month_end), as_dict=True)

    return {
        "monthly_cap": cap,
        "spent_this_month": spent_month,
        "annual_budget": annual,
        "spent_ytd": spent_ytd,
        "pct_month": pct_month,
        "pct_ytd": pct_ytd,
        "status": status,
        "by_type": by_type
    }


def _get_vertical_budget(vertical, fiscal_year, fy_start, fy_end):
    """Get budget vs actual for a vertical."""
    from datetime import date
    from vaishali.budget import _get_month_range

    today = date.today()
    month_start, month_end = _get_month_range(today.isoformat())

    employees = frappe.get_all("Employee",
        filters={"vertical": vertical, "status": "Active"},
        fields=["name", "employee_name"],
        limit_page_length=0)
    emp_names = [e.name for e in employees]

    if not emp_names:
        return {"name": vertical, "annual_budget": 0, "spent_ytd": 0, "pct": 0,
                "employee_count": 0, "over_cap_count": 0, "employees": []}

    # Vertical-level budget
    vbudget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "vertical": vertical, "employee": ["in", ["", None]]},
        "annual_budget") or 0

    # YTD spend
    spent_ytd = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0)
        FROM `tabExpense Claim`
        WHERE employee IN %s AND posting_date BETWEEN %s AND %s AND docstatus = 1
    """, (emp_names, fy_start, fy_end))[0][0]

    # Per-employee this month
    emp_spend = frappe.db.sql("""
        SELECT employee, IFNULL(SUM(total_claimed_amount), 0) as spent
        FROM `tabExpense Claim`
        WHERE employee IN %s AND posting_date BETWEEN %s AND %s AND docstatus = 1
        GROUP BY employee
    """, (emp_names, month_start, month_end), as_dict=True)

    spend_map = {e.employee: e.spent for e in emp_spend}

    over_cap = 0
    emp_list = []
    for emp in employees:
        spent = spend_map.get(emp.name, 0)
        cap = frappe.db.get_value("Expense Budget",
            {"fiscal_year": fiscal_year, "employee": emp.name}, "monthly_cap") or 15000
        status = "exceeded" if spent > cap else "warning" if spent > cap * 0.8 else "ok"
        if spent > cap: over_cap += 1
        emp_list.append({
            "name": emp.employee_name, "employee": emp.name,
            "spent_month": spent, "cap": cap, "status": status
        })

    emp_list.sort(key=lambda x: -x["spent_month"])

    return {
        "name": vertical,
        "annual_budget": vbudget,
        "spent_ytd": spent_ytd,
        "pct": round(spent_ytd / vbudget * 100, 1) if vbudget else 0,
        "employee_count": len(employees),
        "over_cap_count": over_cap,
        "employees": emp_list
    }


def _get_expense_trend(fiscal_year, fy_start, fy_end, vertical=None):
    """Monthly expense trend for the fiscal year."""
    filters = "AND e.vertical = %s" if vertical else ""
    params = [fy_start, fy_end]
    if vertical: params.append(vertical)

    data = frappe.db.sql(f"""
        SELECT DATE_FORMAT(ec.posting_date, '%%b %%y') as month,
               MONTH(ec.posting_date) as month_num,
               IFNULL(SUM(ec.total_claimed_amount), 0) as actual
        FROM `tabExpense Claim` ec
        JOIN `tabEmployee` e ON e.name = ec.employee
        WHERE ec.posting_date BETWEEN %s AND %s AND ec.docstatus = 1
        {filters}
        GROUP BY month, month_num
        ORDER BY YEAR(ec.posting_date), month_num
    """, params, as_dict=True)

    return [{"month": d.month, "actual": d.actual, "budget": 0} for d in data]


def _get_top_spenders(fiscal_year, fy_start, fy_end, limit=10):
    """Top N spenders across all verticals."""
    return frappe.db.sql("""
        SELECT ec.employee_name as name, e.vertical,
               SUM(ec.total_claimed_amount) as spent_ytd
        FROM `tabExpense Claim` ec
        JOIN `tabEmployee` e ON e.name = ec.employee
        WHERE ec.posting_date BETWEEN %s AND %s AND ec.docstatus = 1
        GROUP BY ec.employee, ec.employee_name, e.vertical
        ORDER BY spent_ytd DESC
        LIMIT %s
    """, (fy_start, fy_end, limit), as_dict=True)


@frappe.whitelist()
def get_budget_detail(vertical, employee=None, month=None, fiscal_year=None):
    """Drill-down budget detail. Manager+ only."""
    tier = _get_nav_tier()
    if tier == "field":
        frappe.throw(_("Only managers and admins can view budget details"))

    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year", "2025-2026")

    fy_start, fy_end = frappe.db.get_value("Fiscal Year", fiscal_year, ["year_start_date", "year_end_date"])

    if employee:
        # Per-claim list for an employee
        filters = {"employee": employee, "docstatus": 1}
        if month:
            filters["posting_date"] = ["between", [f"{month}-01", f"{month}-31"]]
        else:
            filters["posting_date"] = ["between", [fy_start, fy_end]]

        claims = frappe.get_list("Expense Claim",
            filters=filters,
            fields=["name", "posting_date", "total_claimed_amount", "approval_status"],
            order_by="posting_date desc",
            limit_page_length=50)
        return {"employee": employee, "claims": claims}
    else:
        return _get_vertical_budget(vertical, fiscal_year, fy_start, fy_end)


@frappe.whitelist(methods=["POST"])
def set_budget(fiscal_year, vertical, monthly_cap, employee=None,
               alert_threshold=80, escalate_threshold=100, name=None):
    """Create or update an Expense Budget. Admin only."""
    tier = _get_nav_tier()
    if tier != "admin":
        frappe.throw(_("Only admins can set budgets"))

    monthly_cap = float(monthly_cap)
    if monthly_cap <= 0:
        frappe.throw(_("Monthly cap must be greater than 0"))

    if not frappe.db.exists("Fiscal Year", fiscal_year):
        frappe.throw(_(f"Fiscal Year {fiscal_year} does not exist"))

    # Upsert logic
    if name and frappe.db.exists("Expense Budget", name):
        doc = frappe.get_doc("Expense Budget", name)
    else:
        # Look for existing match
        filters = {"fiscal_year": fiscal_year, "vertical": vertical}
        if employee:
            filters["employee"] = employee
        else:
            filters["employee"] = ["in", ["", None]]

        existing = frappe.db.get_value("Expense Budget", filters, "name")
        if existing:
            doc = frappe.get_doc("Expense Budget", existing)
        else:
            doc = frappe.new_doc("Expense Budget")
            doc.fiscal_year = fiscal_year
            doc.vertical = vertical
            doc.employee = employee or ""

    doc.monthly_cap = monthly_cap
    doc.alert_threshold = float(alert_threshold)
    doc.escalate_threshold = float(escalate_threshold)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"name": doc.name, "action": "updated" if doc.get("__islocal") is None else "created"}
```

- [ ] **Step 2: Add path translations to api.js**

In `vaishali/public/field/api.js`, add after the last `else if` in the path translation block (around line 330):

```javascript
else if (path === '/api/field/budget-summary' || path.indexOf('/api/field/budget-summary?') === 0) {
  var bsQS = ''; var bsQI = path.indexOf('?'); if (bsQI !== -1) bsQS = path.substring(bsQI);
  path = '/api/method/vaishali.api.field.get_budget_summary' + bsQS;
}
else if (path === '/api/field/budget-detail' || path.indexOf('/api/field/budget-detail?') === 0) {
  var bdQS = ''; var bdQI = path.indexOf('?'); if (bdQI !== -1) bdQS = path.substring(bdQI);
  path = '/api/method/vaishali.api.field.get_budget_detail' + bdQS;
}
else if (path === '/api/field/budget' && method === 'POST') {
  path = '/api/method/vaishali.api.field.set_budget';
}
```

- [ ] **Step 3: Verify API works**

```bash
bench --site dgoc.logstop.com execute "frappe.call('vaishali.api.field.get_budget_summary')"
```

Expected: Returns dict with `my_budget` key.

- [ ] **Step 4: Commit**

```bash
git add vaishali/api/field.py vaishali/public/field/api.js
git commit -m "feat: add budget summary, detail, and set_budget API endpoints"
```

---

### Task 5: PWA Dashboard Screen

**Files:**
- Create: `vaishali/public/field/screens/budget-dashboard.js`
- Modify: `vaishali/public/field/app.js` (add route)
- Modify: `vaishali/www/field.html` (add script tag)

- [ ] **Step 1: Write budget-dashboard.js**

Create `vaishali/public/field/screens/budget-dashboard.js` — a single file with 3 role-based views. Uses existing UI components from ui.js. Follows the screen pattern: IIFE, registers on `window.Screens`, receives `appEl`.

The screen calls `GET /api/field/budget-summary`, checks `Auth.getNavTier()`, and renders the appropriate view (field/manager/admin) as described in the spec Section 6.

Key UI elements:
- Field: progress bar card (green/yellow/red), expense type list, YTD bar, "+ New Expense" button
- Manager: kpiRow (4 stats), employee list sorted by spend, monthly trend bars
- Admin: kpiRow, vertical progress cards, tabs (Vertical/Employee/Trend), "Set Budgets" bottom sheet

All built with `el()`, `UI.card()`, `UI.kpiRow()`, `UI.listCard()`, `UI.tabs()`, `UI.bottomSheet()`, `UI.skeleton()`, `UI.empty()`, `UI.error()`.

- [ ] **Step 2: Add route to app.js**

In `vaishali/public/field/app.js`, add after the monthly-report route (around line 170):

```javascript
{ pattern: '#/budget', handler: function () {
    var tier = Auth.getNavTier();
    var title = tier === 'admin' ? 'Budget Dashboard' : tier === 'manager' ? 'Team Budget' : 'My Budget';
    document.querySelector('#app-header .header-title').textContent = title;
    S().budgetDashboard(appEl);
  }, tab: 'home', title: 'My Budget', back: '#/home' },
```

Note: The title is set dynamically in the handler since it varies by role.

- [ ] **Step 3: Add script tag to field.html**

In `vaishali/www/field.html`, add before the app.js script tag (before line 72):

```html
<script defer src="/assets/vaishali/field/screens/budget-dashboard.js?v={{ _v }}"></script>
```

- [ ] **Step 4: Verify screen loads**

Navigate to `https://dgoc.logstop.com/field#/budget` in browser. Should show skeleton loading then the appropriate dashboard view.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/budget-dashboard.js vaishali/public/field/app.js vaishali/www/field.html
git commit -m "feat: add budget dashboard PWA screen with role-based views"
```

---

### Task 6: Navigation Integration + Expense Fix

**Files:**
- Modify: `vaishali/public/field/screens/expense.js:7` (fix company)
- Modify: `vaishali/public/field/screens/hr-hub.js` (add Budget tile)
- Modify: `vaishali/public/field/screens/home.js` (add Budget card for managers)

- [ ] **Step 1: Fix hardcoded company in expense.js**

In `vaishali/public/field/screens/expense.js`, replace line 7:

```javascript
// Before:
var COMPANY = 'Dynamic Servitech Private Limited';

// After:
var emp = Auth.getEmployee() || {};
var COMPANY = emp.company || 'Dynamic Servitech Private Limited';
```

- [ ] **Step 2: Add Budget tile to hr-hub.js**

In `vaishali/public/field/screens/hr-hub.js`, add to the `tiles` array (after the Salary tile, around line 19):

```javascript
{ label: 'Budget', ic: 'bar-chart', hash: '#/budget', sub: 'Expense budget tracker' }
```

- [ ] **Step 3: Add Budget action card to home.js**

In `vaishali/public/field/screens/home.js`, find where manager-only action cards are rendered and add:

```javascript
// Budget card (manager+)
if (tier !== 'field') {
  // Add after existing manager cards
  actionCards.push({
    label: 'Budget', value: '', icon: 'bar-chart',
    onClick: function () { location.hash = '#/budget'; }
  });
}
```

The exact insertion point depends on how home.js structures its action cards — read the file and follow the existing pattern.

- [ ] **Step 4: Verify navigation works**

- HR Hub → "Budget" tile → navigates to `#/budget`
- Home screen (as manager) → "Budget" card visible
- Expense submission (as DCEP employee) → uses correct company

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/expense.js vaishali/public/field/screens/hr-hub.js vaishali/public/field/screens/home.js
git commit -m "feat: add budget navigation + fix expense company for DCEP"
```

---

### Task 7: Deploy and Verify

- [ ] **Step 1: Build frontend assets**

```bash
bench build --app vaishali
```

- [ ] **Step 2: Clear cache**

```bash
bench --site dgoc.logstop.com clear-cache
```

- [ ] **Step 3: Run migrate (picks up DocType)**

```bash
bench --site dgoc.logstop.com migrate
```

- [ ] **Step 4: Run setup script**

```bash
bench --site dgoc.logstop.com execute vaishali.setup_budget.setup
```

- [ ] **Step 5: Smoke test all 3 views**

1. Login as field staff → `#/budget` → see "My Budget" with personal cap
2. Login as manager → `#/budget` → see "Team Budget" with employee list
3. Login as admin (harsh@dgoc.in) → `#/budget` → see all verticals + top spenders

- [ ] **Step 6: Test cap enforcement**

1. Create Expense Claim as a test employee with amount exceeding their ₹15K cap
2. Submit the claim
3. Verify: comment added to claim + Telegram alert sent to manager

- [ ] **Step 7: Deploy to EC2**

```bash
EC2_IP=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=dspl-erp-server" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].PublicIpAddress" --output text)
ssh -i ~/.ssh/heft-erp-key.pem ubuntu@$EC2_IP
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com migrate'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench build --app vaishali'
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali.setup_budget.setup'
redis-cli FLUSHALL
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web dspl-fastapi
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: budget dashboard deployment verification"
```
