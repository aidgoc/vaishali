"""Custom Fields on Employee for the payroll module + emp_code → name resolver.

Idempotent — safe to re-run. Uses Frappe's create_custom_field which is upsert.
"""
from __future__ import annotations
import json
import os
import re

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


UNMATCHED_REPORT = "/home/frappe/vaishali_data/2026-03/payroll_unmatched.json"

# 4-letter Excel "company" short-code → full ERPNext Company name. NA / blank
# means "don't filter by company" — used by Overhead rows where the routing
# company is ambiguous.
COMPANY_SHORT_MAP = {
    "DCEPL": "Dynamic Crane Engineers Private Limited",
    "DSPL":  "Dynamic Servitech Private Limited",
}

# Real legacy emp_code looks like ST109 / OP003 / OH012 — letters then digits.
# Things like "VB" or "NA" are routing flags, not codes; we don't write them.
_REAL_CODE_RE = re.compile(r"^[A-Z]+\d+$")


CUSTOM_FIELDS = [
    {
        "fieldname": "legacy_emp_code",
        "label": "Legacy Emp Code",
        "fieldtype": "Data",
        "insert_after": "employee_number",
        "search_index": 1,
        "description": "Employee code from the Mar 2026 salary registers (ST109, OP003, VB, etc.). Used to look up payroll inputs.",
    },
    {
        "fieldname": "pf_applicable",
        "label": "PF applicable",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "overtime_eligible",
        "description": "When checked, Provident Fund deduction applies (12% capped at INR 1,800).",
    },
    {
        "fieldname": "esic_applicable",
        "label": "ESIC applicable",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "pf_applicable",
        "description": "When checked, ESIC deduction (0.75%) applies — typically for employees with gross at most INR 21,000.",
    },
    {
        "fieldname": "payroll_subgroup",
        "label": "Payroll subgroup",
        "fieldtype": "Select",
        "options": "Standard\nVB",
        "default": "Standard",
        "insert_after": "esic_applicable",
        "description": "Payment routing within DCEPL operators — Standard or VB (Victory Bharat-routed).",
    },
    {
        "fieldname": "base_basic_da",
        "label": "Base Basic + DA (operator min wage)",
        "fieldtype": "Currency",
        "options": "INR",
        "default": "0",
        "insert_after": "payroll_subgroup",
        "description": "Maharashtra minimum-wage anchor (Basic + DA) for DCEPL operators. Ignored for Staff and Overhead.",
    },
    {
        "fieldname": "site_allowance",
        "label": "Site allowance (INR/month)",
        "fieldtype": "Currency",
        "options": "INR",
        "default": "0",
        "insert_after": "base_basic_da",
        "description": "Monthly site allowance for operators paid via the Operator structure.",
    },
]


def ensure_custom_fields():
    """Create or upsert all 6 Employee Custom Fields. Idempotent."""
    for f in CUSTOM_FIELDS:
        create_custom_field("Employee", f)
    frappe.db.commit()
    print(f"  Custom Fields: {len(CUSTOM_FIELDS)} ensured on Employee")


def populate_legacy_emp_code():
    """For every active Employee, find the matching emp_code from the 4 Excel
    files (parsed via the ingest module) and write it to legacy_emp_code.

    Returns a dict {matched: [...], unmatched: [...]}. Writes the unmatched
    list to UNMATCHED_REPORT for manual triage.
    """
    from rapidfuzz import fuzz, process
    from vaishali.payroll.ingest.parse_dcepl_staff import parse as parse_a
    from vaishali.payroll.ingest.parse_dspl_staff import parse as parse_b
    from vaishali.payroll.ingest.parse_dcepl_operator import parse as parse_c
    from vaishali.payroll.ingest.parse_overhead import parse as parse_d
    from vaishali.payroll.ingest import excel_path

    excel_rows = []
    for src, fn, key in (
        ("dcepl_staff", parse_a, "dcepl_staff"),
        ("dspl_staff",  parse_b, "dspl_staff"),
        ("dcepl_op",    parse_c, "dcepl_operator"),
        ("overhead",    parse_d, "overhead"),
    ):
        for row in fn(excel_path(key)):
            excel_rows.append({
                "src": src,
                "emp_code": str(row["emp_code"]).strip() if row.get("emp_code") else "",
                "name_upper": (row.get("name") or "").upper().strip(),
                "company_short": (row.get("company") or "").upper().strip(),
            })

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "employee_name", "employee_number", "company"],
    )

    # Global indexes (used when no company filter applies — e.g. NA rows).
    name_index = {e["employee_name"].upper().strip(): e["name"] for e in employees}
    number_index = {(e["employee_number"] or "").strip(): e["name"]
                    for e in employees if e.get("employee_number")}

    # Per-company name index — used to narrow the fuzzy-match candidate pool
    # so e.g. a DCEPL operator can't accidentally match a DSPL staff name.
    name_index_by_company: dict[str, dict[str, str]] = {}
    for e in employees:
        comp = e.get("company") or ""
        nm = e["employee_name"].upper().strip()
        name_index_by_company.setdefault(comp, {})[nm] = e["name"]

    matched, unmatched = [], []

    for ex in excel_rows:
        emp_name = None
        if ex["emp_code"]:
            emp_name = number_index.get(ex["emp_code"])

        # Pick the candidate pool: filter by company if the Excel "company"
        # short-code is recognised; otherwise fall back to the global pool.
        expected_company = COMPANY_SHORT_MAP.get(ex["company_short"])
        if expected_company:
            candidate_index = name_index_by_company.get(expected_company, {})
        else:
            candidate_index = name_index

        if not emp_name and ex["name_upper"]:
            emp_name = candidate_index.get(ex["name_upper"])
        if not emp_name and ex["name_upper"]:
            choices = list(candidate_index.keys())
            if choices:
                best = process.extractOne(ex["name_upper"], choices,
                                          scorer=fuzz.token_set_ratio)
                if best and best[1] >= 80:
                    emp_name = candidate_index[best[0]]

        if emp_name:
            # Only stamp legacy_emp_code if it looks like a real code. "VB" /
            # "NA" / blank are routing flags, not codes — writing them would
            # corrupt the Employee record and break the resolver downstream.
            if ex["emp_code"] and _REAL_CODE_RE.match(ex["emp_code"]):
                frappe.db.set_value(
                    "Employee", emp_name,
                    "legacy_emp_code", ex["emp_code"], update_modified=False)
            matched.append({"emp_code": ex["emp_code"], "employee": emp_name,
                            "src": ex["src"]})
        else:
            unmatched.append(ex)

    frappe.db.commit()

    os.makedirs(os.path.dirname(UNMATCHED_REPORT), exist_ok=True)
    with open(UNMATCHED_REPORT, "w") as f:
        json.dump(unmatched, f, indent=2)

    print(f"  Mapped: {len(matched)} matched, {len(unmatched)} unmatched")
    if unmatched:
        print(f"  Unmatched report: {UNMATCHED_REPORT}")
        for u in unmatched[:5]:
            print(f"    - {u['emp_code']!r} {u['name_upper']!r} ({u['src']})")
        if len(unmatched) > 5:
            print(f"    ... +{len(unmatched) - 5} more")
    return {"matched": len(matched), "unmatched": len(unmatched),
            "report": UNMATCHED_REPORT if unmatched else None}
