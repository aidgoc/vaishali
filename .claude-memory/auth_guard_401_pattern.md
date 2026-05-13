---
name: Guest API hits return 401 via auth_guard before_request
description: Vaishali ships a before_request hook that converts Guest hits on /api/method/vaishali.* into 401 SessionExpired so even stale PWA clients auto-recover from session expiry
type: project
originSessionId: 26b463ef-1334-4e3e-8736-23448a7468dd
---
`vaishali/auth_guard.py` registers a `before_request` hook that detects `frappe.session.user == "Guest"` on any `/api/method/vaishali.*` request and raises `frappe.SessionExpired` (HTTP 401). Excludes `/api/method/vaishali.www.*` (the only allow_guest prefix).

**Why:** Frappe's default for Guest hitting a whitelisted-but-not-allow-guest endpoint is HTTP 403 with HTML body `<details>...is not whitelisted...Login to access...</details>`. The current `api.js` (since commit `eae0bfd`) detects that body shape on 403 and redirects to login. But PWAs cached on devices before that handler landed only auto-recover on 401, leaving users stuck staring at the raw HTML in a toast (Akshay Shinde, 2026-04-29). The 401 handler in `api.js` is much older (commit `fec7d48`) so even very stale builds redirect cleanly.

**How to apply:**
- Don't remove the hook unless you've audited every still-installed PWA client
- If you add a new `allow_guest=True` vaishali endpoint, prefix-allowlist it in `_GUEST_ALLOWED_PREFIXES` in `auth_guard.py`
- Don't add similar hooks for `/api/method/frappe.*` paths — Frappe owns those
