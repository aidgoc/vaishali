"""Per-DocType permission hooks for Vaishali.

Currently scopes:
    Communication — hide rows linked to private personal Email Accounts from anyone
    except their owner (and Administrator, which bypasses query conditions anyway).
"""

import frappe

PRIVATE_INBOXES = {
    "Harsh": "harsh@dgoc.in",
}


def get_communication_permission_query(user=None):
    if not user:
        user = frappe.session.user
    if user == "Administrator":
        return ""
    excluded = [name for name, owner in PRIVATE_INBOXES.items() if owner != user]
    if not excluded:
        return ""
    quoted = ", ".join(frappe.db.escape(x) for x in excluded)
    return (
        f"(`tabCommunication`.email_account NOT IN ({quoted}) "
        f"OR `tabCommunication`.email_account IS NULL)"
    )


def has_communication_permission(doc, user=None, permission_type=None):
    if not user:
        user = frappe.session.user
    if user == "Administrator":
        return True
    ea = getattr(doc, "email_account", None)
    if ea and ea in PRIVATE_INBOXES and PRIVATE_INBOXES[ea] != user:
        return False
    return True
