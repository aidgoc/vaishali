"""Idempotent setup: DCEPL ERS Store QA/QC Quality Inspection Template.

Creates 5 Quality Inspection Parameters (Yes/No acceptance) and one
Quality Inspection Template "DCEPL ERS Store QA/QC" wiring them
together with formula-based acceptance.

Run:
    bench --site dgoc.logstop.com execute vaishali.setup_qa_qc.run
"""
import frappe


TEMPLATE_NAME = "DCEPL ERS Store QA/QC"

# (parameter, description) — each accepts only the literal "Yes".
PARAMETERS = [
    ("Inv OK",       "Invoice present and matches challan"),
    ("PO Match",     "Items match the Purchase Order"),
    ("Qty Match",    "Received quantity matches challan/PO"),
    ("Physical OK",  "No physical damage; packaging intact"),
    ("Technical OK", "Make/model/specs match requirement"),
]


def _ensure_parameter(name: str, description: str) -> None:
    if frappe.db.exists("Quality Inspection Parameter", name):
        return
    doc = frappe.new_doc("Quality Inspection Parameter")
    doc.parameter = name
    if doc.meta.has_field("description"):
        doc.description = description
    doc.insert(ignore_permissions=True)


def _ensure_template() -> None:
    if frappe.db.exists("Quality Inspection Template", TEMPLATE_NAME):
        doc = frappe.get_doc("Quality Inspection Template", TEMPLATE_NAME)
        existing = {r.specification for r in (doc.item_quality_inspection_parameter or [])}
    else:
        doc = frappe.new_doc("Quality Inspection Template")
        doc.quality_inspection_template_name = TEMPLATE_NAME
        existing = set()

    for name, _desc in PARAMETERS:
        if name in existing:
            continue
        doc.append("item_quality_inspection_parameter", {
            "specification": name,
            "value": "Yes",
            "numeric": 0,
            "formula_based_criteria": 1,
            "acceptance_formula": 'reading_1 == "Yes"',
        })

    doc.flags.ignore_permissions = True
    doc.save() if doc.name else doc.insert(ignore_permissions=True)


def run():
    for name, desc in PARAMETERS:
        _ensure_parameter(name, desc)
    _ensure_template()
    frappe.db.commit()
    print(f"OK: Quality Inspection Template '{TEMPLATE_NAME}' ready with "
          f"{len(PARAMETERS)} parameters.")
