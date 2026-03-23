"""Seed Sales Target records for FY 2025-2026.

Usage:
    bench --site dgoc.logstop.com execute vaishali.setup_targets.setup
"""
import frappe


TARGETS_2025_2026 = [
    {"product_category": "ACD",        "annual_target": 22300000},
    {"product_category": "DRM-3400",   "annual_target": 21000000},
    {"product_category": "E-DASH EOT", "annual_target": 15350000},
    {"product_category": "MRT",        "annual_target": 6600000},
    {"product_category": "DC-1005",    "annual_target": 4750000},
    {"product_category": "All Products", "annual_target": 70000000},
]

FISCAL_YEAR = "2025-2026"


def setup():
    """Create company-wide Sales Target records for FY 2025-2026 (idempotent)."""
    for t in TARGETS_2025_2026:
        exists = frappe.db.exists("Sales Target", {
            "fiscal_year": FISCAL_YEAR,
            "product_category": t["product_category"],
            "employee": ["in", ["", None]],
        })
        if exists:
            print(f"  [skip] {t['product_category']} already exists ({exists})")
            continue

        doc = frappe.new_doc("Sales Target")
        doc.fiscal_year = FISCAL_YEAR
        doc.product_category = t["product_category"]
        doc.annual_target = t["annual_target"]
        # quarterly_target auto-calculated by controller before_save
        doc.insert(ignore_permissions=True)
        print(f"  [created] {doc.name} — {t['product_category']}: {t['annual_target']:,.0f}")

    frappe.db.commit()
    print(f"\nDone. {len(TARGETS_2025_2026)} target(s) checked for FY {FISCAL_YEAR}.")
