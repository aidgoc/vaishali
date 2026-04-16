"""Core tool schemas — always loaded."""

CORE_TOOLS = [
    {
        "name": "search_records",
        "description": "Search ERPNext records by doctype with filters. ALWAYS use before creating to avoid duplicates.\n\nReturns: Array of objects with requested fields. Each object contains 'name' (document ID) plus any fields you specify.\n\nFilter operators: =, !=, <, >, <=, >=, like, not like, in, not in, between, is (set/not set).\n\nExamples:\n1. Expense accounts: {\"doctype\": \"Account\", \"filters\": [[\"account_type\", \"=\", \"Expense Account\"], [\"is_group\", \"=\", 0]], \"fields\": [\"name\", \"account_name\"]}\n2. Recent invoices: {\"doctype\": \"Sales Invoice\", \"filters\": [[\"posting_date\", \">=\", \"2026-01-01\"]], \"fields\": [\"name\", \"customer\", \"grand_total\", \"status\"], \"order_by\": \"posting_date desc\", \"limit\": 10}\n3. Fuzzy name search: {\"doctype\": \"Supplier\", \"filters\": [[\"supplier_name\", \"like\", \"%power%\"]], \"fields\": [\"name\", \"supplier_name\"]}\n4. Multiple conditions: {\"doctype\": \"Sales Order\", \"filters\": [[\"status\", \"=\", \"To Deliver and Bill\"], [\"grand_total\", \">\", 50000]], \"fields\": [\"name\", \"customer\", \"grand_total\"]}\n5. Date range: {\"doctype\": \"Payment Entry\", \"filters\": [[\"posting_date\", \"between\", [\"2026-03-01\", \"2026-03-31\"]]], \"fields\": [\"name\", \"party\", \"paid_amount\"]}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "ERPNext doctype name"
                },
                "filters": {
                    "type": "array",
                    "description": "Filters as list of lists: [[field, operator, value], ...]. Operators: =, !=, <, >, <=, >=, like, not like, in, not in, between",
                    "items": {
                        "type": "array"
                    }
                },
                "fields": {
                    "type": "array",
                    "description": "Fields to return. Use ['name', 'field1', 'field2']. Default: ['name']",
                    "items": {
                        "type": "string"
                    }
                },
                "order_by": {
                    "type": "string",
                    "description": "e.g. 'creation desc', 'posting_date desc'"
                },
                "limit": {
                    "type": "number",
                    "description": "Max records (default 20, max 100)"
                }
            },
            "required": [
                "doctype"
            ]
        }
    },
    {
        "name": "get_document",
        "description": "Fetch a single document with ALL fields and child tables. Returns: Full document object with every field, child table rows, docstatus, owner, timestamps.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string"
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    },
    {
        "name": "get_count",
        "description": "Get count of records matching filters. Returns: {\"count\": number}. Quick way to check totals without fetching data.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "filters": {
                    "type": "array",
                    "items": {
                        "type": "array"
                    }
                }
            },
            "required": [
                "doctype"
            ]
        }
    },
    {
        "name": "search_link",
        "description": "Quick fuzzy search by name/text (like ERPNext search bar). Returns: Array of {\"value\": \"DOC-NAME\", \"description\": \"display text\"}. Faster than search_records for simple lookups.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "e.g. Customer, Supplier, Item, Employee, Account"
                },
                "txt": {
                    "type": "string",
                    "description": "Search text"
                }
            },
            "required": [
                "doctype",
                "txt"
            ]
        }
    },
    {
        "name": "get_report",
        "description": "Run an ERPNext report. Returns: {{\"columns\": [...], \"result\": [rows...]}}.\n\nReports by module:\nACCOUNTING: General Ledger, Trial Balance, Balance Sheet, Profit and Loss Statement, Accounts Receivable/Payable (+ Summary), Gross Profit, Sales/Purchase Register, Cash Flow, Budget Variance Report.\nINVENTORY: Stock Balance, Stock Ledger, Stock Projected Qty, Stock Ageing, Warehouse wise Stock Balance.\nSALES: Sales Analytics, Quotation/Sales Order/Delivery Note Trends.\nBUYING: Purchase Analytics, Purchase Order Trends.\nHR: Monthly Attendance Sheet, Employee Leave Balance.\nMANUFACTURING: BOM Stock Report, Work Order Summary.\n\nCompany defaults are auto-set. Date defaults: from 2025-01-01 to today.\n\nExamples:\n1. P&L: {{\"report_name\": \"Profit and Loss Statement\", \"filters\": {{\"period_start_date\": \"2026-03-01\", \"period_end_date\": \"2026-03-31\"}}}}\n2. Stock: {{\"report_name\": \"Stock Balance\"}}\n3. Receivables: {{\"report_name\": \"Accounts Receivable\"}}\n4. GL for supplier: {{\"report_name\": \"General Ledger\", \"filters\": {{\"party_type\": \"Supplier\", \"party\": [\"ABC Electronics\"]}}}}",
        "input_schema": {
            "type": "object",
            "properties": {
                "report_name": {
                    "type": "string"
                },
                "filters": {
                    "type": "object",
                    "description": "Report-specific filters as key-value pairs"
                }
            },
            "required": [
                "report_name"
            ]
        }
    },
    {
        "name": "business_dashboard",
        "description": "Quick business overview. Returns: {{revenue, expenses, accounts_receivable, accounts_payable, pending_sales_orders, pending_purchase_orders, active_employees, open_leads, open_projects, period, from, to}}. Use for 'how is the business', 'summary', 'dashboard', 'overview'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "description": "Period for metrics: 'today', 'this_week', 'this_month', 'this_quarter', 'this_year'. Default: this_month"
                }
            }
        }
    },
    {
        "name": "update_document",
        "description": "Update fields on an existing document. Returns: Updated document object. Only pass fields you want to change, not the entire document.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string"
                },
                "data": {
                    "type": "object",
                    "description": "Fields to update as key-value pairs"
                }
            },
            "required": [
                "doctype",
                "name",
                "data"
            ]
        }
    },
    {
        "name": "submit_document",
        "description": "Submit a draft document (docstatus 0\u21921). Returns: Submitted document or error if already submitted/cancelled. Financial documents may require approval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string"
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    },
    {
        "name": "cancel_document",
        "description": "Cancel a submitted document (docstatus 1\u21922). Manager/Admin only. Returns: Cancelled document. Requires user confirmation before executing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string"
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    },
    {
        "name": "delete_document",
        "description": "Permanently delete a cancelled/draft document. Admin only. IRREVERSIBLE. Returns: {\"status\": \"deleted\"}. Requires user confirmation.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string"
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    },
    {
        "name": "amend_bom",
        "description": "Amend a submitted BOM in one step: cancels the existing BOM, creates an amended copy with the requested changes, and submits the new version. Manager/Admin only.\n\nUse this when a user wants to change rates, quantities, or items in an active BOM.\n\nExample \u2014 change rate of item BKA01001 to 150:\n{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"items\": {\"BKA01001\": {\"rate\": 150}}}}\n\nExample \u2014 change quantity of item BKA02003 to 5:\n{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"items\": {\"BKA02003\": {\"qty\": 5}}}}\n\nExample \u2014 update a top-level field like quantity:\n{\"name\": \"BOM-BKC01004-001\", \"changes\": {\"quantity\": 10}}",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The submitted BOM name to amend (e.g. BOM-BKC01004-001)"
                },
                "changes": {
                    "type": "object",
                    "description": "Changes to apply. Use 'items' key with item_code \u2192 {field: value} for item-level changes. Use top-level keys for BOM header fields.",
                    "properties": {
                        "items": {
                            "type": "object",
                            "description": "Item-level changes keyed by item_code. E.g. {\"BKA01001\": {\"rate\": 150, \"qty\": 3}}"
                        },
                        "quantity": {
                            "type": "number",
                            "description": "BOM quantity"
                        }
                    }
                }
            },
            "required": [
                "name",
                "changes"
            ]
        }
    },
    {
        "name": "erp_attach",
        "description": "Attach a previously uploaded file (photo, PDF, voice note) to an ERPNext document. Use after creating/finding an ERPNext document to link evidence. Lists user's recent files if no file_prefix given.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "e.g. Purchase Invoice"
                },
                "docname": {
                    "type": "string",
                    "description": "e.g. ACC-PINV-2026-00001"
                },
                "file_prefix": {
                    "type": "string",
                    "description": "Start of the file_id returned when the user uploaded the file"
                }
            },
            "required": [
                "doctype",
                "docname"
            ]
        }
    },
    {
        "name": "semantic_search",
        "description": "Semantic search across all uploaded media (voice notes, photos, PDFs, invoices). Use to find past documents by meaning, not just keywords. Returns top matching files with their transcripts and ERP links.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string"
                },
                "top_k": {
                    "type": "number",
                    "description": "Max results (default 5)"
                }
            },
            "required": [
                "query"
            ]
        }
    },
    {
        "name": "get_print_pdf",
        "description": "Download a printable PDF of any ERPNext document (invoice, order, receipt, etc.) and send it to the user. Use when user asks for a PDF, printout, or wants to share/download a document.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "e.g. Sales Invoice, Purchase Order, Quotation"
                },
                "name": {
                    "type": "string",
                    "description": "Document name e.g. ACC-SINV-2026-00001"
                },
                "print_format": {
                    "type": "string",
                    "description": "Optional print format name. Leave blank for default."
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    },
    {
        "name": "get_system_settings",
        "description": "View current system settings (language, timezone, email, etc.). Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "chat_mark_attendance",
        "description": "Mark attendance (check in or check out) for the employee. Note: GPS is not available via chat. For GPS attendance, direct the user to the DSPL Mini App.",
        "input_schema": {
            "type": "object",
            "properties": {
                "log_type": {
                    "type": "string",
                    "enum": [
                        "Checkin",
                        "Checkout"
                    ],
                    "description": "Checkin or Checkout"
                }
            },
            "required": [
                "log_type"
            ]
        }
    },
    {
        "name": "log_visit",
        "description": "Create a Daily Call Report (customer visit log) for the employee. Use when they mention visiting a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string",
                    "description": "Customer name or ID"
                },
                "department": {
                    "type": "string",
                    "enum": [
                        "Sales",
                        "Service",
                        "Office"
                    ]
                },
                "visit_purpose": {
                    "type": "string",
                    "description": "Sales: Cold Call / New Enquiry, Lead Follow-up, Quotation Follow-up, Order Follow-up, Recovery, Relationship Building"
                },
                "service_purpose": {
                    "type": "string",
                    "description": "Service: Installation, Breakdown / Repair, Preventive Maintenance (AMC), Commissioning, Training, Warranty Service, Inspection"
                },
                "remarks": {
                    "type": "string",
                    "description": "Visit notes"
                }
            },
            "required": [
                "customer"
            ]
        }
    },
    {
        "name": "apply_leave_for_employee",
        "description": "Apply for leave. Parse dates and leave type from the employee's message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "leave_type": {
                    "type": "string",
                    "enum": [
                        "Casual Leave",
                        "Sick Leave",
                        "Privilege Leave",
                        "Compensatory Off",
                        "Leave Without Pay"
                    ]
                },
                "from_date": {
                    "type": "string",
                    "description": "Start date YYYY-MM-DD"
                },
                "to_date": {
                    "type": "string",
                    "description": "End date YYYY-MM-DD"
                },
                "half_day": {
                    "type": "integer",
                    "enum": [
                        0,
                        1
                    ]
                },
                "reason": {
                    "type": "string"
                }
            },
            "required": [
                "leave_type",
                "from_date",
                "to_date"
            ]
        }
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
                            "expense_type": {
                                "type": "string"
                            },
                            "amount": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "expense_type",
                            "amount"
                        ]
                    }
                }
            },
            "required": [
                "expenses"
            ]
        }
    },
    {
        "name": "request_advance_for_employee",
        "description": "Request an employee advance. Parse amount and purpose from the message.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount in INR"
                },
                "purpose": {
                    "type": "string",
                    "description": "Purpose of advance"
                }
            },
            "required": [
                "amount",
                "purpose"
            ]
        }
    },
    {
        "name": "team_status",
        "description": "Show today's team attendance status \u2014 who's checked in, who's in the field, who's absent. Manager/admin only.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "my_daily_summary",
        "description": "Show the employee's personal daily summary including attendance status, visits logged, and any pending requests.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "query_view",
        "description": "Query a composable business view from the View Engine. Returns role-filtered, parallel-fetched data from ERPNext.\n\nAvailable views:\n- sales_pipeline: Leads, opportunities, quotations, sales orders\n- customer_360: Full customer history (quotes, orders, invoices, visits). Requires context_id=customer_name\n- debtor_dashboard: Outstanding receivables, overdue invoices, recent payments\n- project_hub: Cross-role project view (tasks, orders, invoices). Requires context_id=project_name\n- amc_tracker: Active maintenance schedules and upcoming visits\n- my_targets: Quotation/order summary and visit stats for current FY\n- follow_ups: Quotations needing follow-up (expiring, open, lost)\n- customer_visits: Visit frequency tracking\n\nExamples:\n- 'Show sales pipeline': query_view(view_name='sales_pipeline')\n- 'Customer 360 for L&T': query_view(view_name='customer_360', context_id='Larsen & Toubro ltd')\n- 'Debtor aging': query_view(view_name='debtor_dashboard')\n- 'My targets': query_view(view_name='my_targets')\n- 'Follow up needed': query_view(view_name='follow_ups')\n",
        "input_schema": {
            "type": "object",
            "properties": {
                "view_name": {
                    "type": "string",
                    "description": "Name of the view to query",
                    "enum": [
                        "sales_pipeline",
                        "customer_360",
                        "debtor_dashboard",
                        "project_hub",
                        "amc_tracker",
                        "my_targets",
                        "follow_ups",
                        "customer_visits",
                        "production_dashboard",
                        "dispatch_tracker",
                        "service_dashboard",
                        "installation_tracker",
                        "breakdown_log",
                        "procurement_dashboard",
                        "creditor_dashboard",
                        "conversion_funnel",
                        "revenue_dashboard"
                    ]
                },
                "context_id": {
                    "type": "string",
                    "description": "Context identifier (customer name for customer_360, project name for project_hub). Required for context-dependent views."
                }
            },
            "required": [
                "view_name"
            ]
        }
    },
    {
        "name": "get_leave_balance",
        "description": "Get the current leave balance for an employee. Shows remaining leaves by type (Casual, Sick, Privilege, etc.) for the current year. Use when someone asks 'how many leaves do I have?' or 'check my leave balance'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee_id": {
                    "type": "string",
                    "description": "Employee ID. Leave empty to use the current user's employee ID."
                }
            }
        }
    },
    {
        "name": "list_pending_approvals",
        "description": "Show all documents pending the current user's approval — leave applications, expense claims, employee advances. Manager/admin only.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "approve_document",
        "description": "Approve or reject a pending document (Leave Application, Expense Claim). Manager/admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "enum": ["Leave Application", "Expense Claim"],
                    "description": "Type of document to approve"
                },
                "name": {
                    "type": "string",
                    "description": "Document name/ID (e.g., HR-LAP-00042)"
                },
                "action": {
                    "type": "string",
                    "enum": ["Approve", "Reject"],
                    "description": "Approve or Reject"
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for rejection (required when rejecting)"
                }
            },
            "required": ["doctype", "name", "action"]
        }
    },
    {
        "name": "daily_action_items",
        "description": "Get today's prioritized action items for the current user. Combines: expiring quotations, overdue customer visits, pending approvals (managers), SLA-breaching warranty claims, overdue work orders. Use for '/today' command or 'what should I do?'.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "check_stock",
        "description": "Check stock availability for an item across all warehouses. Returns warehouse-wise actual and projected quantities.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {
                    "type": "string",
                    "description": "Item code to check stock for"
                }
            },
            "required": ["item_code"]
        }
    },
    {
        "name": "save_memory",
        "description": "Save a fact or preference for future conversations. Use when you learn something about the user or their workflow that should persist across sessions.\n\nExamples: preferred report format, key customer names, common queries, workflow preferences.",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Topic identifier, e.g. 'preferred_format', 'key_customer_tata'"
                },
                "content": {
                    "type": "string",
                    "description": "The knowledge to remember for future conversations"
                }
            },
            "required": [
                "key",
                "content"
            ]
        }
    },
    {
        "name": "get_memories",
        "description": "Retrieve all saved memories/preferences for the current user. Use to recall past context.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]
