"""Tests for the DSPL Employee Salary Register parser.

DSPL Employee uses the same Excel template as DCEPL Employee — these tests pin
known rows from the actual Mar 2026 file to catch column-shift / row-offset
regressions in the shared layout module.
"""
import pytest
from vaishali.payroll.ingest.parse_dspl_staff import parse


def test_parse_returns_36_employees(dspl_staff_xlsx):
    rows = parse(dspl_staff_xlsx)
    assert len(rows) == 36


def test_amol_dhumal_row(dspl_staff_xlsx):
    rows = parse(dspl_staff_xlsx)
    amol = next(r for r in rows if "AMOL SATISH DHUMAL" in r["name"])
    assert amol["company"] == "DSPL"
    assert amol["dept"] in {"EPS", "ESS", "R&D"}
    assert amol["gross_pay_target"] == 28809
    # Basic = 28809 * 0.40 = 11523.6 — Excel rounds explicitly; tolerate ±1
    assert abs(amol["basic_target"] - 11524) <= 1
    # HRA = 28809 * 0.20 = 5761.8 — same rounding tolerance
    assert abs(amol["hra_target"] - 5762) <= 1
    assert amol["medical_target"] == 1250


def test_no_blanks(dspl_staff_xlsx):
    rows = parse(dspl_staff_xlsx)
    assert all(r["emp_code"] for r in rows)
    assert all(r["name"] for r in rows)
