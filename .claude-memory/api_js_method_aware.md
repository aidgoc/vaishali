---
name: api.js path translators must be method-aware
description: PWA api.js regex path rewrites match all HTTP methods; PUT/POST/GET sharing the same clean path will silently misroute to the wrong Frappe endpoint
type: feedback
originSessionId: 6465f289-5361-48c5-ae9d-45cde475f547
---
In `vaishali/public/field/api.js`, the path translator block uses regex matches like `^\/api\/field\/dcr\/[^/]+$` that do not check the HTTP method. If the client sends a `PUT` to that path while the rewrite was written for `GET`, the request is rewritten to a `GET`-only Frappe endpoint with `?dcr_id=X` in the query string. Frappe only treats query strings as kwargs for `GET`, so on `PUT` the function is called with no arguments → `TypeError: missing 1 required positional argument`.

**Why:** This was the root cause of Aniket's "Save Remarks" / "Confirm Checkout" server errors on 2026-04-25. `visits.js:762` and `:847` send `PUT`, the api.js regex matched without method check, and the rewrite landed on `get_dcr` (whitelist `GET`) and `checkout_dcr` (`@frappe.whitelist(methods=["POST"])`). 4+ Error Log entries per day had been accumulating silently.

**How to apply:**
- Any time a PWA endpoint accepts both reads and writes on the same clean path (e.g. `/api/field/X/{id}` for GET and PUT), the api.js rewrite block MUST gate on `method`:
  ```js
  if (method === 'PUT' || method === 'PATCH' || method === 'POST') { ... POST endpoint ...; method = 'POST'; }
  else { ... GET endpoint ... }
  ```
- The client's `method` variable is mutable inside `apiCall` (see api.js precedent: `method = 'GET'` for views at line 253). Use this to force the method to whatever the server's `@frappe.whitelist(methods=[...])` decorator requires — don't trust the caller's choice.
- When adding a new whitelisted endpoint that mutates state, immediately ask: "is the client sending PUT or POST? Does the api.js rewrite force the right method?" This is easy to miss because it fails silently in the network tab and only surfaces in `tabError Log` server-side.
