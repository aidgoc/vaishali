---
name: encryption_key is locked — never rotate it again
description: site_config.json::encryption_key on dgoc.logstop.com is permanently frozen. Any rotation breaks every encrypted password (Email Account, Connected App secrets, etc.) and requires re-entering them all from the desk. Do not propose rotation; do not run any command that overwrites it.
type: feedback
originSessionId: 20f6cf08-72cf-4a4f-bd26-caf6f8cfcb05
---
**Rule:** The `encryption_key` value in `/home/frappe/frappe-bench/sites/dgoc.logstop.com/site_config.json` is **permanently locked**. Never rotate, regenerate, or overwrite it. If a tool, migration, or restore script wants to set a new key, **stop and ask the user first**.

**Why:** Frappe encrypts every password field with this key (Email Account passwords, Connected App secrets, GST API secret, etc.). Rotating the key makes `get_decrypted_password()` raise `ValidationError: Failed to decrypt key... Encryption key is invalid` for every previously-saved password — permanently. The only fix is re-entering each password from the desk one at a time. We hit this on 2026-04-30 (HNG account spamming 915 errors/week), and again on 2026-05-07 when ALL Basic-auth Email Account passwords (Info, Nitin Jayanta, Bharti, HNG) and OAuth tokens for everyone except harsh@dgoc.in were unrecoverable when trying to send the Kalpataru POC trial email — only path forward was browser re-auth of harsh's Connected App.

**How to apply:**
- Never include `encryption_key` rotation in a deploy / restore / migration plan.
- If a Frappe tool offers to "regenerate" it (e.g. `bench setup encryption-key`), refuse.
- Backup restores must copy the source-site's `site_config.json` (or at least its `encryption_key`) verbatim — otherwise every encrypted field is dead on arrival.
- If the key ever DOES get rotated by accident, the recovery is: (1) restore the old `encryption_key` from backup if available, (2) otherwise re-enter every password from `/app/email-account` and `/app/connected-app` plus GST Settings api_secret manually.
- OAuth refresh tokens (Google) last ~6 months of inactivity and refresh automatically on use — once authorized via browser, harsh@dgoc.in stays alive indefinitely as long as the encryption_key doesn't change. This is the lowest-effort steady-state.

**Related residual cleanup (open):**
- Basic-auth Email Account passwords for `Info`, `Nitin Jayanta`, `Bharti`, `HNG` are still broken from the prior rotation — re-enter from `/app/email-account/<Name>` if any of those need to send mail.
- `sales@dgoc.in`, `accounts@dgoc.in`, `service@dgoc.in` Email Accounts are configured for OAuth but never authorized — no Token Cache exists. One-time browser auth at `/app/email-account/<Name>` → "Authorize API Access" if they need to send.
