import frappe
from vaishali.views.engine import fetch_view, list_views as _list_views


@frappe.whitelist()
def get_view(view_name=None, context_id=None):
    """Fetch a View Engine view — role-filtered, direct DB queries.

    Args:
        view_name: Registry key (e.g. 'sales_pipeline', 'debtor_dashboard')
        context_id: Optional context document name (e.g. customer name for customer_360)

    Returns:
        dict with view, context, role, and sections keys
    """
    if not view_name:
        frappe.throw("view_name is required", title="View Engine Error")

    return fetch_view(view_name, context_id)


@frappe.whitelist()
def get_views():
    """List all available views with descriptions."""
    return _list_views()
