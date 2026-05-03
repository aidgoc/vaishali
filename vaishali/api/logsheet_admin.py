"""Logsheet admin API — manager verification queue for Operator Logsheets.

Phase 2.5 of the rental-billing pipeline. Most logsheets get client
self-approval via the public URL (Phase 2.2). The remainder are paper-based:
the operator uploads a photo of the signed paper and a manager glances at it
before billing picks it up.

Endpoints:
    get_logsheets_pending_verification(limit)
    verify_logsheet(name, decision, dispute_reason)
    bulk_verify(names)

Permission: only managers (Service Manager / HR Manager / Accounts Manager /
System Manager / Administrator) may call these. Field/operator users see
nothing.
"""
import json
import frappe
from frappe import _
from datetime import datetime, timezone, timedelta


# Roles that may verify a paper-signed logsheet on behalf of the company.
_VERIFY_ROLES = {
    "System Manager",
    "Administrator",
    "Service Manager",
    "HR Manager",
    "Accounts Manager",
}


def _get_employee(user=None):
    """Resolve the active Employee for the calling user. Mirrors field._get_employee."""
    if not user:
        user = frappe.session.user
    emps = frappe.get_list(
        "Employee",
        filters={"user_id": user, "status": "Active"},
        fields=["name", "employee_name", "department", "designation", "company"],
        limit_page_length=1,
    )
    if not emps:
        return None
    return emps[0]


def _ensure_manager(user=None):
    """Throw if the calling user is not a logsheet-verification manager."""
    if not user:
        user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if not (roles & _VERIFY_ROLES):
        frappe.throw(
            _("You are not authorised to verify logsheets."),
            frappe.PermissionError,
        )


def _hours_since(dt):
    """Return whole hours elapsed between dt (server-naive UTC) and now."""
    if not dt:
        return 0
    if isinstance(dt, str):
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                dt = datetime.strptime(dt, "%Y-%m-%d %H:%M:%S.%f")
            except ValueError:
                return 0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    return max(int(delta.total_seconds() // 3600), 0)


# ── List queue ────────────────────────────────────────────────────

@frappe.whitelist()
def get_logsheets_pending_verification(limit=50):
    """Logsheets that need a manager glance before billing.

    Filter:
        - docstatus = 1 (submitted)
        - approval_status NOT in ("Approved", "Rejected")
          → client hasn't self-approved; manager is reviewing the paper proof
        - status = "Open"
        - supervisor_signature is set AND signed_by is set
    """
    _ensure_manager()

    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 50
    if limit <= 0 or limit > 500:
        limit = 50

    rows = frappe.get_all(
        "Operator Logsheet",
        filters=[
            ["docstatus", "=", 1],
            ["status", "=", "Open"],
            ["approval_status", "not in", ["Approved", "Rejected"]],
            ["supervisor_signature", "is", "set"],
            ["signed_by", "is", "set"],
        ],
        fields=[
            "name", "operator", "operator_name", "log_date",
            "customer", "customer_name", "site_name",
            "equipment_label", "equipment_item",
            "total_hours", "idle_hours", "shift", "work_type",
            "signed_by", "supervisor_signature",
            "rate_per_hour", "amount",
            "approval_status", "creation",
        ],
        order_by="log_date asc, creation asc",
        limit_page_length=limit,
    )

    out = []
    for r in rows:
        out.append({
            "name": r.name,
            "operator": r.operator,
            "operator_name": r.operator_name or r.operator,
            "log_date": str(r.log_date) if r.log_date else None,
            "customer": r.customer,
            "customer_name": r.customer_name or r.customer,
            "site_name": r.site_name or "",
            "equipment_label": r.equipment_label or r.equipment_item or "",
            "shift": r.shift or "",
            "work_type": r.work_type or "",
            "total_hours": float(r.total_hours or 0),
            "idle_hours": float(r.idle_hours or 0),
            "signed_by": r.signed_by or "",
            "supervisor_signature": r.supervisor_signature or "",
            "rate_per_hour": float(r.rate_per_hour or 0),
            "amount": float(r.amount or 0),
            "approval_status": r.approval_status or "Pending",
            "operator_age_hours": _hours_since(r.creation),
        })
    return out


# ── Verify / Dispute (single) ─────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def verify_logsheet(name, decision, dispute_reason=None):
    """Manager decision on a single paper-signed logsheet.

    decision="verify"  → status=Verified (billable)
    decision="dispute" → status=Disputed; appends reason to remarks; comments
                          on the doc so the operator sees it.
    """
    _ensure_manager()

    if not name:
        frappe.throw(_("Logsheet name is required."))

    decision = (decision or "").strip().lower()
    if decision not in ("verify", "dispute"):
        frappe.throw(_("Decision must be 'verify' or 'dispute'."))

    doc = frappe.get_doc("Operator Logsheet", name)

    if doc.docstatus != 1:
        frappe.throw(_("Only submitted logsheets can be verified."))
    if doc.status not in ("Open",):
        frappe.throw(
            _("This logsheet is already {0} — cannot change.").format(doc.status)
        )
    if doc.approval_status in ("Approved", "Rejected"):
        frappe.throw(
            _("Client already {0} this logsheet — manager verification not needed.")
            .format(doc.approval_status.lower())
        )

    if decision == "verify":
        new_status = "Verified"
        frappe.db.set_value("Operator Logsheet", name, "status", new_status)
        frappe.db.commit()
        return {"success": True, "name": name, "status": new_status}

    # Dispute branch
    reason = (dispute_reason or "").strip()
    if not reason or len(reason) < 5:
        frappe.throw(_("Please provide a dispute reason (at least 5 characters)."))

    new_status = "Disputed"
    stamp = frappe.utils.now_datetime().strftime("%Y-%m-%d %H:%M")
    appended_block = "\n\n[Disputed by {0} on {1}]\n{2}".format(
        frappe.session.user, stamp, reason
    )
    new_remarks = (doc.remarks or "") + appended_block

    frappe.db.set_value(
        "Operator Logsheet", name,
        {"status": new_status, "remarks": new_remarks},
    )

    # Frappe comment so the operator sees the reason on the doc.
    frappe.get_doc({
        "doctype": "Comment",
        "comment_type": "Comment",
        "reference_doctype": "Operator Logsheet",
        "reference_name": name,
        "content": _("Disputed: {0}").format(reason),
    }).insert(ignore_permissions=True)

    frappe.db.commit()
    return {"success": True, "name": name, "status": new_status}


# ── Bulk verify ───────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def bulk_verify(names):
    """Verify many logsheets in one transaction.

    `names` accepts a JSON array string or a Python list (Frappe's auto-decode
    handles either, but we're defensive).
    """
    _ensure_manager()

    if isinstance(names, str):
        try:
            names = json.loads(names)
        except (TypeError, ValueError):
            frappe.throw(_("'names' must be a JSON array of logsheet names."))

    if not isinstance(names, list) or not names:
        frappe.throw(_("Provide at least one logsheet name."))

    verified = []
    skipped = []
    errors = []

    for raw in names:
        n = (raw or "").strip() if isinstance(raw, str) else None
        if not n:
            continue

        try:
            row = frappe.db.get_value(
                "Operator Logsheet", n,
                ["docstatus", "status", "approval_status"],
                as_dict=True,
            )
            if not row:
                skipped.append({"name": n, "reason": "not found"})
                continue
            if row.docstatus != 1:
                skipped.append({"name": n, "reason": "not submitted"})
                continue
            if row.status != "Open":
                skipped.append({"name": n, "reason": "status=" + (row.status or "")})
                continue
            if row.approval_status in ("Approved", "Rejected"):
                skipped.append({"name": n, "reason": "client already decided"})
                continue

            frappe.db.set_value("Operator Logsheet", n, "status", "Verified")
            # Commit per row so a downstream failure (e.g. trigger raises
            # on a single name) doesn't roll back already-verified rows.
            frappe.db.commit()
            verified.append(n)
        except Exception as exc:
            frappe.db.rollback()
            errors.append({"name": n, "error": str(exc)[:200]})
            frappe.log_error(
                title=f"bulk_verify failed for {n}",
                message=frappe.get_traceback(),
            )

    return {
        "success": True,
        "verified_count": len(verified),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "verified": verified,
        "skipped": skipped,
        "errors": errors,
    }
