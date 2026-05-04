"""Parser for file 2 — DSPL Employee Salary Register & Attendance Mar 2026.

Same column layout as DCEPL Employee — see _staff_layout.py.
"""
from vaishali.payroll.ingest._staff_layout import parse_staff_sheet

SHEET = "DSPL Salary Sheet-Mar 2026"


def parse(xlsx_path: str) -> list[dict]:
    return parse_staff_sheet(xlsx_path, SHEET)
