"""Field PWA — www page controller.

Serves the Field PWA at /field with CSRF token and boot context.
Follows the same pattern as Frappe HRMS, CRM, and Helpdesk.
"""
import frappe

no_cache = 1


def get_context(context):
    csrf_token = frappe.sessions.get_csrf_token()
    frappe.db.commit()
    context.csrf_token = csrf_token
    context.boot = frappe.as_json(get_boot())
    return context


def get_boot():
    return {
        "site_name": frappe.local.site,
        "default_route": "/field",
    }


@frappe.whitelist(allow_guest=True)
def get_context_for_dev():
    """Called by the frontend in dev mode to get boot data."""
    csrf_token = frappe.sessions.get_csrf_token()
    frappe.db.commit()
    return {
        "csrf_token": csrf_token,
        "boot": get_boot(),
    }
