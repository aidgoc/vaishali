"""Parser for file 1 — DCEPL Employee Salary Register & Attendance Mar 2026.

Same column layout as DSPL Employee — see staff_layout.py.
"""
from vaishali.payroll.ingest.staff_layout import parse_staff_sheet

SHEET = "DCEPL Salary Sheet-Mar 2026"


def parse(xlsx_path: str) -> list[dict]:
    return parse_staff_sheet(xlsx_path, SHEET)
