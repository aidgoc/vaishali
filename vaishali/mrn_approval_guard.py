"""DCEPL ERS Store — MRN HOD-approval gate (wedge 4).

Implements the Store SOP rule that every Material Issue out of the
ERS Central Workshop store must carry a Department-Head approval on
the originating Material Requisition Note.

Two hooks:
    - Material Request `validate`: enforces who may tick the
      `mrn_hod_approved` flag, stamps approver + timestamp.
    - Stock Entry `before_submit`: refuses to issue stock from a
      `dcepl_ers_warehouses` warehouse unless every source row's
      Material Request is HOD-approved.

Scope: company == "Dynamic Crane Engineers Private Limited" AND any
warehouse in `site_config.dcepl_ers_warehouses` (default
`["Stores - DCEPL"]`).

Kill switch:
    site_config.dcepl_mrn_approval_enabled = false   # disables both hooks

Setup:
    bench --site dgoc.logstop.com execute vaishali.mrn_approval_guard.setup
"""
import frappe
from frappe.utils import now_datetime


COMPANY = "Dynamic Crane Engineers Private Limited"
HOD_ROLE = "DCEPL ERS HOD"
DEFAULT_WAREHOUSES = ["Stores - DCEPL"]


def _enabled() -> bool:
    return frappe.conf.get("dcepl_mrn_approval_enabled", True) is not False


def _ers_warehouses() -> set[str]:
    confs = frappe.conf.get("dcepl_ers_warehouses") or DEFAULT_WAREHOUSES
    return set(confs)


# --------------------------------------------------------------------- #
# Material Request validate hook
# --------------------------------------------------------------------- #

def validate_material_request(doc, method=None):
    """Enforce role + auto-stamp on the MRN-approval checkbox."""
    if not _enabled():
        return
    if doc.company != COMPANY:
        return
    if (doc.material_request_type or "") != "Material Issue":
        return

    warehouses = _ers_warehouses()
    in_scope = (doc.set_warehouse in warehouses) or any(
        (it.warehouse or it.set_warehouse) in warehouses
        for it in (doc.items or [])
    )
    if not in_scope:
        return

    new_val = 1 if doc.get("mrn_hod_approved") else 0
    old_val = 0
    if not doc.is_new():
        old_val = int(frappe.db.get_value("Material Request", doc.name, "mrn_hod_approved") or 0)

    if new_val == old_val:
        return  # no transition

    if new_val == 1:
        roles = set(frappe.get_roles(frappe.session.user))
        if HOD_ROLE not in roles and "Administrator" not in roles and frappe.session.user != "Administrator":
            frappe.throw(
                f"Only users with the '{HOD_ROLE}' role may approve a DCEPL ERS MRN."
            )
        doc.mrn_approved_by = frappe.session.user
        doc.mrn_approved_at = now_datetime()
    else:
        # Approval revoked
        doc.mrn_approved_by = None
        doc.mrn_approved_at = None


# --------------------------------------------------------------------- #
# Stock Entry before_submit guard
# --------------------------------------------------------------------- #

def enforce_mrn_approval_on_issue(doc, method=None):
    """Block Material Issue submit when any source row's MR is unapproved."""
    if not _enabled():
        return
    if doc.company != COMPANY:
        return
    if (doc.stock_entry_type or doc.purpose or "") != "Material Issue":
        return

    warehouses = _ers_warehouses()
    in_scope_rows = [
        it for it in (doc.items or [])
        if (it.s_warehouse or "") in warehouses
    ]
    if not in_scope_rows:
        return

    unapproved = []
    missing_mr = []
    for it in in_scope_rows:
        mr = it.material_request
        if not mr:
            missing_mr.append(it.item_code)
            continue
        approved = frappe.db.get_value("Material Request", mr, "mrn_hod_approved") or 0
        if not int(approved):
            unapproved.append((mr, it.item_code))

    if missing_mr:
        rows = ", ".join(missing_mr)
        frappe.throw(
            f"DCEPL ERS Store issue: every line must reference a Material "
            f"Request. Missing for: {rows}."
        )

    if unapproved:
        rows = "<br>".join(f"• {mr} (item {ic})" for mr, ic in unapproved)
        frappe.throw(
            "DCEPL ERS Store issue blocked: the following Material "
            f"Requests are not HOD-approved.<br>{rows}<br><br>"
            f"A user with the '{HOD_ROLE}' role must tick "
            "'MRN HOD Approved' on each MR before stock can be issued."
        )


# --------------------------------------------------------------------- #
# Setup helpers
# --------------------------------------------------------------------- #

_FIELDS = [
    {
        "fieldname": "mrn_approval_section",
        "label": "DCEPL ERS MRN Approval",
        "fieldtype": "Section Break",
        "insert_after": "amended_from",
        "collapsible": 1,
        "depends_on": f'eval:doc.company=="{COMPANY}" && doc.material_request_type=="Material Issue"',
    },
    {
        "fieldname": "mrn_hod_approved",
        "label": "MRN HOD Approved",
        "fieldtype": "Check",
        "insert_after": "mrn_approval_section",
        "default": "0",
        "in_standard_filter": 1,
        "description": f"Tick to approve. Requires '{HOD_ROLE}' role.",
    },
    {
        "fieldname": "mrn_approved_by",
        "label": "Approved By",
        "fieldtype": "Link",
        "options": "User",
        "insert_after": "mrn_hod_approved",
        "read_only": 1,
    },
    {
        "fieldname": "mrn_approved_cb",
        "fieldtype": "Column Break",
        "insert_after": "mrn_approved_by",
    },
    {
        "fieldname": "mrn_approved_at",
        "label": "Approved At",
        "fieldtype": "Datetime",
        "insert_after": "mrn_approved_cb",
        "read_only": 1,
    },
]


def ensure_role():
    if frappe.db.exists("Role", HOD_ROLE):
        return
    role = frappe.new_doc("Role")
    role.role_name = HOD_ROLE
    role.desk_access = 1
    role.insert(ignore_permissions=True)
    print(f"OK: created Role '{HOD_ROLE}'")


def ensure_fields():
    from frappe.custom.doctype.custom_field.custom_field import create_custom_field

    for spec in _FIELDS:
        if frappe.db.exists("Custom Field", {"dt": "Material Request", "fieldname": spec["fieldname"]}):
            continue
        create_custom_field("Material Request", spec.copy())
    frappe.db.commit()
    print(f"OK: ensured {len(_FIELDS)} custom fields on Material Request.")


def setup():
    ensure_role()
    ensure_fields()
    print("MRN approval setup complete.")
