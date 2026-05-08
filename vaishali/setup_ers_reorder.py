"""DCEPL ERS Store — reorder levels + auto Material Request (wedge 3).

Writes Item Reorder child rows on Items so ERPNext's built-in
`erpnext.stock.reorder.reorder_item` scheduler creates Material
Requests automatically when actual qty in `Stores - DCEPL` falls
below the workshop sheet's Min/Reorder threshold.

Source columns (per `vaishali/data/ers_abc_classification.json`):

    min_stock    -> warehouse_reorder_level  (trigger)
    reorder_qty  -> warehouse_reorder_qty    (replenishment qty)
    max_stock    -> informational only (ERPNext has no "max" cap)

Match key: same suffix index as wedge 2 (1-letter ERPNext prefix).

Usage:
    bench --site dgoc.logstop.com execute vaishali.setup_ers_reorder.enable_auto_indent
    bench --site dgoc.logstop.com execute vaishali.setup_ers_reorder.import_reorder --kwargs "{'dry_run': True}"
    bench --site dgoc.logstop.com execute vaishali.setup_ers_reorder.import_reorder --kwargs "{'dry_run': False}"
"""
import json
import os

import frappe


_DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "data", "ers_abc_classification.json")

_DEFAULT_WAREHOUSE = "Stores - DCEPL"


def _target_warehouse() -> str:
    confs = frappe.conf.get("dcepl_ers_warehouses") or []
    return confs[0] if confs else _DEFAULT_WAREHOUSE


def enable_auto_indent():
    """Flip Stock Settings.auto_indent on so reorder cron fires."""
    s = frappe.get_single("Stock Settings")
    if not s.auto_indent:
        s.auto_indent = 1
        s.save(ignore_permissions=True)
        frappe.db.commit()
    print(f"OK: Stock Settings.auto_indent = {s.auto_indent}")


def _to_num(v):
    if v in (None, "", "null"):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _build_suffix_index():
    rows = frappe.db.sql("SELECT name FROM `tabItem` WHERE disabled = 0")
    item_codes = {r[0] for r in rows}
    suffix_index = {}
    for code in item_codes:
        if len(code) > 1 and code[0].isalpha():
            suffix_index.setdefault(code[1:], []).append(code)
    return item_codes, suffix_index


def _resolve_item(part_no, item_codes, suffix_index):
    if part_no in item_codes:
        return part_no
    cands = suffix_index.get(part_no, [])
    return cands[0] if len(cands) == 1 else None


def import_reorder(dry_run: bool = True):
    """Add or update Item Reorder rows for the ERS store warehouse."""
    with open(_DATA_PATH, "r") as f:
        data = json.load(f)

    warehouse = _target_warehouse()
    if not frappe.db.exists("Warehouse", warehouse):
        frappe.throw(f"Warehouse '{warehouse}' not found")

    item_codes, suffix_index = _build_suffix_index()

    matched = updated = unchanged = inserted = missing = skipped_no_qty = 0
    sample_skipped = []

    for part_no, info in data.items():
        item_code = _resolve_item(part_no, item_codes, suffix_index)
        if not item_code:
            missing += 1
            continue
        matched += 1

        level = _to_num(info.get("min_stock"))
        qty = _to_num(info.get("reorder_qty"))
        if level is None or qty is None:
            skipped_no_qty += 1
            if len(sample_skipped) < 10:
                sample_skipped.append(part_no)
            continue

        item = frappe.get_doc("Item", item_code)
        existing = next(
            (r for r in (item.reorder_levels or []) if r.warehouse == warehouse),
            None,
        )

        if existing:
            if (float(existing.warehouse_reorder_level or 0) == level
                    and float(existing.warehouse_reorder_qty or 0) == qty
                    and (existing.material_request_type or "") == "Purchase"):
                unchanged += 1
                continue
            if not dry_run:
                existing.warehouse_reorder_level = level
                existing.warehouse_reorder_qty = qty
                existing.material_request_type = "Purchase"
                item.save(ignore_permissions=True)
            updated += 1
        else:
            if not dry_run:
                item.append("reorder_levels", {
                    "warehouse": warehouse,
                    "warehouse_reorder_level": level,
                    "warehouse_reorder_qty": qty,
                    "material_request_type": "Purchase",
                })
                item.save(ignore_permissions=True)
            inserted += 1

    if not dry_run:
        frappe.db.commit()

    summary = {
        "dry_run": dry_run,
        "warehouse": warehouse,
        "data_total": len(data),
        "matched": matched,
        "missing": missing,
        "skipped_no_qty": skipped_no_qty,
        "inserted": inserted,
        "updated": updated,
        "unchanged": unchanged,
        "sample_skipped": sample_skipped,
    }
    print("Reorder import:", json.dumps(summary, indent=2))
    return summary
