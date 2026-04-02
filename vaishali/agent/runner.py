"""Vaishali Agent Runner v3 — Claude Code style agentic loop. No artificial limits."""
import frappe
import json
import time
import uuid

# Sonnet 4.5 on Bedrock supports 1M context. Compact at 80%.
_CONTEXT_WINDOW = 1_000_000
_COMPACT_THRESHOLD = int(_CONTEXT_WINDOW * 0.8)

# Sonnet pricing (USD per million tokens)
_INPUT_COST_PER_M = 3.0
_OUTPUT_COST_PER_M = 15.0


def _get_client():
    """Get Anthropic client — Bedrock (env vars or site_config) or direct API.

    Supports same env vars as Claude Code:
      CLAUDE_CODE_USE_BEDROCK=1
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
    Falls back to site_config.json values.
    """
    import os
    import anthropic

    provider = frappe.conf.get("vaishali_provider") or "bedrock"
    use_bedrock_env = os.environ.get("CLAUDE_CODE_USE_BEDROCK")

    if provider == "bedrock" or use_bedrock_env:
        region = (os.environ.get("AWS_REGION")
                  or os.environ.get("AWS_DEFAULT_REGION")
                  or frappe.conf.get("vaishali_bedrock_region")
                  or "us-east-1")
        kwargs = {"aws_region": region}

        ak = os.environ.get("AWS_ACCESS_KEY_ID") or frappe.conf.get("aws_access_key_id")
        sk = os.environ.get("AWS_SECRET_ACCESS_KEY") or frappe.conf.get("aws_secret_access_key")
        if ak and sk:
            kwargs["aws_access_key"] = ak
            kwargs["aws_secret_key"] = sk

        return anthropic.AnthropicBedrock(**kwargs)

    key = frappe.conf.get("anthropic_api_key") or ""
    if not key:
        frappe.throw("Anthropic API key not configured. Set anthropic_api_key in site_config.json")
    return anthropic.Anthropic(api_key=key)


def _estimate_tokens(text):
    """Rough token estimate: ~4 chars per token."""
    if not text:
        return 0
    return len(text) // 4


def _estimate_messages_tokens(messages):
    """Estimate total tokens across all messages."""
    total = 0
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, str):
            total += _estimate_tokens(content)
        elif isinstance(content, list):
            total += _estimate_tokens(json.dumps(content))
    return total


def _new_conversation_id():
    return uuid.uuid4().hex[:12]


def _table_exists(doctype):
    """Check if a DocType's table exists in the database."""
    try:
        table = f"tab{doctype}"
        return frappe.db.sql(f"SHOW TABLES LIKE %s", table)
    except Exception:
        return False


# ── DB History ──────────────────────────────────────────────────────

def _load_history(user, conversation_id):
    """Load full chat history from DB for a conversation."""
    if not _table_exists("Vaishali Chat Log"):
        return []
    logs = frappe.get_all("Vaishali Chat Log",
        filters={"user": user, "conversation_id": conversation_id},
        fields=["role", "content"],
        order_by="creation asc",
        limit_page_length=0)
    return [{"role": l.role, "content": l.content} for l in logs]


def _save_message(user, conversation_id, role, content,
                  employee=None, model=None, tool_calls=None,
                  client_actions=None, input_tokens=0, output_tokens=0):
    """Save a single message to DB."""
    if not _table_exists("Vaishali Chat Log"):
        return
    cost = (input_tokens * _INPUT_COST_PER_M + output_tokens * _OUTPUT_COST_PER_M) / 1_000_000
    doc = frappe.new_doc("Vaishali Chat Log")
    doc.user = user
    doc.employee = employee if employee else None
    doc.conversation_id = conversation_id
    doc.role = role
    doc.content = content or ""
    doc.model = model or ""
    doc.tool_calls = json.dumps(tool_calls) if tool_calls else "[]"
    doc.client_actions = json.dumps(client_actions) if client_actions else "[]"
    doc.input_tokens = input_tokens
    doc.output_tokens = output_tokens
    doc.token_count = input_tokens + output_tokens
    doc.estimated_cost = cost
    doc.insert(ignore_permissions=True)
    frappe.db.commit()


# ── Context Compaction ──────────────────────────────────────────────

def _compact_if_needed(messages, client, model):
    """Compact messages when approaching context window. Called every iteration like Claude Code."""
    total = _estimate_messages_tokens(messages)
    if total < _COMPACT_THRESHOLD:
        return messages

    # Keep last 20 messages (recent tool calls + responses), compact everything before
    keep_count = min(20, len(messages))
    if len(messages) <= keep_count:
        return messages

    to_compact = messages[:-keep_count]
    to_keep = messages[-keep_count:]

    parts = []
    for m in to_compact:
        role = m.get("role", "")
        content = m.get("content", "")
        if isinstance(content, str) and content:
            parts.append(f"{role}: {content[:2000]}")
        elif isinstance(content, list):
            # Tool results — extract text content
            for block in content:
                if isinstance(block, dict):
                    c = block.get("content", "") or block.get("text", "")
                    if c:
                        parts.append(f"tool_result: {c[:1000]}")

    conversation_text = "\n".join(parts)
    if not conversation_text.strip():
        return messages

    try:
        summary_resp = client.messages.create(
            model=model,
            max_tokens=4096,
            system="You are a conversation summarizer. Produce a detailed summary preserving ALL key facts, data values, decisions, tool results, and pending actions. Do not lose any information that would be needed to continue the conversation.",
            messages=[{"role": "user", "content": f"Summarize this conversation:\n\n{conversation_text[:40000]}"}]
        )
        summary = "".join(b.text for b in summary_resp.content if hasattr(b, "text"))
    except Exception:
        # Fallback: just keep more recent messages
        return messages[-(keep_count + 10):]

    return [{"role": "user", "content": f"[Previous conversation summary]\n{summary}"}] + to_keep


# ── Memory ──────────────────────────────────────────────────────────

def _load_memories(user, limit=20):
    """Load persistent memories for a user."""
    if not _table_exists("Vaishali Memory"):
        return []
    try:
        return frappe.get_all("Vaishali Memory",
            filters={"user": user},
            fields=["key", "content"],
            order_by="last_used desc",
            limit_page_length=limit)
    except Exception:
        return []


def _inject_memories(system_prompt, user):
    """Add memories to system prompt."""
    memories = _load_memories(user)
    if not memories:
        return system_prompt

    mem_lines = []
    for m in memories:
        mem_lines.append(f"[Memory: {m.key}] {m.content}")

    return system_prompt + "\n\n# User memories (from previous conversations)\n" + "\n".join(mem_lines)


# ── Slash Commands ──────────────────────────────────────────────────

def _check_command(message):
    """Check if message starts with a slash command. Returns (command_name, args) or None."""
    from vaishali.agent.commands import COMMANDS
    if not message.startswith("/"):
        return None
    parts = message.split(None, 1)
    cmd = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""
    if cmd in COMMANDS:
        return (cmd, args)
    return None


def _expand_command(cmd_name, args):
    """Expand a slash command into a prompt + restricted tools."""
    from vaishali.agent.commands import COMMANDS
    cmd = COMMANDS[cmd_name]
    prompt = cmd["prompt"].replace("{args}", args)
    return prompt, cmd.get("tools")


# ── Budget Tracking ────────────────────────────────────────────────

def _track_budget(user):
    """Track monthly token usage. Returns (usage, budget) for logging. No blocking."""
    budget = int(frappe.conf.get("vaishali_monthly_token_budget") or 10_000_000)
    if not _table_exists("Vaishali Chat Log"):
        return (0, budget)
    from datetime import date
    month_start = date.today().replace(day=1).isoformat()
    try:
        usage = frappe.db.sql("""
            SELECT COALESCE(SUM(token_count), 0) as total
            FROM `tabVaishali Chat Log`
            WHERE creation >= %s
        """, (month_start,), as_dict=True)[0].total
    except Exception:
        return (0, budget)
    return (int(usage), budget)


# ── Main Agent Loop — Claude Code style ────────────────────────────

def run_agent(message, employee=None, role="user", user=None, conversation_id=None):
    """Run the Vaishali agent. Loops until the model emits end_turn — no artificial limits."""
    try:
        import anthropic
    except ImportError:
        return {"response": "The anthropic Python package is not installed.", "tool_calls": [], "client_actions": []}

    from vaishali.agent.prompt import build_system_prompt
    from vaishali.agent.tools import get_tools_for_role, TOOL_CATEGORIES
    from vaishali.agent.executor import execute_tool, get_pending_actions, clear_pending_actions

    user = user or frappe.session.user
    client = _get_client()
    clear_pending_actions()
    brain_model = frappe.conf.get("vaishali_brain_model") or "us.anthropic.claude-sonnet-4-6"

    emp_name = employee.employee_name if employee else "User"
    emp_id = employee.name if employee else None

    # Budget tracking (log only, never block)
    _track_budget(user)

    # Conversation ID
    if not conversation_id:
        conversation_id = _new_conversation_id()

    # Build system prompt with memories
    roles = frappe.get_roles(user)
    system = build_system_prompt(emp_name, role, roles)
    system = _inject_memories(system, user)

    # Check for slash command — save original message, then expand
    original_message = message
    command_tools = None
    cmd = _check_command(message)
    if cmd:
        cmd_name, cmd_args = cmd
        message, command_tools = _expand_command(cmd_name, cmd_args)

    # Save user message to DB (original, not expanded)
    _save_message(user, conversation_id, "user", original_message, employee=emp_id)

    # Load full history from DB
    history = _load_history(user, conversation_id)
    messages = [{"role": h["role"], "content": h["content"]}
                for h in history
                if h["role"] in ("user", "assistant") and isinstance(h.get("content"), str)]

    # If we expanded a command, replace the last message with the expanded prompt
    if cmd and messages:
        messages[-1] = {"role": "user", "content": message}

    # Tools — use restricted set for commands, full set otherwise
    if command_tools:
        from vaishali.agent.tools import get_tools_by_name
        tools = get_tools_by_name(command_tools)
    else:
        tools = get_tools_for_role(role, categories=None)

    loaded_categories = set()
    tool_calls_log = []
    total_input = 0
    total_output = 0

    # ── Agentic loop: run until end_turn ──
    while True:
        # Compact if approaching context window (like Claude Code)
        messages = _compact_if_needed(messages, client, brain_model)

        try:
            kwargs = {"model": brain_model, "max_tokens": 8192,
                      "system": system, "messages": messages}
            if tools:
                kwargs["tools"] = tools
            response = client.messages.create(**kwargs)
        except Exception as e:
            err_msg = str(e)[:500]
            # If context too long even after compaction, try aggressive trim
            if "too long" in err_msg.lower() or "token" in err_msg.lower():
                messages = messages[-6:]
                try:
                    kwargs["messages"] = messages
                    response = client.messages.create(**kwargs)
                except Exception as e2:
                    return _finish(f"Error: {str(e2)[:300]}", user, conversation_id,
                                   emp_id, brain_model, tool_calls_log,
                                   total_input, total_output)
            else:
                return _finish(f"Error: {err_msg}", user, conversation_id,
                               emp_id, brain_model, tool_calls_log,
                               total_input, total_output)

        # Token tracking
        if hasattr(response, "usage"):
            total_input += response.usage.input_tokens
            total_output += response.usage.output_tokens

        # ── end_turn: model is done ──
        if response.stop_reason != "tool_use":
            text = "".join(b.text for b in response.content if hasattr(b, "text"))
            if not text:
                text = "Done."
            return _finish(text, user, conversation_id, emp_id, brain_model,
                           tool_calls_log, total_input, total_output)

        # ── tool_use: execute tools and loop back ──
        content_blocks = _serialize(response.content)
        messages.append({"role": "assistant", "content": content_blocks})
        tool_results = []

        for block in response.content:
            if block.type == "tool_use":
                t0 = time.time()
                tool_calls_log.append({"name": block.name, "status": "running"})

                result = execute_tool(
                    block.name, block.input, role,
                    employee_id=emp_id or "", employee_name=emp_name, user=user)

                duration_ms = int((time.time() - t0) * 1000)
                is_error = isinstance(result, str) and result.startswith("\u274c")
                tool_calls_log[-1]["status"] = "error" if is_error else "done"
                tool_calls_log[-1]["duration_ms"] = duration_ms

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

                # No truncation — send full tool results
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "user", "content": tool_results})


def _finish(text, user, conversation_id, emp_id, model, tool_calls_log,
            total_input, total_output):
    """Save final response and return result dict."""
    from vaishali.agent.executor import get_pending_actions

    _save_message(user, conversation_id, "assistant", text,
                 employee=emp_id, model=model,
                 tool_calls=tool_calls_log,
                 client_actions=get_pending_actions(),
                 input_tokens=total_input, output_tokens=total_output)

    return {"response": text, "tool_calls": tool_calls_log,
            "client_actions": get_pending_actions(),
            "conversation_id": conversation_id,
            "usage": {"input": total_input, "output": total_output}}


def _serialize(content):
    result = []
    for block in content:
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({"type": "tool_use", "id": block.id,
                           "name": block.name, "input": block.input})
    return result
