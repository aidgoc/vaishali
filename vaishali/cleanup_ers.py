"""Remove non-EPS data from ERPNext.

DSPL only has the EPS division. Only employees in EPS departments
(Sales, Service, Production, R&D, Marketing) should keep vertical=EPS.
All others (Operations-DCEPL, Management, Accounts, HR, Purchase) should
have vertical cleared and their budget records deleted.

Usage: bench --site dgoc.logstop.com execute vaishali.cleanup_ers.run
"""
import frappe


# Only these departments are genuinely EPS
EPS_DEPARTMENTS = [
    "SERVICE - DSPL",
    "Sales - DSPL",
    "SALES AND MARKETING - DSPL",
    "Production - DSPL",
    "R AND D - DSPL",
    "Marketing",
]


def run():
    # 1. Clear vertical for employees NOT in EPS departments
    all_emps = frappe.get_all("Employee",
        fields=["name", "department", "vertical"],
        limit_page_length=0)

    cleared = 0
    eps_names = []
    for emp in all_emps:
        if emp.department in EPS_DEPARTMENTS:
            # Keep as EPS
            if emp.vertical != "EPS":
                frappe.db.set_value("Employee", emp.name, "vertical", "EPS", update_modified=False)
            eps_names.append(emp.name)
        else:
            # Clear vertical
            if emp.vertical:
                frappe.db.set_value("Employee", emp.name, "vertical", "", update_modified=False)
                cleared += 1

    print(f"Kept {len(eps_names)} employees as EPS.")
    print(f"Cleared vertical for {cleared} non-EPS employees.")

    # 2. Delete budget records for non-EPS employees
    all_budgets = frappe.get_all("Expense Budget",
        fields=["name", "employee", "vertical"],
        limit_page_length=0)

    deleted = 0
    for b in all_budgets:
        if b.employee and b.employee not in eps_names:
            frappe.delete_doc("Expense Budget", b.name, force=True)
            deleted += 1

    print(f"Deleted {deleted} budget records for non-EPS employees.")

    # 3. Final state
    eps_count = frappe.db.count("Employee", {"vertical": "EPS"})
    blank_count = frappe.db.count("Employee", {"vertical": ["in", ["", None]]})
    budget_count = frappe.db.count("Expense Budget")
    print(f"\nFinal: {eps_count} EPS employees, {blank_count} without vertical, {budget_count} budget records.")

    frappe.db.commit()
    print("Done.")
