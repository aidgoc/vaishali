"""Management Dashboard — Workspace + Number Cards + Dashboard Charts.

Pure ERPNext-native: Workspace, Number Card, Dashboard Chart, Role.
Scope: visible only to the three directors (harsh@dgoc.in, njg@dgoc.in,
bng@dgoc.in) via the `DSPL Director` role.

Idempotent — re-run on every `bench migrate` via the after_migrate hook.
"""

import json
import frappe

DIRECTORS = ("harsh@dgoc.in", "njg@dgoc.in", "bng@dgoc.in")
ROLE_NAME = "DSPL Director"
WORKSPACE_NAME = "Management"

# ── Number Cards ─────────────────────────────────────────────────────
# Number Card autoname uses the `label` field, so the label IS the name.
# Frappe disallows '<' and '>' in docnames; '—' (em-dash) is fine.
#
# Filter format (matches what Frappe itself produces, NOT the 3-element
# shape that frappe.db.count accepts):
#   filters_json:         [[doctype, field, operator, value, is_dynamic_bool]]
#   dynamic_filters_json: [[doctype, field, operator, "<JS_expression>"]]
#                         (4-element; value is a JAVASCRIPT expression that
#                          the desk evaluates in the browser, so use
#                          frappe.datetime.* not frappe.utils.*)
#
# Time windows prefer the native 'Timespan' operator with values like
# 'today', 'this month', 'this year' — cleaner than expressions, and the
# desk knows how to label them.
#
# Tuple: (label, doctype, function, filters_json, dynamic_filters_json,
#         field_to_aggregate, color)
_CARDS = [
    # Cash & Receivables
    ("Mgmt — Outstanding AR", "Sales Invoice", "Sum",
     [["Sales Invoice", "docstatus", "=", "1", False],
      ["Sales Invoice", "outstanding_amount", ">", 0, False]],
     None, "outstanding_amount", "#E91E63"),
    ("Mgmt — AR Overdue 30d+", "Sales Invoice", "Sum",
     [["Sales Invoice", "docstatus", "=", "1", False],
      ["Sales Invoice", "outstanding_amount", ">", 0, False]],
     [["Sales Invoice", "due_date", "<",
       "frappe.datetime.add_days(frappe.datetime.nowdate(), -30)"]],
     "outstanding_amount", "#D32F2F"),
    ("Mgmt — Draft Sales Invoices", "Sales Invoice", "Count",
     [["Sales Invoice", "docstatus", "=", "0", False]],
     None, None, "#FFA000"),
    ("Mgmt — Unpaid Invoices", "Sales Invoice", "Count",
     [["Sales Invoice", "docstatus", "=", "1", False],
      ["Sales Invoice", "outstanding_amount", ">", 0, False]],
     None, None, "#FF6F00"),

    # Sales & Pipeline — Timespan beats expressions for MTD windows
    ("Mgmt — Sales Orders MTD", "Sales Order", "Sum",
     [["Sales Order", "docstatus", "=", "1", False],
      ["Sales Order", "transaction_date", "Timespan", "this month", False]],
     None, "grand_total", "#388E3C"),
    ("Mgmt — Quotations MTD", "Quotation", "Count",
     [["Quotation", "docstatus", "=", "1", False],
      ["Quotation", "transaction_date", "Timespan", "this month", False]],
     None, None, "#1976D2"),
    ("Mgmt — New Leads MTD", "Lead", "Count",
     [["Lead", "creation", "Timespan", "this month", False]],
     None, None, "#0097A7"),
    ("Mgmt — Open Opportunities", "Opportunity", "Count",
     [["Opportunity", "status", "=", "Open", False]],
     None, None, "#7B1FA2"),

    # People & Approvals
    ("Mgmt — Pending Advances", "Employee Advance", "Count",
     [["Employee Advance", "docstatus", "=", "0", False]],
     None, None, "#F57C00"),
    ("Mgmt — Pending Leaves", "Leave Application", "Count",
     [["Leave Application", "status", "=", "Open", False]],
     None, None, "#FBC02D"),
    ("Mgmt — Pending Expenses", "Expense Claim", "Count",
     [["Expense Claim", "approval_status", "=", "Draft", False],
      ["Expense Claim", "docstatus", "=", "0", False]],
     None, None, "#F9A825"),
    ("Mgmt — Visits Today", "Daily Call Report", "Count",
     [["Daily Call Report", "date", "Timespan", "today", False]],
     None, None, "#00838F"),

    # Service & Operations
    ("Mgmt — Open Breakdowns", "Warranty Claim", "Count",
     [["Warranty Claim", "status", "=", "Open", False]],
     None, None, "#C62828"),
    ("Mgmt — Open Complaints", "Issue", "Count",
     [["Issue", "status", "=", "Open", False]],
     None, None, "#AD1457"),
    ("Mgmt — Open Material Requests", "Material Request", "Count",
     [["Material Request", "docstatus", "=", "1", False],
      ["Material Request", "status", "=", "Pending", False]],
     None, None, "#5E35B1"),
    ("Mgmt — Active Sales Orders", "Sales Order", "Count",
     [["Sales Order", "docstatus", "=", "1", False],
      ["Sales Order", "status", "in",
       ["To Deliver and Bill", "To Deliver"], False]],
     None, None, "#283593"),

    # Cash ageing (couldn't be expressed via Timespan)
    ("Mgmt — Overdue Invoices 90d+", "Sales Invoice", "Count",
     [["Sales Invoice", "docstatus", "=", "1", False],
      ["Sales Invoice", "outstanding_amount", ">", 0, False]],
     [["Sales Invoice", "due_date", "<",
       "frappe.datetime.add_days(frappe.datetime.nowdate(), -90)"]],
     None, "#B71C1C"),
    ("Mgmt — AR Overdue 60d+ Amount", "Sales Invoice", "Sum",
     [["Sales Invoice", "docstatus", "=", "1", False],
      ["Sales Invoice", "outstanding_amount", ">", 0, False]],
     [["Sales Invoice", "due_date", "<",
       "frappe.datetime.add_days(frappe.datetime.nowdate(), -60)"]],
     "outstanding_amount", "#BF360C"),
]

# ── Dashboard Charts ─────────────────────────────────────────────────
# Dashboard Chart autoname uses chart_name, so chart_name IS the docname.
# Tuple: (chart_name, doctype, based_on, value_based_on, function,
#         timespan, time_interval, type, filters_json, color)
_CHARTS = [
    ("Mgmt — Sales (Last 30 days)", "Sales Order", "transaction_date",
     "grand_total", "Sum", "Last Month", "Daily", "Line",
     [["Sales Order", "docstatus", "=", "1", False]], "#388E3C"),
    ("Mgmt — Quotations (Last 30 days)", "Quotation", "transaction_date",
     "grand_total", "Sum", "Last Month", "Daily", "Line",
     [["Quotation", "docstatus", "=", "1", False]], "#1976D2"),
    ("Mgmt — Visits (Last 30 days)", "Daily Call Report", "date",
     None, "Count", "Last Month", "Daily", "Bar", [], "#00838F"),
    ("Mgmt — New Leads (Last 30 days)", "Lead", "creation",
     None, "Count", "Last Month", "Daily", "Bar", [], "#0097A7"),
]


def ensure_role():
    if not frappe.db.exists("Role", ROLE_NAME):
        frappe.get_doc({
            "doctype": "Role",
            "role_name": ROLE_NAME,
            "desk_access": 1,
            "is_custom": 1,
        }).insert(ignore_permissions=True)


def ensure_director_users_have_role():
    for user_id in DIRECTORS:
        if not frappe.db.exists("User", user_id):
            continue
        if frappe.db.exists("Has Role", {"parent": user_id, "role": ROLE_NAME}):
            continue
        # Direct child insert — User.save() with role append silently dropped
        # the new row in our env, so we bypass the user-doc roundtrip.
        frappe.get_doc({
            "doctype": "Has Role",
            "parent": user_id,
            "parenttype": "User",
            "parentfield": "roles",
            "role": ROLE_NAME,
        }).insert(ignore_permissions=True)
        frappe.clear_cache(user=user_id)


def ensure_number_cards():
    for spec in _CARDS:
        (label, doctype, function, filters,
         dyn_filters, agg_field, color) = spec
        if not frappe.db.exists("DocType", doctype):
            continue
        # Number Card autoname uses `label`, so name == label.
        if frappe.db.exists("Number Card", label):
            doc = frappe.get_doc("Number Card", label)
        else:
            doc = frappe.new_doc("Number Card")
        doc.update({
            "label": label,
            "document_type": doctype,
            "function": function,
            "filters_json": json.dumps(filters or []),
            "dynamic_filters_json": json.dumps(dyn_filters) if dyn_filters else None,
            "color": color,
            "is_public": 1,
            "show_percentage_stats": 0,
            "type": "Document Type",
        })
        if function in ("Sum", "Average"):
            doc.aggregate_function_based_on = agg_field
        try:
            if doc.get("modified"):
                doc.save(ignore_permissions=True)
            else:
                doc.insert(ignore_permissions=True)
        except Exception as e:
            frappe.log_error(title=f"NumberCard {label} setup failed", message=str(e))


def ensure_dashboard_charts():
    for spec in _CHARTS:
        (chart_name, doctype, based_on, value_based_on, function,
         timespan, time_interval, ctype, filters, color) = spec
        if not frappe.db.exists("DocType", doctype):
            continue
        # Dashboard Chart autoname uses `chart_name`, so name == chart_name.
        if frappe.db.exists("Dashboard Chart", chart_name):
            doc = frappe.get_doc("Dashboard Chart", chart_name)
        else:
            doc = frappe.new_doc("Dashboard Chart")
        doc.update({
            "chart_name": chart_name,
            "document_type": doctype,
            "based_on": based_on,
            "value_based_on": value_based_on,
            "group_by_type": "Count",
            "chart_type": function,
            "timespan": timespan,
            "time_interval": time_interval,
            "type": ctype,
            "filters_json": json.dumps(filters or []),
            "is_public": 1,
            "color": color,
            "timeseries": 1,
            "module": "Vaishali",
        })
        try:
            if doc.get("modified"):
                doc.save(ignore_permissions=True)
            else:
                doc.insert(ignore_permissions=True)
        except Exception as e:
            frappe.log_error(title=f"DashboardChart {chart_name} setup failed", message=str(e))


def _workspace_content():
    """Visual layout JSON for the Management workspace.

    Helpers skip cards/charts that don't actually exist in the DB so a
    failed insert upstream can't leave the page rendering broken
    references (which surfaces in the desk as 'Invalid filter: =' dialogs)."""

    def header(text):
        return {"id": frappe.generate_hash(length=10), "type": "header",
                "data": {"text": f"<span class='h4'>{text}</span>", "col": 12}}

    def card(card_name):
        if not frappe.db.exists("Number Card", card_name):
            return None
        return {"id": frappe.generate_hash(length=10), "type": "number_card",
                "data": {"number_card_name": card_name, "col": 3}}

    def chart(chart_name, col=6):
        if not frappe.db.exists("Dashboard Chart", chart_name):
            return None
        return {"id": frappe.generate_hash(length=10), "type": "chart",
                "data": {"chart_name": chart_name, "col": col}}

    def spacer():
        return {"id": frappe.generate_hash(length=10), "type": "spacer", "data": {"col": 12}}

    layout = []
    layout.append(header("Cash & Receivables"))
    for n in ("Mgmt — Outstanding AR", "Mgmt — AR Overdue 30d+",
              "Mgmt — AR Overdue 60d+ Amount", "Mgmt — Overdue Invoices 90d+",
              "Mgmt — Unpaid Invoices", "Mgmt — Draft Sales Invoices"):
        layout.append(card(n))

    layout.append(header("Sales & Pipeline"))
    for n in ("Mgmt — Sales Orders MTD", "Mgmt — Quotations MTD",
              "Mgmt — New Leads MTD", "Mgmt — Open Opportunities"):
        layout.append(card(n))
    layout.append(chart("Mgmt — Sales (Last 30 days)"))
    layout.append(chart("Mgmt — Quotations (Last 30 days)"))

    layout.append(header("People & Approvals"))
    for n in ("Mgmt — Pending Advances", "Mgmt — Pending Leaves",
              "Mgmt — Pending Expenses", "Mgmt — Visits Today"):
        layout.append(card(n))
    layout.append(chart("Mgmt — Visits (Last 30 days)"))
    layout.append(chart("Mgmt — New Leads (Last 30 days)"))

    layout.append(header("Service & Operations"))
    for n in ("Mgmt — Open Breakdowns", "Mgmt — Open Complaints",
              "Mgmt — Open Material Requests", "Mgmt — Active Sales Orders"):
        layout.append(card(n))

    return json.dumps([w for w in layout if w is not None])


_SHORTCUTS = [
    ("Management (PWA)", "URL", "/field/#/management", "Orange"),
    ("Approvals (PWA)", "URL", "/field/#/approvals", "Orange"),
    ("Receivables Summary", "Report", "Accounts Receivable Summary", "Pink"),
    ("Pending Advances", "DocType", "Employee Advance", "Yellow"),
    ("Pending Leaves", "DocType", "Leave Application", "Yellow"),
    ("Quotations", "DocType", "Quotation", "Blue"),
    ("Sales Orders", "DocType", "Sales Order", "Green"),
    ("Sales Invoices", "DocType", "Sales Invoice", "Pink"),
    ("Payment Entries", "DocType", "Payment Entry", "Green"),
    ("Daily Call Reports", "DocType", "Daily Call Report", "Cyan"),
    ("Customers", "DocType", "Customer", "Purple"),
]


def ensure_workspace():
    name = WORKSPACE_NAME
    if frappe.db.exists("Workspace", name):
        ws = frappe.get_doc("Workspace", name)
    else:
        ws = frappe.new_doc("Workspace")
        ws.name = name

    ws.title = name
    ws.label = name
    ws.module = "Vaishali"
    ws.icon = "leaderboard"
    ws.public = 1
    ws.is_hidden = 0
    ws.for_user = ""
    ws.content = _workspace_content()

    # Reset child tables and rebuild idempotently
    ws.set("roles", [])
    ws.append("roles", {"role": ROLE_NAME})

    ws.set("number_cards", [])
    for spec in _CARDS:
        label = spec[0]
        if frappe.db.exists("Number Card", label):
            ws.append("number_cards", {"number_card_name": label, "label": label})

    ws.set("charts", [])
    for spec in _CHARTS:
        chart_name = spec[0]
        if frappe.db.exists("Dashboard Chart", chart_name):
            ws.append("charts", {"chart_name": chart_name, "label": chart_name})

    ws.set("shortcuts", [])
    for label, link_type, link_to, color in _SHORTCUTS:
        row = {"label": label, "type": link_type, "color": color}
        if link_type == "URL":
            row["url"] = link_to
        else:
            row["link_to"] = link_to
        ws.append("shortcuts", row)

    ws.save(ignore_permissions=True)


def run():
    """Idempotent — safe to call from after_migrate or manually."""
    try:
        ensure_role()
        ensure_director_users_have_role()
        ensure_number_cards()
        frappe.db.commit()
        ensure_dashboard_charts()
        frappe.db.commit()
        ensure_workspace()
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(title="Management dashboard setup failed", message=str(e))
