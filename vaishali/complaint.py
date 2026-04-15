"""Site Complaint & CAPA management for DSPL ERP.

Handles Warranty Claim SLA calculation, escalation notifications,
and CAPA overdue checks.
"""
import frappe
from frappe.utils import add_days, today, date_diff, getdate

from vaishali.notifications import _get_managers, _notify


# SLA definitions: (response_days, resolution_days)
PRIORITY_SLA = {
    "P1 - Safety":   (1, 2),
    "P2 - Down":     (2, 5),
    "P3 - Degraded": (5, 10),
    "P4 - Minor":    (15, 20),
}


# ── Warranty Claim doc_events ───────────────────────────────────


def on_warranty_claim_save(doc, method):
    """Calculate SLA dates when priority is set."""
    if not doc.priority:
        return

    sla = PRIORITY_SLA.get(doc.priority)
    if not sla:
        return

    base_date = doc.complaint_date or today()
    doc.response_due_date = add_days(base_date, sla[0])
    doc.resolution_due_date = add_days(base_date, sla[1])


def on_warranty_claim_update(doc, method):
    """Notify managers when a new Warranty Claim is created or priority changes."""
    if doc.is_new():
        managers = _get_managers()
        priority_text = doc.priority or "Not set"
        msg = (
            f"New site complaint: {doc.name}\n"
            f"Customer: {doc.customer_name}\n"
            f"Item: {doc.item_name or 'N/A'}\n"
            f"Priority: {priority_text}\n"
            f"Complaint: {(doc.complaint or '')[:200]}"
        )
        for emp_id in managers:
            _notify(emp_id, msg)


# ── Scheduled: SLA breach alerts ────────────────────────────────


def check_sla_breaches():
    """Run daily. Alert managers about complaints breaching SLA.

    Checks:
    1. Response overdue: no first_response_date and past response_due_date
    2. Resolution overdue: status not Resolved and past resolution_due_date
    """
    today_date = today()

    # Response SLA breaches
    overdue_response = frappe.get_all(
        "Warranty Claim",
        filters={
            "status": ["in", ["Open", "Work In Progress"]],
            "response_due_date": ["<", today_date],
            "first_response_date": ["is", "not set"],
        },
        fields=["name", "customer_name", "priority", "response_due_date", "complaint"],
        limit_page_length=50,
    )

    # Resolution SLA breaches
    overdue_resolution = frappe.get_all(
        "Warranty Claim",
        filters={
            "status": ["in", ["Open", "Work In Progress"]],
            "resolution_due_date": ["<", today_date],
        },
        fields=["name", "customer_name", "priority", "resolution_due_date", "complaint"],
        limit_page_length=50,
    )

    if not overdue_response and not overdue_resolution:
        return

    managers = _get_managers()
    lines = []

    if overdue_response:
        lines.append(f"RESPONSE OVERDUE ({len(overdue_response)}):")
        for wc in overdue_response:
            days = date_diff(today_date, wc.response_due_date)
            lines.append(f"  {wc.name} — {wc.customer_name} ({wc.priority}) — {days}d overdue")

    if overdue_resolution:
        lines.append(f"\nRESOLUTION OVERDUE ({len(overdue_resolution)}):")
        for wc in overdue_resolution:
            days = date_diff(today_date, wc.resolution_due_date)
            lines.append(f"  {wc.name} — {wc.customer_name} ({wc.priority}) — {days}d overdue")

    msg = "⚠ Complaint SLA Alert\n" + "\n".join(lines)
    for emp_id in managers:
        _notify(emp_id, msg)


def check_capa_overdue():
    """Run daily. Alert managers about CAPA items past their target date."""
    today_date = today()

    overdue = frappe.get_all(
        "CAPA",
        filters={
            "capa_status": ["in", ["Open", "In Progress"]],
            "preventive_target_date": ["<", today_date],
            "docstatus": 1,
        },
        fields=["name", "customer_name", "item_name", "rca_category", "preventive_target_date"],
        limit_page_length=50,
    )

    if not overdue:
        return

    managers = _get_managers()
    lines = [f"CAPA OVERDUE ({len(overdue)}):"]
    for capa in overdue:
        days = date_diff(today_date, capa.preventive_target_date)
        lines.append(f"  {capa.name} — {capa.customer_name} / {capa.item_name} ({capa.rca_category}) — {days}d overdue")

    msg = "⚠ CAPA Overdue Alert\n" + "\n".join(lines)
    for emp_id in managers:
        _notify(emp_id, msg)
