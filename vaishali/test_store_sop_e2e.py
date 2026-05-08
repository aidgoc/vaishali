"""DCEPL ERS Store SOP — end-to-end functional test.

Goes beyond the wiring smoke test: actually creates draft Frappe
documents and exercises every guard / hook on real DocTypes.

Safety:
- Never submits a Stock Entry (would move stock ledger). Stock Entry
  is created in Draft and the `before_submit` hook is called as a
  function to assert pass/fail behaviour, then the draft is deleted.
- Material Request IS submitted + cancelled (no ledger impact).
- Outward Gate Pass IS submitted + cancelled (no ledger impact).
- All drafts/cancelled docs are deleted at the end. Idempotent.

Run:
    bench --site dgoc.logstop.com execute vaishali.test_store_sop_e2e.run

Or:
    /home/frappe/frappe-bench/env/bin/python -m vaishali.test_store_sop_e2e
"""
import frappe
from frappe.utils import nowdate, nowtime


COMPANY = "Dynamic Crane Engineers Private Limited"
WAREHOUSE = "Stores - DCEPL"

_results = []
_cleanup = []  # list of (doctype, name) to delete at the end


def _record(name: str, ok: bool, detail: str = ""):
    _results.append((ok, name, detail))


def _pick_test_item() -> str:
    """Find any non-disabled Item that already has a Bin row in
    Stores - DCEPL — guarantees the warehouse-item link is valid."""
    rows = frappe.db.sql("""
        SELECT b.item_code FROM tabBin b
        JOIN tabItem i ON i.name = b.item_code
        WHERE b.warehouse = %s AND IFNULL(i.disabled,0)=0
        ORDER BY b.actual_qty DESC LIMIT 1
    """, (WAREHOUSE,))
    return rows[0][0] if rows else None


def _expect_throw(fn, label: str):
    try:
        fn()
    except frappe.ValidationError as e:
        _record(label, True, f"raised: {str(e)[:120]}")
        return True
    except Exception as e:
        _record(label, False, f"wrong exception type: {type(e).__name__}: {e}")
        return False
    _record(label, False, "did NOT raise (expected ValidationError)")
    return False


def _expect_no_throw(fn, label: str):
    try:
        fn()
    except Exception as e:
        _record(label, False, f"raised: {type(e).__name__}: {str(e)[:120]}")
        return False
    _record(label, True)
    return True


# ------------------------------------------------------------------ #
# Wedge 1 — QA/QC blocks Purchase Receipt without inspection
# ------------------------------------------------------------------ #
def test_wedge1_qa_qc(item_code: str):
    from vaishali.qa_qc_guard import enforce_quality_inspection

    pr = frappe.new_doc("Purchase Receipt")
    pr.company = COMPANY
    pr.posting_date = nowdate()
    pr.supplier = frappe.db.get_value("Supplier", {"disabled": 0}, "name")
    if not pr.supplier:
        _record("wedge1: pick a supplier", False, "no enabled Supplier on system")
        return
    pr.append("items", {
        "item_code": item_code,
        "qty": 1,
        "rate": 1,
        "warehouse": WAREHOUSE,
    })
    pr.flags.ignore_permissions = True
    pr.flags.ignore_mandatory = True
    try:
        pr.insert()
        _cleanup.append(("Purchase Receipt", pr.name))
    except Exception as e:
        _record("wedge1: insert draft PR into CWS", False, str(e)[:160])
        return
    _record("wedge1: insert draft PR into CWS", True, f"name={pr.name}")

    _expect_throw(
        lambda: enforce_quality_inspection(pr),
        "wedge1: PR submit blocked without Accepted QI",
    )


# ------------------------------------------------------------------ #
# Wedge 4 — MRN HOD approval gates Material Issue
# ------------------------------------------------------------------ #
def test_wedge4_mrn_approval(item_code: str):
    from vaishali.mrn_approval_guard import (
        enforce_mrn_approval_on_issue,
        validate_material_request,
    )

    # 1. Create + submit a Material Request (Material Issue)
    mr = frappe.new_doc("Material Request")
    mr.material_request_type = "Material Issue"
    mr.company = COMPANY
    mr.set_warehouse = WAREHOUSE
    mr.transaction_date = nowdate()
    mr.schedule_date = nowdate()
    mr.append("items", {
        "item_code": item_code,
        "qty": 1,
        "schedule_date": nowdate(),
        "warehouse": WAREHOUSE,
    })
    mr.flags.ignore_permissions = True
    try:
        mr.insert()
        mr.submit()
        _cleanup.append(("Material Request", mr.name))
    except Exception as e:
        _record("wedge4: create + submit MR", False, str(e)[:160])
        return
    _record("wedge4: create + submit MR", True, f"name={mr.name}")

    # 2. Build an in-memory Stock Entry (no insert — guard reads doc
    #    state + queries the MR from DB; we want to avoid Frappe's heavy
    #    validate on Stock Entry insert and any stock-ledger risk).
    se = frappe.new_doc("Stock Entry")
    se.stock_entry_type = "Material Issue"
    se.purpose = "Material Issue"
    se.company = COMPANY
    se.posting_date = nowdate()
    se.posting_time = nowtime()
    se.append("items", {
        "item_code": item_code,
        "qty": 1,
        "s_warehouse": WAREHOUSE,
        "material_request": mr.name,
    })

    _expect_throw(
        lambda: enforce_mrn_approval_on_issue(se),
        "wedge4: SE submit blocked when MR not approved",
    )

    # 3. Approve the MR — validate hook auto-stamps.
    mr.reload()
    mr.mrn_hod_approved = 1
    try:
        validate_material_request(mr)
        mr.db_update()
        # rerun frappe-side write for stamps via .save() pathway — emulate UX
        approved_user = mr.mrn_approved_by
        approved_at = mr.mrn_approved_at
    except Exception as e:
        _record("wedge4: approve MR (Administrator)", False, str(e)[:160])
        return
    _record("wedge4: approve MR (Administrator)", True,
            f"by={approved_user} at={approved_at}")

    # Persist the approval flag so guard can re-read from DB
    frappe.db.set_value("Material Request", mr.name, {
        "mrn_hod_approved": 1,
        "mrn_approved_by": approved_user,
        "mrn_approved_at": approved_at,
    })
    frappe.db.commit()

    # 4. Now the SE before_submit guard should pass.
    _expect_no_throw(
        lambda: enforce_mrn_approval_on_issue(se),
        "wedge4: SE submit allowed once MR approved",
    )


# ------------------------------------------------------------------ #
# Wedge 5 — Outward Gate Pass round trip
# ------------------------------------------------------------------ #
def test_wedge5_gate_pass(item_code: str):
    gp = frappe.new_doc("Outward Gate Pass")
    gp.posting_date = nowdate()
    gp.posting_time = nowtime()
    gp.company = COMPANY
    gp.source_warehouse = WAREHOUSE
    gp.vehicle_no = "TEST-E2E-1"
    gp.driver_name = "E2E Test Driver"
    gp.destination_type = "Internal"
    gp.destination_name = "End-to-end smoke test"
    gp.returnable = 1
    gp.expected_return_date = nowdate()
    gp.append("items", {"item_code": item_code, "qty": 1})
    gp.flags.ignore_permissions = True

    try:
        gp.insert()
        _cleanup.append(("Outward Gate Pass", gp.name))
    except Exception as e:
        _record("wedge5: insert Gate Pass", False, str(e)[:160])
        return
    _record("wedge5: insert Gate Pass", True, f"name={gp.name}")

    try:
        gp.submit()
    except Exception as e:
        _record("wedge5: submit Gate Pass", False, str(e)[:160])
        return
    _record("wedge5: submit Gate Pass", gp.status == "Out", f"status={gp.status}")

    try:
        gp.reload()
        gp.mark_returned()
        gp.reload()
    except Exception as e:
        _record("wedge5: mark_returned()", False, str(e)[:160])
        return
    _record("wedge5: mark_returned()", gp.status == "Returned",
            f"status={gp.status} returned_at={gp.returned_at}")


# ------------------------------------------------------------------ #
# Cleanup
# ------------------------------------------------------------------ #
def _cleanup_all():
    for dt, name in reversed(_cleanup):
        try:
            doc = frappe.get_doc(dt, name)
            if doc.docstatus == 1:
                doc.flags.ignore_permissions = True
                doc.cancel()
            doc.delete(ignore_permissions=True)
        except Exception as e:
            print(f"cleanup warning: {dt} {name}: {e}")
    frappe.db.commit()


# ------------------------------------------------------------------ #
# Entry points
# ------------------------------------------------------------------ #
def run():
    _results.clear()
    _cleanup.clear()

    item_code = _pick_test_item()
    if not item_code:
        print(f"FATAL: no items found in {WAREHOUSE} — can't run E2E test")
        return {"passed": 0, "total": 0, "failures": [("no test item", "")]}
    print(f"Using test item: {item_code}\n")

    try:
        test_wedge1_qa_qc(item_code)
        test_wedge4_mrn_approval(item_code)
        test_wedge5_gate_pass(item_code)
    finally:
        _cleanup_all()

    passed = sum(1 for ok, *_ in _results if ok)
    total = len(_results)
    print(f"\n{'='*60}\nDCEPL ERS Store SOP E2E test: {passed}/{total} passed\n{'='*60}")
    for ok, name, detail in _results:
        mark = "PASS" if ok else "FAIL"
        line = f"[{mark}] {name}"
        if detail:
            line += f"\n         {detail}"
        print(line)
    print(f"\nCleaned up {len(_cleanup)} draft/cancelled docs")
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
