import pytest
from vaishali.payroll.ingest.parse_overhead import parse


def test_parse_returns_4_overhead_employees(overhead_xlsx):
    rows = parse(overhead_xlsx)
    assert len(rows) == 4
    names = {r["name"] for r in rows}
    assert "SANTOSH MOKASHI" in names
    assert "SULBHA KADAM" in names
    assert "SNEHAL SHEDAGE" in names
    assert "SHEETAL MANE" in names


def test_santosh_row(overhead_xlsx):
    rows = parse(overhead_xlsx)
    s = next(r for r in rows if "SANTOSH" in r["name"])
    assert s["salary_gross_target"] == 24000
    assert s["days_present"] == 31
    assert s["basic_salary"] == 9600     # 24000 * 0.40
    assert s["hra"] == 4416              # 24000 * 0.184
    assert s["attendance_allow"] == 3648 # 24000 * 0.152
    assert s["food_allow"] == 3840       # 24000 * 0.16
    assert s["sp_allow"] == 2496         # 24000 * 0.104
    assert s["pf_applicable"] == "N"
    assert s["esic_applicable"] == "N"
    assert s["ot_applicable"] == "Y"     # only Santosh has OT


def test_snehal_partial_month(overhead_xlsx):
    """SNEHAL joined 12/9/25, prorated for 26 of 31 days."""
    rows = parse(overhead_xlsx)
    snehal = next(r for r in rows if "SNEHAL" in r["name"])
    assert snehal["days_present"] == 26
    # Pro-rated gross — 26 of 31 days × 10000 → 8387 (rounding)
    assert abs((snehal["gross_payable_present_days"] or 0) - 8387) <= 1


def test_no_blanks_or_totals(overhead_xlsx):
    rows = parse(overhead_xlsx)
    assert all(r["name"] for r in rows)
    for r in rows:
        assert "Total" not in str(r["name"])
