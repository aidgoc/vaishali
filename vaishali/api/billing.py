"""Operator Logsheet — month-end Sales Invoice generator.

One Sales Invoice per (customer x equipment x month), one line per logsheet day.

Suggested scheduler: cron 0 9 1 * * (9 AM on the 1st of every month) ->
    vaishali.api.billing.generate_logsheet_invoices  (runs for the previous month)

Endpoints (all PWA path-translated under /api/field/logsheet-billing/*):
    GET  preview_logsheet_billing(month=None)   -> grouped buckets, no writes
    POST generate_logsheet_invoices(month=None) -> creates draft Sales Invoices
    GET  get_logsheet_billing_summary()         -> dashboard tile counts
"""

import calendar
from datetime import date, datetime, timedelta

import frappe
from frappe import _
from frappe.utils import flt, getdate


# ── Role gate ─────────────────────────────────────────────────────────

_ALLOWED_BILLING_ROLES = {
    "Accounts Manager",
    "Accounts User",
    "HR Manager",
    "System Manager",
    "Administrator",
}


def _check_billing_role():
    """Throw PermissionError unless the caller is on the accounts/HR team."""
    roles = set(frappe.get_roles(frappe.session.user))
    if not (roles & _ALLOWED_BILLING_ROLES):
        frappe.throw(
            _("Only the accounts/HR team can generate logsheet invoices."),
            frappe.PermissionError,
        )


# ── Month helpers ─────────────────────────────────────────────────────

def _previous_month_str(today=None):
    today = today or date.today()
    first = today.replace(day=1)
    last_prev = first - timedelta(days=1)
    return last_prev.strftime("%Y-%m")


def _month_range(month_str):
    """Return (start_date, end_date) inclusive for a 'YYYY-MM' string."""
    if not month_str:
        month_str = _previous_month_str()
    try:
        year, month = [int(x) for x in month_str.split("-")]
    except (ValueError, AttributeError):
        frappe.throw(_("Invalid month: {0}. Expected YYYY-MM.").format(month_str))
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _equipment_key(ls):
    """Group key: equipment_item if set, else equipment_label, else 'Unspecified'."""
    if ls.get("equipment_item"):
        return ls["equipment_item"]
    if ls.get("equipment_label"):
        return ls["equipment_label"]
    return "Unspecified"


def _equipment_display(ls):
    return ls.get("equipment_label") or ls.get("equipment_item") or "Equipment"


# ── Core fetch ────────────────────────────────────────────────────────

def _fetch_billable_logsheets(month_str):
    """Pull every billable Operator Logsheet for the given month."""
    start, end = _month_range(month_str)
    rows = frappe.get_all(
        "Operator Logsheet",
        filters={
            "docstatus": 1,
            "approval_status": "Approved",
            "status": ["!=", "Billed"],
            "sales_invoice": ["in", [None, ""]],
            "log_date": ["between", [start, end]],
        },
        fields=[
            "name", "log_date", "company",
            "customer", "customer_name", "site_name",
            "equipment_item", "equipment_label",
            "work_type", "shift",
            "total_hours", "rate_per_hour", "amount",
        ],
        order_by="customer asc, log_date asc",
        limit_page_length=0,
    )
    return rows


def _group_logsheets(rows):
    """Group by (customer, equipment_key). Returns ordered list of buckets."""
    groups = {}
    for ls in rows:
        key = (ls["customer"], _equipment_key(ls))
        bucket = groups.get(key)
        if bucket is None:
            bucket = {
                "customer": ls["customer"],
                "customer_name": ls.get("customer_name") or ls["customer"],
                "equipment_key": _equipment_key(ls),
                "equipment_label": _equipment_display(ls),
                "equipment_item": ls.get("equipment_item") or "",
                "company": ls["company"],
                "logsheets": [],
                "total_hours": 0.0,
                "total_amount": 0.0,
                "log_dates": [],
            }
            groups[key] = bucket
        bucket["logsheets"].append(ls)
        bucket["total_hours"] += flt(ls.get("total_hours"))
        bucket["total_amount"] += flt(ls.get("amount"))
        if ls.get("log_date"):
            bucket["log_dates"].append(str(ls["log_date"]))
    return list(groups.values())


# ── Public endpoints ──────────────────────────────────────────────────

@frappe.whitelist()
def preview_logsheet_billing(month=None):
    """Preview the buckets that would be invoiced. No writes."""
    _check_billing_role()
    rows = _fetch_billable_logsheets(month)
    groups = _group_logsheets(rows)

    out = []
    for g in groups:
        out.append({
            "customer": g["customer"],
            "customer_name": g["customer_name"],
            "equipment_key": g["equipment_key"],
            "equipment_label": g["equipment_label"],
            "company": g["company"],
            "total_hours": round(g["total_hours"], 2),
            "total_amount": round(g["total_amount"], 2),
            "line_count": len(g["logsheets"]),
            "log_dates": sorted(g["log_dates"]),
        })

    start, end = _month_range(month)
    return {
        "month": (month or _previous_month_str()),
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "groups": out,
        "total_groups": len(out),
        "total_logsheets": sum(g["line_count"] for g in out),
        "total_amount": round(sum(g["total_amount"] for g in out), 2),
    }


@frappe.whitelist(methods=["POST"])
def generate_logsheet_invoices(month=None):
    """Create draft Sales Invoices for every (customer x equipment x month) bucket.

    Idempotent: any logsheet that already has sales_invoice set is skipped.
    Invoices are saved as Draft (docstatus=0) so accounts can review + add taxes
    before submit.
    """
    _check_billing_role()

    rows = _fetch_billable_logsheets(month)
    groups = _group_logsheets(rows)

    posting_date = _month_range(month)[1]
    due_date = posting_date + timedelta(days=30)

    created_invoices = []
    skipped = 0
    errors = []

    for g in groups:
        # All logsheets in the group must share a company (sanity)
        companies = set(ls["company"] for ls in g["logsheets"])
        if len(companies) > 1:
            errors.append({
                "customer": g["customer"],
                "equipment_key": g["equipment_key"],
                "error": "Logsheets in this group span multiple companies: "
                         + ", ".join(sorted(companies)),
            })
            continue

        company = g["company"]
        cost_center = frappe.db.get_value("Company", company, "cost_center") or None

        # Re-check for skips (concurrent run / partial prior run)
        live_logsheets = []
        for ls in g["logsheets"]:
            existing_si = frappe.db.get_value("Operator Logsheet", ls["name"], "sales_invoice")
            existing_status = frappe.db.get_value("Operator Logsheet", ls["name"], "status")
            if existing_si or existing_status == "Billed":
                skipped += 1
                continue
            live_logsheets.append(ls)

        if not live_logsheets:
            continue

        try:
            si = frappe.new_doc("Sales Invoice")
            si.customer = g["customer"]
            si.company = company
            si.posting_date = posting_date
            si.due_date = due_date
            si.set_posting_time = 1

            if cost_center:
                si.cost_center = cost_center

            for ls in live_logsheets:
                desc = "{eq} - {dt} - {wt} - {hrs}h".format(
                    eq=(ls.get("equipment_label") or ls.get("equipment_item") or "Equipment"),
                    dt=ls.get("log_date"),
                    wt=ls.get("work_type") or "",
                    hrs=flt(ls.get("total_hours")),
                )
                row = {
                    "qty": flt(ls.get("total_hours")),
                    "rate": flt(ls.get("rate_per_hour")),
                    "uom": "Hour",
                    "description": desc,
                }
                if ls.get("equipment_item"):
                    row["item_code"] = ls["equipment_item"]
                if cost_center:
                    row["cost_center"] = cost_center
                si.append("items", row)

            si.flags.ignore_permissions = True
            si.insert(ignore_permissions=True)

            for ls in live_logsheets:
                frappe.db.set_value(
                    "Operator Logsheet",
                    ls["name"],
                    {
                        "sales_invoice": si.name,
                        "status": "Billed",
                    },
                    update_modified=True,
                )

            created_invoices.append(si.name)

        except Exception as exc:
            frappe.db.rollback()
            errors.append({
                "customer": g["customer"],
                "equipment_key": g["equipment_key"],
                "error": str(exc),
            })
            frappe.log_error(
                title="Logsheet billing failure",
                message=frappe.get_traceback(),
            )

    frappe.db.commit()

    return {
        "month": (month or _previous_month_str()),
        "created": len(created_invoices),
        "skipped": skipped,
        "invoices": created_invoices,
        "errors": errors,
    }


@frappe.whitelist()
def get_logsheet_billing_summary():
    """Manager dashboard tile: this-month + last-month pending counts/amounts."""
    _check_billing_role()

    today = date.today()
    this_month = today.strftime("%Y-%m")
    last_month = _previous_month_str(today)

    def _summarise(month_str):
        rows = _fetch_billable_logsheets(month_str)
        groups = _group_logsheets(rows)
        return {
            "month": month_str,
            "logsheet_count": len(rows),
            "group_count": len(groups),
            "total_amount": round(sum(flt(r.get("amount")) for r in rows), 2),
            "total_hours": round(sum(flt(r.get("total_hours")) for r in rows), 2),
        }

    return {
        "this_month": _summarise(this_month),
        "last_month": _summarise(last_month),
        "default_month": last_month,
    }
