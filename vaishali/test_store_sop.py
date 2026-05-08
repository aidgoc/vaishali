"""DCEPL ERS Store SOP — wiring regression smoke test.

Asserts that every wedge of the 5-wedge Store SOP programme is still
correctly plumbed: hooks registered, custom fields present, roles
created, fixtures applied, DocTypes installed, Ramdas onboarded.

Creates no documents. Safe to re-run after any deploy.

Usage (from frappe-bench/sites):
    /home/frappe/frappe-bench/env/bin/python -m vaishali.test_store_sop

Or:
    bench --site dgoc.logstop.com execute vaishali.test_store_sop.run
"""
import frappe


COMPANY = "Dynamic Crane Engineers Private Limited"
WAREHOUSE = "Stores - DCEPL"
RAMDAS = "sales1@dgoc.in"


_results = []


def _check(name: str, ok: bool, detail: str = ""):
    _results.append((ok, name, detail))


def _assert_hook(doctype: str, event: str, target: str):
    hooks = frappe.get_hooks("doc_events").get(doctype, {}).get(event, [])
    if isinstance(hooks, str):
        hooks = [hooks]
    _check(
        f"hook {doctype}.{event} -> {target}",
        target in hooks,
        f"registered: {hooks}",
    )


def wedge1_qa_qc():
    _assert_hook("Purchase Receipt", "before_submit",
                 "vaishali.qa_qc_guard.enforce_quality_inspection")
    _check("QI Template 'DCEPL ERS Store QA/QC' exists",
           bool(frappe.db.exists("Quality Inspection Template", "DCEPL ERS Store QA/QC")))
    if frappe.db.exists("Quality Inspection Template", "DCEPL ERS Store QA/QC"):
        params = frappe.db.sql("""SELECT specification FROM `tabItem Quality Inspection Parameter`
                                  WHERE parent='DCEPL ERS Store QA/QC'""", as_dict=True)
        names = {p.specification for p in params}
        expected = {"Inv OK", "PO Match", "Qty Match", "Physical OK", "Technical OK"}
        _check("QI Template has all 5 parameters",
               expected.issubset(names),
               f"have: {sorted(names)}")
    _check("site_config.dcepl_ers_warehouses includes Stores - DCEPL",
           WAREHOUSE in (frappe.conf.get("dcepl_ers_warehouses") or []))


def wedge2_abc():
    fields = ["ers_abc_section", "ers_abc_class", "ers_abc_status",
              "ers_abc_cb", "ers_abc_segment", "ers_department"]
    for fn in fields:
        _check(f"Item.{fn} custom field exists",
               bool(frappe.db.exists("Custom Field", {"dt": "Item", "fieldname": fn})))
    classified = frappe.db.count("Item", {"ers_abc_class": ["in", ["A", "B", "C"]]})
    _check("Items with ABC class assigned >= 400",
           classified >= 400, f"actual={classified}")
    counts = frappe.db.sql("""SELECT ers_abc_class, COUNT(*) c FROM tabItem
                              WHERE ers_abc_class IN ('A','B','C') GROUP BY ers_abc_class""", as_dict=True)
    classes = {r.ers_abc_class for r in counts}
    _check("All three classes A/B/C present",
           {"A", "B", "C"}.issubset(classes), str(counts))


def wedge3_reorder():
    auto_indent = frappe.db.get_single_value("Stock Settings", "auto_indent")
    _check("Stock Settings.auto_indent = 1", bool(auto_indent), f"value={auto_indent}")
    rows = frappe.db.count("Item Reorder", {"warehouse": WAREHOUSE})
    _check(f"Item Reorder rows on {WAREHOUSE} >= 400",
           rows >= 400, f"actual={rows}")
    sample = frappe.db.sql("""SELECT warehouse_reorder_level, warehouse_reorder_qty,
                              material_request_type FROM `tabItem Reorder`
                              WHERE warehouse=%s LIMIT 1""", (WAREHOUSE,), as_dict=True)
    if sample:
        s = sample[0]
        _check("Sample reorder row has level>0, qty>0, type=Purchase",
               s.warehouse_reorder_level > 0 and s.warehouse_reorder_qty > 0
               and s.material_request_type == "Purchase",
               str(s))


def wedge4_mrn():
    fields = ["mrn_approval_section", "mrn_hod_approved", "mrn_approved_by",
              "mrn_approved_cb", "mrn_approved_at"]
    for fn in fields:
        _check(f"Material Request.{fn} custom field exists",
               bool(frappe.db.exists("Custom Field", {"dt": "Material Request", "fieldname": fn})))
    _check("Role 'DCEPL ERS HOD' exists",
           bool(frappe.db.exists("Role", "DCEPL ERS HOD")))
    _assert_hook("Material Request", "validate",
                 "vaishali.mrn_approval_guard.validate_material_request")
    _assert_hook("Stock Entry", "before_submit",
                 "vaishali.mrn_approval_guard.enforce_mrn_approval_on_issue")
    _check("Ramdas has DCEPL ERS HOD role",
           bool(frappe.db.exists("Has Role", {"parent": RAMDAS, "role": "DCEPL ERS HOD"})))


def wedge5_gate_pass():
    for dt, expected in [("Outward Gate Pass", {"is_submittable": 1, "custom": 0}),
                        ("Outward Gate Pass Item", {"istable": 1, "custom": 0})]:
        if not frappe.db.exists("DocType", dt):
            _check(f"DocType '{dt}' exists", False)
            continue
        meta = frappe.db.get_value("DocType", dt, list(expected.keys()), as_dict=True)
        ok = all(int(meta[k] or 0) == v for k, v in expected.items())
        _check(f"DocType '{dt}' configured correctly",
               ok, f"have={dict(meta)}")
    _check("Role 'DCEPL Gate Guard' exists",
           bool(frappe.db.exists("Role", "DCEPL Gate Guard")))
    perms = {p.role for p in frappe.get_all(
        "DocPerm", filters={"parent": "Outward Gate Pass"}, fields=["role"])}
    _check("Outward Gate Pass grants Stock Manager + Stock User + DCEPL Gate Guard",
           {"Stock Manager", "Stock User", "DCEPL Gate Guard"}.issubset(perms),
           f"have={sorted(perms)}")


def onboarding_ramdas():
    _check(f"User {RAMDAS} exists and is enabled",
           bool(frappe.db.get_value("User", RAMDAS, "enabled")))
    emp = frappe.db.get_value("Employee", {"user_id": RAMDAS}, "name")
    _check(f"Employee linked to {RAMDAS}",
           bool(emp), f"employee={emp}")
    up = frappe.db.exists("User Permission", {
        "user": RAMDAS, "allow": "Company", "for_value": COMPANY,
    })
    _check(f"User Permission {RAMDAS} -> Company={COMPANY}", bool(up))


def workspace_and_guide():
    sc = frappe.db.exists("Workspace Shortcut",
                          {"parent": "ERP Guides", "label": "Store Guide"})
    _check("ERP Guides workspace has Store Guide shortcut", bool(sc))


def run():
    _results.clear()
    wedge1_qa_qc()
    wedge2_abc()
    wedge3_reorder()
    wedge4_mrn()
    wedge5_gate_pass()
    onboarding_ramdas()
    workspace_and_guide()

    passed = sum(1 for ok, *_ in _results if ok)
    total = len(_results)
    print(f"\n{'='*60}\nDCEPL ERS Store SOP smoke test: {passed}/{total} passed\n{'='*60}")
    for ok, name, detail in _results:
        mark = "PASS" if ok else "FAIL"
        line = f"[{mark}] {name}"
        if not ok and detail:
            line += f"\n         {detail}"
        elif ok and detail and len(detail) < 80:
            line += f"  ({detail})"
        print(line)
    print()
    return {"passed": passed, "total": total,
            "failures": [(n, d) for ok, n, d in _results if not ok]}


def main():
    frappe.init(site="dgoc.logstop.com")
    frappe.connect()
    try:
        return run()
    finally:
        frappe.destroy()


if __name__ == "__main__":
    main()
