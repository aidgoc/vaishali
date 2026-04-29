"""Client-side error reporter for the Field PWA.

Whitelisted endpoint that records JavaScript errors (window.onerror, unhandled
promise rejections, fetch failures) into Frappe's Error Log so we can see what
breaks in the field instead of relying on user-reported issues.

Rate-limited per user via Redis to prevent a buggy client from flooding the log.
"""

import frappe

_RATE_LIMIT_PER_5MIN = 30
_MAX_MESSAGE_LEN = 500
_MAX_STACK_LEN = 4000
_MAX_FIELD_LEN = 200


def _truncate(value, limit):
	if value is None:
		return ""
	value = str(value)
	if len(value) <= limit:
		return value
	return value[:limit] + "…[truncated]"


def _rate_limit_ok(user):
	key = f"pwa_client_log:{user}"
	try:
		count = frappe.cache().incr(key)
		if count == 1:
			frappe.cache().expire(key, 300)
		return count <= _RATE_LIMIT_PER_5MIN
	except Exception:
		return True


@frappe.whitelist(methods=["POST"])
def log_client_error(message=None, source=None, screen=None, route=None, stack=None, user_agent=None):
	user = frappe.session.user
	if user == "Guest":
		return {"ok": False, "reason": "guest"}

	if not _rate_limit_ok(user):
		return {"ok": False, "reason": "rate_limited"}

	title = f"PWA: {_truncate(message, 80) or 'unknown error'}"

	body_lines = [
		f"User: {user}",
		f"Source: {_truncate(source, _MAX_FIELD_LEN)}",
		f"Screen: {_truncate(screen, _MAX_FIELD_LEN)}",
		f"Route: {_truncate(route, _MAX_FIELD_LEN)}",
		f"User-Agent: {_truncate(user_agent, _MAX_FIELD_LEN)}",
		"",
		f"Message: {_truncate(message, _MAX_MESSAGE_LEN)}",
		"",
		"Stack:",
		_truncate(stack, _MAX_STACK_LEN),
	]
	frappe.log_error(message="\n".join(body_lines), title=title)
	return {"ok": True}
