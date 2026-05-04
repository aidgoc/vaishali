import pytest
from vaishali.payroll.ingest.parse_leave_tracker import parse


def test_returns_dict_emp_code_to_closing_bal(leave_tracker_xlsx):
    out = parse(leave_tracker_xlsx)
    assert isinstance(out, dict)
    assert len(out) > 0
    # Spot-check: Vivek Kulkarni ST004 was the first row of HO sheet,
    # closing bal Mar = Pre[Mar] + Earned[Mar] − Taken[Mar] = 9 + 1.5 − 0 = 10.5
    assert "ST004" in out
    assert abs(out["ST004"] - 10.5) <= 0.5  # tolerance for rounding


def test_closing_bal_non_negative(leave_tracker_xlsx):
    out = parse(leave_tracker_xlsx)
    assert all(v >= 0 for v in out.values()), "closing bal should never go negative"


def test_returns_employees_from_both_sheets(leave_tracker_xlsx):
    """HO and Pirangut sheets should both contribute. HO ~28, Pirangut ~10."""
    out = parse(leave_tracker_xlsx)
    # Total should be > 30 (combined HO + Pirangut)
    assert len(out) > 30
