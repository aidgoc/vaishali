"""Setup script for Site Complaint & CAPA system.

Run: bench --site dgoc.logstop.com execute vaishali.setup_complaint.setup

Idempotent — safe to re-run.
"""
import frappe


def setup():
    """Set up custom fields, permissions, and print format for complaints."""
    _sync_custom_fields()
    _ensure_capa_doctype()
    frappe.db.commit()
    print("✓ Site Complaint & CAPA setup complete")


def _sync_custom_fields():
    """Import custom fields from fixture file."""
    import json
    import os

    fixture_path = os.path.join(
        os.path.dirname(__file__), "fixtures", "custom_field.json"
    )
    with open(fixture_path) as f:
        fields = json.load(f)

    for field_data in fields:
        name = field_data.get("name")
        if frappe.db.exists("Custom Field", name):
            doc = frappe.get_doc("Custom Field", name)
            doc.update(field_data)
            doc.save(ignore_permissions=True)
            print(f"  Updated custom field: {name}")
        else:
            doc = frappe.get_doc(field_data)
            doc.insert(ignore_permissions=True)
            print(f"  Created custom field: {name}")

    print(f"✓ {len(fields)} custom fields synced")


def _ensure_capa_doctype():
    """Ensure CAPA DocType exists on the site."""
    if frappe.db.exists("DocType", "CAPA"):
        print("  CAPA DocType already exists")
        return

    # DocType will be auto-created on migrate from the JSON file.
    # This is a reminder to run bench migrate.
    print("  NOTE: Run 'bench --site dgoc.logstop.com migrate' to create CAPA DocType")
