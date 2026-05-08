"""DCEPL ERS Store — ABC classification on Item.

Wedge 2 of the Store SOP programme. Adds 4 custom fields to Item:

    ers_abc_class    : Select   A/B/C  — Pareto value class
    ers_abc_status   : Select   RED/YELLOW/GREEN  — current stock health
    ers_abc_segment  : Select   Regular / AsPerRequirement / NoFuture
                                / NoFutureTrading  — usage segmentation
    ers_department   : Select   ERS/ESS  — owning department

Source: docs/QA QC Checklist ABC.xlsx, signed off as part of the
Store SOP. Pre-processed at build time into
vaishali/data/ers_abc_classification.json so prod doesn't need
openpyxl and the data is reviewable in git.

Match key: Part No (sheet) ↔ Item.item_code (ERPNext).

Usage:
    bench --site dgoc.logstop.com execute vaishali.setup_ers_abc.ensure_fields
    bench --site dgoc.logstop.com execute vaishali.setup_ers_abc.import_abc --kwargs "{'dry_run': True}"
    bench --site dgoc.logstop.com execute vaishali.setup_ers_abc.import_abc --kwargs "{'dry_run': False}"
"""
import json
import os

import frappe


_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "vaishali", "data", "ers_abc_classification.json",
)
# When this file is loaded as vaishali.setup_ers_abc, __file__ resolves to
# .../apps/vaishali/vaishali/setup_ers_abc.py and the data dir sits at
# .../apps/vaishali/vaishali/data/. Recompute robustly:
_DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "data", "ers_abc_classification.json")


# Custom field definitions, applied via Property Setter / Custom Field.
_FIELDS = [
    {
        "fieldname": "ers_abc_section",
        "label": "ERS ABC Classification",
        "fieldtype": "Section Break",
        "insert_after": "stock_uom",
        "collapsible": 1,
    },
    {
        "fieldname": "ers_abc_class",
        "label": "ABC Class",
        "fieldtype": "Select",
        "options": "\nA\nB\nC",
        "insert_after": "ers_abc_section",
        "in_list_view": 0,
        "in_standard_filter": 1,
    },
    {
        "fieldname": "ers_abc_status",
        "label": "Stock Status",
        "fieldtype": "Select",
        "options": "\nRED\nYELLOW\nGREEN",
        "insert_after": "ers_abc_class",
        "in_standard_filter": 1,
    },
    {
        "fieldname": "ers_abc_cb",
        "fieldtype": "Column Break",
        "insert_after": "ers_abc_status",
    },
    {
        "fieldname": "ers_abc_segment",
        "label": "ABC Segment",
        "fieldtype": "Select",
        "options": "\nRegular\nAsPerRequirement\nNoFuture\nNoFutureTrading",
        "insert_after": "ers_abc_cb",
        "in_standard_filter": 1,
    },
    {
        "fieldname": "ers_department",
        "label": "ERS Department",
        "fieldtype": "Select",
        "options": "\nERS\nESS",
        "insert_after": "ers_abc_segment",
        "in_standard_filter": 1,
    },
]


def ensure_fields():
    """Create the ABC custom fields on Item if missing. Idempotent."""
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    for spec in _FIELDS:
        if frappe.db.exists("Custom Field", {"dt": "Item", "fieldname": spec["fieldname"]}):
            continue
        create_custom_field("Item", spec.copy())
    frappe.db.commit()
    print(f"OK: ensured {len(_FIELDS)} custom fields on Item.")


def _load_data():
    with open(_DATA_PATH, "r") as f:
        return json.load(f)


def _allowed(value, options_str):
    """Return value if in the Select options, else None (so we don't reject the doc)."""
    opts = [o.strip() for o in (options_str or "").split("\n") if o.strip()]
    return value if value in opts else None


def dump_missing(output_path: str = None):
    """Write the part numbers that have no matching Item to a CSV.

    Default path: <site>/private/files/ers_abc_missing_parts.csv
    Returns the absolute file path.
    """
    import csv

    data = _load_data()
    rows = frappe.db.sql("SELECT name FROM `tabItem` WHERE disabled = 0")
    item_codes = {r[0] for r in rows}
    suffix_index = {}
    for code in item_codes:
        if len(code) > 1 and code[0].isalpha():
            suffix_index.setdefault(code[1:], []).append(code)

    missing_rows = []
    for part_no, info in data.items():
        if part_no in item_codes:
            continue
        cands = suffix_index.get(part_no, [])
        if len(cands) == 1:
            continue
        # Either no candidate, or ambiguous — both flagged for review.
        missing_rows.append({
            "part_no": part_no,
            "part_name": info.get("part_name") or "",
            "department": info.get("department") or "",
            "equipment_name": info.get("equipment_name") or "",
            "model": info.get("model") or "",
            "unit": info.get("unit") or "",
            "abc_class": info.get("abc_class") or "",
            "status": info.get("status") or "",
            "segment": info.get("segment") or "",
            "min_stock": info.get("min_stock") or "",
            "reorder_qty": info.get("reorder_qty") or "",
            "max_stock": info.get("max_stock") or "",
            "ambiguous_candidates": ",".join(cands) if len(cands) > 1 else "",
        })

    if output_path is None:
        site_path = frappe.get_site_path("private", "files")
        output_path = os.path.join(site_path, "ers_abc_missing_parts.csv")

    fieldnames = list(missing_rows[0].keys()) if missing_rows else [
        "part_no", "part_name", "department", "equipment_name", "model",
        "unit", "abc_class", "status", "segment", "min_stock", "reorder_qty",
        "max_stock", "ambiguous_candidates",
    ]
    with open(output_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(missing_rows)

    print(f"Wrote {len(missing_rows)} missing parts to {output_path}")
    return output_path


def import_abc(dry_run: bool = True):
    """Match Part No -> Item.item_code, update ABC fields. Idempotent.

    Returns counts dict so /api/method callers can inspect results.
    """
    data = _load_data()
    matched, missing, updated, unchanged = 0, 0, 0, 0
    sample_missing = []

    # Allowed Select values come from the field defs above so we can't
    # write a value the field rejects.
    allow_class    = "\nA\nB\nC"
    allow_status   = "\nRED\nYELLOW\nGREEN"
    allow_segment  = "\nRegular\nAsPerRequirement\nNoFuture\nNoFutureTrading"
    allow_dept     = "\nERS\nESS"

    rows = frappe.db.sql("SELECT name FROM `tabItem` WHERE disabled = 0")
    item_codes = {r[0] for r in rows}

    # ERPNext codes carry a single-letter prefix (E/B/D/...) on top of the
    # workshop's bare part numbers. Build a suffix index so "FI02008" matches
    # "EFI02008", "AA01003" matches "EAA01003", etc. Only exactly-one-prefix-
    # char matches are used; ambiguous (>1 candidate) suffixes are skipped.
    suffix_index = {}  # bare_suffix -> list[item_code]
    for code in item_codes:
        if len(code) > 1 and code[0].isalpha():
            suffix_index.setdefault(code[1:], []).append(code)

    ambiguous = 0
    for part_no, info in data.items():
        target_code = None
        if part_no in item_codes:
            target_code = part_no
        else:
            cands = suffix_index.get(part_no, [])
            if len(cands) == 1:
                target_code = cands[0]
            elif len(cands) > 1:
                ambiguous += 1
                missing += 1
                if len(sample_missing) < 10:
                    sample_missing.append(f"{part_no} (ambiguous: {','.join(cands)})")
                continue

        if not target_code:
            missing += 1
            if len(sample_missing) < 10:
                sample_missing.append(part_no)
            continue
        matched += 1
        # Use target_code (the actual ERPNext name) for downstream lookups
        part_no_match = target_code

        new_vals = {
            "ers_abc_class":   _allowed((info.get("abc_class") or "").upper(), allow_class),
            "ers_abc_status":  _allowed((info.get("status") or "").upper(), allow_status),
            "ers_abc_segment": _allowed(info.get("segment"), allow_segment),
            "ers_department":  _allowed(info.get("department"), allow_dept),
        }

        cur = frappe.db.get_value(
            "Item", part_no_match,
            ["ers_abc_class", "ers_abc_status", "ers_abc_segment", "ers_department"],
            as_dict=True,
        ) or {}

        diff = {k: v for k, v in new_vals.items() if (cur.get(k) or None) != (v or None)}
        if not diff:
            unchanged += 1
            continue

        if dry_run:
            updated += 1
            continue

        for k, v in diff.items():
            frappe.db.set_value("Item", part_no_match, k, v, update_modified=False)
        updated += 1

    if not dry_run:
        frappe.db.commit()

    summary = {
        "dry_run": dry_run,
        "matched": matched,
        "missing": missing,
        "ambiguous": ambiguous,
        "updated": updated,
        "unchanged": unchanged,
        "sample_missing": sample_missing,
        "data_total": len(data),
    }
    print("ABC import:", json.dumps(summary, indent=2))
    return summary
