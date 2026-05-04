"""Per-employee monthly inputs that don't fit on the Salary Structure formula:
OT, arrears, advances, deductions, operator allowances. One Additional Salary
doc per (employee, component, month).

Idempotent — skips entries already submitted for the same payroll_date.
"""
from __future__ import annotations
import frappe
from frappe.utils import getdate

from vaishali.payroll.ingest import excel_path
from vaishali.payroll.ingest.parse_dcepl_staff import parse as parse_dcepl_staff
from vaishali.payroll.ingest.parse_dspl_staff import parse as parse_dspl_staff
from vaishali.payroll.ingest.parse_dcepl_operator import parse as parse_dcepl_operator
from vaishali.payroll.ingest.parse_overhead import parse as parse_overhead


PAYROLL_DATE = "2026-03-31"
DCEPL = "Dynamic Crane Engineers Private Limited"
DSPL = "Dynamic Servitech Private Limited"


def _emp(emp_code: str, expected_company: str | None = None) -> str | None:
    if not emp_code:
        return None
    filters = {"legacy_emp_code": emp_code, "status": "Active"}
    if expected_company:
        filters["company"] = expected_company
    return frappe.db.get_value("Employee", filters, "name")


def _create(employee: str, component: str, amount: float,
            company: str = None) -> str | None:
    if amount is None or float(amount) == 0:
        return None
    if frappe.db.exists("Additional Salary", {
        "employee": employee, "salary_component": component,
        "payroll_date": PAYROLL_DATE, "docstatus": 1,
    }):
        return "skipped-existing"
    doc = frappe.new_doc("Additional Salary")
    doc.employee = employee
    doc.salary_component = component
    doc.amount = float(amount)
    doc.payroll_date = PAYROLL_DATE
    if company:
        doc.company = company
    doc.overwrite_salary_structure_amount = 0
    doc.insert(ignore_permissions=True)
    doc.submit()
    return doc.name


def create_for_staff() -> dict:
    counts = {"created": 0, "skipped": 0}
    for parser, key, company in (
        (parse_dcepl_staff, "dcepl_staff", DCEPL),
        (parse_dspl_staff,  "dspl_staff",  DSPL),
    ):
        for row in parser(excel_path(key)):
            emp = _emp(str(row["emp_code"]).strip() if row.get("emp_code") else "",
                       expected_company=company)
            if not emp:
                continue
            for comp, val in (
                ("Overtime",         row.get("ot_amount_payable")),
                ("Salary Arrears",   row.get("salary_arrears")),
                ("Other Deductions", row.get("other_deductions")),
                ("TDS",              row.get("tds")),
            ):
                if val and float(val) != 0:
                    name = _create(emp, comp, val, company=company)
                    if name == "skipped-existing":
                        counts["skipped"] += 1
                    elif name:
                        counts["created"] += 1
    frappe.db.commit()
    return counts


def create_for_operator() -> dict:
    counts = {"created": 0, "skipped": 0}
    for row in parse_dcepl_operator(excel_path("dcepl_operator")):
        emp = _emp(str(row["emp_code"]).strip() if row.get("emp_code") else "",
                   expected_company=DCEPL)
        if not emp:
            continue
        for comp, val in (
            ("Overtime",                row.get("ot_amount")),
            ("DA Arrears",              row.get("da_arrears")),
            ("Attendance Allowance",    row.get("attendance_allow")),
            ("Food Allowance",          row.get("food_allow")),
            ("SP Allowance",            row.get("sp_allow")),
            ("Salary Arrears",          row.get("arrears")),
            ("Salary / Other Advance",  row.get("sal_advance")),
        ):
            if val and float(val) != 0:
                name = _create(emp, comp, val, company=DCEPL)
                if name == "skipped-existing":
                    counts["skipped"] += 1
                elif name:
                    counts["created"] += 1
    frappe.db.commit()
    return counts


def create_for_overhead() -> dict:
    counts = {"created": 0, "skipped": 0}
    for row in parse_overhead(excel_path("overhead")):
        emp = _emp(str(row["emp_code"]).strip() if row.get("emp_code") else "",
                   expected_company=DSPL)
        if not emp:
            continue
        for comp, val in (
            ("Overtime",               row.get("ot_amount")),
            ("Salary / Other Advance", row.get("sal_advance")),
        ):
            if val and float(val) != 0:
                name = _create(emp, comp, val, company=DSPL)
                if name == "skipped-existing":
                    counts["skipped"] += 1
                elif name:
                    counts["created"] += 1
    frappe.db.commit()
    return counts


def create_all() -> dict:
    s = create_for_staff()
    o = create_for_operator()
    h = create_for_overhead()
    print(f"  Staff:    {s}")
    print(f"  Operator: {o}")
    print(f"  Overhead: {h}")
    return {"staff": s, "operator": o, "overhead": h}
