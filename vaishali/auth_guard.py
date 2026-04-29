"""before_request guard: convert Guest hits on auth-required Vaishali API endpoints into a clean 401.

Frappe's default behavior when an unauthenticated user hits a whitelisted endpoint is HTTP 403
with an HTML body of `<details>...is not whitelisted...</details>`. The PWA's older `api.js`
builds (cached on devices) only auto-recover on 401, leaving users stuck with the raw HTML in
a toast. Returning 401 (`SessionExpired`) makes the existing 401 handler — present in even
very old client builds — fire the redirect to login.
"""

import frappe

# Vaishali endpoints that may be hit by Guest (mirror @frappe.whitelist(allow_guest=True))
_GUEST_ALLOWED_PREFIXES = (
	"/api/method/vaishali.www.",
)


def auth_guard():
	if frappe.session.user != "Guest":
		return

	path = (frappe.local.request.path or "")
	if not path.startswith("/api/method/vaishali."):
		return

	for prefix in _GUEST_ALLOWED_PREFIXES:
		if path.startswith(prefix):
			return

	raise frappe.SessionExpired(frappe._("Session expired — please log in again"))
