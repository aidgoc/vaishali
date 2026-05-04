"""Mar 2026 Payroll Entry — 2 batches (one per company).

Frappe routes each employee's Salary Slip via their submitted SSA, so
a single Payroll Entry per company can cover multiple Salary Structures.
DCEPL pulls Staff + Operator; DSPL pulls Staff + Overhead.

Each Payroll Entry:
  - filters Employees by company
  - creates draft Salary Slips (one per employee, structure-aware)
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


def _payable_account(company: str) -> str:
    """Read default_payroll_payable_account from Company. Frappe doesn't
    auto-fetch this onto Payroll Entry before mandatory-field validation,
    so we set it explicitly."""
    acc = frappe.db.get_value("Company", company, "default_payroll_payable_account")
    if not acc:
        frappe.throw(f"Company {company} has no default_payroll_payable_account set")
    return acc


def _create_payroll_entry(label: str, company: str) -> str:
    # Idempotency on (company, period)
    existing = frappe.db.get_value("Payroll Entry", {
        "company": company,
        "start_date": PERIOD_START,
        "end_date": PERIOD_END,
        "docstatus": 1,
    }, "name")
    if existing:
        # Already submitted — count slips already created and skip
        slip_count = frappe.db.count("Salary Slip", {
            "payroll_entry": existing, "docstatus": ["!=", 2],
        })
        print(f"  Payroll Entry: {label} already exists as {existing} "
              f"({slip_count} slips) — skipping")
        return existing
    pe = frappe.new_doc("Payroll Entry")
    pe.posting_date = POSTING_DATE
    pe.payroll_frequency = "Monthly"
    pe.start_date = PERIOD_START
    pe.end_date = PERIOD_END
    pe.company = company
    pe.payroll_payable_account = _payable_account(company)
    pe.exchange_rate = 1.0
    pe.insert(ignore_permissions=True)
    # Pull all employees in this company who have a submitted SSA
    pe.fill_employee_details()
    pe.save(ignore_permissions=True)
    pe.submit()
    # Commit so the Payroll Entry persists even if slip creation later fails.
    # Without this commit, any ValidationError in create_salary_slips_for_employees
    # would roll back the entire transaction including the just-submitted entry.
    frappe.db.commit()
    # NOW generate the actual Salary Slips. Payroll Entry.submit() only marks
    # the entry as submitted — it does not create slips. HRMS's
    # `create_salary_slips()` enqueues a background job for >30 employees, so
    # we call the underlying module-level functions directly to keep this
    # synchronous.
    from hrms.payroll.doctype.payroll_entry.payroll_entry import (
        create_salary_slips_for_employees,
        submit_salary_slips_for_employees,
    )
    employees = [e.employee for e in pe.employees if not e.is_salary_withheld]
    args = frappe._dict({
        "salary_slip_based_on_timesheet": pe.salary_slip_based_on_timesheet,
        "payroll_frequency": pe.payroll_frequency,
        "start_date": pe.start_date,
        "end_date": pe.end_date,
        "company": pe.company,
        "posting_date": pe.posting_date,
        "deduct_tax_for_unclaimed_employee_benefits": pe.deduct_tax_for_unclaimed_employee_benefits,
        "deduct_tax_for_unsubmitted_tax_exemption_proof": pe.deduct_tax_for_unsubmitted_tax_exemption_proof,
        "payroll_entry": pe.name,
        "exchange_rate": pe.exchange_rate,
        "currency": pe.currency,
    })
    create_salary_slips_for_employees(employees, args, publish_progress=False)
    frappe.db.commit()
    # Submit each created (draft) slip — also bypass the >30 queue threshold
    salary_slips = pe.get_sal_slip_list(ss_status=0)
    submit_salary_slips_for_employees(pe, salary_slips, publish_progress=False)
    frappe.db.commit()
    pe.reload()
    slip_count = frappe.db.count("Salary Slip", {
        "payroll_entry": pe.name, "docstatus": ["!=", 2],
    })
    print(f"  Payroll Entry: {label} → {pe.name} ({company}) — {slip_count} slips")
    return pe.name


def run_dcepl() -> str:
    return _create_payroll_entry("Mar-2026 DCEPL", DCEPL)


def run_dspl() -> str:
    return _create_payroll_entry("Mar-2026 DSPL", DSPL)


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
    a = run_dcepl()
    b = run_dspl()
    s = submit_all_slips()
    print(f"  Payroll Entries: {[a, b]}")
    print(f"  Slips submission: {s}")
    return {"entries": [a, b], "slips": s}
