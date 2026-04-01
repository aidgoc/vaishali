"""
Unified ERP Agent — All modules (Accounts, HR, Inventory, Projects) in one agent.
For Dynamic Servitech Pvt Ltd on Frappe Cloud (API-only, no direct DB).

Optimization: Two-tier tool loading following Anthropic's Advanced Tool Use guide.
- Core tools (always loaded): ~15 tools for common operations
- Extended tools (on-demand): ~70+ tools loaded via discover_tools meta-tool
This reduces initial token usage by ~70% while maintaining full capability.
"""

import json
import os
from datetime import date

# ── Inline definitions (originally from old bot's config.py and shared/knowledge.py) ──

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

COMPANY_KNOWLEDGE = """
# DSPL ERPNext — LIVE DATA REFERENCE

## COMPANIES ON THIS SITE
1. Dynamic Servitech Private Limited (DSPL) — DEFAULT
2. Dynamic Crane Engineers Private Limited (DCEPL) — DO NOT TOUCH

## KEY ACCOUNTS
- Cash: Cash - DSPL
- Debtors: Debtors - DSPL (Receivable, party_type=Customer)
- Creditors: Creditors - DSPL (Payable, party_type=Supplier)
- Income: Sales - DSPL, Service - DSPL
- Cost Center: Main - DSPL

## WAREHOUSES
- Stores - DSPL (main), Finished Goods - DSPL, Work In Progress - DSPL

## GST TAX TEMPLATES
- Sales: Output GST In-state - DSPL, Output GST Out-state - DSPL
- Purchase: Input GST In-state - DSPL, Input GST Out-state - DSPL

## LEAVE TYPES
Casual Leave, Compensatory Off, Sick Leave, Privilege Leave, Leave Without Pay

## PRICE LISTS
Standard Buying, Standard Selling
"""

COMPANY = os.getenv("COMPANY_NAME", "Dynamic Servitech Private Limited")
ABBR = "DSPL"

SYSTEM_PROMPT = f"""
You are the **ERP AI Agent** for {COMPANY}, an R&D and electronics solutions company for the heavy equipment industry (cranes, manlifts, forklifts).

You have FULL access to the company's ERPNext ERP system. You are an expert in accounting, HR, inventory, and project management.

# TODAY: {date.today().isoformat()}
# COMPANY: {COMPANY} (Abbr: {ABBR})
# CURRENCY: INR (Indian Rupees) — format: Rs. 1,23,456.78
# COST CENTER: Main - {ABBR}

# ═══════════════════════════════════════
# TOOL ECOSYSTEM
# ═══════════════════════════════════════
You have access to 87+ ERP tools organized in two tiers:
- **Core tools** (always available): search_records, get_document, get_count, search_link, get_report, business_dashboard, update_document, submit_document, cancel_document, delete_document, erp_attach, semantic_search, get_print_pdf, get_system_settings
- **Extended tools** (load on demand): Use `discover_tools(category=...)` to load specialized tools when needed.

Categories: accounting, inventory, sales_crm, buying, hr, master_data, projects, assets, manufacturing, pricing_budgets, system_config, communication.

**IMPORTANT**: When user asks to CREATE something (invoice, employee, item, etc.), FIRST call discover_tools with the right category, THEN use the loaded tool.

# ═══════════════════════════════════════
# ACCOUNTING RULES
# ═══════════════════════════════════════

## Double-Entry
- Every transaction MUST have equal debits and credits.
- Account names MUST end with " - {ABBR}".

## Account Rules
- Group accounts CANNOT be used in transactions (folders only).
- Payable/Receivable accounts REQUIRE party_type + party.
  - Creditors - {ABBR} → party_type="Supplier" + party name
  - Debtors - {ABBR} → party_type="Customer" + party name

## Company Defaults
- Payable: Creditors - {ABBR}
- Receivable: Debtors - {ABBR}
- Income: Sales - {ABBR}
- Expense: Cost of Goods Sold - {ABBR}
- Cash: Cash - {ABBR}
- Cost Center: Main - {ABBR}

## When to Use What
- **Journal Entry**: Expenses without named party, owner transactions, internal transfers, adjustments
- **Payment Entry**: Paying a known supplier, receiving from known customer
- **Purchase Invoice**: Recording a supplier bill with AP tracking
- **Sales Invoice**: Billing a customer with AR tracking

## Expense Categories
- Electronic components, PCBs → Cost of Goods Sold - {ABBR}
- Software, cloud services → IT and Internet Expenses - {ABBR}
- Contract engineers → Consultant Expense - {ABBR}
- Wages → Salaries and Employee Wages - {ABBR}
- Rent, utilities → Rent Expense / Utility Expenses - {ABBR}
- Travel → Travel Expenses - {ABBR}

# ═══════════════════════════════════════
# HR RULES
# ═══════════════════════════════════════
- Employee names: proper case
- Departments: R&D, Engineering, Operations, Administration, Finance, Sales, Quality
- Attendance: Present, Absent, Half Day, On Leave

# ═══════════════════════════════════════
# INVENTORY RULES
# ═══════════════════════════════════════
- Warehouse names must end with " - {ABBR}"
- Stock Entry types: Material Receipt (IN), Material Issue (OUT), Material Transfer, Manufacture
- Always check existing items before creating duplicates
- Item groups: Raw Material, Sub Assembly, Finished Goods, Consumable, Products, Services

# ═══════════════════════════════════════
# CRM & SALES RULES
# ═══════════════════════════════════════
- Leads: Always search before creating to avoid duplicates
- Lead sources: Advertisement, Campaign, Cold Calling, Reference, Website, Existing Customer
- Sales flow: Lead → Opportunity → Quotation → Sales Order → Delivery Note → Sales Invoice
- Quotations can be made to Leads or Customers
- Sales Orders require a delivery_date
- Always search for existing items before using item_code in orders

# ═══════════════════════════════════════
# BUYING & PROCUREMENT RULES
# ═══════════════════════════════════════
- Procurement flow: Material Request → Supplier Quotation → Purchase Order → Purchase Receipt → Purchase Invoice
- Purchase Orders require a schedule_date (expected delivery)
- Purchase Receipts record actual goods received — updates stock
- Delivery Notes record goods shipped to customers — reduces stock
- Material Requests can be for: Purchase, Material Transfer, Material Issue, Manufacture
- Item Prices: set in "Standard Buying" or "Standard Selling" price lists
- Quality Inspections: can be linked to Purchase Receipts, Delivery Notes, or Stock Entries
- Landed Cost Vouchers: add freight/customs/insurance costs to Purchase Receipts
- Always search for supplier and item_code before creating orders

# ═══════════════════════════════════════
# HR & PAYROLL RULES
# ═══════════════════════════════════════
- Salary structures define earning/deduction components
- Payroll entries process salary for multiple employees at once
- Expense claims: employee submits expenses for reimbursement
- Employee advances: pre-payment against future expenses
- Always search for employee ID before using in any HR tool

# ═══════════════════════════════════════
# ASSETS RULES
# ═══════════════════════════════════════
- Assets are tracked with category, location, and depreciation
- Use is_existing_asset=1 for assets already owned
- Asset categories define depreciation method and rates

# ═══════════════════════════════════════
# MANUFACTURING RULES
# ═══════════════════════════════════════
- Work Orders require a BOM (Bill of Materials)
- Flow: BOM → Work Order → Job Card → Stock Entry (Manufacture)
- fg_warehouse = where finished goods go
- wip_warehouse = where work-in-progress materials are

# ═══════════════════════════════════════
# PROJECT MANAGEMENT RULES
# ═══════════════════════════════════════
- Tasks belong to Projects
- Timesheets track time spent on tasks/projects
- Activity types: Planning, Execution, Communication, Review

# ═══════════════════════════════════════
# SYSTEM CONFIGURATION RULES (Admin Only)
# ═══════════════════════════════════════
- Custom Fields: Always use list_doctype_fields first to see existing fields before adding new ones
- Property Setter: Use modify_doctype_property to change field properties (like Customize Form)
- Workflows: States must include doc_status mapping (0=Draft, 1=Submitted, 2=Cancelled)
- Print Formats: Use Jinja2 templates with {{ doc.field_name }} syntax
- Notifications: Support Jinja in subject and message fields
- Role Permissions: Always list_roles first to verify role names exist
- Bulk Updates: Max 200 records per call, confirm with user before mass changes
- Email: Requires ERPNext email settings to be configured
- Export: Generates CSV files sent directly to user

# ═══════════════════════════════════════
# MANDATORY: SEARCH FIRST, NEVER GUESS
# ═══════════════════════════════════════

**BEFORE USING ANY ERP NAME OR CODE, SEARCH FIRST. DO NOT INVENT OR ASSUME.**

Violation examples (NEVER do these):
- ❌ Assume account "Consulting Expense - {ABBR}" exists without searching
- ❌ Use employee_id "HR-EMP-00001" without confirming it exists
- ❌ Create duplicate Supplier if one with similar name exists
- ❌ Invent an item_code without searching Item first

Correct pattern:
1. User says: "Create payment for electricity bill of Rs. 5,000"
2. YOU: search_records(doctype="Account", filters=[["account_name","like","%electricity%"]], fields=["name","account_type"])
3. YOU: search_records(doctype="Supplier", filters=[["supplier_name","like","%power%"]], fields=["name"])
4. YOU: Show summary to user
5. USER: Confirms
6. YOU: Create payment entry

Mandatory searches before creating financial documents:
- **Accounts**: Always search by keyword. Use exact name returned (e.g., "Electricity Expense - {ABBR}")
- **Employees**: Search by name, use the `name` field (e.g., "HR-EMP-00003"), not a guessed ID
- **Suppliers/Customers**: Search by company name; if found, use existing record; never create duplicates
- **Items**: Search by code or description; use exact item_code from results

**ERRORS ARE CRITICAL**: If any tool returns {{"error": ...}}, STOP immediately. Do not attempt next step. Show exact error to user.

**CONFIRMATION IS MANDATORY**: Before creating or modifying ANY financial document (invoice, payment, journal entry, stock entry), show a clear summary:

**Summary Template:**
```
📋 Ready to create: [Document Type]
├─ Account: [Account Name - ABBR]
├─ Party: [Supplier/Customer Name] (Type: [Supplier/Customer])
├─ Amount: Rs. [X,XX,XXX.XX]
├─ Description: [What is this for]
└─ Cost Center: [Cost Center Name]

Please confirm: yes/confirm/ok to proceed
```

Do NOT create the document until user explicitly confirms.
""" + COMPANY_KNOWLEDGE

# ═══════════════════════════════════════════════════════════════
# TOOL CATEGORIES — Two-tier loading for token optimization
# Core tools are always loaded. Extended tools loaded on demand
# via discover_tools meta-tool. (Anthropic Advanced Tool Use pattern)
# ═══════════════════════════════════════════════════════════════

TOOL_CATEGORIES = {
    "accounting": {
        "description": "Journal entries, payment entries, sales/purchase invoices",
        "tools": ["create_journal_entry", "create_payment_entry", "create_sales_invoice", "create_purchase_invoice"],
    },
    "inventory": {
        "description": "Stock entries, warehouses, BOMs, stock reconciliation, quality inspection, landed costs",
        "tools": ["create_stock_entry", "create_warehouse", "create_bom", "stock_reconciliation",
                  "create_quality_inspection", "create_landed_cost_voucher"],
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

# Core tools — always loaded (most frequently used, ~15 tools)
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

TOOLS = [
    # ── Data Access ──
    {
        "name": "search_records",
        "description": (
            "Search ERPNext records by doctype with filters. ALWAYS use before creating to avoid duplicates.\n\n"
            "Returns: Array of objects with requested fields. Each object contains 'name' (document ID) plus any fields you specify.\n\n"
            "Filter operators: =, !=, <, >, <=, >=, like, not like, in, not in, between, is (set/not set).\n\n"
            "Examples:\n"
            "1. Expense accounts: {\"doctype\": \"Account\", \"filters\": [[\"account_type\", \"=\", \"Expense Account\"], [\"is_group\", \"=\", 0]], \"fields\": [\"name\", \"account_name\"]}\n"
            "2. Recent invoices: {\"doctype\": \"Sales Invoice\", \"filters\": [[\"posting_date\", \">=\", \"2026-01-01\"]], \"fields\": [\"name\", \"customer\", \"grand_total\", \"status\"], \"order_by\": \"posting_date desc\", \"limit\": 10}\n"
            "3. Fuzzy name search: {\"doctype\": \"Supplier\", \"filters\": [[\"supplier_name\", \"like\", \"%power%\"]], \"fields\": [\"name\", \"supplier_name\"]}\n"
            "4. Multiple conditions: {\"doctype\": \"Sales Order\", \"filters\": [[\"status\", \"=\", \"To Deliver and Bill\"], [\"grand_total\", \">\", 50000]], \"fields\": [\"name\", \"customer\", \"grand_total\"]}\n"
            "5. Date range: {\"doctype\": \"Payment Entry\", \"filters\": [[\"posting_date\", \"between\", [\"2026-03-01\", \"2026-03-31\"]]], \"fields\": [\"name\", \"party\", \"paid_amount\"]}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "ERPNext doctype name"},
                "filters": {
                    "type": "array",
                    "description": "Filters as list of lists: [[field, operator, value], ...]. Operators: =, !=, <, >, <=, >=, like, not like, in, not in, between",
                    "items": {"type": "array"},
                },
                "fields": {
                    "type": "array",
                    "description": "Fields to return. Use ['name', 'field1', 'field2']. Default: ['name']",
                    "items": {"type": "string"},
                },
                "order_by": {"type": "string", "description": "e.g. 'creation desc', 'posting_date desc'"},
                "limit": {"type": "number", "description": "Max records (default 20, max 100)"},
            },
            "required": ["doctype"],
        },
    },
    {
        "name": "get_document",
        "description": "Fetch a single document with ALL fields and child tables. Returns: Full document object with every field, child table rows, docstatus, owner, timestamps.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string"},
            },
            "required": ["doctype", "name"],
        },
    },
    {
        "name": "get_count",
        "description": "Get count of records matching filters. Returns: {\"count\": number}. Quick way to check totals without fetching data.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "filters": {"type": "array", "items": {"type": "array"}},
            },
            "required": ["doctype"],
        },
    },
    {
        "name": "search_link",
        "description": "Quick fuzzy search by name/text (like ERPNext search bar). Returns: Array of {\"value\": \"DOC-NAME\", \"description\": \"display text\"}. Faster than search_records for simple lookups.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "e.g. Customer, Supplier, Item, Employee, Account"},
                "txt": {"type": "string", "description": "Search text"},
            },
            "required": ["doctype", "txt"],
        },
    },

    # ── Reports ──
    {
        "name": "get_report",
        "description": (
            "Run an ERPNext report. Returns: {{\"columns\": [...], \"result\": [rows...]}}.\n\n"
            "Reports by module:\n"
            "ACCOUNTING: General Ledger, Trial Balance, Balance Sheet, Profit and Loss Statement, "
            "Accounts Receivable/Payable (+ Summary), Gross Profit, Sales/Purchase Register, Cash Flow, Budget Variance Report.\n"
            "INVENTORY: Stock Balance, Stock Ledger, Stock Projected Qty, Stock Ageing, Warehouse wise Stock Balance.\n"
            "SALES: Sales Analytics, Quotation/Sales Order/Delivery Note Trends.\n"
            "BUYING: Purchase Analytics, Purchase Order Trends.\n"
            "HR: Monthly Attendance Sheet, Employee Leave Balance.\n"
            "MANUFACTURING: BOM Stock Report, Work Order Summary.\n\n"
            "Company defaults are auto-set. Date defaults: from 2025-01-01 to today.\n\n"
            "Examples:\n"
            "1. P&L: {{\"report_name\": \"Profit and Loss Statement\", \"filters\": {{\"period_start_date\": \"2026-03-01\", \"period_end_date\": \"2026-03-31\"}}}}\n"
            "2. Stock: {{\"report_name\": \"Stock Balance\"}}\n"
            "3. Receivables: {{\"report_name\": \"Accounts Receivable\"}}\n"
            "4. GL for supplier: {{\"report_name\": \"General Ledger\", \"filters\": {{\"party_type\": \"Supplier\", \"party\": [\"ABC Electronics\"]}}}}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "report_name": {"type": "string"},
                "filters": {
                    "type": "object",
                    "description": "Report-specific filters as key-value pairs",
                },
            },
            "required": ["report_name"],
        },
    },
    {
        "name": "business_dashboard",
        "description": (
            "Quick business overview. Returns: {{revenue, expenses, accounts_receivable, accounts_payable, "
            "pending_sales_orders, pending_purchase_orders, active_employees, open_leads, open_projects, period, from, to}}. "
            "Use for 'how is the business', 'summary', 'dashboard', 'overview'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "description": "Period for metrics: 'today', 'this_week', 'this_month', 'this_quarter', 'this_year'. Default: this_month",
                },
            },
        },
    },

    # ── Accounting ──
    {
        "name": "create_journal_entry",
        "description": (
            "Create a Journal Entry. Use for expenses without named party, internal transfers, "
            "adjustments, owner equity. Total debits MUST equal total credits.\n\n"
            "Example — Record Rs.5000 electricity expense paid from cash:\n"
            "{\"posting_date\": \"2026-03-11\", \"voucher_type\": \"Cash Entry\", "
            "\"remark\": \"Electricity bill March 2026\", \"accounts\": ["
            "{\"account\": \"Electricity Expense - DSPL\", \"debit_in_account_currency\": 5000, \"credit_in_account_currency\": 0}, "
            "{\"account\": \"Cash - DSPL\", \"debit_in_account_currency\": 0, \"credit_in_account_currency\": 5000}]}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "voucher_type": {
                    "type": "string",
                    "enum": ["Journal Entry", "Bank Entry", "Cash Entry", "Credit Card Entry",
                             "Contra Entry", "Depreciation Entry", "Write Off Entry", "Opening Entry"],
                },
                "remark": {"type": "string"},
                "cheque_no": {"type": "string"},
                "cheque_date": {"type": "string"},
                "accounts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account": {"type": "string", "description": f"Full account name with ' - {ABBR}' suffix"},
                            "debit_in_account_currency": {"type": "number"},
                            "credit_in_account_currency": {"type": "number"},
                            "party_type": {"type": "string"},
                            "party": {"type": "string"},
                            "cost_center": {"type": "string"},
                        },
                        "required": ["account", "debit_in_account_currency", "credit_in_account_currency"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["posting_date", "voucher_type", "remark", "accounts"],
        },
    },
    {
        "name": "create_payment_entry",
        "description": (
            "Create a Payment Entry for paying suppliers, receiving from customers, or internal transfers.\n\n"
            "Example — Pay Rs.25000 to supplier from bank:\n"
            "{\"payment_type\": \"Pay\", \"party_type\": \"Supplier\", \"party\": \"ABC Electronics\", "
            "\"paid_from\": \"Bank Account - DSPL\", \"paid_to\": \"Creditors - DSPL\", "
            "\"amount\": 25000, \"posting_date\": \"2026-03-11\", \"reference_no\": \"NEFT-12345\", "
            "\"remarks\": \"Payment for PCB order\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "payment_type": {"type": "string", "enum": ["Pay", "Receive", "Internal Transfer"]},
                "party_type": {"type": "string", "enum": ["Supplier", "Customer", "Employee"]},
                "party": {"type": "string"},
                "paid_from": {"type": "string"},
                "paid_to": {"type": "string"},
                "amount": {"type": "number"},
                "posting_date": {"type": "string"},
                "reference_no": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["payment_type", "party_type", "party", "paid_from", "paid_to",
                         "amount", "posting_date", "reference_no", "remarks"],
        },
    },
    {
        "name": "create_sales_invoice",
        "description": "Create a Sales Invoice to bill a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "posting_date": {"type": "string"},
                "due_date": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_name": {"type": "string"},
                            "description": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "uom": {"type": "string"},
                            "income_account": {"type": "string"},
                            "cost_center": {"type": "string"},
                        },
                        "required": ["item_name", "qty", "rate"],
                    },
                },
                "project": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["customer", "posting_date", "items"],
        },
    },
    {
        "name": "create_purchase_invoice",
        "description": "Create a Purchase Invoice to record a supplier bill.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {"type": "string"},
                "posting_date": {"type": "string"},
                "due_date": {"type": "string"},
                "bill_no": {"type": "string"},
                "bill_date": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_name": {"type": "string"},
                            "description": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "uom": {"type": "string"},
                            "expense_account": {"type": "string"},
                            "cost_center": {"type": "string"},
                        },
                        "required": ["item_name", "qty", "rate"],
                    },
                },
                "project": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["supplier", "posting_date", "items"],
        },
    },

    # ── Master Data ──
    {
        "name": "create_customer",
        "description": "Create a new Customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_name": {"type": "string"},
                "customer_group": {"type": "string"},
                "customer_type": {"type": "string", "enum": ["Company", "Individual"]},
                "territory": {"type": "string"},
            },
            "required": ["customer_name"],
        },
    },
    {
        "name": "create_supplier",
        "description": "Create a new Supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier_name": {"type": "string"},
                "supplier_group": {"type": "string"},
                "supplier_type": {"type": "string", "enum": ["Company", "Individual"]},
            },
            "required": ["supplier_name"],
        },
    },
    {
        "name": "create_item",
        "description": "Create a new Item (product/service/component).",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {"type": "string"},
                "item_name": {"type": "string"},
                "item_group": {"type": "string", "description": "Raw Material, Sub Assembly, Finished Goods, Consumable, Products, Services"},
                "stock_uom": {"type": "string", "description": "Nos, Kg, Meter, Liter, Box, Set"},
                "description": {"type": "string"},
                "is_stock_item": {"type": "boolean"},
                "standard_rate": {"type": "number"},
                "default_warehouse": {"type": "string"},
            },
            "required": ["item_code", "item_name"],
        },
    },

    # ── HR ──
    {
        "name": "create_employee",
        "description": "Create a new employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "designation": {"type": "string"},
                "department": {"type": "string"},
                "date_of_joining": {"type": "string"},
                "gender": {"type": "string", "enum": ["Male", "Female", "Other"]},
                "date_of_birth": {"type": "string"},
                "cell_phone": {"type": "string"},
            },
            "required": ["first_name", "designation", "date_of_joining"],
        },
    },
    {
        "name": "mark_attendance",
        "description": "Mark attendance for an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string", "description": "Employee ID (e.g. HR-EMP-00001)"},
                "date": {"type": "string"},
                "status": {"type": "string", "enum": ["Present", "Absent", "Half Day", "On Leave"]},
            },
            "required": ["employee", "status"],
        },
    },
    {
        "name": "create_leave_application",
        "description": "Create a leave request.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "leave_type": {"type": "string"},
                "from_date": {"type": "string"},
                "to_date": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["employee", "leave_type", "from_date", "to_date", "reason"],
        },
    },

    # ── Inventory ──
    {
        "name": "create_stock_entry",
        "description": "Create a Stock Entry for material receipt, issue, transfer, or manufacture.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stock_entry_type": {
                    "type": "string",
                    "enum": ["Material Receipt", "Material Issue", "Material Transfer",
                             "Manufacture", "Repack", "Send to Subcontractor"],
                },
                "posting_date": {"type": "string"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "s_warehouse": {"type": "string"},
                            "t_warehouse": {"type": "string"},
                            "basic_rate": {"type": "number"},
                        },
                        "required": ["item_code", "qty"],
                    },
                },
                "from_bom": {"type": "boolean"},
                "bom_no": {"type": "string"},
                "fg_completed_qty": {"type": "number"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["stock_entry_type", "posting_date", "items"],
        },
    },
    {
        "name": "create_warehouse",
        "description": f"Create a new Warehouse.",
        "input_schema": {
            "type": "object",
            "properties": {
                "warehouse_name": {"type": "string"},
                "parent_warehouse": {"type": "string"},
            },
            "required": ["warehouse_name"],
        },
    },
    {
        "name": "create_bom",
        "description": "Create a Bill of Materials for manufacturing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item": {"type": "string", "description": "Finished product item_code"},
                "quantity": {"type": "number"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "uom": {"type": "string"},
                        },
                        "required": ["item_code", "qty"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["item", "quantity", "items"],
        },
    },
    {
        "name": "stock_reconciliation",
        "description": "Adjust stock to match physical count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {"type": "string"},
                "purpose": {"type": "string", "enum": ["Stock Reconciliation", "Opening Stock"]},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "warehouse": {"type": "string"},
                            "qty": {"type": "number"},
                            "valuation_rate": {"type": "number"},
                        },
                        "required": ["item_code", "warehouse", "qty"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["posting_date", "items"],
        },
    },

    # ── Buying & Procurement ──
    {
        "name": "create_purchase_order",
        "description": "Create a Purchase Order to order items from a supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {"type": "string"},
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "schedule_date": {"type": "string", "description": "YYYY-MM-DD — expected delivery date"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                            "warehouse": {"type": "string"},
                            "schedule_date": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "project": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["supplier", "transaction_date", "schedule_date", "items"],
        },
    },
    {
        "name": "create_purchase_receipt",
        "description": "Create a Purchase Receipt when goods are received from a supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {"type": "string"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                            "warehouse": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "purchase_order": {"type": "string", "description": "Link to Purchase Order if receiving against one"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["supplier", "posting_date", "items"],
        },
    },
    {
        "name": "create_delivery_note",
        "description": "Create a Delivery Note when shipping items to a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                            "warehouse": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "sales_order": {"type": "string", "description": "Link to Sales Order if delivering against one"},
                "project": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["customer", "posting_date", "items"],
        },
    },
    {
        "name": "create_material_request",
        "description": "Create a Material Request to request items for purchase, transfer, or manufacture.",
        "input_schema": {
            "type": "object",
            "properties": {
                "material_request_type": {
                    "type": "string",
                    "enum": ["Purchase", "Material Transfer", "Material Issue", "Manufacture", "Customer Provided"],
                },
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "schedule_date": {"type": "string", "description": "YYYY-MM-DD — required by date"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "warehouse": {"type": "string"},
                            "schedule_date": {"type": "string"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                        },
                        "required": ["item_code", "qty"],
                    },
                },
                "project": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["material_request_type", "transaction_date", "schedule_date", "items"],
        },
    },
    {
        "name": "create_item_price",
        "description": "Set a buying or selling price for an item in a price list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {"type": "string"},
                "price_list": {"type": "string", "description": "e.g. Standard Buying, Standard Selling"},
                "price_list_rate": {"type": "number"},
                "currency": {"type": "string", "description": "Default INR"},
                "buying": {"type": "boolean", "description": "True if buying price"},
                "selling": {"type": "boolean", "description": "True if selling price"},
            },
            "required": ["item_code", "price_list", "price_list_rate"],
        },
    },
    {
        "name": "create_quality_inspection",
        "description": "Create a Quality Inspection for incoming or outgoing items.",
        "input_schema": {
            "type": "object",
            "properties": {
                "inspection_type": {"type": "string", "enum": ["Incoming", "Outgoing", "In Process"]},
                "item_code": {"type": "string"},
                "reference_type": {"type": "string", "description": "e.g. Purchase Receipt, Delivery Note, Stock Entry"},
                "reference_name": {"type": "string"},
                "inspected_by": {"type": "string"},
                "readings": {
                    "type": "array",
                    "description": "Inspection parameter readings",
                    "items": {
                        "type": "object",
                        "properties": {
                            "specification": {"type": "string"},
                            "value": {"type": "string"},
                            "status": {"type": "string", "enum": ["Accepted", "Rejected"]},
                            "min_value": {"type": "number"},
                            "max_value": {"type": "number"},
                        },
                        "required": ["specification", "value", "status"],
                    },
                },
                "status": {"type": "string", "enum": ["Accepted", "Rejected"]},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["inspection_type", "item_code", "reference_type", "reference_name"],
        },
    },
    {
        "name": "create_landed_cost_voucher",
        "description": "Add additional costs (freight, customs, insurance) to purchased items via Purchase Receipts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "purchase_receipts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "receipt_document_type": {"type": "string", "description": "Usually 'Purchase Receipt'"},
                            "receipt_document": {"type": "string", "description": "Purchase Receipt name"},
                            "supplier": {"type": "string"},
                            "posting_date": {"type": "string"},
                            "grand_total": {"type": "number"},
                        },
                        "required": ["receipt_document_type", "receipt_document"],
                    },
                },
                "taxes": {
                    "type": "array",
                    "description": "Additional costs to distribute",
                    "items": {
                        "type": "object",
                        "properties": {
                            "expense_account": {"type": "string"},
                            "description": {"type": "string"},
                            "amount": {"type": "number"},
                        },
                        "required": ["expense_account", "description", "amount"],
                    },
                },
                "distribute_charges_based_on": {
                    "type": "string",
                    "enum": ["Qty", "Amount", "Distribute Manually"],
                    "description": "How to split additional costs across items. Default: Amount",
                },
                "submit": {"type": "boolean"},
            },
            "required": ["purchase_receipts", "taxes"],
        },
    },

    {
        "name": "create_request_for_quotation",
        "description": "Create a Request for Quotation to solicit quotes from multiple suppliers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "suppliers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "supplier": {"type": "string"},
                        },
                        "required": ["supplier"],
                    },
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "uom": {"type": "string"},
                            "warehouse": {"type": "string"},
                            "schedule_date": {"type": "string"},
                        },
                        "required": ["item_code", "qty"],
                    },
                },
                "schedule_date": {"type": "string", "description": "YYYY-MM-DD — default required-by date"},
                "message_for_supplier": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["transaction_date", "suppliers", "items"],
        },
    },
    {
        "name": "create_budget",
        "description": "Create a Budget against a Cost Center, Project, or Department for a fiscal year.",
        "input_schema": {
            "type": "object",
            "properties": {
                "budget_against": {"type": "string", "enum": ["Cost Center", "Project", "Department"]},
                "budget_against_value": {"type": "string", "description": "The actual cost center/project/department name"},
                "fiscal_year": {"type": "string", "description": "e.g. 2025-2026"},
                "accounts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account": {"type": "string"},
                            "budget_amount": {"type": "number"},
                        },
                        "required": ["account", "budget_amount"],
                    },
                },
                "monthly_distribution": {"type": "string"},
                "applicable_on_material_request": {"type": "boolean"},
                "applicable_on_purchase_order": {"type": "boolean"},
                "applicable_on_booking_actual_expenses": {"type": "boolean"},
                "action_if_annual_budget_exceeded": {"type": "string", "enum": ["Stop", "Warn", "Ignore"]},
                "action_if_accumulated_monthly_budget_exceeded": {"type": "string", "enum": ["Stop", "Warn", "Ignore"]},
            },
            "required": ["budget_against", "budget_against_value", "fiscal_year", "accounts"],
        },
    },
    {
        "name": "create_pricing_rule",
        "description": "Create a Pricing Rule for automatic discounts/rates on selling or buying transactions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "selling": {"type": "boolean"},
                "buying": {"type": "boolean"},
                "applicable_for": {
                    "type": "string",
                    "enum": ["Customer", "Customer Group", "Territory", "Supplier", "Supplier Group", "Campaign"],
                },
                "apply_on": {
                    "type": "string",
                    "enum": ["Item Code", "Item Group", "Brand", "Transaction"],
                },
                "items": {
                    "type": "array",
                    "description": "Items/groups/brands depending on apply_on",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "item_group": {"type": "string"},
                            "brand": {"type": "string"},
                        },
                    },
                },
                "min_qty": {"type": "number"},
                "max_qty": {"type": "number"},
                "min_amt": {"type": "number"},
                "max_amt": {"type": "number"},
                "rate_or_discount": {"type": "string", "enum": ["Discount Percentage", "Discount Amount", "Rate"]},
                "discount_percentage": {"type": "number"},
                "discount_amount": {"type": "number"},
                "rate": {"type": "number"},
                "valid_from": {"type": "string", "description": "YYYY-MM-DD"},
                "valid_upto": {"type": "string", "description": "YYYY-MM-DD"},
                "priority": {"type": "string"},
                "company": {"type": "string"},
            },
            "required": ["title", "selling", "buying", "applicable_for", "apply_on"],
        },
    },

    # ── CRM & Sales ──
    {
        "name": "create_lead",
        "description": "Create a new Lead (potential customer/prospect).",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_name": {"type": "string"},
                "company_name": {"type": "string"},
                "email_id": {"type": "string"},
                "phone": {"type": "string"},
                "source": {"type": "string", "enum": ["Advertisement", "Campaign", "Cold Calling", "Reference", "Website", "Existing Customer"]},
                "territory": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["lead_name"],
        },
    },
    {
        "name": "create_opportunity",
        "description": "Create an Opportunity (sales prospect from a Lead or Customer).",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_name": {"type": "string", "description": "Lead or Customer name"},
                "opportunity_from": {"type": "string", "enum": ["Lead", "Customer"]},
                "opportunity_type": {"type": "string", "enum": ["Sales", "Maintenance", "Support"]},
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "expected_closing": {"type": "string", "description": "YYYY-MM-DD"},
                "sales_stage": {"type": "string"},
                "source": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["party_name", "opportunity_from"],
        },
    },
    {
        "name": "create_quotation",
        "description": "Create a Quotation (price offer) for a Customer or Lead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_name": {"type": "string"},
                "quotation_to": {"type": "string", "enum": ["Customer", "Lead"]},
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "valid_till": {"type": "string", "description": "YYYY-MM-DD"},
                "order_type": {"type": "string", "enum": ["Sales", "Maintenance", "Shopping Cart"]},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["party_name", "items"],
        },
    },
    {
        "name": "create_sales_order",
        "description": "Create a Sales Order (confirmed order from a customer).",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string"},
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "delivery_date": {"type": "string", "description": "YYYY-MM-DD — required delivery date"},
                "order_type": {"type": "string", "enum": ["Sales", "Maintenance", "Shopping Cart"]},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                            "warehouse": {"type": "string"},
                            "delivery_date": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "project": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["customer", "delivery_date", "items"],
        },
    },
    {
        "name": "create_supplier_quotation",
        "description": "Record a price quote received from a supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {"type": "string"},
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "valid_till": {"type": "string", "description": "YYYY-MM-DD"},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "qty": {"type": "number"},
                            "rate": {"type": "number"},
                            "description": {"type": "string"},
                            "uom": {"type": "string"},
                        },
                        "required": ["item_code", "qty", "rate"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["supplier", "items"],
        },
    },

    # ── Address & Contact ──
    {
        "name": "create_address",
        "description": (
            "Create an Address and link it to a Customer, Supplier, Company, or Lead. "
            "Use for billing/shipping addresses."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "address_title": {"type": "string", "description": "e.g. customer/supplier name"},
                "address_type": {"type": "string", "enum": ["Billing", "Shipping", "Office", "Personal", "Plant", "Postal", "Shop", "Subsidiary", "Warehouse", "Other"]},
                "address_line1": {"type": "string"},
                "address_line2": {"type": "string"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "pincode": {"type": "string"},
                "country": {"type": "string"},
                "phone": {"type": "string"},
                "email_id": {"type": "string"},
                "is_primary_address": {"type": "boolean"},
                "is_shipping_address": {"type": "boolean"},
                "links": {
                    "type": "array",
                    "description": "Link to Customer/Supplier/Lead/Company",
                    "items": {
                        "type": "object",
                        "properties": {
                            "link_doctype": {"type": "string", "enum": ["Customer", "Supplier", "Lead", "Company"]},
                            "link_name": {"type": "string", "description": "Customer/Supplier/Lead/Company name"},
                        },
                        "required": ["link_doctype", "link_name"],
                    },
                },
            },
            "required": ["address_title", "address_type", "address_line1", "city", "country"],
        },
    },
    {
        "name": "create_contact",
        "description": (
            "Create a Contact person and link to a Customer, Supplier, or Company. "
            "For storing phone numbers, emails, and designations of people."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email_id": {"type": "string"},
                "phone": {"type": "string"},
                "mobile_no": {"type": "string"},
                "designation": {"type": "string"},
                "department": {"type": "string"},
                "is_primary_contact": {"type": "boolean"},
                "is_billing_contact": {"type": "boolean"},
                "links": {
                    "type": "array",
                    "description": "Link to Customer/Supplier/Company",
                    "items": {
                        "type": "object",
                        "properties": {
                            "link_doctype": {"type": "string", "enum": ["Customer", "Supplier", "Company"]},
                            "link_name": {"type": "string"},
                        },
                        "required": ["link_doctype", "link_name"],
                    },
                },
            },
            "required": ["first_name"],
        },
    },

    # ── HR Extended ──
    {
        "name": "create_expense_claim",
        "description": "Create an Expense Claim for employee reimbursement.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string", "description": "Employee ID (e.g. HR-EMP-00001)"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "expenses": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "expense_type": {"type": "string"},
                            "amount": {"type": "number"},
                            "description": {"type": "string"},
                            "sanctioned_amount": {"type": "number"},
                        },
                        "required": ["expense_type", "amount"],
                    },
                },
                "payable_account": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["employee", "expenses"],
        },
    },
    {
        "name": "create_salary_structure",
        "description": "Create a Salary Structure defining earning and deduction components.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name_template": {"type": "string", "description": "Name for this structure (e.g. 'Standard Monthly')"},
                "payroll_frequency": {"type": "string", "enum": ["Monthly", "Bimonthly", "Fortnightly", "Weekly"]},
                "earnings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "salary_component": {"type": "string"},
                            "amount": {"type": "number"},
                            "formula": {"type": "string"},
                            "depends_on_payment_days": {"type": "boolean"},
                        },
                        "required": ["salary_component"],
                    },
                },
                "deductions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "salary_component": {"type": "string"},
                            "amount": {"type": "number"},
                            "formula": {"type": "string"},
                        },
                        "required": ["salary_component"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["name_template", "payroll_frequency", "earnings"],
        },
    },
    {
        "name": "create_salary_slip",
        "description": "Create a Salary Slip for an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "start_date": {"type": "string"},
                "end_date": {"type": "string"},
                "payroll_frequency": {"type": "string", "enum": ["Monthly", "Bimonthly", "Fortnightly", "Weekly"]},
                "submit": {"type": "boolean"},
            },
            "required": ["employee"],
        },
    },
    {
        "name": "create_payroll_entry",
        "description": "Process payroll for multiple employees at once.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "payroll_frequency": {"type": "string", "enum": ["Monthly", "Bimonthly", "Fortnightly", "Weekly"]},
                "start_date": {"type": "string"},
                "end_date": {"type": "string"},
                "department": {"type": "string"},
                "branch": {"type": "string"},
                "designation": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["posting_date", "payroll_frequency"],
        },
    },
    {
        "name": "create_employee_advance",
        "description": "Create an Employee Advance (pre-payment against future expenses).",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "advance_amount": {"type": "number"},
                "purpose": {"type": "string"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "advance_account": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["employee", "advance_amount", "purpose"],
        },
    },
    {
        "name": "create_shift_assignment",
        "description": "Assign a shift to an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "shift_type": {"type": "string"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string"},
            },
            "required": ["employee", "shift_type", "start_date"],
        },
    },
    {
        "name": "create_training_event",
        "description": "Create a Training Event for employees.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_name": {"type": "string"},
                "start_time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                "end_time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                "type": {"type": "string", "enum": ["Seminar", "Theory", "Workshop"]},
                "trainer_name": {"type": "string"},
                "trainer_email": {"type": "string"},
                "introduction": {"type": "string"},
                "employees": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "employee": {"type": "string"},
                            "employee_name": {"type": "string"},
                        },
                        "required": ["employee"],
                    },
                },
            },
            "required": ["event_name", "start_time", "end_time"],
        },
    },
    {
        "name": "create_appraisal",
        "description": "Create an employee performance Appraisal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "appraisal_template": {"type": "string"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "goals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "kra": {"type": "string"},
                            "per_weightage": {"type": "number"},
                        },
                        "required": ["kra", "per_weightage"],
                    },
                },
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["employee", "appraisal_template", "start_date", "end_date"],
        },
    },

    {
        "name": "create_employee_checkin",
        "description": "Create an Employee Checkin record (clock in/out).",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string", "description": "Employee ID (e.g. HR-EMP-00001)"},
                "time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                "log_type": {"type": "string", "enum": ["IN", "OUT"]},
                "device_id": {"type": "string"},
            },
            "required": ["employee", "time"],
        },
    },
    {
        "name": "create_leave_allocation",
        "description": "Allocate leave balance to an employee for a leave type and period.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string", "description": "Employee ID (e.g. HR-EMP-00001)"},
                "leave_type": {"type": "string"},
                "new_leaves_allocated": {"type": "number"},
                "from_date": {"type": "string", "description": "YYYY-MM-DD"},
                "to_date": {"type": "string", "description": "YYYY-MM-DD"},
                "carry_forward": {"type": "boolean"},
                "submit": {"type": "boolean"},
            },
            "required": ["employee", "leave_type", "new_leaves_allocated", "from_date", "to_date"],
        },
    },

    # ── Assets ──
    {
        "name": "create_asset",
        "description": "Register a company Asset (equipment, vehicle, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_name": {"type": "string"},
                "item_code": {"type": "string"},
                "asset_category": {"type": "string"},
                "location": {"type": "string"},
                "purchase_date": {"type": "string", "description": "YYYY-MM-DD"},
                "gross_purchase_amount": {"type": "number"},
                "available_for_use_date": {"type": "string"},
                "is_existing_asset": {"type": "boolean"},
            },
            "required": ["asset_name", "item_code", "asset_category", "location"],
        },
    },
    {
        "name": "create_asset_movement",
        "description": "Create an Asset Movement to transfer, receive, or issue assets between locations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "purpose": {"type": "string", "enum": ["Transfer", "Receipt", "Issue"]},
                "assets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset": {"type": "string"},
                            "source_location": {"type": "string"},
                            "target_location": {"type": "string"},
                        },
                        "required": ["asset", "source_location", "target_location"],
                    },
                },
                "transaction_date": {"type": "string", "description": "YYYY-MM-DD"},
                "company": {"type": "string", "description": f"Default: {COMPANY}"},
                "submit": {"type": "boolean"},
            },
            "required": ["purpose", "assets"],
        },
    },
    {
        "name": "create_asset_maintenance",
        "description": "Create an Asset Maintenance schedule for preventive maintenance or calibration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_name": {"type": "string"},
                "item_code": {"type": "string"},
                "maintenance_team": {"type": "string"},
                "company": {"type": "string", "description": f"Default: {COMPANY}"},
                "maintenance_tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "maintenance_task": {"type": "string"},
                            "maintenance_type": {"type": "string", "enum": ["Preventive Maintenance", "Calibration"]},
                            "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                            "periodicity": {"type": "string", "enum": ["Daily", "Weekly", "Monthly", "Quarterly", "Yearly"]},
                            "assign_to": {"type": "string"},
                        },
                        "required": ["maintenance_task", "maintenance_type", "start_date", "periodicity"],
                    },
                },
            },
            "required": ["asset_name", "item_code"],
        },
    },

    # ── Manufacturing Extended ──
    {
        "name": "create_work_order",
        "description": "Create a Work Order for manufacturing a product from a BOM.",
        "input_schema": {
            "type": "object",
            "properties": {
                "production_item": {"type": "string", "description": "Item code of finished product"},
                "qty": {"type": "number"},
                "bom_no": {"type": "string", "description": "BOM name (e.g. BOM-ITEM-001)"},
                "planned_start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "expected_delivery_date": {"type": "string"},
                "project": {"type": "string"},
                "fg_warehouse": {"type": "string"},
                "wip_warehouse": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["production_item", "qty", "bom_no"],
        },
    },
    {
        "name": "create_job_card",
        "description": "Create a Job Card for tracking an operation in a Work Order.",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_order": {"type": "string"},
                "operation": {"type": "string"},
                "workstation": {"type": "string"},
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "for_quantity": {"type": "number"},
                "time_logs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "from_time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                            "to_time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                            "completed_qty": {"type": "number"},
                        },
                        "required": ["from_time", "to_time", "completed_qty"],
                    },
                },
                "employee": {"type": "string"},
                "remarks": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["work_order", "operation", "workstation"],
        },
    },
    {
        "name": "create_production_plan",
        "description": "Create a Production Plan to plan manufacturing based on Sales Orders or Material Requests.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {"type": "string", "description": "YYYY-MM-DD"},
                "get_items_from": {"type": "string", "enum": ["Sales Order", "Material Request"]},
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {"type": "string"},
                            "planned_qty": {"type": "number"},
                            "bom_no": {"type": "string"},
                            "warehouse": {"type": "string"},
                        },
                        "required": ["item_code", "planned_qty"],
                    },
                },
                "submit": {"type": "boolean"},
            },
            "required": ["posting_date"],
        },
    },

    # ── Subscription ──
    {
        "name": "create_subscription",
        "description": "Create a Subscription for recurring invoicing to a Customer or Supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_type": {"type": "string", "enum": ["Customer", "Supplier"]},
                "party": {"type": "string"},
                "plans": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "plan": {"type": "string"},
                            "qty": {"type": "number"},
                        },
                        "required": ["plan", "qty"],
                    },
                },
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "generate_invoice_at": {
                    "type": "string",
                    "enum": [
                        "Beginning of the current subscription period",
                        "End of the current subscription period",
                    ],
                },
                "submit_invoice": {"type": "boolean", "description": "Default: true"},
                "company": {"type": "string", "description": f"Default: {COMPANY}"},
            },
            "required": ["party_type", "party", "plans"],
        },
    },

    # ── Projects Extended ──
    {
        "name": "create_project",
        "description": "Create a new Project for R&D or client work.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {"type": "string"},
                "project_type": {"type": "string", "enum": ["External", "Internal", "Other"]},
                "expected_start_date": {"type": "string"},
                "expected_end_date": {"type": "string"},
                "customer": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["project_name"],
        },
    },
    {
        "name": "create_task",
        "description": "Create a Task (belongs to a Project).",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string"},
                "project": {"type": "string"},
                "priority": {"type": "string", "enum": ["Low", "Medium", "High", "Urgent"]},
                "exp_start_date": {"type": "string"},
                "exp_end_date": {"type": "string"},
                "description": {"type": "string"},
                "parent_task": {"type": "string"},
            },
            "required": ["subject"],
        },
    },
    {
        "name": "create_timesheet",
        "description": "Log time spent on projects/tasks via a Timesheet.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {"type": "string"},
                "time_logs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "activity_type": {"type": "string"},
                            "hours": {"type": "number"},
                            "from_time": {"type": "string", "description": "YYYY-MM-DD HH:MM:SS"},
                            "to_time": {"type": "string"},
                            "project": {"type": "string"},
                            "task": {"type": "string"},
                        },
                        "required": ["activity_type", "hours", "from_time"],
                    },
                },
                "note": {"type": "string"},
                "submit": {"type": "boolean"},
            },
            "required": ["time_logs"],
        },
    },

    # ── Generic Write ──
    {
        "name": "update_document",
        "description": "Update fields on an existing document. Returns: Updated document object. Only pass fields you want to change, not the entire document.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string"},
                "data": {"type": "object", "description": "Fields to update as key-value pairs"},
            },
            "required": ["doctype", "name", "data"],
        },
    },
    {
        "name": "submit_document",
        "description": "Submit a draft document (docstatus 0→1). Returns: Submitted document or error if already submitted/cancelled. Financial documents may require approval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string"},
            },
            "required": ["doctype", "name"],
        },
    },
    {
        "name": "cancel_document",
        "description": "Cancel a submitted document (docstatus 1→2). Manager/Admin only. Returns: Cancelled document. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string"},
            },
            "required": ["doctype", "name"],
        },
    },
    {
        "name": "delete_document",
        "description": "Permanently delete a cancelled/draft document. Admin only. IRREVERSIBLE. Returns: {\"status\": \"deleted\"}. Requires user confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string"},
            },
            "required": ["doctype", "name"],
        },
    },
    # ── BOM Amendment ──
    {
        "name": "amend_bom",
        "description": (
            "Amend a submitted BOM in one step: cancels the existing BOM, creates an amended copy "
            "with the requested changes, and submits the new version. Manager/Admin only.\n\n"
            "Use this when a user wants to change rates, quantities, or items in an active BOM.\n\n"
            "Example — change rate of item BKA01001 to 150:\n"
            "{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"items\": {\"BKA01001\": {\"rate\": 150}}}}\n\n"
            "Example — change quantity of item BKA02003 to 5:\n"
            "{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"items\": {\"BKA02003\": {\"qty\": 5}}}}\n\n"
            "Example — update a top-level field like quantity:\n"
            "{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"quantity\": 10}}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "The submitted BOM name to amend (e.g. BOM-BKC01004-001)"},
                "changes": {
                    "type": "object",
                    "description": "Changes to apply. Use 'items' key with item_code → {field: value} for item-level changes. Use top-level keys for BOM header fields.",
                    "properties": {
                        "items": {
                            "type": "object",
                            "description": "Item-level changes keyed by item_code. E.g. {\"BKA01001\": {\"rate\": 150, \"qty\": 3}}",
                        },
                        "quantity": {"type": "number", "description": "BOM quantity"},
                    },
                },
            },
            "required": ["name", "changes"],
        },
    },
    # ── Media & Search ──
    {
        "name": "erp_attach",
        "description": (
            "Attach a previously uploaded file (photo, PDF, voice note) to an ERPNext document. "
            "Use after creating/finding an ERPNext document to link evidence. "
            "Lists user's recent files if no file_prefix given."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "e.g. Purchase Invoice"},
                "docname": {"type": "string", "description": "e.g. ACC-PINV-2026-00001"},
                "file_prefix": {
                    "type": "string",
                    "description": "Start of the file_id returned when the user uploaded the file",
                },
            },
            "required": ["doctype", "docname"],
        },
    },
    {
        "name": "semantic_search",
        "description": (
            "Semantic search across all uploaded media (voice notes, photos, PDFs, invoices). "
            "Use to find past documents by meaning, not just keywords. "
            "Returns top matching files with their transcripts and ERP links."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "top_k": {"type": "number", "description": "Max results (default 5)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_print_pdf",
        "description": (
            "Download a printable PDF of any ERPNext document (invoice, order, receipt, etc.) "
            "and send it to the user. Use when user asks for a PDF, printout, or wants to share/download a document."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "e.g. Sales Invoice, Purchase Order, Quotation"},
                "name": {"type": "string", "description": "Document name e.g. ACC-SINV-2026-00001"},
                "print_format": {"type": "string", "description": "Optional print format name. Leave blank for default."},
            },
            "required": ["doctype", "name"],
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # NEW TOOLS — System Configuration, Customization & Automation
    # ═══════════════════════════════════════════════════════════════

    # ── DocType Structure & Customization ──
    {
        "name": "list_doctype_fields",
        "description": (
            "Get all fields of a DocType (standard + custom). Use this to understand DocType structure, "
            "find field names, check field types, see what's required, etc. Essential before modifying "
            "DocType structure.\n\n"
            "Example: {\"doctype\": \"Sales Invoice\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "DocType name e.g. Sales Invoice, Customer, Item"},
            },
            "required": ["doctype"],
        },
    },
    {
        "name": "create_custom_field",
        "description": (
            "Add a Custom Field to any DocType. This is how you extend ERPNext without modifying core code. "
            "Admin only. Use to add new fields to forms.\n\n"
            "Field types: Data, Text, Small Text, Long Text, Text Editor, HTML Editor, Select, Link, "
            "Dynamic Link, Check, Int, Float, Currency, Date, Datetime, Time, Duration, Phone, "
            "Autocomplete, Password, Read Only, Section Break, Column Break, Tab Break, "
            "Table, Table MultiSelect, Attach, Attach Image, Color, Barcode, Geolocation, Rating.\n\n"
            "Example — Add a custom 'Brand Ambassador' field to Customer:\n"
            "{\"doctype\": \"Customer\", \"fieldname\": \"brand_ambassador\", \"label\": \"Brand Ambassador\", "
            "\"fieldtype\": \"Data\", \"insert_after\": \"customer_name\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "Target DocType to add field to"},
                "fieldname": {"type": "string", "description": "Internal field name (lowercase, underscores)"},
                "label": {"type": "string", "description": "Display label"},
                "fieldtype": {
                    "type": "string",
                    "description": "Field type",
                    "enum": ["Data", "Text", "Small Text", "Long Text", "Text Editor", "HTML Editor",
                             "Select", "Link", "Dynamic Link", "Check", "Int", "Float", "Currency",
                             "Date", "Datetime", "Time", "Duration", "Phone", "Autocomplete",
                             "Password", "Read Only", "Section Break", "Column Break", "Tab Break",
                             "Table", "Table MultiSelect", "Attach", "Attach Image", "Color",
                             "Barcode", "Geolocation", "Rating", "HTML", "Heading", "Image"],
                },
                "insert_after": {"type": "string", "description": "Fieldname after which to insert this field"},
                "options": {
                    "type": "string",
                    "description": "For Select: newline-separated options. For Link: target DocType. For Table: child DocType.",
                },
                "default": {"type": "string", "description": "Default value"},
                "reqd": {"type": "boolean", "description": "Is this field mandatory?"},
                "hidden": {"type": "boolean", "description": "Hide field from form view?"},
                "read_only": {"type": "boolean", "description": "Make field read-only?"},
                "unique": {"type": "boolean", "description": "Enforce unique values?"},
                "in_list_view": {"type": "boolean", "description": "Show in list view?"},
                "in_standard_filter": {"type": "boolean", "description": "Add to standard filters?"},
                "description": {"type": "string", "description": "Help text shown below field"},
                "depends_on": {"type": "string", "description": "Conditional visibility formula e.g. eval:doc.status=='Active'"},
                "mandatory_depends_on": {"type": "string", "description": "Conditional mandatory formula"},
                "fetch_from": {"type": "string", "description": "Auto-fetch from linked field e.g. customer.customer_name"},
                "fetch_if_empty": {"type": "boolean", "description": "Only fetch if field is empty"},
                "allow_on_submit": {"type": "boolean", "description": "Allow editing after submit"},
                "bold": {"type": "boolean", "description": "Show in bold"},
                "collapsible": {"type": "boolean", "description": "For Section Break: make collapsible"},
                "collapsible_depends_on": {"type": "string", "description": "Conditional collapse formula"},
            },
            "required": ["doctype", "fieldname", "label", "fieldtype"],
        },
    },
    {
        "name": "modify_doctype_property",
        "description": (
            "Modify a property of an existing field in a DocType using Property Setter. "
            "This is the 'Customize Form' equivalent via API. Admin only.\n\n"
            "Common properties you can change:\n"
            "- label: Change display name\n"
            "- reqd: Make mandatory (1) or optional (0)\n"
            "- hidden: Hide (1) or show (0)\n"
            "- read_only: Make read-only (1) or editable (0)\n"
            "- default: Set default value\n"
            "- options: Change select options or link target\n"
            "- in_list_view: Show in list view (1/0)\n"
            "- in_standard_filter: Add to filters (1/0)\n"
            "- description: Change help text\n"
            "- allow_on_submit: Allow editing after submit (1/0)\n"
            "- bold: Make bold (1/0)\n"
            "- print_hide: Hide from print (1/0)\n"
            "- permlevel: Permission level\n"
            "- width: Column width in list\n"
            "- depends_on: Conditional visibility\n\n"
            "Example — Make customer_name mandatory on Customer:\n"
            "{\"doctype\": \"Customer\", \"fieldname\": \"customer_name\", \"property\": \"reqd\", \"value\": \"1\"}\n\n"
            "Example — Change label:\n"
            "{\"doctype\": \"Item\", \"fieldname\": \"item_name\", \"property\": \"label\", \"value\": \"Product Name\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "Target DocType"},
                "fieldname": {"type": "string", "description": "Field to modify"},
                "property": {
                    "type": "string",
                    "description": "Property to change",
                    "enum": ["label", "reqd", "hidden", "read_only", "default", "options",
                             "in_list_view", "in_standard_filter", "description", "allow_on_submit",
                             "bold", "print_hide", "permlevel", "width", "depends_on",
                             "mandatory_depends_on", "read_only_depends_on", "fetch_from",
                             "fetch_if_empty", "translatable", "fieldtype", "precision",
                             "columns", "collapsible", "collapsible_depends_on"],
                },
                "value": {"type": "string", "description": "New value for the property"},
            },
            "required": ["doctype", "fieldname", "property", "value"],
        },
    },
    {
        "name": "delete_custom_field",
        "description": "Delete a Custom Field from a DocType. Only custom fields can be deleted, not standard ones. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "custom_field_name": {
                    "type": "string",
                    "description": "Custom Field name (format: 'DocType-fieldname' e.g. 'Customer-brand_ambassador')",
                },
            },
            "required": ["custom_field_name"],
        },
    },
    {
        "name": "list_doctypes",
        "description": (
            "List available DocTypes in the system. Filter by module, custom status, or search by name. "
            "Use to discover what DocTypes exist.\n\n"
            "Example: {\"module\": \"Accounts\"}\n"
            "Example: {\"search\": \"invoice\"}\n"
            "Example: {\"is_custom\": true}  — list only custom DocTypes"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "module": {"type": "string", "description": "Filter by module e.g. Accounts, HR, Stock, Selling, Buying"},
                "search": {"type": "string", "description": "Search DocType names"},
                "is_custom": {"type": "boolean", "description": "Only show custom DocTypes"},
                "limit": {"type": "number", "description": "Max results (default 50)"},
            },
        },
    },

    # ── Role Permissions ──
    {
        "name": "manage_role_permission",
        "description": (
            "Add or modify role permissions for a DocType. Admin only. "
            "Controls who can read/write/create/delete/submit/amend documents.\n\n"
            "Example — Give 'Sales User' write access to Quotation:\n"
            "{\"doctype\": \"Quotation\", \"role\": \"Sales User\", \"permlevel\": 0, "
            "\"permissions\": {\"read\": 1, \"write\": 1, \"create\": 1, \"delete\": 0, \"submit\": 0}}\n\n"
            "Example — Remove delete permission for 'Accounts User' on Journal Entry:\n"
            "{\"doctype\": \"Journal Entry\", \"role\": \"Accounts User\", \"permlevel\": 0, "
            "\"permissions\": {\"delete\": 0}}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "Target DocType"},
                "role": {"type": "string", "description": "Role name e.g. 'System Manager', 'Accounts User', 'Sales User'"},
                "permlevel": {"type": "number", "description": "Permission level (0 = top level, default 0)"},
                "permissions": {
                    "type": "object",
                    "description": "Permission flags to set",
                    "properties": {
                        "read": {"type": "number", "description": "Can read (0/1)"},
                        "write": {"type": "number", "description": "Can write/edit (0/1)"},
                        "create": {"type": "number", "description": "Can create new (0/1)"},
                        "delete": {"type": "number", "description": "Can delete (0/1)"},
                        "submit": {"type": "number", "description": "Can submit (0/1)"},
                        "cancel": {"type": "number", "description": "Can cancel (0/1)"},
                        "amend": {"type": "number", "description": "Can amend (0/1)"},
                        "report": {"type": "number", "description": "Can view reports (0/1)"},
                        "export": {"type": "number", "description": "Can export (0/1)"},
                        "import": {"type": "number", "description": "Can import (0/1)"},
                        "print": {"type": "number", "description": "Can print (0/1)"},
                        "email": {"type": "number", "description": "Can email (0/1)"},
                        "share": {"type": "number", "description": "Can share (0/1)"},
                    },
                },
            },
            "required": ["doctype", "role", "permissions"],
        },
    },
    {
        "name": "list_roles",
        "description": "List all roles in the system. Use to find valid role names before managing permissions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search role names"},
            },
        },
    },
    {
        "name": "list_role_permissions",
        "description": "List current permissions for a DocType across all roles.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string", "description": "DocType to check permissions for"},
            },
            "required": ["doctype"],
        },
    },

    # ── Workflows ──
    {
        "name": "create_workflow",
        "description": (
            "Create an approval Workflow for a DocType. Admin only. "
            "Workflows define states and transitions (who can approve/reject and move between states).\n\n"
            "Example — Simple approval workflow for Purchase Order:\n"
            "{\"workflow_name\": \"PO Approval\", \"document_type\": \"Purchase Order\", "
            "\"workflow_state_field\": \"workflow_state\", \"is_active\": true, "
            "\"states\": ["
            "{\"state\": \"Draft\", \"doc_status\": 0, \"allow_edit\": \"Accounts User\"}, "
            "{\"state\": \"Pending Approval\", \"doc_status\": 0, \"allow_edit\": \"Accounts Manager\"}, "
            "{\"state\": \"Approved\", \"doc_status\": 1, \"allow_edit\": \"Accounts Manager\"}, "
            "{\"state\": \"Rejected\", \"doc_status\": 0, \"allow_edit\": \"Accounts Manager\"}], "
            "\"transitions\": ["
            "{\"state\": \"Draft\", \"action\": \"Submit for Approval\", \"next_state\": \"Pending Approval\", \"allowed\": \"Accounts User\"}, "
            "{\"state\": \"Pending Approval\", \"action\": \"Approve\", \"next_state\": \"Approved\", \"allowed\": \"Accounts Manager\"}, "
            "{\"state\": \"Pending Approval\", \"action\": \"Reject\", \"next_state\": \"Rejected\", \"allowed\": \"Accounts Manager\"}]}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_name": {"type": "string"},
                "document_type": {"type": "string", "description": "DocType this workflow applies to"},
                "workflow_state_field": {"type": "string", "description": "Field to store state (default: workflow_state)"},
                "is_active": {"type": "boolean", "description": "Activate immediately? Default true"},
                "override_status": {"type": "boolean", "description": "Override document Status field with workflow state"},
                "send_email_alert": {"type": "boolean", "description": "Send email on state change"},
                "states": {
                    "type": "array",
                    "description": "Workflow states",
                    "items": {
                        "type": "object",
                        "properties": {
                            "state": {"type": "string", "description": "State name e.g. Draft, Pending Approval, Approved"},
                            "doc_status": {"type": "number", "description": "0=Draft, 1=Submitted, 2=Cancelled"},
                            "allow_edit": {"type": "string", "description": "Role that can edit in this state"},
                            "is_optional_state": {"type": "boolean"},
                            "update_field": {"type": "string", "description": "Field to update when entering this state"},
                            "update_value": {"type": "string", "description": "Value to set in update_field"},
                        },
                        "required": ["state", "doc_status", "allow_edit"],
                    },
                },
                "transitions": {
                    "type": "array",
                    "description": "State transitions (who can move from one state to another)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "state": {"type": "string", "description": "Current state"},
                            "action": {"type": "string", "description": "Button label e.g. Approve, Reject, Submit"},
                            "next_state": {"type": "string", "description": "Target state after action"},
                            "allowed": {"type": "string", "description": "Role allowed to perform this transition"},
                            "allow_self_approval": {"type": "boolean"},
                            "condition": {"type": "string", "description": "Python condition e.g. doc.grand_total < 50000"},
                        },
                        "required": ["state", "action", "next_state", "allowed"],
                    },
                },
            },
            "required": ["workflow_name", "document_type", "states", "transitions"],
        },
    },

    # ── Print Formats ──
    {
        "name": "create_print_format",
        "description": (
            "Create a custom Print Format for any DocType. Admin only. "
            "Supports HTML/Jinja templates for invoices, orders, receipts, etc.\n\n"
            "Use Jinja2 template syntax with access to:\n"
            "- doc: the document object\n"
            "- doc.items: child table rows\n"
            "- frappe.format_value(): format numbers/dates\n"
            "- frappe.utils: utility functions\n\n"
            "Example — Simple Sales Invoice print:\n"
            "{\"name\": \"DSPL Invoice\", \"doc_type\": \"Sales Invoice\", \"print_format_type\": \"Jinja\", "
            "\"html\": \"<h1>{{ doc.company }}</h1><p>Invoice: {{ doc.name }}</p>...\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Print format name"},
                "doc_type": {"type": "string", "description": "DocType this format applies to"},
                "print_format_type": {"type": "string", "enum": ["Jinja", "JS"], "description": "Template type (Jinja recommended)"},
                "html": {"type": "string", "description": "HTML/Jinja template content"},
                "css": {"type": "string", "description": "Custom CSS styles"},
                "custom_format": {"type": "boolean", "description": "Is custom format? Default true"},
                "standard": {"type": "string", "description": "No for custom formats"},
                "default_print_language": {"type": "string", "description": "Default language e.g. en"},
                "align_labels_right": {"type": "boolean"},
                "show_section_headings": {"type": "boolean"},
                "line_breaks": {"type": "boolean"},
                "disabled": {"type": "boolean"},
            },
            "required": ["name", "doc_type", "html"],
        },
    },
    {
        "name": "list_print_formats",
        "description": "List print formats for a DocType. Shows both standard and custom formats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doc_type": {"type": "string", "description": "DocType to list print formats for"},
            },
            "required": ["doc_type"],
        },
    },

    # ── Letter Head ──
    {
        "name": "create_letter_head",
        "description": (
            "Create a Letter Head for use in print formats. Admin only. "
            "Letter heads appear at the top of printed documents.\n\n"
            "Example: {\"letter_head_name\": \"DSPL Official\", "
            "\"content\": \"<div style='text-align:center'><h2>Dynamic Servitech Pvt Ltd</h2>"
            "<p>Electronic Solutions for Heavy Equipment</p></div>\", \"is_default\": true}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "letter_head_name": {"type": "string"},
                "content": {"type": "string", "description": "HTML content for the header"},
                "footer": {"type": "string", "description": "HTML content for footer"},
                "is_default": {"type": "boolean", "description": "Set as default letter head?"},
                "disabled": {"type": "boolean"},
            },
            "required": ["letter_head_name", "content"],
        },
    },

    # ── Notification Rules ──
    {
        "name": "create_notification",
        "description": (
            "Create an automatic Notification/Alert rule. Admin only. "
            "Sends email/system notification when conditions are met.\n\n"
            "Events: New, Save, Submit, Cancel, Days After, Days Before, Value Change, Method, Custom.\n\n"
            "Example — Email alert when Sales Invoice is overdue:\n"
            "{\"subject\": \"Overdue Invoice: {{ doc.name }}\", \"document_type\": \"Sales Invoice\", "
            "\"event\": \"Days After\", \"days_in_advance\": -1, \"date_changed\": \"due_date\", "
            "\"channel\": \"Email\", \"recipients\": [{\"receiver_by_document_field\": \"contact_email\"}], "
            "\"message\": \"Dear {{ doc.customer }}, Invoice {{ doc.name }} for Rs. {{ doc.grand_total }} is overdue.\"}\n\n"
            "Example — System notification on new Lead:\n"
            "{\"subject\": \"New Lead: {{ doc.lead_name }}\", \"document_type\": \"Lead\", "
            "\"event\": \"New\", \"channel\": \"System Notification\", "
            "\"recipients\": [{\"receiver_by_role\": \"Sales Manager\"}], "
            "\"message\": \"New lead {{ doc.lead_name }} from {{ doc.source }}\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "Notification subject (Jinja supported)"},
                "document_type": {"type": "string", "description": "DocType to watch"},
                "event": {
                    "type": "string",
                    "enum": ["New", "Save", "Submit", "Cancel", "Days After", "Days Before",
                             "Value Change", "Method", "Custom"],
                },
                "channel": {
                    "type": "string",
                    "enum": ["Email", "System Notification", "SMS", "Slack"],
                    "description": "Notification channel (default Email)",
                },
                "message": {"type": "string", "description": "Message body (Jinja/HTML supported)"},
                "message_type": {"type": "string", "enum": ["Markdown", "HTML"], "description": "Default Markdown"},
                "condition": {"type": "string", "description": "Python condition e.g. doc.grand_total > 50000"},
                "recipients": {
                    "type": "array",
                    "description": "Who to notify",
                    "items": {
                        "type": "object",
                        "properties": {
                            "receiver_by_document_field": {"type": "string", "description": "Field containing email e.g. contact_email"},
                            "receiver_by_role": {"type": "string", "description": "Role to notify e.g. Accounts Manager"},
                            "cc": {"type": "string"},
                            "bcc": {"type": "string"},
                        },
                    },
                },
                "days_in_advance": {"type": "number", "description": "For Days After/Before events. Negative = days after."},
                "date_changed": {"type": "string", "description": "Date field to check for Days After/Before"},
                "value_changed": {"type": "string", "description": "Field to watch for Value Change event"},
                "set_property_after_alert": {"type": "string", "description": "Field to update after alert is sent"},
                "property_value": {"type": "string", "description": "Value to set in the field"},
                "enabled": {"type": "boolean", "description": "Enable immediately? Default true"},
            },
            "required": ["subject", "document_type", "event", "message"],
        },
    },

    # ── Email ──
    {
        "name": "send_email",
        "description": (
            "Send an email through ERPNext's email system. Can be linked to a document for tracking.\n\n"
            "Example: {\"recipients\": \"client@example.com\", \"subject\": \"Invoice Attached\", "
            "\"message\": \"Please find the invoice attached.\", \"reference_doctype\": \"Sales Invoice\", "
            "\"reference_name\": \"ACC-SINV-2026-00001\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "recipients": {"type": "string", "description": "Comma-separated email addresses"},
                "subject": {"type": "string"},
                "message": {"type": "string", "description": "Email body (HTML supported)"},
                "cc": {"type": "string", "description": "CC email addresses (comma-separated)"},
                "bcc": {"type": "string", "description": "BCC email addresses (comma-separated)"},
                "reference_doctype": {"type": "string", "description": "Link email to a DocType"},
                "reference_name": {"type": "string", "description": "Link email to a specific document"},
            },
            "required": ["recipients", "subject", "message"],
        },
    },

    # ── Bulk Operations ──
    {
        "name": "bulk_update",
        "description": (
            "Mass update multiple records of the same DocType with the same field values. "
            "Provide filters to select records or explicit list of names.\n\n"
            "Example — Mark all open leads as 'Replied':\n"
            "{\"doctype\": \"Lead\", \"filters\": [[\"status\", \"=\", \"Open\"]], "
            "\"data\": {\"status\": \"Replied\"}}\n\n"
            "Example — Update specific items:\n"
            "{\"doctype\": \"Item\", \"names\": [\"ITEM-001\", \"ITEM-002\"], "
            "\"data\": {\"item_group\": \"Finished Goods\"}}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "filters": {"type": "array", "description": "Filters to select records", "items": {"type": "array"}},
                "names": {
                    "type": "array",
                    "description": "Explicit list of document names to update",
                    "items": {"type": "string"},
                },
                "data": {"type": "object", "description": "Fields to update as key-value pairs"},
                "limit": {"type": "number", "description": "Max records to update (default 50, max 200)"},
            },
            "required": ["doctype", "data"],
        },
    },

    # ── Data Export ──
    {
        "name": "export_records",
        "description": (
            "Export records as CSV data. Generates a CSV file and sends it to the user. "
            "Use for data export, generating Excel-ready data, or creating reports.\n\n"
            "Example — Export all customers:\n"
            "{\"doctype\": \"Customer\", \"fields\": [\"name\", \"customer_name\", \"customer_group\", \"territory\"]}\n\n"
            "Example — Export sales invoices for March:\n"
            "{\"doctype\": \"Sales Invoice\", \"filters\": [[\"posting_date\", \">=\", \"2026-03-01\"]], "
            "\"fields\": [\"name\", \"customer\", \"posting_date\", \"grand_total\", \"status\"], \"limit\": 100}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "filters": {"type": "array", "items": {"type": "array"}},
                "fields": {
                    "type": "array",
                    "description": "Fields to include in export",
                    "items": {"type": "string"},
                },
                "order_by": {"type": "string"},
                "limit": {"type": "number", "description": "Max records (default 100, max 500)"},
            },
            "required": ["doctype", "fields"],
        },
    },

    # ── Document Operations ──
    {
        "name": "rename_document",
        "description": (
            "Rename a document (change its ID/name). Admin only.\n\n"
            "Example: {\"doctype\": \"Item\", \"old_name\": \"ITEM-OLD\", \"new_name\": \"ITEM-NEW\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "old_name": {"type": "string"},
                "new_name": {"type": "string"},
                "merge": {"type": "boolean", "description": "Merge with existing record of same name? Default false."},
            },
            "required": ["doctype", "old_name", "new_name"],
        },
    },
    {
        "name": "amend_document",
        "description": (
            "Create an amended copy of a cancelled document. Use when a submitted document was cancelled "
            "and needs to be re-created with modifications.\n\n"
            "Example: {\"doctype\": \"Sales Invoice\", \"name\": \"ACC-SINV-2026-00001\"}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {"type": "string"},
                "name": {"type": "string", "description": "The cancelled document to amend"},
            },
            "required": ["doctype", "name"],
        },
    },

    # ── System Settings ──
    {
        "name": "get_system_settings",
        "description": "View current system settings (language, timezone, email, etc.). Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "update_system_settings",
        "description": (
            "Update ERPNext system settings. Admin only. Use with caution.\n\n"
            "Common settings: language, time_zone, date_format, number_format, "
            "currency_precision, float_precision, country, disable_rounded_total.\n\n"
            "Example: {\"settings\": {\"date_format\": \"dd-mm-yyyy\", \"currency_precision\": 2}}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "settings": {
                    "type": "object",
                    "description": "Settings to update as key-value pairs",
                },
            },
            "required": ["settings"],
        },
    },

    # ── User Management ──
    {
        "name": "list_erp_users",
        "description": "List ERPNext users with their roles and status. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "description": "Filter by enabled status"},
                "search": {"type": "string", "description": "Search by name or email"},
            },
        },
    },
    {
        "name": "manage_user_roles",
        "description": (
            "Add or remove roles for an ERPNext user. Admin only.\n\n"
            "Example — Add 'Accounts User' role:\n"
            "{\"user\": \"vaishali@dspl.com\", \"add_roles\": [\"Accounts User\", \"Sales User\"]}\n\n"
            "Example — Remove a role:\n"
            "{\"user\": \"employee@dspl.com\", \"remove_roles\": [\"System Manager\"]}"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "user": {"type": "string", "description": "User email/ID"},
                "add_roles": {"type": "array", "items": {"type": "string"}, "description": "Roles to add"},
                "remove_roles": {"type": "array", "items": {"type": "string"}, "description": "Roles to remove"},
            },
            "required": ["user"],
        },
    },

    # ── Backups ──
    {
        "name": "get_backup_info",
        "description": "Get information about recent backups and backup configuration. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },

    # ── Natural Language Field Action Tools (self-service via chat) ──
    {
        "name": "chat_mark_attendance",
        "description": "Mark attendance (check in or check out) for the employee. Note: GPS is not available via chat. For GPS attendance, direct the user to the DSPL Mini App.",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_type": {"type": "string", "enum": ["Checkin", "Checkout"], "description": "Checkin or Checkout"}
            },
            "required": ["log_type"],
        },
    },
    {
        "name": "log_visit",
        "description": "Create a Daily Call Report (customer visit log) for the employee. Use when they mention visiting a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {"type": "string", "description": "Customer name or ID"},
                "department": {"type": "string", "enum": ["Sales", "Service", "Office"]},
                "visit_purpose": {"type": "string", "description": "Sales: Cold Call / New Enquiry, Lead Follow-up, Quotation Follow-up, Order Follow-up, Recovery, Relationship Building"},
                "service_purpose": {"type": "string", "description": "Service: Installation, Breakdown / Repair, Preventive Maintenance (AMC), Commissioning, Training, Warranty Service, Inspection"},
                "remarks": {"type": "string", "description": "Visit notes"},
            },
            "required": ["customer"],
        },
    },
    {
        "name": "apply_leave_for_employee",
        "description": "Apply for leave. Parse dates and leave type from the employee's message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "leave_type": {"type": "string", "enum": ["Casual Leave", "Sick Leave", "Privilege Leave", "Compensatory Off", "Leave Without Pay"]},
                "from_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                "to_date": {"type": "string", "description": "End date YYYY-MM-DD"},
                "half_day": {"type": "integer", "enum": [0, 1]},
                "reason": {"type": "string"},
            },
            "required": ["leave_type", "from_date", "to_date"],
        },
    },
    {
        "name": "submit_expense_for_employee",
        "description": "Create an expense claim with one or more line items. Parse amounts and types from the employee's message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expenses": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "expense_type": {"type": "string"},
                            "amount": {"type": "number"},
                            "description": {"type": "string"},
                        },
                        "required": ["expense_type", "amount"],
                    },
                },
            },
            "required": ["expenses"],
        },
    },
    {
        "name": "request_advance_for_employee",
        "description": "Request an employee advance. Parse amount and purpose from the message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {"type": "number", "description": "Amount in INR"},
                "purpose": {"type": "string", "description": "Purpose of advance"},
            },
            "required": ["amount", "purpose"],
        },
    },
    {
        "name": "team_status",
        "description": "Show today's team attendance status — who's checked in, who's in the field, who's absent. Manager/admin only.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "my_daily_summary",
        "description": "Show the employee's personal daily summary including attendance status, visits logged, and any pending requests.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "query_view",
        "description": (
            "Query a composable business view from the View Engine. Returns role-filtered, "
            "parallel-fetched data from ERPNext.\n\n"
            "Available views:\n"
            "- sales_pipeline: Leads, opportunities, quotations, sales orders\n"
            "- customer_360: Full customer history (quotes, orders, invoices, visits). Requires context_id=customer_name\n"
            "- debtor_dashboard: Outstanding receivables, overdue invoices, recent payments\n"
            "- project_hub: Cross-role project view (tasks, orders, invoices). Requires context_id=project_name\n"
            "- amc_tracker: Active maintenance schedules and upcoming visits\n"
            "- my_targets: Quotation/order summary and visit stats for current FY\n"
            "- follow_ups: Quotations needing follow-up (expiring, open, lost)\n"
            "- customer_visits: Visit frequency tracking\n\n"
            "Examples:\n"
            "- 'Show sales pipeline': query_view(view_name='sales_pipeline')\n"
            "- 'Customer 360 for L&T': query_view(view_name='customer_360', context_id='Larsen & Toubro ltd')\n"
            "- 'Debtor aging': query_view(view_name='debtor_dashboard')\n"
            "- 'My targets': query_view(view_name='my_targets')\n"
            "- 'Follow up needed': query_view(view_name='follow_ups')\n"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "view_name": {
                    "type": "string",
                    "description": "Name of the view to query",
                    "enum": ["sales_pipeline", "customer_360", "debtor_dashboard", "project_hub", "amc_tracker", "my_targets", "follow_ups", "customer_visits"],
                },
                "context_id": {
                    "type": "string",
                    "description": "Context identifier (customer name for customer_360, project name for project_hub). Required for context-dependent views.",
                },
            },
            "required": ["view_name"],
        },
    },
    # ── Memory Tools ──
    {
        "name": "save_memory",
        "description": (
            "Save a fact or preference for future conversations. Use when you learn something "
            "about the user or their workflow that should persist across sessions.\n\n"
            "Examples: preferred report format, key customer names, common queries, workflow preferences."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Topic identifier, e.g. 'preferred_format', 'key_customer_tata'",
                },
                "content": {
                    "type": "string",
                    "description": "The knowledge to remember for future conversations",
                },
            },
            "required": ["key", "content"],
        },
    },
    {
        "name": "get_memories",
        "description": "Retrieve all saved memories/preferences for the current user. Use to recall past context.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]


def _resolve_employee_for_chat(user_id):
    """Look up employee mapping for a chat user.
    Note: On Frappe Cloud, this is handled by the session/auth layer, not the old SQLite store.
    """
    try:
        import store
        mapping = store.get_employee_by_telegram(str(user_id))
        if not mapping:
            return None, None
        return mapping["employee_id"], mapping
    except ImportError:
        return None, None


def execute_tool(tool_name, tool_input, erp_client, user_role,
                 user_id=None, user_name=None):
    """Execute a tool call. Returns JSON string."""
    try:
        # ── Approval interception for financial document submissions ──
        _SUBMIT_CREATE_TOOLS = {
            "create_journal_entry":    "Journal Entry",
            "create_payment_entry":    "Payment Entry",
            "create_sales_invoice":    "Sales Invoice",
            "create_purchase_invoice": "Purchase Invoice",
            "create_stock_entry":      "Stock Entry",
            "stock_reconciliation":    "Stock Reconciliation",
            "create_bom":              "BOM",
            "create_purchase_order":   "Purchase Order",
            "create_purchase_receipt": "Purchase Receipt",
            "create_delivery_note":    "Delivery Note",
            "create_material_request": "Material Request",
            "create_quality_inspection": "Quality Inspection",
            "create_landed_cost_voucher": "Landed Cost Voucher",
            "create_quotation":          "Quotation",
            "create_sales_order":        "Sales Order",
            "create_supplier_quotation": "Supplier Quotation",
            "create_expense_claim":      "Expense Claim",
            "create_salary_slip":        "Salary Slip",
            "create_payroll_entry":      "Payroll Entry",
            "create_employee_advance":   "Employee Advance",
            "create_appraisal":          "Appraisal",
            "create_work_order":         "Work Order",
            "create_timesheet":          "Timesheet",
            "create_request_for_quotation": "Request for Quotation",
            "create_leave_allocation":   "Leave Allocation",
            "create_job_card":           "Job Card",
            "create_production_plan":    "Production Plan",
            "create_asset_movement":     "Asset Movement",
        }
        if tool_name in _SUBMIT_CREATE_TOOLS and tool_input.get("submit"):
            import approvals_engine as ae
            doctype = _SUBMIT_CREATE_TOOLS[tool_name]
            amount = ae.get_amount(doctype, tool_input)
            if ae.needs_approval(doctype, amount, user_role):
                tool_input = dict(tool_input)
                tool_input["submit"] = False  # create as draft only
                description = f"{tool_name.replace('_', ' ').title()} for ₹{amount:,.0f}"
                return ae.create_financial_approval(
                    user_id or 0, user_name or "unknown", user_role,
                    doctype, "(pending creation)", amount, description,
                )
        # ── Confirmation gate for destructive tools ──
        if tool_name in ("cancel_document", "delete_document"):
            doctype = tool_input.get("doctype", "unknown")
            doc_name = tool_input.get("name", "unknown")
            action = "cancel" if tool_name == "cancel_document" else "delete"
            return json.dumps({
                "requires_confirmation": True,
                "action": tool_name,
                "doctype": doctype,
                "name": doc_name,
                "message": (
                    f"⚠️ This will {action} {doctype} {doc_name}. "
                    f"This action cannot be easily undone. "
                    f"Please confirm by saying 'yes, {action} it'."
                ),
            })

        if tool_name == "submit_document":
            doctype = tool_input.get("doctype", "")
            doc_name = tool_input.get("name", "")
            # Docstatus validation: prevent re-submit or submit of cancelled docs
            doc = None
            try:
                doc = erp_client.get_doc(doctype, doc_name)
                if isinstance(doc, dict):
                    ds = doc.get("docstatus", 0)
                    if ds == 1:
                        return _json({"error": f"{doctype} {doc_name} is already submitted (docstatus=1)."})
                    if ds == 2:
                        return _json({"error": f"{doctype} {doc_name} is cancelled (docstatus=2) and cannot be submitted."})
            except Exception:
                pass  # let the actual submit call handle errors
            # Financial approval gate (approvals_engine is from old bot — skip if unavailable)
            if doctype in FINANCIAL_DOCTYPES:
                try:
                    import approvals_engine as ae
                    if doc is None:
                        try:
                            doc = erp_client.get_doc(doctype, doc_name)
                        except Exception:
                            pass
                    amount = ae.get_amount(doctype, doc) if isinstance(doc, dict) else 0
                    if ae.needs_approval(doctype, amount, user_role):
                        description = f"Submit {doctype} {doc_name} for ₹{amount:,.0f}"
                        return ae.create_financial_approval(
                            user_id or 0, user_name or "unknown", user_role,
                            doctype, doc_name, amount, description,
                        )
                except ImportError:
                    pass  # approval engine not available — proceed with direct submit

        # Role-based submit restriction
        if user_role == "user" and tool_input.get("submit"):
            tool_input["submit"] = False

        # ── Meta: discover_tools ──
        if tool_name == "discover_tools":
            category = tool_input.get("category", "")
            if category not in TOOL_CATEGORIES:
                return _json({"error": f"Unknown category '{category}'. Available: {list(TOOL_CATEGORIES.keys())}"})
            cat_info = TOOL_CATEGORIES[category]
            # Return the tool names in this category so Claude knows what's available
            # The actual tools will be injected into the next API call by bot.py
            return _json({
                "category": category,
                "description": cat_info["description"],
                "tools_loaded": cat_info["tools"],
                "instruction": "These tools are now available. Call them directly to proceed.",
            })

        # ── Data Access ──
        elif tool_name == "search_records":
            return _json(erp_client.get_list(
                tool_input["doctype"],
                filters=tool_input.get("filters"),
                fields=tool_input.get("fields"),
                limit=min(tool_input.get("limit", 20), 100),
                order_by=tool_input.get("order_by"),
            ))

        elif tool_name == "get_document":
            return _json(erp_client.get_doc(tool_input["doctype"], tool_input["name"]))

        elif tool_name == "get_count":
            return _json({"count": erp_client.get_count(
                tool_input["doctype"], filters=tool_input.get("filters")
            )})

        elif tool_name == "search_link":
            return _json(erp_client.search_link(tool_input["doctype"], tool_input["txt"]))

        # ── Reports ──
        elif tool_name == "get_report":
            filters = tool_input.get("filters", {})
            filters.setdefault("company", COMPANY)
            report = tool_input["report_name"]
            today = date.today().isoformat()
            # Set sensible defaults per report type
            if report in ("General Ledger", "Trial Balance"):
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            elif report == "Balance Sheet":
                filters.setdefault("period_start_date", "2025-01-01")
                filters.setdefault("report_date", today)
                filters.setdefault("periodicity", "Yearly")
            elif report in ("Profit and Loss Statement", "Cash Flow"):
                filters.setdefault("period_start_date", "2025-01-01")
                filters.setdefault("period_end_date", today)
                filters.setdefault("periodicity", "Yearly")
            elif report in ("Accounts Receivable", "Accounts Payable",
                            "Accounts Receivable Summary", "Accounts Payable Summary"):
                filters.setdefault("report_date", today)
            elif report in ("Stock Balance", "Stock Projected Qty",
                            "Stock Ageing", "Warehouse wise Stock Balance",
                            "Item Shortage Report"):
                filters.setdefault("to_date", today)
            elif report in ("Stock Ledger", "Item-wise Stock Movement"):
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            elif report in ("Sales Analytics", "Purchase Analytics"):
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
                filters.setdefault("range", "Monthly")
            elif report == "Gross Profit":
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            elif report in ("Sales Register", "Purchase Register"):
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            elif report == "Budget Variance Report":
                filters.setdefault("fiscal_year", f"{date.today().year}-{date.today().year + 1}")
                filters.setdefault("budget_against", "Cost Center")
            elif report in ("Sales Order Trends", "Purchase Order Trends",
                            "Delivery Note Trends", "Quotation Trends"):
                filters.setdefault("period", "Monthly")
                filters.setdefault("based_on", "Item")
                filters.setdefault("fiscal_year", f"{date.today().year}-{date.today().year + 1}")
            elif report == "Employee Leave Balance":
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            elif report in ("Daily Timesheet Summary", "Work Order Summary",
                            "Production Planning Report", "BOM Stock Report"):
                filters.setdefault("from_date", "2025-01-01")
                filters.setdefault("to_date", today)
            return _json(erp_client.get_report(report, filters))

        elif tool_name == "business_dashboard":
            from datetime import datetime, timedelta
            today = date.today()
            period = tool_input.get("period", "this_month")
            if period == "today":
                start = today.isoformat()
            elif period == "this_week":
                start = (today - timedelta(days=today.weekday())).isoformat()
            elif period == "this_quarter":
                q_month = ((today.month - 1) // 3) * 3 + 1
                start = today.replace(month=q_month, day=1).isoformat()
            elif period == "this_year":
                start = today.replace(month=1, day=1).isoformat()
            else:  # this_month
                start = today.replace(day=1).isoformat()
            end = today.isoformat()
            dashboard = {}
            try:
                # Revenue (Sales Invoices)
                inv = erp_client.get_list("Sales Invoice", filters=[
                    ["posting_date", ">=", start], ["posting_date", "<=", end],
                    ["docstatus", "=", 1],
                ], fields=["sum(grand_total) as total"], limit=1)
                dashboard["revenue"] = inv[0].get("total", 0) if inv else 0
                # Expenses (Purchase Invoices)
                pinv = erp_client.get_list("Purchase Invoice", filters=[
                    ["posting_date", ">=", start], ["posting_date", "<=", end],
                    ["docstatus", "=", 1],
                ], fields=["sum(grand_total) as total"], limit=1)
                dashboard["expenses"] = pinv[0].get("total", 0) if pinv else 0
                # Receivables (unpaid Sales Invoices)
                ar = erp_client.get_list("Sales Invoice", filters=[
                    ["docstatus", "=", 1], ["outstanding_amount", ">", 0],
                ], fields=["sum(outstanding_amount) as total"], limit=1)
                dashboard["accounts_receivable"] = ar[0].get("total", 0) if ar else 0
                # Payables (unpaid Purchase Invoices)
                ap = erp_client.get_list("Purchase Invoice", filters=[
                    ["docstatus", "=", 1], ["outstanding_amount", ">", 0],
                ], fields=["sum(outstanding_amount) as total"], limit=1)
                dashboard["accounts_payable"] = ap[0].get("total", 0) if ap else 0
                # Pending Sales Orders
                so = erp_client.get_count("Sales Order", filters=[
                    ["docstatus", "=", 1], ["status", "not in", ["Completed", "Cancelled", "Closed"]],
                ])
                dashboard["pending_sales_orders"] = so
                # Pending Purchase Orders
                po = erp_client.get_count("Purchase Order", filters=[
                    ["docstatus", "=", 1], ["status", "not in", ["Completed", "Cancelled", "Closed"]],
                ])
                dashboard["pending_purchase_orders"] = po
                # Active Employees
                emp = erp_client.get_count("Employee", filters=[["status", "=", "Active"]])
                dashboard["active_employees"] = emp
                # Open Leads
                leads = erp_client.get_count("Lead", filters=[["status", "=", "Open"]])
                dashboard["open_leads"] = leads
                # Open Projects
                proj = erp_client.get_count("Project", filters=[
                    ["status", "not in", ["Completed", "Cancelled"]],
                ])
                dashboard["open_projects"] = proj
                dashboard["period"] = period
                dashboard["from"] = start
                dashboard["to"] = end
            except Exception as e:
                dashboard["error"] = str(e)
            return _json(dashboard)

        # ── Accounting ──
        elif tool_name == "create_journal_entry":
            doc = {
                "doctype": "Journal Entry",
                "voucher_type": tool_input.get("voucher_type", "Journal Entry"),
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
                "user_remark": tool_input["remark"],
                "accounts": tool_input["accounts"],
            }
            if tool_input.get("cheque_no"):
                doc["cheque_no"] = tool_input["cheque_no"]
                doc["cheque_date"] = tool_input.get("cheque_date", tool_input["posting_date"])
            result = erp_client.create_doc("Journal Entry", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Journal Entry", result["name"])
            return _json(result)

        elif tool_name == "create_payment_entry":
            doc = {
                "doctype": "Payment Entry",
                "payment_type": tool_input["payment_type"],
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
                "party_type": tool_input["party_type"],
                "party": tool_input["party"],
                "paid_from": tool_input["paid_from"],
                "paid_to": tool_input["paid_to"],
                "paid_amount": tool_input["amount"],
                "received_amount": tool_input["amount"],
                "source_exchange_rate": 1,
                "target_exchange_rate": 1,
                "reference_no": tool_input["reference_no"],
                "reference_date": tool_input["posting_date"],
                "remarks": tool_input["remarks"],
            }
            result = erp_client.create_doc("Payment Entry", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Payment Entry", result["name"])
            return _json(result)

        elif tool_name == "create_sales_invoice":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_name": item["item_name"],
                    "description": item.get("description", item["item_name"]),
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "income_account": item.get("income_account", f"Sales - {ABBR}"),
                    "cost_center": item.get("cost_center", f"Main - {ABBR}"),
                })
            doc = {
                "doctype": "Sales Invoice",
                "customer": tool_input["customer"],
                "posting_date": tool_input["posting_date"],
                "due_date": tool_input.get("due_date", tool_input["posting_date"]),
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "selling_price_list": "Standard Selling",
                "debit_to": f"Debtors - {ABBR}",
                "items": items,
            }
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Sales Invoice", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Sales Invoice", result["name"])
            return _json(result)

        elif tool_name == "create_purchase_invoice":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_name": item["item_name"],
                    "description": item.get("description", item["item_name"]),
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "expense_account": item.get("expense_account", f"Cost of Goods Sold - {ABBR}"),
                    "cost_center": item.get("cost_center", f"Main - {ABBR}"),
                })
            doc = {
                "doctype": "Purchase Invoice",
                "supplier": tool_input["supplier"],
                "posting_date": tool_input["posting_date"],
                "due_date": tool_input.get("due_date", tool_input["posting_date"]),
                "company": COMPANY,
                "credit_to": f"Creditors - {ABBR}",
                "items": items,
            }
            if tool_input.get("bill_no"):
                doc["bill_no"] = tool_input["bill_no"]
                doc["bill_date"] = tool_input.get("bill_date", tool_input["posting_date"])
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Purchase Invoice", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Purchase Invoice", result["name"])
            return _json(result)

        # ── Master Data ──
        elif tool_name == "create_customer":
            return _json(erp_client.create_doc("Customer", {
                "doctype": "Customer",
                "customer_name": tool_input["customer_name"],
                "customer_group": tool_input.get("customer_group", "All Customer Groups"),
                "customer_type": tool_input.get("customer_type", "Company"),
                "territory": tool_input.get("territory", "India"),
            }))

        elif tool_name == "create_supplier":
            return _json(erp_client.create_doc("Supplier", {
                "doctype": "Supplier",
                "supplier_name": tool_input["supplier_name"],
                "supplier_group": tool_input.get("supplier_group", "All Supplier Groups"),
                "supplier_type": tool_input.get("supplier_type", "Individual"),
            }))

        elif tool_name == "create_item":
            doc = {
                "doctype": "Item",
                "item_code": tool_input["item_code"],
                "item_name": tool_input["item_name"],
                "item_group": tool_input.get("item_group", "All Item Groups"),
                "stock_uom": tool_input.get("stock_uom", "Nos"),
                "description": tool_input.get("description", tool_input["item_name"]),
                "is_stock_item": 1 if tool_input.get("is_stock_item", True) else 0,
                "item_defaults": [{
                    "company": COMPANY,
                    "default_warehouse": tool_input.get("default_warehouse", f"Stores - {ABBR}"),
                }],
            }
            if tool_input.get("standard_rate"):
                doc["standard_rate"] = tool_input["standard_rate"]
            return _json(erp_client.create_doc("Item", doc))

        # ── HR ──
        elif tool_name == "create_employee":
            doc = {
                "doctype": "Employee",
                "first_name": tool_input["first_name"],
                "last_name": tool_input.get("last_name", ""),
                "employee_name": f"{tool_input['first_name']} {tool_input.get('last_name', '')}".strip(),
                "designation": tool_input["designation"],
                "department": tool_input.get("department", "All Departments"),
                "company": COMPANY,
                "date_of_joining": tool_input["date_of_joining"],
                "status": "Active",
            }
            if tool_input.get("gender"):
                doc["gender"] = tool_input["gender"]
            if tool_input.get("date_of_birth"):
                doc["date_of_birth"] = tool_input["date_of_birth"]
            if tool_input.get("cell_phone"):
                doc["cell_phone"] = tool_input["cell_phone"]
            return _json(erp_client.create_doc("Employee", doc))

        elif tool_name == "mark_attendance":
            return _json(erp_client.create_doc("Attendance", {
                "doctype": "Attendance",
                "employee": tool_input["employee"],
                "attendance_date": tool_input.get("date", date.today().isoformat()),
                "status": tool_input["status"],
                "company": COMPANY,
            }))

        elif tool_name == "create_leave_application":
            return _json(erp_client.create_doc("Leave Application", {
                "doctype": "Leave Application",
                "employee": tool_input["employee"],
                "leave_type": tool_input["leave_type"],
                "from_date": tool_input["from_date"],
                "to_date": tool_input["to_date"],
                "reason": tool_input["reason"],
                "status": "Open",
            }))

        # ── Inventory ──
        elif tool_name == "create_stock_entry":
            items = []
            for item in tool_input["items"]:
                entry = {"item_code": item["item_code"], "qty": item["qty"]}
                if item.get("s_warehouse"):
                    entry["s_warehouse"] = item["s_warehouse"]
                if item.get("t_warehouse"):
                    entry["t_warehouse"] = item["t_warehouse"]
                if item.get("basic_rate"):
                    entry["basic_rate"] = item["basic_rate"]
                items.append(entry)
            doc = {
                "doctype": "Stock Entry",
                "stock_entry_type": tool_input["stock_entry_type"],
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
                "items": items,
            }
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            if tool_input.get("from_bom") and tool_input.get("bom_no"):
                doc["from_bom"] = 1
                doc["bom_no"] = tool_input["bom_no"]
                if tool_input.get("fg_completed_qty"):
                    doc["fg_completed_qty"] = tool_input["fg_completed_qty"]
            result = erp_client.create_doc("Stock Entry", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Stock Entry", result["name"])
            return _json(result)

        elif tool_name == "create_warehouse":
            wh_name = tool_input["warehouse_name"]
            return _json(erp_client.create_doc("Warehouse", {
                "doctype": "Warehouse",
                "warehouse_name": wh_name,
                "company": COMPANY,
                "parent_warehouse": tool_input.get("parent_warehouse", f"All Warehouses - {ABBR}"),
            }))

        elif tool_name == "create_bom":
            bom_items = []
            for item in tool_input["items"]:
                entry = {"item_code": item["item_code"], "qty": item["qty"]}
                if item.get("rate"):
                    entry["rate"] = item["rate"]
                if item.get("uom"):
                    entry["stock_uom"] = item["uom"]
                bom_items.append(entry)
            doc = {
                "doctype": "BOM",
                "item": tool_input["item"],
                "quantity": tool_input.get("quantity", 1),
                "company": COMPANY,
                "items": bom_items,
            }
            result = erp_client.create_doc("BOM", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("BOM", result["name"])
            return _json(result)

        elif tool_name == "stock_reconciliation":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                    "qty": item["qty"],
                    "valuation_rate": item.get("valuation_rate", 0),
                })
            doc = {
                "doctype": "Stock Reconciliation",
                "posting_date": tool_input["posting_date"],
                "purpose": tool_input.get("purpose", "Stock Reconciliation"),
                "company": COMPANY,
                "items": items,
            }
            result = erp_client.create_doc("Stock Reconciliation", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Stock Reconciliation", result["name"])
            return _json(result)

        # ── Buying & Procurement ──
        elif tool_name == "create_purchase_order":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                    "schedule_date": item.get("schedule_date", tool_input["schedule_date"]),
                })
            doc = {
                "doctype": "Purchase Order",
                "supplier": tool_input["supplier"],
                "transaction_date": tool_input["transaction_date"],
                "schedule_date": tool_input["schedule_date"],
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "buying_price_list": "Standard Buying",
                "items": items,
            }
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Purchase Order", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Purchase Order", result["name"])
            return _json(result)

        elif tool_name == "create_purchase_receipt":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                })
            doc = {
                "doctype": "Purchase Receipt",
                "supplier": tool_input["supplier"],
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "buying_price_list": "Standard Buying",
                "items": items,
            }
            if tool_input.get("purchase_order"):
                doc["purchase_order"] = tool_input["purchase_order"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Purchase Receipt", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Purchase Receipt", result["name"])
            return _json(result)

        elif tool_name == "create_delivery_note":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                })
            doc = {
                "doctype": "Delivery Note",
                "customer": tool_input["customer"],
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "selling_price_list": "Standard Selling",
                "items": items,
            }
            if tool_input.get("sales_order"):
                doc["sales_order"] = tool_input["sales_order"]
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Delivery Note", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Delivery Note", result["name"])
            return _json(result)

        elif tool_name == "create_material_request":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                    "schedule_date": item.get("schedule_date", tool_input["schedule_date"]),
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                })
            doc = {
                "doctype": "Material Request",
                "material_request_type": tool_input["material_request_type"],
                "transaction_date": tool_input["transaction_date"],
                "schedule_date": tool_input["schedule_date"],
                "company": COMPANY,
                "items": items,
            }
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Material Request", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Material Request", result["name"])
            return _json(result)

        elif tool_name == "create_item_price":
            doc = {
                "doctype": "Item Price",
                "item_code": tool_input["item_code"],
                "price_list": tool_input["price_list"],
                "price_list_rate": tool_input["price_list_rate"],
                "currency": tool_input.get("currency", "INR"),
                "buying": 1 if tool_input.get("buying") else 0,
                "selling": 1 if tool_input.get("selling") else 0,
            }
            return _json(erp_client.create_doc("Item Price", doc))

        elif tool_name == "create_quality_inspection":
            doc = {
                "doctype": "Quality Inspection",
                "inspection_type": tool_input["inspection_type"],
                "item_code": tool_input["item_code"],
                "reference_type": tool_input["reference_type"],
                "reference_name": tool_input["reference_name"],
                "inspected_by": tool_input.get("inspected_by", "Administrator"),
                "status": tool_input.get("status", "Accepted"),
            }
            if tool_input.get("readings"):
                doc["readings"] = tool_input["readings"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Quality Inspection", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Quality Inspection", result["name"])
            return _json(result)

        elif tool_name == "create_landed_cost_voucher":
            doc = {
                "doctype": "Landed Cost Voucher",
                "company": COMPANY,
                "distribute_charges_based_on": tool_input.get("distribute_charges_based_on", "Amount"),
                "purchase_receipts": tool_input["purchase_receipts"],
                "taxes": tool_input["taxes"],
            }
            result = erp_client.create_doc("Landed Cost Voucher", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Landed Cost Voucher", result["name"])
            return _json(result)

        elif tool_name == "create_request_for_quotation":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "uom": item.get("uom", "Nos"),
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                    "schedule_date": item.get("schedule_date", tool_input.get("schedule_date", tool_input["transaction_date"])),
                })
            suppliers = []
            for s in tool_input["suppliers"]:
                suppliers.append({"supplier": s["supplier"]})
            doc = {
                "doctype": "Request for Quotation",
                "transaction_date": tool_input["transaction_date"],
                "company": COMPANY,
                "suppliers": suppliers,
                "items": items,
            }
            if tool_input.get("schedule_date"):
                doc["schedule_date"] = tool_input["schedule_date"]
            if tool_input.get("message_for_supplier"):
                doc["message_for_supplier"] = tool_input["message_for_supplier"]
            result = erp_client.create_doc("Request for Quotation", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Request for Quotation", result["name"])
            return _json(result)

        elif tool_name == "create_budget":
            accounts = []
            for a in tool_input["accounts"]:
                accounts.append({
                    "account": a["account"],
                    "budget_amount": a["budget_amount"],
                })
            doc = {
                "doctype": "Budget",
                "budget_against": tool_input["budget_against"],
                tool_input["budget_against"].lower().replace(" ", "_"): tool_input["budget_against_value"],
                "fiscal_year": tool_input["fiscal_year"],
                "company": COMPANY,
                "accounts": accounts,
            }
            if tool_input.get("monthly_distribution"):
                doc["monthly_distribution"] = tool_input["monthly_distribution"]
            for field in ("applicable_on_material_request", "applicable_on_purchase_order",
                          "applicable_on_booking_actual_expenses"):
                if tool_input.get(field) is not None:
                    doc[field] = 1 if tool_input[field] else 0
            for field in ("action_if_annual_budget_exceeded",
                          "action_if_accumulated_monthly_budget_exceeded"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Budget", doc))

        elif tool_name == "create_pricing_rule":
            doc = {
                "doctype": "Pricing Rule",
                "title": tool_input["title"],
                "selling": 1 if tool_input.get("selling") else 0,
                "buying": 1 if tool_input.get("buying") else 0,
                "applicable_for": tool_input["applicable_for"],
                "apply_on": tool_input["apply_on"],
                "company": tool_input.get("company", COMPANY),
            }
            if tool_input.get("items"):
                doc["items"] = tool_input["items"]
            for field in ("min_qty", "max_qty", "min_amt", "max_amt",
                          "rate_or_discount", "discount_percentage",
                          "discount_amount", "rate", "valid_from",
                          "valid_upto", "priority"):
                if tool_input.get(field) is not None:
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Pricing Rule", doc))

        # ── CRM & Sales ──
        elif tool_name == "create_lead":
            doc = {
                "doctype": "Lead",
                "lead_name": tool_input["lead_name"],
                "status": "Open",
                "territory": tool_input.get("territory", "India"),
            }
            for field in ("company_name", "email_id", "phone", "source", "notes"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Lead", doc))

        elif tool_name == "create_opportunity":
            doc = {
                "doctype": "Opportunity",
                "party_name": tool_input["party_name"],
                "opportunity_from": tool_input["opportunity_from"],
                "opportunity_type": tool_input.get("opportunity_type", "Sales"),
                "status": "Open",
                "company": COMPANY,
            }
            for field in ("transaction_date", "expected_closing", "sales_stage", "source", "notes"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Opportunity", doc))

        elif tool_name == "create_quotation":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                })
            doc = {
                "doctype": "Quotation",
                "quotation_to": tool_input.get("quotation_to", "Customer"),
                "party_name": tool_input["party_name"],
                "transaction_date": tool_input.get("transaction_date", date.today().isoformat()),
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "selling_price_list": "Standard Selling",
                "order_type": tool_input.get("order_type", "Sales"),
                "items": items,
            }
            if tool_input.get("valid_till"):
                doc["valid_till"] = tool_input["valid_till"]
            result = erp_client.create_doc("Quotation", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Quotation", result["name"])
            return _json(result)

        elif tool_name == "create_sales_order":
            items = []
            for item in tool_input["items"]:
                entry = {
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                    "warehouse": item.get("warehouse", f"Stores - {ABBR}"),
                    "delivery_date": item.get("delivery_date", tool_input["delivery_date"]),
                }
                items.append(entry)
            doc = {
                "doctype": "Sales Order",
                "customer": tool_input["customer"],
                "transaction_date": tool_input.get("transaction_date", date.today().isoformat()),
                "delivery_date": tool_input["delivery_date"],
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "selling_price_list": "Standard Selling",
                "order_type": tool_input.get("order_type", "Sales"),
                "items": items,
            }
            if tool_input.get("project"):
                doc["project"] = tool_input["project"]
            result = erp_client.create_doc("Sales Order", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Sales Order", result["name"])
            return _json(result)

        elif tool_name == "create_supplier_quotation":
            items = []
            for item in tool_input["items"]:
                items.append({
                    "item_code": item["item_code"],
                    "qty": item["qty"],
                    "rate": item["rate"],
                    "description": item.get("description", item["item_code"]),
                    "uom": item.get("uom", "Nos"),
                    "conversion_factor": 1,
                })
            doc = {
                "doctype": "Supplier Quotation",
                "supplier": tool_input["supplier"],
                "transaction_date": tool_input.get("transaction_date", date.today().isoformat()),
                "company": COMPANY,
                "currency": "INR",
                "conversion_rate": 1,
                "buying_price_list": "Standard Buying",
                "items": items,
            }
            if tool_input.get("valid_till"):
                doc["valid_till"] = tool_input["valid_till"]
            result = erp_client.create_doc("Supplier Quotation", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Supplier Quotation", result["name"])
            return _json(result)

        # ── Address & Contact ──
        elif tool_name == "create_address":
            doc = {
                "doctype": "Address",
                "address_title": tool_input["address_title"],
                "address_type": tool_input["address_type"],
                "address_line1": tool_input["address_line1"],
                "city": tool_input["city"],
                "country": tool_input.get("country", "India"),
            }
            for field in ("address_line2", "state", "pincode", "phone", "email_id"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            if tool_input.get("is_primary_address"):
                doc["is_primary_address"] = 1
            if tool_input.get("is_shipping_address"):
                doc["is_shipping_address"] = 1
            if tool_input.get("links"):
                doc["links"] = tool_input["links"]
            return _json(erp_client.create_doc("Address", doc))

        elif tool_name == "create_contact":
            doc = {
                "doctype": "Contact",
                "first_name": tool_input["first_name"],
            }
            for field in ("last_name", "email_id", "phone", "mobile_no", "designation", "department"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            if tool_input.get("is_primary_contact"):
                doc["is_primary_contact"] = 1
            if tool_input.get("is_billing_contact"):
                doc["is_billing_contact"] = 1
            if tool_input.get("links"):
                doc["links"] = tool_input["links"]
            if tool_input.get("email_id"):
                doc["email_ids"] = [{"email_id": tool_input["email_id"], "is_primary": 1}]
            if tool_input.get("phone"):
                doc["phone_nos"] = [{"phone": tool_input["phone"], "is_primary_phone": 1}]
            if tool_input.get("mobile_no"):
                doc.setdefault("phone_nos", []).append({"phone": tool_input["mobile_no"], "is_primary_mobile_no": 1})
            return _json(erp_client.create_doc("Contact", doc))

        # ── HR Extended ──
        elif tool_name == "create_expense_claim":
            expenses = []
            for exp in tool_input["expenses"]:
                expenses.append({
                    "expense_type": exp["expense_type"],
                    "amount": exp["amount"],
                    "description": exp.get("description", exp["expense_type"]),
                    "sanctioned_amount": exp.get("sanctioned_amount", exp["amount"]),
                })
            doc = {
                "doctype": "Expense Claim",
                "employee": tool_input["employee"],
                "posting_date": tool_input.get("posting_date", date.today().isoformat()),
                "company": COMPANY,
                "expenses": expenses,
                "payable_account": tool_input.get("payable_account", f"Creditors - {ABBR}"),
            }
            result = erp_client.create_doc("Expense Claim", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Expense Claim", result["name"])
            return _json(result)

        elif tool_name == "create_salary_structure":
            earnings = []
            for e in tool_input["earnings"]:
                entry = {"salary_component": e["salary_component"]}
                if e.get("amount"):
                    entry["amount"] = e["amount"]
                if e.get("formula"):
                    entry["formula"] = e["formula"]
                if e.get("depends_on_payment_days") is not None:
                    entry["depends_on_payment_days"] = 1 if e["depends_on_payment_days"] else 0
                earnings.append(entry)
            deductions = []
            for d in tool_input.get("deductions", []):
                entry = {"salary_component": d["salary_component"]}
                if d.get("amount"):
                    entry["amount"] = d["amount"]
                if d.get("formula"):
                    entry["formula"] = d["formula"]
                deductions.append(entry)
            doc = {
                "doctype": "Salary Structure",
                "name": tool_input["name_template"],
                "payroll_frequency": tool_input["payroll_frequency"],
                "company": COMPANY,
                "currency": "INR",
                "earnings": earnings,
                "deductions": deductions,
            }
            result = erp_client.create_doc("Salary Structure", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Salary Structure", result["name"])
            return _json(result)

        elif tool_name == "create_salary_slip":
            doc = {
                "doctype": "Salary Slip",
                "employee": tool_input["employee"],
                "posting_date": tool_input.get("posting_date", date.today().isoformat()),
                "payroll_frequency": tool_input.get("payroll_frequency", "Monthly"),
                "company": COMPANY,
            }
            if tool_input.get("start_date"):
                doc["start_date"] = tool_input["start_date"]
            if tool_input.get("end_date"):
                doc["end_date"] = tool_input["end_date"]
            result = erp_client.create_doc("Salary Slip", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Salary Slip", result["name"])
            return _json(result)

        elif tool_name == "create_payroll_entry":
            doc = {
                "doctype": "Payroll Entry",
                "posting_date": tool_input["posting_date"],
                "payroll_frequency": tool_input["payroll_frequency"],
                "company": COMPANY,
                "currency": "INR",
                "exchange_rate": 1,
            }
            for field in ("start_date", "end_date", "department", "branch", "designation"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            result = erp_client.create_doc("Payroll Entry", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Payroll Entry", result["name"])
            return _json(result)

        elif tool_name == "create_employee_advance":
            doc = {
                "doctype": "Employee Advance",
                "employee": tool_input["employee"],
                "advance_amount": tool_input["advance_amount"],
                "purpose": tool_input["purpose"],
                "posting_date": tool_input.get("posting_date", date.today().isoformat()),
                "company": COMPANY,
                "currency": "INR",
                "exchange_rate": 1,
            }
            if tool_input.get("advance_account"):
                doc["advance_account"] = tool_input["advance_account"]
            result = erp_client.create_doc("Employee Advance", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Employee Advance", result["name"])
            return _json(result)

        elif tool_name == "create_shift_assignment":
            doc = {
                "doctype": "Shift Assignment",
                "employee": tool_input["employee"],
                "shift_type": tool_input["shift_type"],
                "start_date": tool_input["start_date"],
                "company": COMPANY,
            }
            if tool_input.get("end_date"):
                doc["end_date"] = tool_input["end_date"]
            return _json(erp_client.create_doc("Shift Assignment", doc))

        elif tool_name == "create_training_event":
            doc = {
                "doctype": "Training Event",
                "event_name": tool_input["event_name"],
                "start_time": tool_input["start_time"],
                "end_time": tool_input["end_time"],
                "type": tool_input.get("type", "Seminar"),
                "company": COMPANY,
            }
            for field in ("trainer_name", "trainer_email", "introduction"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            if tool_input.get("employees"):
                doc["employees"] = tool_input["employees"]
            return _json(erp_client.create_doc("Training Event", doc))

        elif tool_name == "create_appraisal":
            doc = {
                "doctype": "Appraisal",
                "employee": tool_input["employee"],
                "appraisal_template": tool_input["appraisal_template"],
                "start_date": tool_input["start_date"],
                "end_date": tool_input["end_date"],
                "company": COMPANY,
            }
            if tool_input.get("goals"):
                doc["goals"] = tool_input["goals"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Appraisal", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Appraisal", result["name"])
            return _json(result)

        elif tool_name == "create_employee_checkin":
            doc = {
                "doctype": "Employee Checkin",
                "employee": tool_input["employee"],
                "time": tool_input["time"],
            }
            if tool_input.get("log_type"):
                doc["log_type"] = tool_input["log_type"]
            if tool_input.get("device_id"):
                doc["device_id"] = tool_input["device_id"]
            return _json(erp_client.create_doc("Employee Checkin", doc))

        elif tool_name == "create_leave_allocation":
            doc = {
                "doctype": "Leave Allocation",
                "employee": tool_input["employee"],
                "leave_type": tool_input["leave_type"],
                "new_leaves_allocated": tool_input["new_leaves_allocated"],
                "from_date": tool_input["from_date"],
                "to_date": tool_input["to_date"],
                "company": COMPANY,
            }
            if tool_input.get("carry_forward"):
                doc["carry_forward"] = 1
            result = erp_client.create_doc("Leave Allocation", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Leave Allocation", result["name"])
            return _json(result)

        # ── Assets ──
        elif tool_name == "create_asset":
            doc = {
                "doctype": "Asset",
                "asset_name": tool_input["asset_name"],
                "item_code": tool_input["item_code"],
                "asset_category": tool_input["asset_category"],
                "location": tool_input["location"],
                "company": COMPANY,
                "is_existing_asset": 1 if tool_input.get("is_existing_asset", True) else 0,
            }
            for field in ("purchase_date", "gross_purchase_amount", "available_for_use_date"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Asset", doc))

        elif tool_name == "create_asset_movement":
            doc = {
                "doctype": "Asset Movement",
                "purpose": tool_input["purpose"],
                "transaction_date": tool_input.get("transaction_date", date.today().isoformat()),
                "company": tool_input.get("company", COMPANY),
                "assets": tool_input["assets"],
            }
            result = erp_client.create_doc("Asset Movement", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Asset Movement", result["name"])
            return _json(result)

        elif tool_name == "create_asset_maintenance":
            doc = {
                "doctype": "Asset Maintenance",
                "asset_name": tool_input["asset_name"],
                "item_code": tool_input["item_code"],
                "company": tool_input.get("company", COMPANY),
            }
            if tool_input.get("maintenance_team"):
                doc["maintenance_team"] = tool_input["maintenance_team"]
            if tool_input.get("maintenance_tasks"):
                doc["maintenance_tasks"] = tool_input["maintenance_tasks"]
            return _json(erp_client.create_doc("Asset Maintenance", doc))

        # ── Manufacturing Extended ──
        elif tool_name == "create_work_order":
            doc = {
                "doctype": "Work Order",
                "production_item": tool_input["production_item"],
                "qty": tool_input["qty"],
                "bom_no": tool_input["bom_no"],
                "company": COMPANY,
                "status": "Draft",
                "fg_warehouse": tool_input.get("fg_warehouse", f"Finished Goods - {ABBR}"),
                "wip_warehouse": tool_input.get("wip_warehouse", f"Work In Progress - {ABBR}"),
            }
            for field in ("planned_start_date", "expected_delivery_date", "project"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            result = erp_client.create_doc("Work Order", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Work Order", result["name"])
            return _json(result)

        elif tool_name == "create_job_card":
            doc = {
                "doctype": "Job Card",
                "work_order": tool_input["work_order"],
                "operation": tool_input["operation"],
                "workstation": tool_input["workstation"],
                "company": COMPANY,
            }
            if tool_input.get("posting_date"):
                doc["posting_date"] = tool_input["posting_date"]
            if tool_input.get("for_quantity"):
                doc["for_quantity"] = tool_input["for_quantity"]
            if tool_input.get("time_logs"):
                doc["time_logs"] = tool_input["time_logs"]
            if tool_input.get("employee"):
                doc["employee"] = tool_input["employee"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Job Card", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Job Card", result["name"])
            return _json(result)

        elif tool_name == "create_production_plan":
            doc = {
                "doctype": "Production Plan",
                "posting_date": tool_input["posting_date"],
                "company": COMPANY,
            }
            if tool_input.get("get_items_from"):
                doc["get_items_from"] = tool_input["get_items_from"]
            if tool_input.get("items"):
                doc["po_items"] = tool_input["items"]
            result = erp_client.create_doc("Production Plan", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Production Plan", result["name"])
            return _json(result)

        # ── Subscription ──
        elif tool_name == "create_subscription":
            doc = {
                "doctype": "Subscription",
                "party_type": tool_input["party_type"],
                "party": tool_input["party"],
                "plans": tool_input["plans"],
                "company": tool_input.get("company", COMPANY),
            }
            if tool_input.get("start_date"):
                doc["start_date"] = tool_input["start_date"]
            if tool_input.get("generate_invoice_at"):
                doc["generate_invoice_at"] = tool_input["generate_invoice_at"]
            if "submit_invoice" in tool_input:
                doc["submit_invoice"] = 1 if tool_input["submit_invoice"] else 0
            else:
                doc["submit_invoice"] = 1
            return _json(erp_client.create_doc("Subscription", doc))

        # ── Projects ──
        elif tool_name == "create_project":
            doc = {
                "doctype": "Project",
                "project_name": tool_input["project_name"],
                "project_type": tool_input.get("project_type", "Internal"),
                "company": COMPANY,
                "status": "Open",
            }
            for field in ("expected_start_date", "expected_end_date", "customer", "notes"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Project", doc))

        elif tool_name == "create_task":
            doc = {
                "doctype": "Task",
                "subject": tool_input["subject"],
                "status": "Open",
                "priority": tool_input.get("priority", "Medium"),
                "company": COMPANY,
            }
            for field in ("project", "exp_start_date", "exp_end_date", "description", "parent_task"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            return _json(erp_client.create_doc("Task", doc))

        elif tool_name == "create_timesheet":
            from datetime import datetime, timedelta
            time_logs = []
            for log in tool_input["time_logs"]:
                entry = {
                    "activity_type": log["activity_type"],
                    "hours": log["hours"],
                    "from_time": log["from_time"],
                }
                if log.get("to_time"):
                    entry["to_time"] = log["to_time"]
                else:
                    try:
                        ft = datetime.strptime(log["from_time"], "%Y-%m-%d %H:%M:%S")
                        entry["to_time"] = (ft + timedelta(hours=log["hours"])).strftime("%Y-%m-%d %H:%M:%S")
                    except Exception:
                        pass
                for field in ("project", "task"):
                    if log.get(field):
                        entry[field] = log[field]
                time_logs.append(entry)
            doc = {
                "doctype": "Timesheet",
                "company": COMPANY,
                "time_logs": time_logs,
            }
            if tool_input.get("employee"):
                doc["employee"] = tool_input["employee"]
            if tool_input.get("note"):
                doc["note"] = tool_input["note"]
            result = erp_client.create_doc("Timesheet", doc)
            if tool_input.get("submit") and _ok(result):
                result = erp_client.submit_doc("Timesheet", result["name"])
            return _json(result)

        # ── Generic Write ──
        elif tool_name == "update_document":
            return _json(erp_client.update_doc(
                tool_input["doctype"], tool_input["name"], tool_input["data"]
            ))

        elif tool_name == "submit_document":
            return _json(erp_client.submit_doc(tool_input["doctype"], tool_input["name"]))

        elif tool_name == "cancel_document":
            return _json(erp_client.cancel_doc(tool_input["doctype"], tool_input["name"]))

        elif tool_name == "delete_document":
            return _json(erp_client.delete_doc(tool_input["doctype"], tool_input["name"]))

        elif tool_name == "erp_attach":
            # erp_attach depends on old bot's media store — not available on Frappe Cloud
            return json.dumps({"error": "File attachment via chat is not yet supported in this deployment. Use the ERPNext UI to attach files."})

        elif tool_name == "semantic_search":
            try:
                import vector_store
                hits = vector_store.search(
                    tool_input["query"],
                    top_k=int(tool_input.get("top_k", 5)),
                )
                return vector_store.format_search_results(hits, tool_input["query"])
            except ImportError:
                return json.dumps({"error": "Semantic search not available in this deployment. Use search_records instead."})

        elif tool_name == "get_print_pdf":
            pdf_bytes = erp_client.get_print_pdf(
                tool_input["doctype"],
                tool_input["name"],
                print_format=tool_input.get("print_format"),
            )
            if isinstance(pdf_bytes, bytes) and len(pdf_bytes) > 100:
                # Save to temp file, return path for bot to send
                import tempfile
                fname = f"{tool_input['doctype'].replace(' ', '_')}_{tool_input['name']}.pdf"
                path = os.path.join(tempfile.gettempdir(), fname)
                with open(path, "wb") as f:
                    f.write(pdf_bytes)
                return json.dumps({
                    "pdf_path": path,
                    "filename": fname,
                    "size_kb": round(len(pdf_bytes) / 1024, 1),
                    "message": f"PDF ready: {fname} ({round(len(pdf_bytes) / 1024, 1)} KB). Sending to user..."
                })
            else:
                return json.dumps({"error": "Failed to generate PDF. The document may not exist or print format is unavailable."})

        # ═══════════════════════════════════════════════════════════
        # NEW TOOL HANDLERS — System Configuration & Automation
        # ═══════════════════════════════════════════════════════════

        elif tool_name == "list_doctype_fields":
            result = erp_client.get_doctype_meta(tool_input["doctype"])
            return _json(result)

        elif tool_name == "create_custom_field":
            doc = {
                "doctype": "Custom Field",
                "dt": tool_input["doctype"],
                "fieldname": tool_input["fieldname"],
                "label": tool_input["label"],
                "fieldtype": tool_input["fieldtype"],
            }
            for field in ("insert_after", "options", "default", "description",
                          "depends_on", "mandatory_depends_on", "fetch_from",
                          "collapsible", "collapsible_depends_on"):
                if tool_input.get(field):
                    doc[field] = tool_input[field]
            for bool_field in ("reqd", "hidden", "read_only", "unique", "in_list_view",
                               "in_standard_filter", "fetch_if_empty", "allow_on_submit", "bold"):
                if tool_input.get(bool_field) is not None:
                    doc[bool_field] = 1 if tool_input[bool_field] else 0
            result = erp_client.create_doc("Custom Field", doc)
            return _json(result)

        elif tool_name == "modify_doctype_property":
            doc = {
                "doctype": "Property Setter",
                "doc_type": tool_input["doctype"],
                "field_name": tool_input["fieldname"],
                "property": tool_input["property"],
                "value": tool_input["value"],
                "property_type": "Small Text" if tool_input["property"] in (
                    "options", "description", "default", "depends_on",
                    "mandatory_depends_on", "read_only_depends_on",
                    "fetch_from", "collapsible_depends_on"
                ) else ("Check" if tool_input["property"] in (
                    "reqd", "hidden", "read_only", "in_list_view",
                    "in_standard_filter", "allow_on_submit", "bold",
                    "print_hide", "translatable", "fetch_if_empty", "collapsible"
                ) else ("Select" if tool_input["property"] == "fieldtype" else "Data")),
                "doctype_or_field": "DocField",
            }
            result = erp_client.create_doc("Property Setter", doc)
            return _json(result)

        elif tool_name == "delete_custom_field":
            result = erp_client.delete_doc("Custom Field", tool_input["custom_field_name"])
            return _json(result)

        elif tool_name == "list_doctypes":
            filters = [["istable", "=", 0]]
            if tool_input.get("module"):
                filters.append(["module", "=", tool_input["module"]])
            if tool_input.get("is_custom"):
                filters.append(["custom", "=", 1])
            if tool_input.get("search"):
                filters.append(["name", "like", f"%{tool_input['search']}%"])
            result = erp_client.get_list(
                "DocType",
                filters=filters,
                fields=["name", "module", "custom", "issingle", "is_submittable"],
                limit=min(tool_input.get("limit", 50), 200),
                order_by="name asc",
            )
            return _json(result)

        elif tool_name == "manage_role_permission":
            dt = tool_input["doctype"]
            role = tool_input["role"]
            permlevel = tool_input.get("permlevel", 0)
            perms = tool_input["permissions"]
            # Check if Custom DocPerm exists for this combination
            existing = erp_client.get_list("Custom DocPerm", filters=[
                ["parent", "=", dt], ["role", "=", role], ["permlevel", "=", permlevel],
            ], fields=["name"], limit=1)
            if existing and not isinstance(existing, dict):
                # Update existing
                result = erp_client.update_doc("Custom DocPerm", existing[0]["name"], perms)
            else:
                # Create new
                doc = {
                    "doctype": "Custom DocPerm",
                    "parent": dt,
                    "parenttype": "DocType",
                    "parentfield": "permissions",
                    "role": role,
                    "permlevel": permlevel,
                }
                doc.update(perms)
                result = erp_client.create_doc("Custom DocPerm", doc)
            return _json(result)

        elif tool_name == "list_roles":
            filters = []
            if tool_input.get("search"):
                filters.append(["name", "like", f"%{tool_input['search']}%"])
            result = erp_client.get_list("Role", filters=filters,
                                         fields=["name", "disabled"],
                                         limit=100, order_by="name asc")
            return _json(result)

        elif tool_name == "list_role_permissions":
            dt = tool_input["doctype"]
            # Get standard permissions
            doc = erp_client.get_doc("DocType", dt)
            perms = []
            if isinstance(doc, dict):
                perms = doc.get("permissions", [])
            # Get custom permissions
            custom = erp_client.get_list("Custom DocPerm", filters=[
                ["parent", "=", dt],
            ], fields=["name", "role", "permlevel", "read", "write", "create",
                       "delete", "submit", "cancel", "amend", "report", "export",
                       "import", "print", "email", "share"],
               limit=100)
            return _json({"standard_permissions": perms, "custom_permissions": custom})

        elif tool_name == "create_workflow":
            states = []
            for s in tool_input["states"]:
                state = {
                    "state": s["state"],
                    "doc_status": str(s["doc_status"]),
                    "allow_edit": s["allow_edit"],
                }
                if s.get("is_optional_state"):
                    state["is_optional_state"] = 1
                if s.get("update_field"):
                    state["update_field"] = s["update_field"]
                if s.get("update_value"):
                    state["update_value"] = s["update_value"]
                states.append(state)
            transitions = []
            for t in tool_input["transitions"]:
                trans = {
                    "state": t["state"],
                    "action": t["action"],
                    "next_state": t["next_state"],
                    "allowed": t["allowed"],
                }
                if t.get("condition"):
                    trans["condition"] = t["condition"]
                if "allow_self_approval" in t:
                    trans["allow_self_approval"] = 1 if t["allow_self_approval"] else 0
                transitions.append(trans)
            doc = {
                "doctype": "Workflow",
                "workflow_name": tool_input["workflow_name"],
                "document_type": tool_input["document_type"],
                "workflow_state_field": tool_input.get("workflow_state_field", "workflow_state"),
                "is_active": 1 if tool_input.get("is_active", True) else 0,
                "override_status": 1 if tool_input.get("override_status") else 0,
                "send_email_alert": 1 if tool_input.get("send_email_alert") else 0,
                "states": states,
                "transitions": transitions,
            }
            result = erp_client.create_doc("Workflow", doc)
            return _json(result)

        elif tool_name == "create_print_format":
            doc = {
                "doctype": "Print Format",
                "name": tool_input["name"],
                "doc_type": tool_input["doc_type"],
                "print_format_type": tool_input.get("print_format_type", "Jinja"),
                "html": tool_input["html"],
                "custom_format": 1,
                "standard": "No",
                "module": "Printing",
            }
            if tool_input.get("css"):
                doc["css"] = tool_input["css"]
            if tool_input.get("default_print_language"):
                doc["default_print_language"] = tool_input["default_print_language"]
            for field in ("align_labels_right", "show_section_headings", "line_breaks", "disabled"):
                if tool_input.get(field) is not None:
                    doc[field] = 1 if tool_input[field] else 0
            result = erp_client.create_doc("Print Format", doc)
            return _json(result)

        elif tool_name == "list_print_formats":
            result = erp_client.get_list("Print Format", filters=[
                ["doc_type", "=", tool_input["doc_type"]],
            ], fields=["name", "doc_type", "standard", "disabled", "print_format_type"],
               limit=50, order_by="name asc")
            return _json(result)

        elif tool_name == "create_letter_head":
            doc = {
                "doctype": "Letter Head",
                "letter_head_name": tool_input["letter_head_name"],
                "content": tool_input["content"],
                "is_default": 1 if tool_input.get("is_default") else 0,
                "source": "HTML",
            }
            if tool_input.get("footer"):
                doc["footer"] = tool_input["footer"]
            if tool_input.get("disabled"):
                doc["disabled"] = 1
            result = erp_client.create_doc("Letter Head", doc)
            return _json(result)

        elif tool_name == "create_notification":
            doc = {
                "doctype": "Notification",
                "subject": tool_input["subject"],
                "document_type": tool_input["document_type"],
                "event": tool_input["event"],
                "channel": tool_input.get("channel", "Email"),
                "message": tool_input["message"],
                "message_type": tool_input.get("message_type", "Markdown"),
                "enabled": 1 if tool_input.get("enabled", True) else 0,
            }
            if tool_input.get("condition"):
                doc["condition"] = tool_input["condition"]
            if tool_input.get("recipients"):
                doc["recipients"] = tool_input["recipients"]
            if tool_input.get("days_in_advance") is not None:
                doc["days_in_advance"] = tool_input["days_in_advance"]
            if tool_input.get("date_changed"):
                doc["date_changed"] = tool_input["date_changed"]
            if tool_input.get("value_changed"):
                doc["value_changed"] = tool_input["value_changed"]
            if tool_input.get("set_property_after_alert"):
                doc["set_property_after_alert"] = tool_input["set_property_after_alert"]
            if tool_input.get("property_value"):
                doc["property_value"] = tool_input["property_value"]
            result = erp_client.create_doc("Notification", doc)
            return _json(result)

        elif tool_name == "send_email":
            result = erp_client.send_email(
                recipients=tool_input["recipients"],
                subject=tool_input["subject"],
                message=tool_input["message"],
                cc=tool_input.get("cc"),
                bcc=tool_input.get("bcc"),
                reference_doctype=tool_input.get("reference_doctype"),
                reference_name=tool_input.get("reference_name"),
            )
            return _json(result)

        elif tool_name == "bulk_update":
            dt = tool_input["doctype"]
            data = tool_input["data"]
            limit = min(tool_input.get("limit", 50), 200)
            if tool_input.get("names"):
                names = tool_input["names"][:limit]
            elif tool_input.get("filters"):
                records = erp_client.get_list(dt, filters=tool_input["filters"],
                                              fields=["name"], limit=limit)
                if isinstance(records, dict) and "error" in records:
                    return _json(records)
                names = [r["name"] for r in records]
            else:
                return _json({"error": "Provide either 'names' or 'filters' to select records"})
            if not names:
                return _json({"error": "No records matched the criteria"})
            results = erp_client.bulk_update_docs(dt, names, data)
            success = sum(1 for r in results if r["result"] == "ok")
            return _json({
                "total": len(names),
                "updated": success,
                "failed": len(names) - success,
                "details": results,
            })

        elif tool_name == "export_records":
            import csv
            import io
            import tempfile
            dt = tool_input["doctype"]
            fields = tool_input["fields"]
            limit = min(tool_input.get("limit", 100), 500)
            records = erp_client.get_list(
                dt, filters=tool_input.get("filters"),
                fields=fields, limit=limit,
                order_by=tool_input.get("order_by"),
            )
            if isinstance(records, dict) and "error" in records:
                return _json(records)
            if not records:
                return _json({"error": "No records found matching criteria"})
            # Generate CSV
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fields)
            writer.writeheader()
            for rec in records:
                writer.writerow({f: rec.get(f, "") for f in fields})
            csv_content = output.getvalue()
            # Save to temp file
            fname = f"{dt.replace(' ', '_')}_export.csv"
            path = os.path.join(tempfile.gettempdir(), fname)
            with open(path, "w") as f:
                f.write(csv_content)
            return json.dumps({
                "csv_path": path,
                "filename": fname,
                "records": len(records),
                "fields": fields,
                "message": f"CSV ready: {fname} with {len(records)} records. Sending to user...",
            })

        elif tool_name == "rename_document":
            result = erp_client.rename_doc(
                tool_input["doctype"],
                tool_input["old_name"],
                tool_input["new_name"],
                merge=tool_input.get("merge", False),
            )
            return _json(result)

        elif tool_name == "amend_document":
            dt = tool_input["doctype"]
            name = tool_input["name"]
            # Fetch the cancelled document
            doc = erp_client.get_doc(dt, name)
            if isinstance(doc, dict) and "error" in doc:
                return _json(doc)
            if isinstance(doc, dict) and doc.get("docstatus") != 2:
                return _json({"error": f"Document {name} is not cancelled (docstatus={doc.get('docstatus')}). Only cancelled documents can be amended."})
            # Create amended copy
            amended = erp_client.run_method("frappe.client.amend_doc", doctype=dt, name=name)
            return _json(amended)

        elif tool_name == "get_system_settings":
            result = erp_client.get_system_settings()
            if isinstance(result, dict) and "error" not in result:
                # Filter to useful settings only
                useful = {k: result.get(k) for k in (
                    "language", "time_zone", "date_format", "time_format",
                    "number_format", "float_precision", "currency_precision",
                    "country", "disable_rounded_total", "setup_complete",
                    "email_footer_address", "disable_standard_email_footer",
                ) if result.get(k) is not None}
                return _json(useful)
            return _json(result)

        elif tool_name == "update_system_settings":
            result = erp_client.update_doc("System Settings", "System Settings",
                                           tool_input["settings"])
            return _json(result)

        elif tool_name == "list_erp_users":
            filters = [["user_type", "=", "System User"]]
            if tool_input.get("enabled") is not None:
                filters.append(["enabled", "=", 1 if tool_input["enabled"] else 0])
            if tool_input.get("search"):
                filters.append(["full_name", "like", f"%{tool_input['search']}%"])
            result = erp_client.get_list("User", filters=filters,
                                         fields=["name", "full_name", "enabled",
                                                 "last_login", "user_type"],
                                         limit=50, order_by="full_name asc")
            return _json(result)

        elif tool_name == "manage_user_roles":
            user_email = tool_input["user"]
            results = {"user": user_email, "added": [], "removed": [], "errors": []}
            for role in tool_input.get("add_roles", []):
                try:
                    r = erp_client.run_method(
                        "frappe.core.doctype.user.user.add_role",
                        user=user_email, role=role)
                    results["added"].append(role)
                except Exception as e:
                    results["errors"].append(f"Add {role}: {str(e)}")
            for role in tool_input.get("remove_roles", []):
                try:
                    r = erp_client.run_method(
                        "frappe.core.doctype.user.user.remove_role",
                        user=user_email, role=role)
                    results["removed"].append(role)
                except Exception as e:
                    results["errors"].append(f"Remove {role}: {str(e)}")
            return _json(results)

        elif tool_name == "get_backup_info":
            # Try to get backup info
            try:
                result = erp_client.run_method("frappe.utils.backups.get_backup_list")
                return _json(result)
            except Exception:
                # Fallback: check scheduled backup settings
                settings = erp_client.get_doc("System Settings", "System Settings")
                if isinstance(settings, dict):
                    backup_info = {
                        "backup_url": settings.get("backup_url"),
                        "enable_auto_backup": settings.get("enable_auto_backup"),
                        "backup_limit": settings.get("backup_limit"),
                        "note": "For Frappe Cloud sites, backups are managed automatically. "
                                "Visit your Frappe Cloud dashboard for full backup management.",
                    }
                    return _json(backup_info)
                return _json({"note": "This is a Frappe Cloud hosted site. Backups are managed via Frappe Cloud dashboard."})

        # ── Natural Language Field Action Tools (self-service via chat) ──

        elif tool_name == "chat_mark_attendance":
            from datetime import datetime
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            log_type = tool_input["log_type"]
            now = datetime.now()
            doc = {
                "doctype": "Employee Checkin",
                "employee": emp_id,
                "time": now.strftime("%Y-%m-%d %H:%M:%S"),
                "log_type": log_type,
                "device_id": f"telegram-{user_id}",
            }
            result = erp_client.create_doc("Employee Checkin", doc)
            if _ok(result):
                emp_name = mapping.get("employee_name", emp_id)
                return _json({"message": f"Attendance {log_type.lower()} recorded for {emp_name} at {now.strftime('%I:%M %p')}. (No GPS — use Mini App for location-based check-in.)", "checkin_id": result.get("name")})
            return _json(result)

        elif tool_name == "log_visit":
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            today = date.today().isoformat()
            doc = {
                "doctype": "Daily Call Report",
                "employee": emp_id,
                "customer": tool_input["customer"],
                "date": today,
                "status": "Ongoing",
                "company": COMPANY,
            }
            if tool_input.get("department"):
                doc["department"] = tool_input["department"]
            if tool_input.get("visit_purpose"):
                doc["visit_purpose"] = tool_input["visit_purpose"]
            if tool_input.get("service_purpose"):
                doc["service_purpose"] = tool_input["service_purpose"]
            if tool_input.get("remarks"):
                doc["remarks"] = tool_input["remarks"]
            result = erp_client.create_doc("Daily Call Report", doc)
            if _ok(result):
                emp_name = mapping.get("employee_name", emp_id)
                return _json({"message": f"Visit to {tool_input['customer']} logged for {emp_name} on {today}.", "dcr_id": result.get("name")})
            return _json(result)

        elif tool_name == "apply_leave_for_employee":
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            doc = {
                "doctype": "Leave Application",
                "employee": emp_id,
                "leave_type": tool_input["leave_type"],
                "from_date": tool_input["from_date"],
                "to_date": tool_input["to_date"],
                "status": "Open",
            }
            if tool_input.get("half_day"):
                doc["half_day"] = 1
                doc["half_day_date"] = tool_input["from_date"]
            if tool_input.get("reason"):
                doc["reason"] = tool_input["reason"]
            result = erp_client.create_doc("Leave Application", doc)
            if _ok(result):
                emp_name = mapping.get("employee_name", emp_id)
                days = "half day" if tool_input.get("half_day") else f"{tool_input['from_date']} to {tool_input['to_date']}"
                return _json({"message": f"Leave application ({tool_input['leave_type']}) submitted for {emp_name}: {days}. Status: Open (pending approval).", "leave_id": result.get("name")})
            return _json(result)

        elif tool_name == "submit_expense_for_employee":
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            expenses = []
            total = 0
            for exp in tool_input["expenses"]:
                expenses.append({
                    "expense_type": exp["expense_type"],
                    "amount": exp["amount"],
                    "description": exp.get("description", exp["expense_type"]),
                    "sanctioned_amount": exp["amount"],
                })
                total += exp["amount"]
            doc = {
                "doctype": "Expense Claim",
                "employee": emp_id,
                "posting_date": date.today().isoformat(),
                "company": COMPANY,
                "expenses": expenses,
                "payable_account": f"Creditors - {ABBR}",
            }
            result = erp_client.create_doc("Expense Claim", doc)
            if _ok(result):
                emp_name = mapping.get("employee_name", emp_id)
                items_desc = ", ".join(f"{e['expense_type']} (Rs. {e['amount']:,.0f})" for e in tool_input["expenses"])
                return _json({"message": f"Expense claim created for {emp_name}: {items_desc}. Total: Rs. {total:,.0f}. Status: Draft.", "expense_claim_id": result.get("name")})
            return _json(result)

        elif tool_name == "request_advance_for_employee":
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            doc = {
                "doctype": "Employee Advance",
                "employee": emp_id,
                "advance_amount": tool_input["amount"],
                "purpose": tool_input["purpose"],
                "posting_date": date.today().isoformat(),
                "company": COMPANY,
                "currency": "INR",
                "exchange_rate": 1,
            }
            result = erp_client.create_doc("Employee Advance", doc)
            if _ok(result):
                emp_name = mapping.get("employee_name", emp_id)
                return _json({"message": f"Advance request of Rs. {tool_input['amount']:,.0f} created for {emp_name}. Purpose: {tool_input['purpose']}. Status: Draft (pending approval).", "advance_id": result.get("name")})
            return _json(result)

        elif tool_name == "team_status":
            from datetime import datetime
            today = date.today().isoformat()
            # Get all active employees
            employees = erp_client.get_list("Employee", filters=[
                ["status", "=", "Active"], ["company", "=", COMPANY],
            ], fields=["name", "employee_name", "department", "designation"], limit=200)
            if isinstance(employees, dict) and "error" in employees:
                return _json(employees)
            # Get today's checkins
            checkins = erp_client.get_list("Employee Checkin", filters=[
                ["time", ">=", f"{today} 00:00:00"],
                ["time", "<=", f"{today} 23:59:59"],
            ], fields=["employee", "employee_name", "log_type", "time"], limit=500, order_by="time asc")
            if isinstance(checkins, dict) and "error" in checkins:
                checkins = []
            # Get today's attendance
            attendance = erp_client.get_list("Attendance", filters=[
                ["attendance_date", "=", today], ["docstatus", "=", 1],
            ], fields=["employee", "employee_name", "status"], limit=200)
            if isinstance(attendance, dict) and "error" in attendance:
                attendance = []
            # Build status map
            checkin_map = {}
            for c in checkins:
                emp = c.get("employee", "")
                if emp not in checkin_map:
                    checkin_map[emp] = []
                checkin_map[emp].append(c)
            att_map = {a["employee"]: a["status"] for a in attendance}
            checked_in = []
            absent = []
            on_leave = []
            not_marked = []
            for emp in employees:
                eid = emp["name"]
                ename = emp.get("employee_name", eid)
                dept = emp.get("department", "")
                if eid in att_map:
                    st = att_map[eid]
                    if st == "On Leave":
                        on_leave.append(f"  - {ename} ({dept})")
                    elif st == "Absent":
                        absent.append(f"  - {ename} ({dept})")
                    else:
                        checked_in.append(f"  - {ename} ({dept})")
                elif eid in checkin_map:
                    last = checkin_map[eid][-1]
                    lt = last.get("log_type", "")
                    checked_in.append(f"  - {ename} ({dept}) — last: {lt}")
                else:
                    not_marked.append(f"  - {ename} ({dept})")
            lines = [f"Team Status for {today}", f"Total employees: {len(employees)}", ""]
            if checked_in:
                lines.append(f"Checked In ({len(checked_in)}):")
                lines.extend(checked_in)
            if on_leave:
                lines.append(f"\nOn Leave ({len(on_leave)}):")
                lines.extend(on_leave)
            if absent:
                lines.append(f"\nAbsent ({len(absent)}):")
                lines.extend(absent)
            if not_marked:
                lines.append(f"\nNot Marked ({len(not_marked)}):")
                lines.extend(not_marked)
            return _json({"message": "\n".join(lines)})

        elif tool_name == "my_daily_summary":
            emp_id, mapping = _resolve_employee_for_chat(user_id)
            if not emp_id:
                return _json({"error": "Your Telegram account is not linked to an employee record. Please ask your admin to set up the mapping."})
            today = date.today().isoformat()
            emp_name = mapping.get("employee_name", emp_id)
            lines = [f"Daily Summary for {emp_name} — {today}", ""]
            # Attendance / Checkins
            checkins = erp_client.get_list("Employee Checkin", filters=[
                ["employee", "=", emp_id],
                ["time", ">=", f"{today} 00:00:00"],
                ["time", "<=", f"{today} 23:59:59"],
            ], fields=["log_type", "time"], limit=20, order_by="time asc")
            if isinstance(checkins, list) and checkins:
                lines.append("Attendance:")
                for c in checkins:
                    t = c.get("time", "")
                    if isinstance(t, str) and len(t) > 10:
                        t = t[11:16]  # extract HH:MM
                    lines.append(f"  - {c.get('log_type', 'Check')} at {t}")
            else:
                lines.append("Attendance: No check-in recorded today.")
            # Daily Call Reports (visits)
            dcrs = erp_client.get_list("Daily Call Report", filters=[
                ["employee", "=", emp_id], ["date", "=", today],
            ], fields=["customer", "status", "name"], limit=20)
            if isinstance(dcrs, list) and dcrs:
                lines.append(f"\nVisits ({len(dcrs)}):")
                for d in dcrs:
                    lines.append(f"  - {d.get('customer', 'N/A')} — {d.get('status', 'N/A')}")
            else:
                lines.append("\nVisits: None logged today.")
            # Pending leave applications
            leaves = erp_client.get_list("Leave Application", filters=[
                ["employee", "=", emp_id], ["status", "=", "Open"],
            ], fields=["leave_type", "from_date", "to_date", "name"], limit=5)
            if isinstance(leaves, list) and leaves:
                lines.append(f"\nPending Leave Requests ({len(leaves)}):")
                for lv in leaves:
                    lines.append(f"  - {lv.get('leave_type', 'N/A')}: {lv.get('from_date', '')} to {lv.get('to_date', '')}")
            # Pending expense claims
            expenses = erp_client.get_list("Expense Claim", filters=[
                ["employee", "=", emp_id], ["docstatus", "=", 0],
            ], fields=["name", "total_claimed_amount"], limit=5)
            if isinstance(expenses, list) and expenses:
                lines.append(f"\nPending Expense Claims ({len(expenses)}):")
                for ex in expenses:
                    lines.append(f"  - {ex.get('name', 'N/A')}: Rs. {ex.get('total_claimed_amount', 0):,.0f}")
            # Pending advances
            advances = erp_client.get_list("Employee Advance", filters=[
                ["employee", "=", emp_id], ["docstatus", "=", 0],
            ], fields=["name", "advance_amount", "purpose"], limit=5)
            if isinstance(advances, list) and advances:
                lines.append(f"\nPending Advance Requests ({len(advances)}):")
                for adv in advances:
                    lines.append(f"  - Rs. {adv.get('advance_amount', 0):,.0f} — {adv.get('purpose', 'N/A')}")
            return _json({"message": "\n".join(lines)})

        elif tool_name == "query_view":
            import requests as sync_requests
            view_name = tool_input.get("view_name", "")
            context_id = tool_input.get("context_id")
            # Call the View Engine via the FastAPI endpoint (avoids async event loop issues)
            erp_url = os.getenv("ERPNEXT_URL", "https://dynamicservitech.m.frappe.cloud").rstrip("/")
            admin_key = os.getenv("ERPNEXT_API_KEY", "")
            admin_sec = os.getenv("ERPNEXT_API_SECRET", "")
            # Use the user's own ERP client keys if available
            auth_header = f"token {erp_client.api_key}:{erp_client.api_secret}" if erp_client else f"token {admin_key}:{admin_sec}"
            try:
                url = f"http://localhost:8443/api/field/view/{view_name}"
                if context_id:
                    url += f"/{context_id}"
                r = sync_requests.get(url, headers={"Authorization": auth_header}, timeout=20)
                if r.status_code != 200:
                    return json.dumps({"error": f"View query failed: {r.status_code}"})
                result = r.json()
                result_str = json.dumps(result, default=str)
                if len(result_str) > 4000:
                    result_str = result_str[:4000] + "\n\n[... truncated]"
                return result_str
            except Exception as e:
                return json.dumps({"error": str(e)})

        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})

    except Exception as e:
        return json.dumps({"error": str(e)})


def _ok(result):
    return isinstance(result, dict) and "error" not in result


def _sanitize_tool_output(text):
    """Strip potential prompt injection markers from ERP data."""
    import re
    # Remove HTML comment injection attempts
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Remove attempts to break out of tool results
    text = re.sub(r'</?(?:system|instructions|prompt|rules)>', '', text, flags=re.IGNORECASE)
    # Remove markdown heading injection (only strip if it looks like injection)
    text = re.sub(r'^#{1,3}\s*(?:IGNORE|OVERRIDE|SYSTEM|INSTRUCTION).*$', '[sanitized]', text, flags=re.MULTILINE | re.IGNORECASE)
    return text


def _json(obj):
    text = json.dumps(obj, indent=2, default=str)[:8000]
    # Make errors impossible to miss so Claude never glosses over them
    if isinstance(obj, dict) and "error" in obj:
        return f"❌ ERROR: {obj['error']}"
    return _sanitize_tool_output(text)


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
    # New tools — data operations (manager+user)
    "bulk_update", "export_records", "send_email", "amend_document",
    # Self-service chat tools
    "chat_mark_attendance", "log_visit", "apply_leave_for_employee",
    "submit_expense_for_employee", "request_advance_for_employee",
    "my_daily_summary",
}
MANAGER_TOOLS = {"cancel_document", "team_status"}
ADMIN_TOOLS = {
    "delete_document",
    # New admin-only tools — system configuration
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
_TOOL_LOOKUP = {}  # populated after TOOLS list is defined

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
