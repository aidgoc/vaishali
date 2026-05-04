from vaishali.payroll.ingest.parse_dcepl_operator import parse, parse_subgroups


def test_subgroup_map_total_47(dcepl_operator_xlsx):
    sg = parse_subgroups(dcepl_operator_xlsx)
    assert len(sg) == 47
    assert sum(1 for v in sg.values() if v == "Standard") == 27
    assert sum(1 for v in sg.values() if v == "VB") == 20


def test_subgroup_op309_standard(dcepl_operator_xlsx):
    """OP309 (AKHILESH PASWAN) is in the OP side sheet — Standard pool."""
    sg = parse_subgroups(dcepl_operator_xlsx)
    assert sg.get("OP309") == "Standard"


def test_subgroup_op420_vb(dcepl_operator_xlsx):
    """OP420 (ABHISHEK JAISWAL) is first row of VB OP side sheet — VB pool."""
    sg = parse_subgroups(dcepl_operator_xlsx)
    assert sg.get("OP420") == "VB"


def test_main_parse_dinesh_adey(dcepl_operator_xlsx):
    rows = parse(dcepl_operator_xlsx)
    dinesh = next(r for r in rows if r["emp_code"] == "OP003")
    assert dinesh["name"].startswith("DINESH")
    assert dinesh["salary_gross_target"] == 19000
    assert dinesh["days_present"] == 31
    assert dinesh["basic"] == 10350
    assert dinesh["da"] == 5964
    assert dinesh["pf"] == 1800
    assert dinesh["pt"] == 200
    assert dinesh["pf_applicable"] == "Y"
    assert dinesh["esic_applicable"] == "Y"
    assert dinesh["payroll_subgroup"] == "Standard"


def test_main_parse_skips_total_rows(dcepl_operator_xlsx):
    rows = parse(dcepl_operator_xlsx)
    assert all(r["emp_code"] for r in rows)
    assert all(r["name"] for r in rows)
    # No totals/blanks should leak through
    for r in rows:
        assert "Total" not in str(r["name"])
