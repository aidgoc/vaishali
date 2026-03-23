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
    "Operations - DCEPL": "EPS",
    "SERVICE - DSPL": "EPS",
    "Sales - DSPL": "EPS",
    "SALES AND MARKETING - DSPL": "EPS",
    "Production - DSPL": "EPS",
    "R AND D - DSPL": "EPS",
    "Management - DSPL": "EPS",
    "Accounts": "EPS",
    "Human Resources": "EPS",
    "Purchase": "EPS",
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
        "options": "EPS",
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
            vertical = DEPT_VERTICAL_DEFAULT.get(emp.department, "EPS")

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
    }

    for vertical, monthly in vertical_budgets.items():
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
            "vertical": emp.vertical or "EPS",
            "employee": emp.name,
            "monthly_cap": cap,
            "alert_threshold": 80,
            "escalate_threshold": 100,
        })
        doc.insert(ignore_permissions=True)
        created += 1

    print(f"Created {created} per-employee budgets.")
