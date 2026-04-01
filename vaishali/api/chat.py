"""Vaishali AI Chat v2 — persistent conversations, usage stats, slash commands."""
import frappe
import json


@frappe.whitelist(methods=["POST"])
def send_message(message, conversation_id=None):
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
    result = run_agent(message, employee=emp, role=role, user=user,
                       conversation_id=conversation_id)
    return result


def _chat_log_exists():
    """Check if Vaishali Chat Log table exists."""
    try:
        return bool(frappe.db.sql("SHOW TABLES LIKE 'tabVaishali Chat Log'"))
    except Exception:
        return False


@frappe.whitelist()
def get_history(conversation_id=None):
    """Get chat history for current user."""
    user = frappe.session.user
    if not _chat_log_exists():
        return {"history": []}

    if conversation_id:
        logs = frappe.get_all("Vaishali Chat Log",
            filters={"user": user, "conversation_id": conversation_id},
            fields=["role", "content"],
            order_by="creation asc",
            limit_page_length=50)
        return {"history": [{"role": l.role, "content": l.content} for l in logs],
                "conversation_id": conversation_id}

    # Default: return most recent conversation
    latest = frappe.get_all("Vaishali Chat Log",
        filters={"user": user},
        fields=["conversation_id"],
        order_by="creation desc",
        limit_page_length=1)

    if not latest:
        return {"history": []}

    conv_id = latest[0].conversation_id
    logs = frappe.get_all("Vaishali Chat Log",
        filters={"user": user, "conversation_id": conv_id},
        fields=["role", "content"],
        order_by="creation asc",
        limit_page_length=50)
    return {
        "history": [{"role": l.role, "content": l.content} for l in logs],
        "conversation_id": conv_id,
    }


@frappe.whitelist()
def get_conversations():
    """List recent conversations for current user."""
    user = frappe.session.user
    if not _chat_log_exists():
        return {"conversations": []}

    convs = frappe.db.sql("""
        SELECT conversation_id,
               MIN(creation) as started,
               MAX(creation) as last_message,
               COUNT(*) as message_count,
               COALESCE(SUM(token_count), 0) as total_tokens
        FROM `tabVaishali Chat Log`
        WHERE user = %s
        GROUP BY conversation_id
        ORDER BY MAX(creation) DESC
        LIMIT 20
    """, (user,), as_dict=True)

    for c in convs:
        first = frappe.get_all("Vaishali Chat Log",
            filters={"user": user, "conversation_id": c.conversation_id, "role": "user"},
            fields=["content"],
            order_by="creation asc",
            limit_page_length=1)
        c["preview"] = (first[0].content[:80] + "...") if first and len(first[0].content) > 80 else (first[0].content if first else "")

    return {"conversations": convs}


@frappe.whitelist(methods=["DELETE"])
def clear_history(conversation_id=None):
    """Clear chat history."""
    user = frappe.session.user
    if not _chat_log_exists():
        return {"ok": True}

    if conversation_id:
        frappe.db.delete("Vaishali Chat Log",
            filters={"user": user, "conversation_id": conversation_id})
    else:
        frappe.db.delete("Vaishali Chat Log", filters={"user": user})
    frappe.db.commit()
    return {"ok": True}


@frappe.whitelist()
def get_usage_stats(period="this_month"):
    """Get token usage stats for the site."""
    if not _chat_log_exists():
        budget = int(frappe.conf.get("vaishali_monthly_token_budget") or 2_000_000)
        return {"conversations": 0, "messages": 0, "total_input_tokens": 0,
                "total_output_tokens": 0, "total_tokens": 0, "total_cost_usd": 0,
                "budget": budget, "budget_used_pct": 0}

    from datetime import date
    month_start = date.today().replace(day=1).isoformat()

    stats = frappe.db.sql("""
        SELECT
            COUNT(DISTINCT conversation_id) as conversations,
            COUNT(*) as messages,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(token_count), 0) as total_tokens,
            COALESCE(SUM(estimated_cost), 0) as total_cost_usd
        FROM `tabVaishali Chat Log`
        WHERE creation >= %s
    """, (month_start,), as_dict=True)[0]

    budget = int(frappe.conf.get("vaishali_monthly_token_budget") or 2_000_000)
    stats["budget"] = budget
    stats["budget_used_pct"] = round(stats["total_tokens"] / budget * 100, 1) if budget else 0

    return stats


@frappe.whitelist()
def get_commands():
    """Get available slash commands for autocomplete."""
    from vaishali.agent.commands import get_command_list
    return {"commands": get_command_list()}
