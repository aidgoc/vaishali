"""FY 26-27 opening Leave Allocation from the Mar 2026 leave tracker (file 7).

For each employee in the HO + Pirangut sheets, read Mar closing balance
(Pre + Earned − Taken, clamped to non-negative) and create one
Leave Allocation against `Paid Leave` (the active earned-leave type on
this site, used by 179 existing allocations).

Resolver follows the same name-fallback pattern as ssa.py: try emp_code
first when it matches /^[A-Z]+\d+$/, else look up by employee_name in the
right company. Required because 63 of 79 leave-tracker blocks have blank
emp_code (col 2 NULL) — only the name (col 3) is populated.

Idempotent — skips employees who already have a submitted Leave Allocation
for `Paid Leave` with from_date = 2026-04-01.
"""
from __future__ import annotations
import re

import frappe

from vaishali.payroll.ingest import excel_path
from vaishali.payroll.ingest.parse_leave_tracker import parse as parse_leaves


LEAVE_TYPE = "Paid Leave"
FROM_DATE = "2026-04-01"
TO_DATE = "2027-03-31"


def _resolve_employee(key: str) -> str | None:
    """Try emp_code (e.g. 'ST004') first if the key looks like a real code,
    else fall back to a case-insensitive employee_name match against active
    employees. Returns Employee.name or None."""
    if not key:
        return None
    if re.match(r"^[A-Z]+\d+$", key.strip()):
        emp = frappe.db.get_value(
            "Employee",
            {"legacy_emp_code": key.strip(), "status": "Active"},
            "name",
        )
        if emp:
            return emp
    # Name fallback — case-insensitive LIKE match
    return frappe.db.get_value(
        "Employee",
        {"employee_name": ["like", key.strip()], "status": "Active"},
        "name",
    )


def import_opening_balances() -> dict:
    """Read closing balances from file 7 and create one Leave Allocation per
    matched employee. Returns counts by outcome."""
    closings = parse_leaves(excel_path("leave_tracker"))
    counts = {"created": 0, "skipped": 0, "missing_employee": 0, "zero_balance": 0}

    for key, closing in closings.items():
        if closing <= 0:
            counts["zero_balance"] += 1
            continue
        emp = _resolve_employee(key)
        if not emp:
            counts["missing_employee"] += 1
            continue
        if frappe.db.exists("Leave Allocation", {
            "employee": emp,
            "leave_type": LEAVE_TYPE,
            "from_date": FROM_DATE,
            "docstatus": 1,
        }):
            counts["skipped"] += 1
            continue
        try:
            doc = frappe.new_doc("Leave Allocation")
            doc.employee = emp
            doc.leave_type = LEAVE_TYPE
            doc.from_date = FROM_DATE
            doc.to_date = TO_DATE
            doc.new_leaves_allocated = float(closing)
            doc.description = (
                "FY 26-27 opening balance imported from Mar 2026 leave tracker "
                "(closing = pre + earned − taken, clamped non-negative)."
            )
            doc.insert(ignore_permissions=True)
            doc.submit()
            counts["created"] += 1
        except Exception as e:
            counts.setdefault("errors", []).append({"employee": emp, "error": str(e)[:200]})

    frappe.db.commit()
    print(f"  Leave Allocation: {counts}")
    return counts
