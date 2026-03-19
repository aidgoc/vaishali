"""Vaishali AI Chat — @frappe.whitelist endpoint."""
import frappe
import json


@frappe.whitelist(methods=["POST"])
def send_message(message):
    """Send a message to Vaishali AI and get a response."""
    if not message or not message.strip():
        frappe.throw("Empty message")

    message = message.strip()
    if len(message) > 12000:
        message = message[:12000] + "\n\n[... truncated]"

    user = frappe.session.user
    from vaishali.api.field import _get_employee, _get_nav_tier

    emp = _get_employee(user)
    nav_tier = _get_nav_tier(user)
    role = {"admin": "admin", "manager": "manager"}.get(nav_tier, "user")

    from vaishali.agent.runner import run_agent
    result = run_agent(message, employee=emp, role=role, user=user)
    return result


@frappe.whitelist()
def get_history():
    """Get chat history for current user."""
    user = frappe.session.user
    # Use frappe.cache for now (simple key-value)
    history = frappe.cache.get_value(f"vaishali_chat_{user}") or []
    display = [msg for msg in history
               if msg.get("role") in ("user", "assistant") and isinstance(msg.get("content"), str)]
    return {"history": display}


@frappe.whitelist(methods=["DELETE"])
def clear_history():
    """Clear chat history."""
    user = frappe.session.user
    frappe.cache.set_value(f"vaishali_chat_{user}", [])
    return {"ok": True}
