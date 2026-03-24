"""Enable serial number tracking on key products and add equipment custom fields.

Usage: bench --site dgoc.logstop.com execute vaishali.setup_equipment.setup
"""
import frappe


# Item groups / keywords that identify finished products needing serial tracking
SERIAL_KEYWORDS = [
    "ACD",
    "DRM",
    "DJ-1005",
    "E-DASH",
    "E-Dash",
    "F-Dash",
    "TPS",
    "MRT",
    "DC-1005",
    "WWSI",
]

# Custom fields to add on Serial No for equipment tracking
SERIAL_NO_FIELDS = [
    {
        "fieldname": "krisp_asset_id",
        "label": "Krisp Asset ID",
        "fieldtype": "Data",
        "description": "Legacy Krisp ERP asset ID (e.g. ACA01017)",
    },
    {
        "fieldname": "asset_type_1",
        "label": "Asset Type 1",
        "fieldtype": "Data",
        "description": "Krisp 3-level type hierarchy — level 1",
    },
    {
        "fieldname": "asset_type_2",
        "label": "Asset Type 2",
        "fieldtype": "Data",
        "description": "Krisp 3-level type hierarchy — level 2",
    },
    {
        "fieldname": "asset_type_3",
        "label": "Asset Type 3",
        "fieldtype": "Data",
        "description": "Krisp 3-level type hierarchy — level 3",
    },
    {
        "fieldname": "dc_number",
        "label": "DC Number",
        "fieldtype": "Data",
        "description": "Delivery Challan number (e.g. DC-167)",
    },
    {
        "fieldname": "customer_site",
        "label": "Customer Site",
        "fieldtype": "Data",
        "description": "Site/location where equipment is deployed",
    },
    {
        "fieldname": "warranty_expiry",
        "label": "Warranty Expiry",
        "fieldtype": "Date",
        "description": "Warranty end date",
    },
    {
        "fieldname": "next_calibration",
        "label": "Next Calibration",
        "fieldtype": "Date",
        "description": "Next calibration due date",
    },
    {
        "fieldname": "next_maintenance",
        "label": "Next Maintenance",
        "fieldtype": "Date",
        "description": "Next maintenance due date",
    },
]


def setup():
    _add_serial_no_custom_fields()
    _enable_serial_numbers()
    frappe.db.commit()
    print("Equipment setup complete.")


def _add_serial_no_custom_fields():
    """Add custom fields on Serial No for equipment tracking."""
    insert_after = "company"
    added = 0

    for field_def in SERIAL_NO_FIELDS:
        fieldname = field_def["fieldname"]

        if frappe.db.exists("Custom Field", {"dt": "Serial No", "fieldname": fieldname}):
            print(f"  Custom field '{fieldname}' already exists on Serial No.")
            insert_after = fieldname
            continue

        doc = frappe.get_doc({
            "doctype": "Custom Field",
            "dt": "Serial No",
            "fieldname": fieldname,
            "label": field_def["label"],
            "fieldtype": field_def["fieldtype"],
            "description": field_def["description"],
            "insert_after": insert_after,
        })
        doc.insert(ignore_permissions=True)
        print(f"  Added custom field '{fieldname}' on Serial No.")
        insert_after = fieldname
        added += 1

    print(f"Custom fields: {added} added, {len(SERIAL_NO_FIELDS) - added} already existed.")


def _enable_serial_numbers():
    """Enable has_serial_no on key finished-product items."""
    # Build OR conditions for item_group matching
    conditions = []
    params = {}
    for i, keyword in enumerate(SERIAL_KEYWORDS):
        key = f"kw_{i}"
        conditions.append(f"i.item_group LIKE %({key})s")
        params[key] = f"%{keyword}%"

    # Also match item_name or item_code containing these keywords
    name_conditions = []
    for i, keyword in enumerate(SERIAL_KEYWORDS):
        key_name = f"kn_{i}"
        key_code = f"kc_{i}"
        name_conditions.append(f"i.item_name LIKE %({key_name})s")
        name_conditions.append(f"i.item_code LIKE %({key_code})s")
        params[key_name] = f"%{keyword}%"
        params[key_code] = f"%{keyword}%"

    where_clause = " OR ".join(conditions + name_conditions)

    # Exclude raw materials, components, spare parts
    sql = f"""
        SELECT i.name, i.item_name, i.item_group, i.has_serial_no
        FROM `tabItem` i
        WHERE ({where_clause})
          AND i.item_group NOT LIKE '%%Raw Material%%'
          AND i.item_group NOT LIKE '%%Component%%'
          AND i.item_group NOT LIKE '%%Spare%%'
          AND i.item_group NOT LIKE '%%Sub Assembly%%'
          AND i.item_group NOT LIKE '%%Consumable%%'
    """

    items = frappe.db.sql(sql, params, as_dict=True)
    print(f"Found {len(items)} matching items for serial number tracking.")

    already_enabled = 0
    updated = 0
    for item in items:
        if item.has_serial_no:
            already_enabled += 1
            continue
        frappe.db.set_value("Item", item.name, "has_serial_no", 1, update_modified=False)
        updated += 1

    print(f"Serial numbers: {updated} items updated, {already_enabled} already enabled.")
    if updated:
        for item in items:
            if not item.has_serial_no:
                print(f"  Enabled: {item.name} ({item.item_group})")
