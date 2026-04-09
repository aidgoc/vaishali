# AI Agent — Vaishali v2.1

Claude-powered AI assistant embedded in ERPNext. Persistent chat, cross-session memory, 101 tools, slash commands.

## Configuration

- **Provider:** AWS Bedrock (`AnthropicBedrock` client) — configurable via `vaishali_provider` in site_config
- **Model:** `us.anthropic.claude-sonnet-4-6` (cross-region inference profile)
- **Auth:** AWS access keys in site_config (`aws_access_key_id`, `aws_secret_access_key`) — EC2 has no IAM role
- **Fallback:** Set `vaishali_provider=direct` + `anthropic_api_key` to use Anthropic API directly
- **Max tool rounds:** 10 (configurable `_MAX_ITERATIONS`)
- **Max tokens per chat:** 16,000 budget
- **Monthly token budget:** 2M tokens (configurable `vaishali_monthly_token_budget` in site_config)
- **Browser timeout:** 120s (chat.js), nginx: 300s
- **System prompt:** Includes full ABP + user memories from previous conversations

## Code Structure

```
agent/
├── runner.py      # Brain loop (unbounded, Claude Code style), compaction, memory injection
├── executor.py    # Dispatch dict (TOOL_HANDLERS) + _ROLE_GATES dict, no if-elif chain
├── prompt.py      # Single source of truth: company knowledge, domain rules, tool ecosystem, search rules
├── commands.py    # 6 slash commands: /pipeline, /follow-up, /report, /dcr, /customer, /quotation
└── tools/         # Tool schema package (14 files, was single 4,897-line tools.py)
    ├── __init__.py      # Categories, role filtering, get_tools_for_role(), two-tier loading
    ├── core.py          # 25 core tool schemas (always loaded)
    ├── accounting.py    # 4 tools: journal entries, payment entries, invoices
    ├── inventory.py     # 6 tools: stock entries, warehouses, BOMs, quality, landed costs
    ├── sales_crm.py     # 6 tools: leads, opportunities, quotations, sales orders
    ├── buying.py        # 5 tools: purchase orders, receipts, RFQs, material requests
    ├── hr.py            # 13 tools: employees, attendance, leave, salary, payroll
    ├── master_data.py   # 5 tools: customers, suppliers, items, addresses, contacts
    ├── projects.py      # 3 tools: projects, tasks, timesheets
    ├── assets.py        # 3 tools: fixed assets, movements, maintenance
    ├── manufacturing.py # 3 tools: work orders, job cards, production plans
    ├── pricing.py       # 3 tools: budgets, pricing rules, subscriptions
    ├── system_config.py # 17 tools: custom fields, workflows, permissions, print formats
    └── communication.py # 5 tools: email, bulk updates, export, rename, amend
```

### DocTypes
- `vaishali/doctype/vaishali_chat_log/` — Chat persistence (user, conversation_id, role, content, tokens, cost). 16 fields, indexed.
- `vaishali/doctype/vaishali_memory/` — Cross-session memory (user, key, content, source, last_used). 7 fields.

## Tools: 101 total (26 core + 75 extended via discover_tools), 12 categories

### Role-Based Access
| Role | Tools | Restrictions |
|------|-------|-------------|
| user (field) | 23 | No cancel, no delete, no amend. ERPNext submit permissions enforced |
| manager | 25 | No delete. Has cancel + amend |
| admin | 26 | Full access |
| blocked | 0 | No tools |

### Submit/Cancel Hardening
- `submit_document`: Checks `is_submittable`, `docstatus==0`, ERPNext role permissions (defense-in-depth)
- `cancel_document`: Checks `is_submittable`, `docstatus==1`
- `delete_document`: Admin-only role gate
- `amend_bom`: Manager/Admin-only role gate

## v2 Features

- **Persistent Chat Storage:** `Vaishali Chat Log` DocType replaces Redis cache. Conversations survive restarts, full audit trail with token/cost tracking per message
- **Context Compaction:** LLM-based conversation summary when history exceeds 80% of token budget. Keeps last 6 messages intact, summarizes older ones
- **Persistent Memory:** `Vaishali Memory` DocType for cross-session knowledge. `save_memory`/`get_memories` tools. Agent auto-remembers user preferences
- **Slash Commands:** 6 commands (`/pipeline`, `/follow-up`, `/report`, `/dcr`, `/customer`, `/quotation`) with restricted tool sets for faster execution. Autocomplete in Desk widget + PWA
- **Token Tracking:** input/output tokens + USD cost tracked per message. Monthly budget enforcement with warn at 80%, block at 100%
- **Conversation Management:** New conversation button, conversation ID tracking, `get_conversations()` list API, per-conversation clear

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `vaishali.api.chat.send_message` | Send message with optional conversation_id |
| `vaishali.api.chat.get_history` | Load conversation history from DB |
| `vaishali.api.chat.get_conversations` | List recent conversations with previews |
| `vaishali.api.chat.clear_history` | Clear per-conversation or all history |
| `vaishali.api.chat.get_usage_stats` | Monthly token usage, cost, budget % |
| `vaishali.api.chat.get_commands` | Slash command list for autocomplete |

## Gotchas

- **`doc.submit()` on non-submittable DocType** silently sets docstatus=1 — ALWAYS check `meta.is_submittable` first
- **Employee Link field:** Pass `None` not `""` for empty — empty string fails Link validation
- **Frappe DocType class name:** Remove spaces from DocType name ("Vaishali Chat Log" → `VaishaliChatLog`)
- **`frappe.db.delete`** works in v15 with `filters` kwarg
