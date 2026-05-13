---
name: Email Account "Harsh" — alias of hng@dgoc.in
description: SMTP login_id must be the primary mailbox (hng@dgoc.in), not the alias (harsh@dgoc.in). Auth method is Basic + App Password, NOT OAuth.
type: project
originSessionId: 3d1b15db-41ca-44fb-8970-727b05cfd6e4
---
`harsh@dgoc.in` is a Google Workspace **alias** of `hng@dgoc.in`. App Passwords + SMTP auth always go against the primary mailbox — Gmail rejects auth attempts against the alias address with `535 5.7.8 Username and Password not accepted`.

**Working configuration on `/app/email-account/Harsh` (set 2026-05-08):**
- Email ID: `harsh@dgoc.in` (sender / From address)
- Auth Method: **Basic** (not OAuth)
- Use different Email ID: ✓
- Login ID: `hng@dgoc.in`
- Password: 16-char App Password generated under hng@dgoc.in
- SMTP: smtp.gmail.com:587 TLS

**Why we abandoned OAuth (2026-05-08):** Frappe's Connected App `o8s04kreb9` doesn't request `access_type=offline&prompt=consent`, so Google never returned a refresh_token. Token Cache held only a 1-hour access token; once expired, all sends failed with "Please Authorize OAuth for Email Account Harsh" and required browser re-auth. App Password sidesteps the refresh-token issue entirely and works indefinitely until the password is revoked.

**Why:** Gmail SMTP auth resolves the username to a real mailbox identity. Aliases don't have their own credential surface — they exist only as additional From addresses on the primary account.

**How to apply:** Any future Gmail-backed Email Account in this ERPNext where the desired sender is a Workspace alias must use:
1. Email ID = alias address (display)
2. Login ID = primary mailbox (auth)
3. App Password generated under the primary

Also: in the **primary** mailbox's Gmail → Settings → Accounts → "Send mail as", confirm the alias is listed (Workspace usually pre-configures this). Otherwise Gmail rewrites the From header to the primary on outbound and recipients see hng@dgoc.in instead of harsh@dgoc.in.

**Validate-on-save quirk:** Frappe runs an SMTP auth probe before persisting. If the probe fails, the password field is rolled back to empty (`pw_length: 0`) and the title shows "Not Saved". Don't trust the form contents until the "Not Saved" badge clears.

**Confirmed working:** queue `1h3jic4fk8` sent to bng@dgoc.in 2026-05-08 with Pitch + Quote PDFs attached.
