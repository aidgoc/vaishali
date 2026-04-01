"""
DSPL Workspace Setup — Number Cards, Dashboard Charts, and Workspaces.

Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_workspace.setup

Idempotent — safe to run multiple times.
"""

import frappe
import json
import random
import string


def _block_id():
    """Generate a 10-char random ID like Frappe's Editor.js blocks."""
    return "".join(random.choices(string.ascii_letters + string.digits, k=10))


def setup():
    """Main entry point."""
    cleanup_old_number_cards()
    create_number_cards()
    create_charts()
    # Commit so link validation finds the newly created cards/charts
    frappe.db.commit()
    update_dspl_sales_workspace()
    create_dspl_operations_workspace()
    create_dspl_finance_workspace()
    frappe.db.commit()
    print("DSPL workspace setup complete!")


def cleanup_old_number_cards():
    """Remove duplicate number cards from previous failed runs."""
    # Previous runs created cards with wrong labels (without DSPL prefix),
    # causing autoname duplicates like "Open Quotations-1", etc.
    old_labels = [
        "Open Quotations", "Orders This Month", "Outstanding Receivables",
        "Active Leads", "Team Present Today", "Pending Approvals",
        "Active Work Orders", "Pending Deliveries", "Stock Below Reorder",
    ]
    for label in old_labels:
        for nc in frappe.get_all("Number Card", filters={"label": label}, pluck="name"):
            frappe.delete_doc("Number Card", nc, force=True)
            print(f"  Cleaned up: {nc}")
    frappe.db.commit()


# ---------------------------------------------------------------------------
# Number Cards
# ---------------------------------------------------------------------------

def create_number_cards():
    cards = [
        # --- Sales ---
        {
            "doctype": "Number Card",
            "name": "DSPL Open Quotations",
            "label": "DSPL Open Quotations",
            "document_type": "Quotation",
            "function": "Count",
            "filters_json": json.dumps([
                ["Quotation", "docstatus", "=", 1],
                ["Quotation", "status", "=", "Open"],
            ]),
            "color": "#3B82F6",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Orders This Month",
            "label": "DSPL Orders This Month",
            "document_type": "Sales Order",
            "function": "Count",
            "filters_json": json.dumps([
                ["Sales Order", "docstatus", "=", 1],
                ["Sales Order", "transaction_date", "Timespan", "this month"],
            ]),
            "color": "#22C55E",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Outstanding Receivables",
            "label": "DSPL Outstanding Receivables",
            "document_type": "Sales Invoice",
            "function": "Sum",
            "aggregate_function_based_on": "outstanding_amount",
            "filters_json": json.dumps([
                ["Sales Invoice", "docstatus", "=", 1],
                ["Sales Invoice", "outstanding_amount", ">", 0],
            ]),
            "color": "#F97316",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Active Leads",
            "label": "DSPL Active Leads",
            "document_type": "Lead",
            "function": "Count",
            "filters_json": json.dumps([
                ["Lead", "status", "in", ["Open", "Replied"]],
            ]),
            "color": "#A855F7",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        # --- Conversion Funnel ---
        {
            "doctype": "Number Card",
            "name": "DSPL Visits This Month",
            "label": "DSPL Visits This Month",
            "document_type": "Daily Call Report",
            "function": "Count",
            "filters_json": json.dumps([
                ["Daily Call Report", "date", "Timespan", "this month"],
            ]),
            "color": "#3B82F6",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Leads Generated",
            "label": "DSPL Leads Generated",
            "document_type": "Daily Call Report",
            "function": "Count",
            "filters_json": json.dumps([
                ["Daily Call Report", "date", "Timespan", "this month"],
                ["Daily Call Report", "conversion_status", "in",
                 ["Lead Created", "Opportunity", "Quoted", "Won"]],
            ]),
            "color": "#A855F7",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Visits Won",
            "label": "DSPL Visits Won",
            "document_type": "Daily Call Report",
            "function": "Count",
            "filters_json": json.dumps([
                ["Daily Call Report", "date", "Timespan", "this month"],
                ["Daily Call Report", "conversion_status", "=", "Won"],
            ]),
            "color": "#22C55E",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        # --- HR / Operations ---
        {
            "doctype": "Number Card",
            "name": "DSPL Team Present Today",
            "label": "DSPL Team Present Today",
            "document_type": "Employee Checkin",
            "function": "Count",
            "filters_json": json.dumps([
                ["Employee Checkin", "time", "Timespan", "today"],
            ]),
            "color": "#22C55E",
            "show_percentage_stats": 0,
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Pending Approvals",
            "label": "DSPL Pending Approvals",
            "document_type": "Leave Application",
            "function": "Count",
            "filters_json": json.dumps([
                ["Leave Application", "docstatus", "=", 0],
                ["Leave Application", "status", "=", "Open"],
            ]),
            "color": "#EF4444",
            "show_percentage_stats": 0,
            "is_standard": 0,
        },
        # --- Finance ---
        {
            "doctype": "Number Card",
            "name": "DSPL Unpaid Invoices",
            "label": "DSPL Unpaid Invoices",
            "document_type": "Sales Invoice",
            "function": "Count",
            "filters_json": json.dumps([
                ["Sales Invoice", "docstatus", "=", 1],
                ["Sales Invoice", "outstanding_amount", ">", 0],
            ]),
            "color": "#F97316",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Overdue Invoices",
            "label": "DSPL Overdue Invoices",
            "document_type": "Sales Invoice",
            "function": "Count",
            "filters_json": json.dumps([
                ["Sales Invoice", "docstatus", "=", 1],
                ["Sales Invoice", "outstanding_amount", ">", 0],
                ["Sales Invoice", "due_date", "<", "today"],
            ]),
            "color": "#EF4444",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Payments This Month",
            "label": "DSPL Payments This Month",
            "document_type": "Payment Entry",
            "function": "Sum",
            "aggregate_function_based_on": "paid_amount",
            "filters_json": json.dumps([
                ["Payment Entry", "docstatus", "=", 1],
                ["Payment Entry", "posting_date", "Timespan", "this month"],
                ["Payment Entry", "payment_type", "=", "Receive"],
            ]),
            "color": "#22C55E",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        # --- Service ---
        {
            "doctype": "Number Card",
            "name": "DSPL Open Warranty Claims",
            "label": "DSPL Open Warranty Claims",
            "document_type": "Warranty Claim",
            "function": "Count",
            "filters_json": json.dumps([
                ["Warranty Claim", "status", "!=", "Resolved"],
            ]),
            "color": "#EA580C",
            "show_percentage_stats": 0,
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Pending Installations",
            "label": "DSPL Pending Installations",
            "document_type": "Maintenance Visit",
            "function": "Count",
            "filters_json": json.dumps([
                ["Maintenance Visit", "maintenance_type", "=", "Scheduled"],
                ["Maintenance Visit", "docstatus", "<", 1],
            ]),
            "color": "#3B82F6",
            "show_percentage_stats": 0,
            "is_standard": 0,
        },
        # --- Operations ---
        {
            "doctype": "Number Card",
            "name": "DSPL Active Work Orders",
            "label": "DSPL Active Work Orders",
            "document_type": "Work Order",
            "function": "Count",
            "filters_json": json.dumps([
                ["Work Order", "docstatus", "=", 1],
                ["Work Order", "status", "in", ["Not Started", "In Process"]],
            ]),
            "color": "#3B82F6",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Pending Deliveries",
            "label": "DSPL Pending Deliveries",
            "document_type": "Delivery Note",
            "function": "Count",
            "filters_json": json.dumps([
                ["Delivery Note", "docstatus", "=", 0],
            ]),
            "color": "#F97316",
            "show_percentage_stats": 1,
            "stats_time_interval": "Monthly",
            "is_standard": 0,
        },
        {
            "doctype": "Number Card",
            "name": "DSPL Stock Below Reorder",
            "label": "DSPL Stock Below Reorder",
            "document_type": "Bin",
            "function": "Count",
            "filters_json": json.dumps([
                ["Bin", "projected_qty", "<", 0],
            ]),
            "color": "#EF4444",
            "show_percentage_stats": 0,
            "is_standard": 0,
        },
    ]

    for card in cards:
        # Number Card autonames from label, so check by label
        if not frappe.db.exists("Number Card", card["label"]):
            doc = frappe.get_doc(card)
            doc.insert(ignore_permissions=True)
            print(f"  Created number card: {card['label']}")
        else:
            print(f"  Exists: {card['label']}")


# ---------------------------------------------------------------------------
# Dashboard Charts
# ---------------------------------------------------------------------------

def create_charts():
    charts = [
        {
            "doctype": "Dashboard Chart",
            "name": "DSPL Monthly Revenue",
            "chart_name": "DSPL Monthly Revenue",
            "chart_type": "Sum",
            "document_type": "Sales Invoice",
            "based_on": "posting_date",
            "value_based_on": "grand_total",
            "timespan": "Last Year",
            "time_interval": "Monthly",
            "filters_json": json.dumps([
                ["Sales Invoice", "docstatus", "=", 1],
            ]),
            "type": "Bar",
            "color": "#E60005",
            "is_standard": 0,
        },
        {
            "doctype": "Dashboard Chart",
            "name": "DSPL Quotation Pipeline",
            "chart_name": "DSPL Quotation Pipeline",
            "chart_type": "Group By",
            "document_type": "Quotation",
            "group_by_type": "Count",
            "group_by_based_on": "status",
            "filters_json": json.dumps([
                ["Quotation", "docstatus", "=", 1],
            ]),
            "type": "Donut",
            "color": "#3B82F6",
            "is_standard": 0,
        },
        {
            "doctype": "Dashboard Chart",
            "name": "DSPL Lead Source Breakdown",
            "chart_name": "DSPL Lead Source Breakdown",
            "chart_type": "Group By",
            "document_type": "Lead",
            "group_by_type": "Count",
            "group_by_based_on": "source",
            "filters_json": json.dumps([
                ["Lead", "status", "in", ["Open", "Replied"]],
            ]),
            "type": "Pie",
            "color": "#A855F7",
            "is_standard": 0,
        },
        {
            "doctype": "Dashboard Chart",
            "name": "DSPL Monthly Collections",
            "chart_name": "DSPL Monthly Collections",
            "chart_type": "Sum",
            "document_type": "Payment Entry",
            "based_on": "posting_date",
            "value_based_on": "paid_amount",
            "timespan": "Last Year",
            "time_interval": "Monthly",
            "filters_json": json.dumps([
                ["Payment Entry", "docstatus", "=", 1],
                ["Payment Entry", "payment_type", "=", "Receive"],
            ]),
            "type": "Bar",
            "color": "#22C55E",
            "is_standard": 0,
        },
        {
            "doctype": "Dashboard Chart",
            "name": "DSPL Monthly Orders",
            "chart_name": "DSPL Monthly Orders",
            "chart_type": "Count",
            "document_type": "Sales Order",
            "based_on": "transaction_date",
            "timespan": "Last Year",
            "time_interval": "Monthly",
            "filters_json": json.dumps([
                ["Sales Order", "docstatus", "=", 1],
            ]),
            "type": "Line",
            "color": "#22C55E",
            "is_standard": 0,
        },
    ]

    for chart in charts:
        if not frappe.db.exists("Dashboard Chart", chart["chart_name"]):
            doc = frappe.get_doc(chart)
            doc.insert(ignore_permissions=True)
            print(f"  Created chart: {chart['chart_name']}")
        else:
            print(f"  Exists: {chart['chart_name']}")


# ---------------------------------------------------------------------------
# Shortcuts
# ---------------------------------------------------------------------------

def create_shortcuts():
    """Create workspace shortcuts for quick access links."""
    shortcuts = [
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Quotation",
            "label": "Quotation",
            "link_to": "Quotation",
            "type": "DocType",
            "color": "#3B82F6",
        },
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Sales Order",
            "label": "Sales Order",
            "link_to": "Sales Order",
            "type": "DocType",
            "color": "#22C55E",
        },
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Sales Invoice",
            "label": "Sales Invoice",
            "link_to": "Sales Invoice",
            "type": "DocType",
            "color": "#F97316",
        },
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Lead",
            "label": "Lead",
            "link_to": "Lead",
            "type": "DocType",
            "color": "#A855F7",
        },
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Customer",
            "label": "Customer",
            "link_to": "Customer",
            "type": "DocType",
            "color": "#6B7280",
        },
        {
            "doctype": "Workspace Shortcut",
            "name": "DSPL Shortcut Item",
            "label": "Item",
            "link_to": "Item",
            "type": "DocType",
            "color": "#6B7280",
        },
    ]

    for sc in shortcuts:
        if not frappe.db.exists("Workspace Shortcut", sc["name"]):
            doc = frappe.get_doc(sc)
            doc.insert(ignore_permissions=True)
            print(f"  Created shortcut: {sc['name']}")
        else:
            print(f"  Exists: {sc['name']}")


# ---------------------------------------------------------------------------
# Workspace: DSPL Sales
# ---------------------------------------------------------------------------

def _build_sales_workspace_content():
    """Build the JSON content blocks for the DSPL Sales workspace."""
    return json.dumps([
        # --- Header: Overview ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Overview</b></span>", "col": 12}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Number Cards Row ---
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Open Quotations", "col": 3}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Orders This Month", "col": 3}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Outstanding Receivables", "col": 3}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Active Leads", "col": 3}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Charts ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Revenue & Pipeline</b></span>", "col": 12}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Monthly Revenue", "col": 12}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Quotation Pipeline", "col": 6}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Lead Source Breakdown", "col": 6}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

    ])


def _set_workspace_children(workspace, number_card_names, chart_names, shortcuts=None):
    """Populate the number_cards, charts, and shortcuts child tables on a workspace.

    IMPORTANT: Frappe's block.js matches widgets by label == block_name,
    so label must exactly match the name used in the content JSON.
    """
    workspace.set("number_cards", [])
    for nc_name in number_card_names:
        workspace.append("number_cards", {
            "number_card_name": nc_name,
            "label": nc_name,
        })

    workspace.set("charts", [])
    for ch_name in chart_names:
        workspace.append("charts", {
            "chart_name": ch_name,
            "label": ch_name,
        })

    if shortcuts:
        workspace.set("shortcuts", [])
        for sc in shortcuts:
            workspace.append("shortcuts", sc)


def update_dspl_sales_workspace():
    """Update the existing DSPL Sales workspace with number cards, charts, and shortcuts."""
    ws_name = "DSPL Sales"

    sales_number_cards = [
        "DSPL Open Quotations",
        "DSPL Orders This Month",
        "DSPL Outstanding Receivables",
        "DSPL Active Leads",
    ]
    sales_charts = [
        "DSPL Monthly Revenue",
        "DSPL Quotation Pipeline",
        "DSPL Lead Source Breakdown",
    ]

    if not frappe.db.exists("Workspace", ws_name):
        workspace = frappe.get_doc({
            "doctype": "Workspace",
            "name": ws_name,
            "label": "DSPL Sales",
            "module": "Vaishali",
            "category": "Modules",
            "icon": "chart-line",
            "is_standard": 0,
            "public": 1,
            "content": _build_sales_workspace_content(),
        })
        _set_workspace_children(workspace, sales_number_cards, sales_charts)
        workspace.flags.ignore_links = True
        workspace.insert(ignore_permissions=True)
        print(f"  Created workspace: {ws_name}")
    else:
        workspace = frappe.get_doc("Workspace", ws_name)
        workspace.content = _build_sales_workspace_content()
        _set_workspace_children(workspace, sales_number_cards, sales_charts)
        workspace.flags.ignore_links = True
        workspace.save(ignore_permissions=True)
        print(f"  Updated workspace: {ws_name}")


# ---------------------------------------------------------------------------
# Workspace: DSPL Operations
# ---------------------------------------------------------------------------

def _build_operations_workspace_content():
    """Build the JSON content blocks for the DSPL Operations workspace."""
    return json.dumps([
        # --- Header: Overview ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Operations Overview</b></span>", "col": 12}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Number Cards Row ---
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Active Work Orders", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Pending Deliveries", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Stock Below Reorder", "col": 4}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Service Cards ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Service</b></span>", "col": 12}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Open Warranty Claims", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Pending Installations", "col": 4}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Shortcuts ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Quick Links</b></span>", "col": 12}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Work Order", "col": 3}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Delivery Note", "col": 3}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Warranty Claim", "col": 3}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Maintenance Visit", "col": 3}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- HR Cards ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Team</b></span>", "col": 12}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Team Present Today", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Pending Approvals", "col": 4}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Chart ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Order Trends</b></span>", "col": 12}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Monthly Orders", "col": 12}},
    ])


def create_dspl_operations_workspace():
    """Create or update the DSPL Operations workspace."""
    ws_name = "DSPL Operations"

    ops_number_cards = [
        "DSPL Active Work Orders",
        "DSPL Pending Deliveries",
        "DSPL Stock Below Reorder",
        "DSPL Open Warranty Claims",
        "DSPL Pending Installations",
        "DSPL Team Present Today",
        "DSPL Pending Approvals",
    ]
    ops_charts = [
        "DSPL Monthly Orders",
    ]
    ops_shortcuts = [
        {"label": "Work Order", "link_to": "Work Order", "type": "DocType"},
        {"label": "Delivery Note", "link_to": "Delivery Note", "type": "DocType"},
        {"label": "Warranty Claim", "link_to": "Warranty Claim", "type": "DocType"},
        {"label": "Maintenance Visit", "link_to": "Maintenance Visit", "type": "DocType"},
    ]

    if not frappe.db.exists("Workspace", ws_name):
        workspace = frappe.get_doc({
            "doctype": "Workspace",
            "name": ws_name,
            "label": "DSPL Operations",
            "title": "DSPL Operations",
            "module": "Vaishali",
            "category": "Modules",
            "icon": "tool",
            "is_standard": 0,
            "public": 1,
            "content": _build_operations_workspace_content(),
        })
        _set_workspace_children(workspace, ops_number_cards, ops_charts, ops_shortcuts)
        workspace.flags.ignore_links = True
        workspace.insert(ignore_permissions=True)
        print(f"  Created workspace: {ws_name}")
    else:
        workspace = frappe.get_doc("Workspace", ws_name)
        workspace.content = _build_operations_workspace_content()
        _set_workspace_children(workspace, ops_number_cards, ops_charts, ops_shortcuts)
        workspace.flags.ignore_links = True
        workspace.save(ignore_permissions=True)
        print(f"  Updated workspace: {ws_name}")


# ---------------------------------------------------------------------------
# Workspace: DSPL Finance
# ---------------------------------------------------------------------------

def _build_finance_workspace_content():
    """Build the JSON content blocks for the DSPL Finance workspace."""
    return json.dumps([
        # --- Header ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Finance Overview</b></span>", "col": 12}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Number Cards ---
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Unpaid Invoices", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Overdue Invoices", "col": 4}},
        {"id": _block_id(), "type": "number_card", "data": {"number_card_name": "DSPL Payments This Month", "col": 4}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Charts ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Revenue &amp; Collections</b></span>", "col": 12}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Monthly Revenue", "col": 6}},
        {"id": _block_id(), "type": "chart", "data": {"chart_name": "DSPL Monthly Collections", "col": 6}},
        {"id": _block_id(), "type": "spacer", "data": {"col": 12}},

        # --- Shortcuts ---
        {"id": _block_id(), "type": "header", "data": {"text": "<span class=\"h4\"><b>Quick Links</b></span>", "col": 12}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Sales Invoice", "col": 3}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Payment Entry", "col": 3}},
        {"id": _block_id(), "type": "shortcut", "data": {"shortcut_name": "Accounts Receivable", "col": 3}},
    ])


def create_dspl_finance_workspace():
    """Create or update the DSPL Finance workspace."""
    ws_name = "DSPL Finance"

    fin_number_cards = [
        "DSPL Unpaid Invoices",
        "DSPL Overdue Invoices",
        "DSPL Payments This Month",
    ]
    fin_charts = [
        "DSPL Monthly Revenue",
        "DSPL Monthly Collections",
    ]
    fin_shortcuts = [
        {"label": "Sales Invoice", "link_to": "Sales Invoice", "type": "DocType"},
        {"label": "Payment Entry", "link_to": "Payment Entry", "type": "DocType"},
        {"label": "Accounts Receivable", "link_to": "Accounts Receivable", "type": "Report"},
    ]

    if not frappe.db.exists("Workspace", ws_name):
        workspace = frappe.get_doc({
            "doctype": "Workspace",
            "name": ws_name,
            "label": "DSPL Finance",
            "title": "DSPL Finance",
            "module": "Vaishali",
            "category": "Modules",
            "icon": "income",
            "is_standard": 0,
            "public": 1,
            "content": _build_finance_workspace_content(),
        })
        _set_workspace_children(workspace, fin_number_cards, fin_charts, fin_shortcuts)
        workspace.flags.ignore_links = True
        workspace.insert(ignore_permissions=True)
        print(f"  Created workspace: {ws_name}")
    else:
        workspace = frappe.get_doc("Workspace", ws_name)
        workspace.content = _build_finance_workspace_content()
        _set_workspace_children(workspace, fin_number_cards, fin_charts, fin_shortcuts)
        workspace.flags.ignore_links = True
        workspace.save(ignore_permissions=True)
        print(f"  Updated workspace: {ws_name}")
