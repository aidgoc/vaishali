# Email Accounts, OAuth & Auth

## Email Account Setup

- Email Account `validate()` tries IMAP connect immediately — use `doc.flags.ignore_validate = True` when creating programmatically before OAuth token exists.
- **Email Account form silently rolls back on failed save:** when SMTP/IMAP probe rejects the credentials, Frappe drops the password field (`pw_length` becomes `0`) and leaves title showing `Not Saved`. Symptom: `Invalid Credentials` dialog → re-enter doesn't help → `get_password()` returns empty. Fix: address whatever SMTP rejection reason caused the probe to fail before retrying save.
- **Google Workspace alias accounts: SMTP `login_id` MUST be the primary mailbox, not the alias.** App Passwords + SMTP auth resolve to a real mailbox identity; aliases get `535 5.7.8 Username and Password not accepted`. For "Harsh" (`harsh@dgoc.in` alias of `hng@dgoc.in`): Email ID stays as alias (sender display), but tick "Use different Email ID" and put primary in `login_id`. Confirm the alias is in primary's Gmail → Settings → Accounts → "Send mail as".
- Email Queue force-send: `frappe.get_doc("Email Queue", name).send()` — use after `frappe.sendmail(now=False)` for immediate delivery.
- "Sent via ERPNext" footer: controlled by `send_unsubscribe_message` on Email Account — set to 0 on all accounts to remove.

## OAuth Limitations

- **OAuth via Frappe Connected App does NOT yield a refresh_token.** Frappe's auth URL doesn't append `access_type=offline&prompt=consent`, so Google returns only a 1-hour access token. Once expired, every send fails with `Please Authorize OAuth for Email Account <name>`. Locking `encryption_key` does NOT fix this. **Default to Basic auth + App Password for production-critical Email Accounts.** OAuth is fine for read-only / one-off integrations.
- Connected App OAuth callback URL differs from SSO callback: `http://<site>/api/method/frappe.integrations.doctype.connected_app.connected_app.callback/<app_name>` — add both to Google Cloud Console.
- Social Login Key: requires `provider_name` field; `redirect_url` = OAuth callback URL (not landing page); `sign_ups = "Allow"` for self-registration.

## Encryption Key

- **`get_decrypted_password()` breaks permanently if `encryption_key` rotates.** Frappe encrypts password fields (Email Account, etc.) with `site_config.json::encryption_key`. If rotated *after* a password is saved, decryption raises forever. The only fix is re-entering passwords from desk. ⛔ **Never rotate `encryption_key`.** If you must, dump and re-enter every Email Account password and any other encrypted field.

## GSTIN Autofill

- **Autofill only fires in Quick Entry — not the full Customer/Supplier/Lead form.** `india_compliance/public/js/quick_entry.js` adds the `_gstin` field with an `onchange`. Tell users to click **+ Add Customer** from the list, NOT a deep-link to `/app/customer/new`.
- **API key lives in `GST Settings.api_secret` (encrypted in `__Auth`).** Set up via `/app/india-compliance-account`. Account: harsh@dgoc.in / DSPL GSTIN. Free trial expires **2026-08-06**.
