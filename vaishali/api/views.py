import frappe
from vaishali.views.engine import fetch_view, list_views as _list_views


@frappe.whitelist()
def get_view(view_name, context_id=None):
    """Fetch a View Engine view — role-filtered, direct DB queries."""
    return fetch_view(view_name, context_id)


@frappe.whitelist()
def get_views():
    """List all available views."""
    return _list_views()
