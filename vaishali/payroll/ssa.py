"""Bulk Salary Structure Assignment from Excel inputs.

For each parsed Excel row:
  - Resolve emp_code → Employee.name via legacy_emp_code (set by employees.populate_legacy_emp_code)
  - Pick the right structure (Staff-DCEPL / Staff-DSPL / Operator-DCEPL / Overhead-DSPL)
  - Set base from the Excel "Gross" / "Salary Gross" column
  - For operators: also stamp base_basic_da, site_allowance, payroll_subgroup on Employee
  - For everyone: stamp pf_applicable, esic_applicable from Y/N columns
  - Insert + submit SSA

Idempotent — skips employees that already have a submitted SSA against the
same from_date and structure.
"""
from __future__ import annotations
import frappe
from frappe.utils import getdate

from vaishali.payroll.ingest import excel_path
from vaishali.payroll.ingest.parse_dcepl_staff import parse as parse_dcepl_staff
from vaishali.payroll.ingest.parse_dspl_staff import parse as parse_dspl_staff
from vaishali.payroll.ingest.parse_dcepl_operator import parse as parse_dcepl_operator
from vaishali.payroll.ingest.parse_overhead import parse as parse_overhead


FROM_DATE = "2026-03-01"

DCEPL = "Dynamic Crane Engineers Private Limited"
DSPL = "Dynamic Servitech Private Limited"


def _resolve_employee(emp_code: str) -> str | None:
    if not emp_code:
        return None
    return frappe.db.get_value("Employee",
                               {"legacy_emp_code": emp_code, "status": "Active"},
                               "name")


def _yn_to_int(v) -> int:
    return 1 if str(v or "").upper().strip() == "Y" else 0


def _create_ssa(employee: str, structure: str, base: float, company: str) -> str | None:
    if frappe.db.exists("Salary Structure Assignment",
                        {"employee": employee, "from_date": FROM_DATE,
                         "salary_structure": structure, "docstatus": 1}):
        return None
    ssa = frappe.new_doc("Salary Structure Assignment")
    ssa.employee = employee
    ssa.salary_structure = structure
    ssa.from_date = FROM_DATE
    ssa.base = float(base or 0)
    ssa.company = company
    ssa.insert(ignore_permissions=True)
    ssa.submit()
    return ssa.name


def assign_staff() -> dict:
    counts = {"created": 0, "skipped": 0, "missing_employee": 0}
    for src, parser, structure, company in (
        ("dcepl_staff", parse_dcepl_staff, "Staff - DCEPL", DCEPL),
        ("dspl_staff",  parse_dspl_staff,  "Staff - DSPL",  DSPL),
    ):
        for row in parser(excel_path(src)):
            emp = _resolve_employee(str(row["emp_code"]).strip() if row.get("emp_code") else "")
            if not emp:
                counts["missing_employee"] += 1
                continue
            base = row.get("gross_pay_target") or 0
            if not base:
                counts["skipped"] += 1
                continue
            pf_app = 1 if (row.get("pf") or 0) > 0 else 0
            esic_app = 1 if (row.get("esic") or 0) > 0 else 0
            frappe.db.set_value("Employee", emp, {
                "pf_applicable": pf_app,
                "esic_applicable": esic_app,
            }, update_modified=False)
            name = _create_ssa(emp, structure, base, company)
            if name:
                counts["created"] += 1
            else:
                counts["skipped"] += 1
    frappe.db.commit()
    return counts


def assign_operator() -> dict:
    counts = {"created": 0, "skipped": 0, "missing_employee": 0}
    for row in parse_dcepl_operator(excel_path("dcepl_operator")):
        emp = _resolve_employee(str(row["emp_code"]).strip() if row.get("emp_code") else "")
        if not emp:
            counts["missing_employee"] += 1
            continue
        base = row.get("salary_gross_target") or 0
        if not base:
            counts["skipped"] += 1
            continue
        basic_da = float(row.get("basic") or 0) + float(row.get("da") or 0)
        site = float(row.get("site_allow") or 0)
        frappe.db.set_value("Employee", emp, {
            "pf_applicable": _yn_to_int(row.get("pf_applicable")),
            "esic_applicable": _yn_to_int(row.get("esic_applicable")),
            "payroll_subgroup": row.get("payroll_subgroup") or "Standard",
            "base_basic_da": basic_da,
            "site_allowance": site,
        }, update_modified=False)
        name = _create_ssa(emp, "Operator - DCEPL", base, DCEPL)
        if name:
            counts["created"] += 1
        else:
            counts["skipped"] += 1
    frappe.db.commit()
    return counts


def assign_overhead() -> dict:
    counts = {"created": 0, "skipped": 0, "missing_employee": 0}
    for row in parse_overhead(excel_path("overhead")):
        emp = _resolve_employee(str(row["emp_code"]).strip() if row.get("emp_code") else "")
        if not emp:
            counts["missing_employee"] += 1
            continue
        base = row.get("salary_gross_target") or 0
        if not base:
            counts["skipped"] += 1
            continue
        frappe.db.set_value("Employee", emp, {
            "pf_applicable": _yn_to_int(row.get("pf_applicable")),
            "esic_applicable": _yn_to_int(row.get("esic_applicable")),
        }, update_modified=False)
        name = _create_ssa(emp, "Overhead - DSPL", base, DSPL)
        if name:
            counts["created"] += 1
        else:
            counts["skipped"] += 1
    frappe.db.commit()
    return counts


def assign_all() -> dict:
    s = assign_staff()
    o = assign_operator()
    h = assign_overhead()
    print(f"  Staff:    {s}")
    print(f"  Operator: {o}")
    print(f"  Overhead: {h}")
    return {"staff": s, "operator": o, "overhead": h}
