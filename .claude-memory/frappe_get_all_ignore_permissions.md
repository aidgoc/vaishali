---
name: frappe.get_all bypasses permissions by default — use get_list to test ACL hooks
description: When verifying a permission_query_conditions or has_permission hook works, frappe.get_all returns visible=True for everyone because its ignore_permissions default is True. Always use frappe.get_list (or pass ignore_permissions=False explicitly) for real ACL tests.
type: feedback
originSessionId: 20f6cf08-72cf-4a4f-bd26-caf6f8cfcb05
---
**Rule:** When testing whether a Frappe permission hook (`permission_query_conditions`, `has_permission`) is filtering correctly, never use `frappe.get_all`. Use `frappe.get_list` or pass `ignore_permissions=False` explicitly.

**Why:** Burned by this on 2026-05-07 while shipping the Communication private-inbox lock. After deploy + restart, my synthetic test showed System Manager `accounts@dgoc.in` could still see harsh's mail via `frappe.get_all(...)` and `frappe.get_doc(...).fields`. Spent ~15 minutes debugging the hook itself, only to discover (a) `frappe.get_all` defaults to `ignore_permissions=True`, and (b) `frappe.get_doc` fetches without auto-permission-check unless you call `.has_permission()` on the result. The hook was working correctly all along — `DatabaseQuery.execute(user=...)` and `frappe.get_list(...)` both confirmed empty results for the locked-out users.

**How to apply:**
- For ACL tests in scripts: `frappe.get_list("X", filters=..., ignore_permissions=False)`. Direct fetches: `doc = frappe.get_doc(...); doc.has_permission("read")`.
- For permission-hook debugging: instantiate `from frappe.model.db_query import DatabaseQuery; q = DatabaseQuery("X"); q.execute(filters=..., user=...)` — also respects perms and lets you read `frappe.db.last_query` to see the exact SQL.
- Production use: most internal Frappe code uses `get_all` for performance. **This means private-inbox or row-level ACL hooks DO NOT protect against system code that calls get_all** — only against the desk UI / REST / get_list paths. Document this as a residual risk wherever you ship a row-level ACL.
