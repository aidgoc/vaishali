"""Vaishali Agent Runner — brain/worker loop using Anthropic SDK."""
import frappe
import json

_MAX_TOKENS_PER_CHAT = 16000
_MAX_ITERATIONS = 6
_MAX_TOOL_RESULT_CHARS = 4000


def _get_api_key():
    """Get Anthropic API key from site config."""
    key = frappe.conf.get("anthropic_api_key") or ""
    if not key:
        frappe.throw("Anthropic API key not configured. Set anthropic_api_key in site_config.json")
    return key


def _truncate(s, max_len=_MAX_TOOL_RESULT_CHARS):
    if len(s) <= max_len:
        return s
    return s[:max_len] + f"\n\n[... truncated, {len(s)} chars total]"


def run_agent(message, employee=None, role="user", user=None):
    """Run the Vaishali agent. Returns {response, tool_calls}."""
    import anthropic
    from vaishali.agent.prompt import build_system_prompt
    from vaishali.agent.tools import get_tools_for_role, TOOL_CATEGORIES
    from vaishali.agent.executor import execute_tool

    client = anthropic.Anthropic(api_key=_get_api_key())
    brain_model = frappe.conf.get("vaishali_brain_model") or "claude-sonnet-4-6"

    emp_name = employee.employee_name if employee else "User"
    emp_id = employee.name if employee else ""

    # Build system prompt
    roles = frappe.get_roles(user or frappe.session.user)
    system = build_system_prompt(emp_name, role, roles)

    # Load chat history
    cache_key = f"vaishali_chat_{user or frappe.session.user}"
    raw_history = frappe.cache.get_value(cache_key) or []
    clean_history = [msg for msg in raw_history
                     if msg.get("role") in ("user", "assistant") and isinstance(msg.get("content"), str)]
    clean_history = clean_history[-10:]  # Last 10 exchanges
    clean_history.append({"role": "user", "content": message})
    messages = clean_history

    history = raw_history + [{"role": "user", "content": message}]

    # Tools
    tools = get_tools_for_role(role, categories=None)
    loaded_categories = set()
    tool_calls_log = []
    total_tokens = 0

    for iteration in range(_MAX_ITERATIONS):
        try:
            kwargs = {"model": brain_model, "max_tokens": 2048,
                      "system": system, "messages": messages[-12:]}
            if tools:
                kwargs["tools"] = tools
            response = client.messages.create(**kwargs)
        except Exception as e:
            return {"response": f"Error: {str(e)[:200]}", "tool_calls": tool_calls_log}

        # Token tracking
        if hasattr(response, "usage"):
            total_tokens += response.usage.input_tokens + response.usage.output_tokens
        if total_tokens > _MAX_TOKENS_PER_CHAT:
            text = "I've used the maximum processing budget."
            history.append({"role": "assistant", "content": text})
            _save_history(cache_key, history)
            return {"response": text, "tool_calls": tool_calls_log}

        if response.stop_reason == "tool_use":
            content_blocks = _serialize(response.content)
            messages.append({"role": "assistant", "content": content_blocks})
            tool_results = []

            for block in response.content:
                if block.type == "tool_use":
                    tool_calls_log.append({"name": block.name, "status": "running"})

                    result = execute_tool(
                        block.name, block.input, role,
                        employee_id=emp_id, employee_name=emp_name)

                    tool_calls_log[-1]["status"] = "error" if isinstance(result, str) and result.startswith("❌") else "done"

                    # Dynamic tool loading
                    if block.name == "discover_tools":
                        try:
                            disc = json.loads(result)
                            cat = disc.get("category")
                            if cat and cat in TOOL_CATEGORIES:
                                loaded_categories.add(cat)
                                tools = get_tools_for_role(role, categories=loaded_categories)
                        except Exception:
                            pass

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": _truncate(result),
                    })

            messages.append({"role": "user", "content": tool_results})
        else:
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            if not text:
                text = "Request processed."
            history.append({"role": "assistant", "content": text})
            _save_history(cache_key, history)
            return {"response": text, "tool_calls": tool_calls_log}

    text = "Max processing steps reached."
    history.append({"role": "assistant", "content": text})
    _save_history(cache_key, history)
    return {"response": text, "tool_calls": tool_calls_log}


def _serialize(content):
    result = []
    for block in content:
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({"type": "tool_use", "id": block.id,
                           "name": block.name, "input": block.input})
    return result


def _save_history(key, history):
    # Keep last 30 exchanges
    trimmed = history[-(30 * 2):]
    frappe.cache.set_value(key, trimmed, expires_in_sec=86400 * 7)
