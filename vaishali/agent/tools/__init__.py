"""
Vaishali Agent Tools — Two-tier tool loading for token optimization.

Core tools are always loaded. Extended tools loaded on demand
via discover_tools meta-tool. (Anthropic Advanced Tool Use pattern)
"""

import json
import os
from datetime import date

from vaishali.agent.tools.core import CORE_TOOLS
from vaishali.agent.tools.accounting import ACCOUNTING_TOOLS
from vaishali.agent.tools.inventory import INVENTORY_TOOLS
from vaishali.agent.tools.sales_crm import SALES_CRM_TOOLS
from vaishali.agent.tools.buying import BUYING_TOOLS
from vaishali.agent.tools.hr import HR_TOOLS
from vaishali.agent.tools.master_data import MASTER_DATA_TOOLS
from vaishali.agent.tools.projects import PROJECTS_TOOLS
from vaishali.agent.tools.assets import ASSETS_TOOLS
from vaishali.agent.tools.manufacturing import MANUFACTURING_TOOLS
from vaishali.agent.tools.pricing import PRICING_TOOLS
from vaishali.agent.tools.system_config import SYSTEM_CONFIG_TOOLS
from vaishali.agent.tools.communication import COMMUNICATION_TOOLS


COMPANY = os.getenv("COMPANY_NAME", "Dynamic Servitech Private Limited")
ABBR = "DSPL"


# ── Tool Categories — Two-tier loading ──

TOOL_CATEGORIES = {
    "accounting": {
        "description": "Journal entries, payment entries, sales/purchase invoices",
        "tools": ["create_journal_entry", "create_payment_entry", "create_sales_invoice", "create_purchase_invoice"],
    },
    "inventory": {
        "description": "Stock entries, warehouses, BOMs, stock reconciliation, landed costs",
        "tools": ["create_stock_entry", "create_warehouse", "create_bom", "stock_reconciliation",
                  "create_landed_cost_voucher"],
    },
    "service_quality": {
        "description": "Quality inspections, warranty claims, CAPA (corrective/preventive actions)",
        "tools": ["create_quality_inspection"],
    },
    "sales_crm": {
        "description": "Leads, opportunities, quotations, sales orders, delivery notes",
        "tools": ["create_lead", "create_opportunity", "create_quotation", "create_sales_order",
                  "create_delivery_note"],
    },
    "buying": {
        "description": "Purchase orders, purchase receipts, supplier quotations, RFQs, material requests, item prices",
        "tools": ["create_purchase_order", "create_purchase_receipt", "create_supplier_quotation",
                  "create_request_for_quotation", "create_material_request", "create_item_price"],
    },
    "hr": {
        "description": "Employees, attendance, leave, salary, payroll, expense claims, advances, shifts, training, appraisals, checkins",
        "tools": ["create_employee", "mark_attendance", "create_leave_application",
                  "create_salary_structure", "create_salary_slip", "create_payroll_entry",
                  "create_expense_claim", "create_employee_advance", "create_shift_assignment",
                  "create_training_event", "create_appraisal", "create_employee_checkin",
                  "create_leave_allocation"],
    },
    "master_data": {
        "description": "Customers, suppliers, items, addresses, contacts",
        "tools": ["create_customer", "create_supplier", "create_item", "create_address", "create_contact"],
    },
    "projects": {
        "description": "Projects, tasks, timesheets",
        "tools": ["create_project", "create_task", "create_timesheet"],
    },
    "assets": {
        "description": "Fixed assets, asset movements, asset maintenance",
        "tools": ["create_asset", "create_asset_movement", "create_asset_maintenance"],
    },
    "manufacturing": {
        "description": "Work orders, job cards, production plans",
        "tools": ["create_work_order", "create_job_card", "create_production_plan"],
    },
    "pricing_budgets": {
        "description": "Budgets, pricing rules, subscriptions",
        "tools": ["create_budget", "create_pricing_rule", "create_subscription"],
    },
    "system_config": {
        "description": "Custom fields, customize form, role permissions, workflows, print formats, letterheads, notifications, system settings, user management, backups",
        "tools": ["create_custom_field", "modify_doctype_property", "delete_custom_field",
                  "list_doctype_fields", "list_doctypes", "manage_role_permission",
                  "list_roles", "list_role_permissions", "create_workflow",
                  "create_print_format", "list_print_formats", "create_letter_head",
                  "create_notification", "update_system_settings", "list_erp_users",
                  "manage_user_roles", "get_backup_info"],
    },
    "communication": {
        "description": "Send emails, bulk updates, data export, document rename/amend",
        "tools": ["send_email", "bulk_update", "export_records", "rename_document", "amend_document"],
    },
}

# Build a flat set of all extended (non-core) tool names
_EXTENDED_TOOL_NAMES = set()
for _cat in TOOL_CATEGORIES.values():
    _EXTENDED_TOOL_NAMES.update(_cat["tools"])

# Core tools — always loaded (most frequently used)
CORE_TOOL_NAMES = {
    "search_records", "get_document", "get_count", "search_link",
    "get_report", "business_dashboard",
    "update_document", "submit_document", "cancel_document", "delete_document", "amend_bom",
    "erp_attach", "semantic_search", "get_print_pdf",
    "get_system_settings",
    "discover_tools",  # meta-tool for loading extended tools
    # Self-service chat tools (always available)
    "chat_mark_attendance", "log_visit", "apply_leave_for_employee",
    "submit_expense_for_employee", "request_advance_for_employee",
    "team_status", "my_daily_summary",
    "query_view",  # View Engine access
    # Memory tools (always available)
    "save_memory", "get_memories",
}

# The discover_tools meta-tool definition
DISCOVER_TOOLS_DEF = {
    "name": "discover_tools",
    "description": (
        "Load specialized ERP tools by category. You start with core tools (search, reports, "
        "update, submit, cancel, delete, PDF). When you need to CREATE documents or configure "
        "the system, use this tool to load the right category.\n\n"
        "Available categories:\n"
        + "\n".join(f"- **{cat}**: {info['description']}" for cat, info in TOOL_CATEGORIES.items())
        + "\n\nReturns: List of tool names now available for use. Call the returned tools directly."
        "\n\nExamples:\n"
        "- User asks to create an invoice → discover_tools(category=\"accounting\")\n"
        "- User asks to add a custom field → discover_tools(category=\"system_config\")\n"
        "- User asks to create a purchase order → discover_tools(category=\"buying\")\n"
        "- User asks about employees/attendance → discover_tools(category=\"hr\")"
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "description": "Tool category to load",
                "enum": list(TOOL_CATEGORIES.keys()),
            },
        },
        "required": ["category"],
    },
}


# ── Aggregate all tool schemas ──

TOOLS = (
    CORE_TOOLS
    + ACCOUNTING_TOOLS
    + INVENTORY_TOOLS
    + SALES_CRM_TOOLS
    + BUYING_TOOLS
    + HR_TOOLS
    + MASTER_DATA_TOOLS
    + PROJECTS_TOOLS
    + ASSETS_TOOLS
    + MANUFACTURING_TOOLS
    + PRICING_TOOLS
    + SYSTEM_CONFIG_TOOLS
    + COMMUNICATION_TOOLS
)


# ── Legacy constants used by old FastAPI executor (kept for reference, not imported) ──

FINANCIAL_DOCTYPES = {
    "Journal Entry", "Payment Entry",
    "Sales Invoice", "Purchase Invoice",
    "Stock Entry", "Sales Order", "Purchase Order",
    "Stock Reconciliation", "BOM",
    "Purchase Receipt", "Delivery Note", "Material Request",
    "Quality Inspection", "Landed Cost Voucher",
    "Quotation", "Supplier Quotation",
    "Expense Claim", "Salary Slip", "Payroll Entry",
    "Employee Advance", "Work Order", "Timesheet",
    "Request for Quotation", "Leave Allocation",
    "Job Card", "Production Plan", "Asset Movement",
}


# ── Role-based tool filtering ──

WRITE_TOOLS = {
    "create_journal_entry", "create_payment_entry", "create_sales_invoice",
    "create_purchase_invoice", "create_customer", "create_supplier", "create_item",
    "create_employee", "mark_attendance", "create_leave_application",
    "create_stock_entry", "create_warehouse", "create_bom", "stock_reconciliation",
    "create_purchase_order", "create_purchase_receipt", "create_delivery_note",
    "create_material_request", "create_item_price", "create_quality_inspection",
    "create_landed_cost_voucher",
    "create_lead", "create_opportunity", "create_quotation", "create_sales_order",
    "create_supplier_quotation", "create_address", "create_contact",
    "create_expense_claim", "create_salary_structure", "create_salary_slip",
    "create_payroll_entry", "create_employee_advance", "create_shift_assignment",
    "create_training_event", "create_appraisal",
    "create_asset", "create_work_order", "create_task", "create_timesheet",
    "create_project", "update_document", "submit_document", "erp_attach",
    "create_request_for_quotation", "create_budget", "create_pricing_rule",
    "create_employee_checkin", "create_leave_allocation",
    "create_job_card", "create_production_plan", "create_asset_movement",
    "create_asset_maintenance", "create_subscription",
    "bulk_update", "export_records", "send_email", "amend_document",
    "chat_mark_attendance", "log_visit", "apply_leave_for_employee",
    "submit_expense_for_employee", "request_advance_for_employee",
    "my_daily_summary",
}

MANAGER_TOOLS = {"cancel_document", "team_status"}

ADMIN_TOOLS = {
    "delete_document",
    "create_custom_field", "modify_doctype_property", "delete_custom_field",
    "manage_role_permission", "create_workflow", "create_print_format",
    "create_letter_head", "create_notification", "rename_document",
    "update_system_settings", "manage_user_roles", "get_backup_info",
}


def _filter_by_role(tool_list, role):
    """Filter tools by role permissions."""
    available = []
    for tool in tool_list:
        name = tool["name"]
        if name in ADMIN_TOOLS:
            if role == "admin":
                available.append(tool)
        elif name in MANAGER_TOOLS:
            if role in ("admin", "manager"):
                available.append(tool)
        elif name in WRITE_TOOLS:
            if role in ("admin", "manager", "user"):
                available.append(tool)
        else:
            available.append(tool)
    return available


# Build tool lookup for fast access
_TOOL_LOOKUP = {}


def _build_tool_lookup():
    global _TOOL_LOOKUP
    _TOOL_LOOKUP = {t["name"]: t for t in TOOLS}
    _TOOL_LOOKUP["discover_tools"] = DISCOVER_TOOLS_DEF


def get_tools_for_role(role, categories=None):
    """Get tools for a role. Two-tier loading:
    - Default (categories=None): Core tools only + discover_tools meta-tool
    - With categories: Core + specified category tools

    This reduces initial token usage by ~70% (from 87 tools to ~15).
    Extended tools are loaded on-demand when Claude calls discover_tools().
    """
    if role in ("blocked", "none"):
        return []
    if not _TOOL_LOOKUP:
        _build_tool_lookup()

    if categories is None:
        # Tier 1: Core tools only
        core = [_TOOL_LOOKUP[n] for n in CORE_TOOL_NAMES if n in _TOOL_LOOKUP]
        return _filter_by_role(core, role)
    else:
        # Tier 2: Core + requested category tools
        names = set(CORE_TOOL_NAMES)
        for cat in categories:
            if cat in TOOL_CATEGORIES:
                names.update(TOOL_CATEGORIES[cat]["tools"])
        tools = [_TOOL_LOOKUP[n] for n in names if n in _TOOL_LOOKUP]
        return _filter_by_role(tools, role)


def get_tools_by_name(names):
    """Get specific tools by name. Used by slash commands for restricted tool sets."""
    if not _TOOL_LOOKUP:
        _build_tool_lookup()
    return [_TOOL_LOOKUP[n] for n in names if n in _TOOL_LOOKUP]


def get_all_tools_for_role(role):
    """Legacy: Get ALL tools (no two-tier). Used for admin dashboard/counting."""
    if role in ("blocked", "none"):
        return []
    if not _TOOL_LOOKUP:
        _build_tool_lookup()
    all_tools = list(TOOLS) + [DISCOVER_TOOLS_DEF]
    return _filter_by_role(all_tools, role)
