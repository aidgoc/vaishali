"""Remove ERS/ESS/OTHER vertical data from ERPNext.

DSPL only has the EPS division. This script:
1. Deletes Expense Budget records for ERS/ESS/OTHER verticals
2. Clears the vertical field on employees that were tagged ERS/ESS/OTHER
3. Updates the Custom Field options to only allow EPS

Usage: bench --site dgoc.logstop.com execute vaishali.cleanup_ers.run
"""
import frappe


def run():
    # 1. Delete non-EPS Expense Budgets
    budgets = frappe.get_all("Expense Budget",
        filters={"vertical": ["in", ["ERS", "ESS", "OTHER"]]},
        pluck="name")
    for name in budgets:
        frappe.delete_doc("Expense Budget", name, force=True)
    print(f"Deleted {len(budgets)} non-EPS Expense Budget records.")

    # 2. Clear vertical for non-EPS employees
    employees = frappe.get_all("Employee",
        filters={"vertical": ["in", ["ERS", "ESS", "OTHER"]]},
        pluck="name")
    for name in employees:
        frappe.db.set_value("Employee", name, "vertical", "", update_modified=False)
    print(f"Cleared vertical for {len(employees)} non-EPS employees.")

    # 3. Update Custom Field options to only EPS
    cf = frappe.db.get_value("Custom Field",
        {"dt": "Employee", "fieldname": "vertical"}, "name")
    if cf:
        frappe.db.set_value("Custom Field", cf, "options", "EPS")
        print("Updated vertical Custom Field options to: EPS")

    # 4. Show remaining state
    eps_count = frappe.db.count("Employee", {"vertical": "EPS"})
    blank_count = frappe.db.count("Employee", {"vertical": ["in", ["", None]]})
    budget_count = frappe.db.count("Expense Budget")
    print(f"\nFinal state: {eps_count} EPS employees, {blank_count} unassigned, {budget_count} budget records remaining.")

    frappe.db.commit()
    print("Cleanup complete.")
