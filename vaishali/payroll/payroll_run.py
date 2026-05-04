"""Mar 2026 Payroll Entry — 4 batches.

Each Payroll Entry:
  - filters Employees by company + structure
  - creates draft Salary Slips (one per employee)
  - submits each slip
We don't auto-make the Bank Entry; the accountant continues using the
external bank file for now.
"""
from __future__ import annotations
import frappe
from frappe.utils import getdate

DCEPL = "Dynamic Crane Engineers Private Limited"
DSPL = "Dynamic Servitech Private Limited"

PERIOD_START = "2026-03-01"
PERIOD_END = "2026-03-31"
POSTING_DATE = "2026-03-31"


def _create_payroll_entry(name: str, company: str, structure_name: str | None,
                           branch: str | None = None) -> str:
    if frappe.db.exists("Payroll Entry", {"title": name, "docstatus": 1}):
        existing = frappe.db.get_value("Payroll Entry",
                                       {"title": name, "docstatus": 1}, "name")
        print(f"  Payroll Entry: {name} already submitted ({existing}) — skipping")
        return existing
    pe = frappe.new_doc("Payroll Entry")
    pe.posting_date = POSTING_DATE
    pe.payroll_frequency = "Monthly"
    pe.start_date = PERIOD_START
    pe.end_date = PERIOD_END
    pe.company = company
    if structure_name:
        pe.salary_structure = structure_name
    if branch:
        pe.branch = branch
    pe.exchange_rate = 1.0
    pe.title = name
    pe.insert(ignore_permissions=True)
    # Pull employees → fills child table
    pe.fill_employee_details()
    pe.save(ignore_permissions=True)
    pe.submit()
    return pe.name


def run_dcepl_staff() -> str:
    return _create_payroll_entry("Mar-2026 DCEPL Staff", DCEPL, "Staff - DCEPL")


def run_dcepl_operator() -> str:
    return _create_payroll_entry("Mar-2026 DCEPL Operator", DCEPL, "Operator - DCEPL")


def run_dspl_staff() -> str:
    return _create_payroll_entry("Mar-2026 DSPL Staff", DSPL, "Staff - DSPL")


def run_dspl_overhead() -> str:
    return _create_payroll_entry("Mar-2026 DSPL Overhead", DSPL, "Overhead - DSPL")


def submit_all_slips() -> dict:
    drafts = frappe.get_all("Salary Slip",
        filters={"start_date": PERIOD_START, "end_date": PERIOD_END,
                 "docstatus": 0},
        pluck="name")
    counts = {"submitted": 0, "errors": 0}
    for n in drafts:
        try:
            doc = frappe.get_doc("Salary Slip", n)
            doc.submit()
            counts["submitted"] += 1
        except Exception:
            frappe.log_error(title=f"Slip submit failed: {n}",
                             message=frappe.get_traceback())
            counts["errors"] += 1
    frappe.db.commit()
    return counts


def run_all() -> dict:
    a = run_dcepl_staff()
    b = run_dcepl_operator()
    c = run_dspl_staff()
    d = run_dspl_overhead()
    s = submit_all_slips()
    print(f"  Payroll Entries: {[a, b, c, d]}")
    print(f"  Slips submission: {s}")
    return {"entries": [a, b, c, d], "slips": s}
