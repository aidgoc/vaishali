# Claude Code Project Memory

This folder contains persistent context for Claude Code sessions. When starting a new session on any machine, Claude should read these files to understand the project, the user, and working preferences.

## How to use

Add this to your `.claude/CLAUDE.md` or tell Claude:
> "Read all files in `.claude-memory/` to understand this project's context."

## Files

- **MEMORY.md** — Index of all memory files
- **user_harsh.md** — User profile, role, working style
- **feedback_working_style.md** — How Claude should work (parallel agents, verify data, Telegram reports)
- **feedback_ui_style.md** — UI/design preferences
- **project_erp_buildout.md** — Complete ERP status, data inventory across 3 systems, roadmap
- **project_data_sync.md** — Frappe Cloud ↔ EC2 sync status
- **project_desk_overhaul.md** — ERPNext desk UI plans
- **reference_infra.md** — EC2, SSH, Frappe Cloud (credentials redacted — ask user)
- **reference_krisp_erp.md** — Krisp ERP navigation, data structure (password redacted — ask user)
- **reference_google_sheet.md** — Price List spreadsheet with costing/targets

## Redacted credentials

Passwords and API tokens are replaced with `<ASK_USER_FOR_PASSWORD>` or `<ASK_USER_FOR_TELEGRAM_BOT_TOKEN>`. Ask the user for these when needed.
