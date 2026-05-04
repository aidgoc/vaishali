"""Tests for the DCEPL Employee Salary Register parser.

These tests pin known rows from the actual Mar 2026 Excel — when the parser
breaks (column shifts, row offsets, formula changes) at least one of these
will fail with a clear diff.
"""
import pytest
from vaishali.payroll.ingest.parse_dcepl_staff import parse


def test_parse_returns_23_employees(dcepl_staff_xlsx):
    rows = parse(dcepl_staff_xlsx)
    assert len(rows) == 23


def test_pooja_shinde_row(dcepl_staff_xlsx):
    rows = parse(dcepl_staff_xlsx)
    pooja = next(r for r in rows if "POOJA" in r["name"])
    assert pooja["emp_code"] == "ST109"
    assert pooja["company"] == "DCEPL"
    assert pooja["dept"] == "ERS"
    assert pooja["days_worked"] == 31
    assert pooja["gross_pay_target"] == 25305
    assert pooja["gross_pay_payable"] == 25305
    assert pooja["pf"] == 1672
    assert pooja["pt"] == 200
    assert pooja["other_deductions"] == 5000
    assert pooja["net_salary"] == 18433


def test_amarnath_no_payroll(dcepl_staff_xlsx):
    """AMARNATH is on leave full month — gross_pay_payable should be 0/None."""
    rows = parse(dcepl_staff_xlsx)
    amar = next(r for r in rows if "AMARNATH" in r["name"])
    assert amar["emp_code"] == "ST197"
    # gross_pay_target carried, payable blank
    assert amar["gross_pay_target"] == 22000
    assert (amar["gross_pay_payable"] or 0) == 0


def test_no_total_rows_returned(dcepl_staff_xlsx):
    rows = parse(dcepl_staff_xlsx)
    assert all(r["emp_code"] for r in rows), "every row must have emp_code"
    assert all(r["name"] and "Total" not in r["name"] for r in rows), "no Total rows"
