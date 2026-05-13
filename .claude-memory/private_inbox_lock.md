---
name: Communication private-inbox lock (harsh@dgoc.in)
description: Hook-based ACL hiding Communications linked to private Email Accounts from non-owners. Live since 2026-05-07 commit 0dc5ef4. Currently locks "Harsh" inbox to harsh@dgoc.in only.
type: project
originSessionId: 20f6cf08-72cf-4a4f-bd26-caf6f8cfcb05
---
**What's live:** `vaishali/permissions.py` exposes `get_communication_permission_query` + `has_communication_permission`, registered via `permission_query_conditions` and `has_permission` hooks on Communication in `vaishali/hooks.py`. Adds a SQL clause `(email_account NOT IN (...) OR email_account IS NULL)` for any user who isn't the owner of a private inbox. Administrator bypasses (Frappe behaviour).

**Why:** harsh@dgoc.in's IMAP inbox carries sensitive mail — quotes-in-flight, board correspondence, personal. Frappe's default Communication ACL lets every System Manager read every mail. Confirmed leak before lock: `accounts@dgoc.in` and `bng@dgoc.in` could `frappe.get_doc('Communication', X)` on harsh's mails. Verified blocked after deploy.

**How to apply:**
- The mapping lives in `PRIVATE_INBOXES` dict in `vaishali/permissions.py`. Currently `{"Harsh": "harsh@dgoc.in"}`.
- To add another private inbox (e.g. `Sambhaji` for `sambhaji@dgoc.in`): edit the dict, commit, deploy with the standard sequence (`git pull upstream main && redis-cli FLUSHALL && bench --site dgoc.logstop.com clear-cache && sudo supervisorctl restart all`). The supervisor restart is mandatory — Frappe caches `get_hooks()` paths in Redis.
- To verify a lock change took effect: insert a synthetic Communication with `email_account = "<inbox-name>"`, then `frappe.set_user(<other-system-manager>)` and call `frappe.get_list('Communication', filters={'name': X}, ignore_permissions=False)` — must return `[]`.
- **Caveat we accepted:** scripts using `frappe.get_all(...)` (with the default `ignore_permissions=True`) still see private mails. That's by design for system code. Only the desk UI, REST API, and any framework path that goes through `has_permission` / `get_list` enforce the lock.
- **Don't change without re-checking:** the Frappe core function `get_permission_query_conditions_for_communication` returns `None` for System Manager / Super Email User. That used to make these users omniscient over Communications; our hook is the only thing standing between them and harsh's mail.
