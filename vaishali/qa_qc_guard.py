"""DCEPL ERS Store — QA/QC guard on Purchase Receipt.

Implements Store SOP §1 (Material Inward) + the QA/QC Checklist:

    For every Purchase Receipt where company == DCEPL and at least one
    item lands in an ERS warehouse, every item row MUST have a
    submitted Quality Inspection with status="Accepted".

The Quality Inspection carries the 5 SOP checks (Inv OK, PO Match,
Qty Match, Physical OK, Technical OK) as parameters and a Final Status
that mirrors QI.status.

Wired in hooks.py: doc_events."Purchase Receipt".before_submit.

Override / opt-out via site_config.json:

    dcepl_ers_qa_qc_enabled : false       # disable entirely
    dcepl_ers_warehouses    : ["ERS - DCEPL", ...]   # explicit list
                                          # default: any warehouse whose
                                          # name contains "ERS"

Reject path: Store SOP §1 says rejected material is informed to Purchase
and returned to vendor — that's handled outside the guard (PR is simply
not submitted; rejected qty stays in the rejected_warehouse via standard
ERPNext flow).
"""
import frappe
from frappe import _


DCEPL_COMPANY = "Dynamic Crane Engineers Private Limited"


def _is_ers_warehouse(warehouse: str) -> bool:
    if not warehouse:
        return False
    explicit = frappe.conf.get("dcepl_ers_warehouses")
    if isinstance(explicit, list) and explicit:
        return warehouse in explicit
    # Default: DCEPL Central Workshop (CWS) is the ERS store warehouse.
    return "CWS" in warehouse


def _enabled() -> bool:
    return frappe.conf.get("dcepl_ers_qa_qc_enabled", True) is not False


def enforce_quality_inspection(doc, method=None):
    """Block Purchase Receipt submit until every ERS-bound row has an
    Accepted Quality Inspection."""
    if not _enabled():
        return
    if doc.company != DCEPL_COMPANY:
        return

    ers_rows = [it for it in (doc.items or []) if _is_ers_warehouse(it.warehouse)]
    if not ers_rows:
        return

    missing, rejected = [], []
    for it in ers_rows:
        qi = it.quality_inspection
        if not qi:
            missing.append(f"Row {it.idx} ({it.item_code})")
            continue
        status, docstatus = frappe.db.get_value(
            "Quality Inspection", qi, ["status", "docstatus"]
        ) or (None, None)
        if docstatus != 1 or status != "Accepted":
            rejected.append(
                f"Row {it.idx} ({it.item_code}) — QI {qi}: "
                f"{status or 'no status'}, docstatus={docstatus}"
            )

    if missing or rejected:
        msg = [
            _("DCEPL ERS Store QA/QC required before Purchase Receipt submit."),
            "",
        ]
        if missing:
            msg.append(_("Missing Quality Inspection on:"))
            msg.extend(f"  • {m}" for m in missing)
        if rejected:
            msg.append("")
            msg.append(_("Quality Inspection not Accepted / not submitted:"))
            msg.extend(f"  • {r}" for r in rejected)
        msg += [
            "",
            _(
                "Per SOP (Store Material Management Process, 25/03/2026): "
                "inspection is mandatory before storage. If material is "
                "rejected, inform Purchase and return to vendor — do not "
                "submit this Purchase Receipt."
            ),
        ]
        frappe.throw("\n".join(msg))
