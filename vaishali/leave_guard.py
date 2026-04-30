"""Leave Application validators — advance notice, sick-leave attachment, HR CC.

Wired into Leave Application via doc_events in hooks.py:
    Leave Application:
        validate: vaishali.leave_guard.validate
        on_update: vaishali.leave_guard.cc_hr_on_notification
"""
import frappe
from frappe import _
from frappe.utils import getdate, date_diff

HR_EMAIL = "info@dgoc.in"

# Advance-notice tiers — see tasks/todo.md §4a
NOTICE_TIERS = [
    (1, 3),      # 1 day leave → 3 days advance
    (3, 7),      # 2-3 day leave → 7 days advance
    (10, 30),    # 4-10 day leave → 30 days advance
    (float("inf"), 30),  # 11+ days → 30 days advance
]

EMERGENCY_TYPES = {"Sick Leave"}
SICK_DOC_THRESHOLD_DAYS = 2


def validate(doc, method=None):
    """Run all leave-application validators on save (covers draft + on submit)."""
    _validate_advance_notice(doc)
    _validate_sick_leave_attachment(doc)


# ── Advance notice ────────────────────────────────────────────────

def _validate_advance_notice(doc):
    if doc.leave_type in EMERGENCY_TYPES:
        return  # Sickness/emergency exempt — but post-facto approval required (handled separately)
    days = float(doc.total_leave_days or 0)
    if days <= 0:
        return
    posting = getdate(doc.posting_date)
    start = getdate(doc.from_date)
    notice_given = date_diff(start, posting)
    required = _required_notice(days)
    if notice_given < required:
        frappe.throw(_(
            "{0} day leave must be applied at least {1} days in advance. "
            "You're applying {2} day(s) before the leave start. "
            "If this is a sick/emergency case, please use Sick Leave instead."
        ).format(int(days) if days == int(days) else days, required, notice_given),
        title=_("Insufficient Notice"))


def _required_notice(days):
    for max_days, notice in NOTICE_TIERS:
        if days <= max_days:
            return notice
    return NOTICE_TIERS[-1][1]


# ── Sick-leave > 2 days requires attachment ───────────────────────

def _validate_sick_leave_attachment(doc):
    if doc.leave_type != "Sick Leave":
        return
    days = float(doc.total_leave_days or 0)
    if days <= SICK_DOC_THRESHOLD_DAYS:
        return
    if not doc.name or doc.name.startswith("new-"):
        return  # New unsaved doc — File child can't exist yet; check on submit instead
    has_attachment = frappe.db.exists("File", {
        "attached_to_doctype": "Leave Application",
        "attached_to_name": doc.name,
    })
    if not has_attachment:
        frappe.throw(_(
            "Sick leave exceeding {0} days requires a supporting medical document. "
            "Please attach a doctor's certificate or medical record before submitting."
        ).format(SICK_DOC_THRESHOLD_DAYS),
        title=_("Medical Document Required"))


# ── HR CC on every leave notification ─────────────────────────────

def cc_hr_on_notification(doc, method=None):
    """Append HR to recipients of any in-progress notification on this Leave Application.

    Frappe Notifications evaluate recipients at send time. We hook the doc save
    and stamp `_hr_cc` so the Notification template can pick it up via `{{ doc._hr_cc }}`.
    Simpler approach: ensure HR is on every Notification's "always_send_to" list (one-time setup).
    See vaishali.setup_leave_policy._ensure_hr_cc_on_notifications().
    """
    # No-op runtime — handled by Notification configuration. Kept as hook for future logic.
    return
