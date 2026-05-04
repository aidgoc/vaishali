"""Mar 2026 reconciliation — diff each Salary Slip's net_pay vs Excel net.

Outputs a CSV at /home/frappe/vaishali_data/2026-03/reconciliation.csv.
"""
from __future__ import annotations
import csv
import os
import frappe

from vaishali.payroll.ingest import excel_path
from vaishali.payroll.ingest.parse_dcepl_staff import parse as parse_a
from vaishali.payroll.ingest.parse_dspl_staff import parse as parse_b
from vaishali.payroll.ingest.parse_dcepl_operator import parse as parse_c
from vaishali.payroll.ingest.parse_overhead import parse as parse_d


REPORT = "/home/frappe/vaishali_data/2026-03/reconciliation.csv"
TOLERANCE = 2.0


def _excel_index() -> dict:
    """Return {emp_code_or_name: {"name", "excel_net", "src"}}.
    Uses emp_code as key when it looks like a real code; otherwise name."""
    import re
    out = {}
    for src, parser, key in (
        ("dcepl_staff", parse_a, "dcepl_staff"),
        ("dspl_staff",  parse_b, "dspl_staff"),
        ("dcepl_op",    parse_c, "dcepl_operator"),
        ("overhead",    parse_d, "overhead"),
    ):
        for row in parser(excel_path(key)):
            ec = str(row.get("emp_code") or "").strip()
            nm = str(row.get("name") or "").strip()
            net = float(row.get("net_salary") or 0)
            if ec and re.match(r"^[A-Z]+\d+$", ec):
                key_id = ec
            else:
                key_id = nm.upper()
            out[key_id] = {
                "emp_code": ec, "name": nm, "excel_net": net, "src": src,
            }
    return out


def run_mar2026():
    excel = _excel_index()
    slips = frappe.get_all("Salary Slip",
        filters={"start_date": "2026-03-01", "docstatus": 1},
        fields=["name", "employee", "employee_name", "net_pay"])
    employees = frappe.get_all("Employee",
        fields=["name", "legacy_emp_code", "employee_name"],
        limit_page_length=0)
    emp_to_legacy = {e["name"]: (e["legacy_emp_code"] or "") for e in employees}
    emp_to_name = {e["name"]: (e["employee_name"] or "").upper() for e in employees}

    rows = []
    seen_keys = set()
    for slip in slips:
        legacy = emp_to_legacy.get(slip["employee"], "")
        emp_upper = emp_to_name.get(slip["employee"], "")
        excel_row = excel.get(legacy) if legacy else None
        if not excel_row:
            excel_row = excel.get(emp_upper)
        excel_net = excel_row["excel_net"] if excel_row else None
        seen_keys.add(legacy or emp_upper)
        if excel_net is None:
            status = "no-excel-row"
            diff = None
        else:
            diff = round(slip["net_pay"] - excel_net, 2)
            status = "match" if abs(diff) <= TOLERANCE else "off-by-rupees"
        rows.append({
            "key": legacy or emp_upper,
            "name": slip["employee_name"],
            "excel_net": excel_net,
            "erp_net": slip["net_pay"],
            "diff": diff,
            "status": status,
            "slip": slip["name"],
        })
    for k, e in excel.items():
        if k not in seen_keys:
            rows.append({
                "key": k,
                "name": e["name"],
                "excel_net": e["excel_net"],
                "erp_net": None,
                "diff": None,
                "status": "missing-slip",
                "slip": None,
            })

    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    summary = {}
    for r in rows:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    print(f"  Reconciliation: {summary}")
    print(f"  Report: {REPORT}")
    return summary
