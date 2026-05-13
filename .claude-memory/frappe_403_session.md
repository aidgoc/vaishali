---
name: Frappe 403 on expired session — not 401
description: When a Frappe session expires, POSTs to whitelisted methods return 403 ("is not whitelisted" / "Login to access"), not 401. Any client-side auth recovery must treat this 403 shape as a session-expiry signal.
type: feedback
originSessionId: c5d63914-3824-4e93-b8d9-5ed94943b4b2
---
Frappe returns **HTTP 403** (not 401) when a logged-out/expired-session user POSTs to a `@frappe.whitelist()` method. The response body contains `"Function X is not whitelisted"` and/or `"Login to access"`.

**Why:** Frappe's `is_whitelisted()` check in `frappe/__init__.py` throws `PermissionError` for Guest users — and PermissionError maps to 403. Frappe treats "not authenticated" as a permission problem, not an authentication problem, so 401 is never emitted for this case.

**How to apply:** Any PWA/client auth-recovery logic must handle 403-with-"not whitelisted" body as "session expired → re-login", not as "real permission denied". The Vaishali field PWA got bitten by this on 2026-04-24: `api.js` only recovered on 401, so ~19 engineers got stuck after a redis flush invalidated their sessions. Fix was to parse the 403 body and check for `"is not whitelisted"` / `"Login to access"` fingerprints before deciding whether to force re-login. See `vaishali/public/field/api.js` post-commit eae0bfd.

Related: running `redis-cli FLUSHALL` on production blows away every active session — all users have to re-login on next request. If the PWA's recovery path is broken, they silently fail instead.
