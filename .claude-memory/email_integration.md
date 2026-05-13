---
name: Email Integration (2026-04-25/27)
description: Google OAuth email integration — Connected App, 3 shared aliases, send_email agent tool, Google SSO login, self-service email for all users
type: project
originSessionId: 0d8a5adb-70ab-449c-b531-6290ae6e689b
---
## Email Integration — Live (2026-04-27) ✅

**Architecture:** Frappe Email Accounts + Google OAuth (Connected App), NOT App Passwords.

### Google OAuth Setup (on server)
- **Connected App:** `o8s04kreb9` (name: "Google") — `vaishali/fixtures/custom_field.json` + DB record
- **OpenID config:** `https://accounts.google.com/.well-known/openid-configuration`
- **Scope:** `https://mail.google.com/`
- **Client ID:** `403432960647-u4ivgijbcs9tpalnhkcstevcmbs5ksq0.apps.googleusercontent.com`
- **Client Secret:** stored in Google Settings + Connected App DB records
- **Redirect URIs to add in Cloud Console (both required):**
  - `https://dgoc.logstop.com/api/method/frappe.integrations.oauth2_logins.custom` (SSO login)
  - `http://dgoc.logstop.com/api/method/frappe.integrations.doctype.connected_app.connected_app.callback/o8s04kreb9` (email OAuth)

### Email Accounts (3 shared aliases)
| Name | Email | Default Outgoing | Append To | Status |
|---|---|---|---|---|
| DSPL Sales | sales@dgoc.in | Yes | Quotation | Needs authorization |
| DSPL Accounts | accounts@dgoc.in | No | Sales Invoice | Needs authorization |
| DSPL Service | service@dgoc.in | No | Warranty Claim | Needs authorization |
| Harsh | harsh@dgoc.in | No | — | **Authorized (OAuth token stored)** |

- `harsh@dgoc.in` OAuth token stored as `o8s04kreb9-harsh@dgoc.in` in Token Cache
- Others need: Settings → Email Account → open record → **Authorize API Access** → sign in as that alias

### Email Outbox Pattern
- Custom field `vaishali_email_status` (Draft/Sent/Discarded) on Communication DocType — in `fixtures/custom_field.json`
- Doc events create Draft Communications (not send immediately): Quotation, SO, SI, PO, Warranty Claim status update, payment reminders
- API: `vaishali/api/email_outbox.py` — `send_draft()` attaches PDF via `frappe.get_print()`, `discard_draft()`, `list_drafts()`
- Desk: `vaishali/public/js/communication.js` — Send/Discard buttons on Communication form when status=Draft

### Vaishali Agent send_email Tool
- Implemented in `vaishali/agent/executor.py` → `_execute_send_email()`
- Manager/admin: sends immediately via `frappe.sendmail()`
- User role: creates draft Communication for manager review
- From address auto-selected: CRM docs → sales@, Finance → accounts@, Service → service@
- Registered in `TOOL_HANDLERS` (no role gate — logic is internal)

### Google SSO Login
- Social Login Key `google` configured in Frappe
- "Sign in with Google" button appears on login page
- Any Google account works (@dgoc.in or @gmail.com) if Frappe user exists
- `sign_ups = "Allow"` — new users can self-register via Google

### Self-Service Email Accounts
- `Desk User` role has create/read/write on Email Account with `if_owner=1`
- Any user can add their own email: Settings → Email Account → New → OAuth → Authorize
- Uses same Connected App `o8s04kreb9`

### Disabled
- `send_unsubscribe_message = 0` on all 9 Email Accounts — removes "Sent via ERPNext" footer from all outgoing emails

### Key Gotchas
- Frappe Email Account `validate` tries to connect IMAP immediately — use `flags.ignore_validate = True` when creating programmatically without a token
- Connected App OAuth callback URL is different from Social Login callback — both must be in Google Cloud Console
- `now=True` in `frappe.sendmail()` bypasses Email Queue — use `eq.send()` for force-send with queue entry
- `frappe.sendmail()` with OAuth routes through the email account matching the sender — token must exist for that user
