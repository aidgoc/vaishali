"""
View Registry — all view definitions as config.

Adding a new view = adding a dict here. No new endpoint needed.
The View Engine (views/__init__.py) handles the rest.

Each view has:
- description: what it shows
- context_doctype: primary entity (None for aggregated views)
- sections: role → list of section names they can see
- section_defs: section_name → how to fetch the data
"""

COMPANY = "Dynamic Servitech Private Limited"

VIEWS = {

    # ═══════════════════════════════════════════════════════════════
    # SALES PIPELINE — Leads → Quotations → Orders → Delivered
    # ═══════════════════════════════════════════════════════════════
    "sales_pipeline": {
        "description": "Sales pipeline from leads to delivery",
        "context_doctype": None,
        "sections": {
            "sales": ["leads", "opportunities", "quotations", "orders"],
            "manager": ["leads", "opportunities", "quotations", "orders"],
            "admin": ["*"],
        },
        "section_defs": {
            "leads": {
                "doctype": "Lead",
                "fields": ["name", "lead_name", "company_name", "status", "source", "territory", "creation"],
                "filters": [["status", "not in", ["Converted", "Do Not Contact"]]],
                "order_by": "creation desc",
                "limit": 50,
                "skip_company_filter": True,
            },
            "opportunities": {
                "doctype": "Opportunity",
                "fields": ["name", "party_name", "opportunity_amount", "status", "expected_closing", "source"],
                "filters": [["status", "not in", ["Lost", "Closed"]]],
                "order_by": "expected_closing asc",
                "limit": 50,
            },
            "quotations": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "status", "transaction_date", "valid_till"],
                "filters": [["docstatus", "<", 2]],
                "order_by": "transaction_date desc",
                "limit": 50,
            },
            "orders": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "status", "transaction_date", "delivery_date"],
                "filters": [["docstatus", "=", 1], ["status", "not in", ["Completed", "Cancelled"]]],
                "order_by": "transaction_date desc",
                "limit": 50,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # CUSTOMER 360 — Full customer view, role-filtered
    # ═══════════════════════════════════════════════════════════════
    "customer_360": {
        "description": "Complete customer view — quotes, orders, invoices, visits, installations",
        "context_doctype": "Customer",
        "sections": {
            "sales": ["overview", "quotations", "orders", "visits"],
            "field": ["overview", "visits"],
            "accounts": ["overview", "invoices", "payments"],
            "service": ["overview", "visits", "installations"],
            "manager": ["overview", "quotations", "orders", "invoices", "visits"],
            "admin": ["*"],
        },
        "section_defs": {
            "overview": {
                "doctype": "Customer",
                "fields": ["name", "customer_name", "territory", "customer_group",
                           "customer_primary_contact", "mobile_no", "email_id",
                           "customer_type", "industry", "website", "gstin",
                           "customer_primary_address", "primary_address", "tax_id"],
                "single": True,
            },
            "quotations": {
                "doctype": "Quotation",
                "fields": ["name", "transaction_date", "grand_total", "status", "valid_till"],
                "filters": [["party_name", "=", "{context}"]],
                "order_by": "transaction_date desc",
                "limit": 20,
                "skip_company_filter": True,
            },
            "orders": {
                "doctype": "Sales Order",
                "fields": ["name", "transaction_date", "grand_total", "status", "delivery_date", "per_delivered"],
                "filters": [["customer", "=", "{context}"]],
                "order_by": "transaction_date desc",
                "limit": 20,
            },
            "invoices": {
                "doctype": "Sales Invoice",
                "fields": ["name", "posting_date", "grand_total", "outstanding_amount", "status"],
                "filters": [["customer", "=", "{context}"]],
                "order_by": "posting_date desc",
                "limit": 20,
            },
            "payments": {
                "doctype": "Payment Entry",
                "fields": ["name", "posting_date", "paid_amount", "payment_type", "mode_of_payment"],
                "filters": [["party_type", "=", "Customer"], ["party", "=", "{context}"]],
                "order_by": "posting_date desc",
                "limit": 20,
            },
            "visits": {
                "doctype": "Daily Call Report",
                "fields": ["name", "date", "status", "visit_purpose", "service_purpose",
                           "employee_name", "remarks"],
                "filters": [["customer", "=", "{context}"]],
                "order_by": "date desc",
                "limit": 20,
                "skip_company_filter": True,
            },
            "installations": {
                "doctype": "Daily Call Report",
                "fields": ["name", "date", "status", "service_purpose", "employee_name",
                           "equipment_name", "serial_no", "remarks"],
                "filters": [["customer", "=", "{context}"],
                            ["department", "=", "Service"]],
                "order_by": "date desc",
                "limit": 20,
                "skip_company_filter": True,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # DEBTOR DASHBOARD — Outstanding receivables
    # ═══════════════════════════════════════════════════════════════
    "debtor_dashboard": {
        "description": "Outstanding receivables and debtor aging",
        "context_doctype": None,
        "sections": {
            "accounts": ["aging_report", "overdue_invoices", "recent_payments"],
            "manager": ["aging_report", "overdue_invoices"],
            "admin": ["*"],
        },
        "section_defs": {
            "aging_report": {
                "report": "Accounts Receivable Summary",
                "filters": {"company": COMPANY, "ageing_based_on": "Due Date"},
            },
            "overdue_invoices": {
                "doctype": "Sales Invoice",
                "fields": ["name", "customer", "posting_date", "due_date",
                           "grand_total", "outstanding_amount", "status"],
                "filters": [["outstanding_amount", ">", 0], ["docstatus", "=", 1]],
                "order_by": "due_date asc",
                "limit": 100,
            },
            "recent_payments": {
                "doctype": "Payment Entry",
                "fields": ["name", "posting_date", "party", "paid_amount",
                           "mode_of_payment", "reference_no"],
                "filters": [["payment_type", "=", "Receive"], ["docstatus", "=", 1]],
                "order_by": "posting_date desc",
                "limit": 20,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # PROJECT HUB — Cross-role project view
    # ═══════════════════════════════════════════════════════════════
    "project_hub": {
        "description": "Project dashboard — different view per role",
        "context_doctype": "Project",
        "sections": {
            "sales": ["overview", "orders", "quotations"],
            "accounts": ["overview", "invoices", "purchase_orders", "payments"],
            "service": ["overview", "tasks", "visits"],
            "manufacturing": ["overview", "work_orders", "boms"],
            "field": ["overview", "tasks", "visits"],
            "manager": ["overview", "orders", "invoices", "tasks", "visits"],
            "admin": ["*"],
        },
        "section_defs": {
            "overview": {
                "doctype": "Project",
                "fields": ["name", "project_name", "status", "percent_complete",
                           "expected_start_date", "expected_end_date", "company"],
                "single": True,
            },
            "tasks": {
                "doctype": "Task",
                "fields": ["name", "subject", "status", "priority", "exp_start_date",
                           "exp_end_date", "completed_by"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "exp_start_date asc",
                "skip_company_filter": True,
            },
            "orders": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "status", "transaction_date"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "transaction_date desc",
                "limit": 20,
            },
            "quotations": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "status", "transaction_date"],
                "filters": [],
                "order_by": "transaction_date desc",
                "limit": 20,
                "skip_company_filter": True,
            },
            "invoices": {
                "doctype": "Sales Invoice",
                "fields": ["name", "customer", "grand_total", "outstanding_amount", "status", "posting_date"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "posting_date desc",
                "limit": 20,
            },
            "purchase_orders": {
                "doctype": "Purchase Order",
                "fields": ["name", "supplier", "grand_total", "status", "transaction_date"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "transaction_date desc",
                "limit": 20,
            },
            "payments": {
                "doctype": "Payment Entry",
                "fields": ["name", "posting_date", "party", "paid_amount", "payment_type"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "posting_date desc",
                "limit": 20,
            },
            "visits": {
                "doctype": "Daily Call Report",
                "fields": ["name", "date", "status", "visit_purpose", "service_purpose",
                           "employee_name", "customer"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "date desc",
                "limit": 20,
                "skip_company_filter": True,
            },
            "work_orders": {
                "doctype": "Work Order",
                "fields": ["name", "production_item", "qty", "produced_qty", "status"],
                "filters": [["project", "=", "{context}"]],
                "order_by": "creation desc",
                "limit": 20,
            },
            "boms": {
                "doctype": "BOM",
                "fields": ["name", "item", "item_name", "total_cost", "is_active", "is_default"],
                "filters": [],
                "order_by": "creation desc",
                "limit": 20,
                "skip_company_filter": True,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # PRODUCTION DASHBOARD — Production team overview
    # ═══════════════════════════════════════════════════════════════
    "production_dashboard": {
        "description": "Production overview — pending orders, work orders, stock, BOM status",
        "context_doctype": None,
        "sections": {
            "manufacturing": ["pending_orders", "active_work_orders", "overdue_work_orders", "stock_levels", "bom_status"],
            "field": ["pending_orders"],
            "manager": ["pending_orders", "active_work_orders", "overdue_work_orders", "stock_levels", "bom_status"],
            "admin": ["*"],
        },
        "section_defs": {
            "pending_orders": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "status",
                           "transaction_date", "delivery_date"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "not in", ["Completed", "Cancelled", "Closed"]],
                ],
                "order_by": "delivery_date asc",
                "limit": 100,
            },
            "active_work_orders": {
                "doctype": "Work Order",
                "fields": ["name", "production_item", "item_name", "qty", "produced_qty",
                           "status", "planned_start_date", "expected_delivery_date",
                           "sales_order", "bom_no"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "in", ["Not Started", "In Process"]],
                ],
                "order_by": "planned_start_date asc",
                "limit": 100,
            },
            "overdue_work_orders": {
                "doctype": "Work Order",
                "fields": ["name", "production_item", "item_name", "qty", "produced_qty",
                           "status", "planned_start_date", "expected_delivery_date"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "in", ["Not Started", "In Process"]],
                    ["planned_start_date", "<", "today"],
                ],
                "order_by": "planned_start_date asc",
                "limit": 50,
            },
            "stock_levels": {
                "doctype": "Bin",
                "fields": ["item_code", "warehouse", "actual_qty", "projected_qty"],
                "filters": [
                    ["warehouse", "like", "%DSPL%"],
                    ["actual_qty", ">", 0],
                ],
                "order_by": "actual_qty desc",
                "limit": 100,
                "skip_company_filter": True,
            },
            "bom_status": {
                "doctype": "BOM",
                "fields": ["name", "item", "item_name", "total_cost",
                           "is_active", "is_default"],
                "filters": [["docstatus", "=", 0]],
                "order_by": "creation desc",
                "limit": 200,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # DISPATCH TRACKER — What's ready to ship
    # ═══════════════════════════════════════════════════════════════
    "dispatch_tracker": {
        "description": "Dispatch tracking — pending deliveries and recent shipments",
        "context_doctype": None,
        "sections": {
            "manufacturing": ["pending_delivery", "recent_deliveries"],
            "manager": ["pending_delivery", "recent_deliveries"],
            "admin": ["*"],
        },
        "section_defs": {
            "pending_delivery": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "status",
                           "transaction_date", "delivery_date", "per_delivered"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["per_delivered", "<", 100],
                    ["status", "not in", ["Cancelled", "Closed"]],
                ],
                "order_by": "delivery_date asc",
                "limit": 100,
            },
            "recent_deliveries": {
                "doctype": "Delivery Note",
                "fields": ["name", "customer", "grand_total", "posting_date",
                           "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["posting_date", ">=", "month_start"],
                ],
                "order_by": "posting_date desc",
                "limit": 50,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # MY TARGETS — Personal sales target vs actual dashboard
    # ═══════════════════════════════════════════════════════════════
    "my_targets": {
        "description": "Personal sales target vs actual dashboard",
        "context_doctype": None,
        "sections": {
            "sales": ["quotation_summary", "order_summary", "visit_stats"],
            "field": ["quotation_summary", "order_summary", "visit_stats"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "quotation_summary": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "transaction_date", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["transaction_date", ">=", "fy_start"],
                ],
                "order_by": "transaction_date desc",
                "limit": 100,
            },
            "order_summary": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "transaction_date", "status", "delivery_date"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["transaction_date", ">=", "fy_start"],
                ],
                "order_by": "transaction_date desc",
                "limit": 100,
            },
            "visit_stats": {
                "doctype": "Daily Call Report",
                "fields": ["name", "date", "customer", "customer_name", "status", "visit_purpose"],
                "filters": [
                    ["date", ">=", "month_start"],
                ],
                "order_by": "date desc",
                "limit": 100,
                "skip_company_filter": True,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # FOLLOW-UPS — Quotations needing follow-up
    # ═══════════════════════════════════════════════════════════════
    "follow_ups": {
        "description": "Quotations needing follow-up — open, expiring, or expired",
        "context_doctype": None,
        "sections": {
            "sales": ["expiring_soon", "open_quotes", "lost_quotes"],
            "field": ["expiring_soon", "open_quotes"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "expiring_soon": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "transaction_date", "valid_till", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "=", "Open"],
                    ["valid_till", "<=", "today_plus_7"],
                ],
                "order_by": "valid_till asc",
                "limit": 50,
            },
            "open_quotes": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "transaction_date", "valid_till", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "=", "Open"],
                ],
                "order_by": "transaction_date desc",
                "limit": 50,
            },
            "lost_quotes": {
                "doctype": "Quotation",
                "fields": ["name", "party_name", "grand_total", "transaction_date", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "=", "Lost"],
                ],
                "order_by": "transaction_date desc",
                "limit": 20,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # REVENUE DASHBOARD — Revenue tracking and collection visibility
    # ═══════════════════════════════════════════════════════════════
    "revenue_dashboard": {
        "description": "Revenue tracking — invoiced, collected, outstanding, monthly trend",
        "context_doctype": None,
        "sections": {
            "accounts": ["invoiced_this_fy", "collected_this_fy", "outstanding", "monthly_trend"],
            "manager": ["invoiced_this_fy", "collected_this_fy", "outstanding", "monthly_trend"],
            "admin": ["*"],
        },
        "section_defs": {
            "invoiced_this_fy": {
                "doctype": "Sales Invoice",
                "fields": ["name", "customer", "grand_total", "posting_date", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["posting_date", ">=", "fy_start"],
                ],
                "order_by": "posting_date desc",
                "limit": 500,
            },
            "collected_this_fy": {
                "doctype": "Payment Entry",
                "fields": ["name", "posting_date", "party", "paid_amount",
                           "mode_of_payment", "reference_no"],
                "filters": [
                    ["payment_type", "=", "Receive"],
                    ["docstatus", "=", 1],
                    ["posting_date", ">=", "fy_start"],
                ],
                "order_by": "posting_date desc",
                "limit": 500,
            },
            "outstanding": {
                "doctype": "Sales Invoice",
                "fields": ["name", "customer", "posting_date", "due_date",
                           "grand_total", "outstanding_amount", "status"],
                "filters": [
                    ["outstanding_amount", ">", 0],
                    ["docstatus", "=", 1],
                ],
                "order_by": "due_date asc",
                "limit": 500,
            },
            "monthly_trend": {
                "doctype": "Sales Invoice",
                "fields": ["name", "customer", "grand_total", "posting_date"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["posting_date", ">=", "fy_start"],
                ],
                "order_by": "posting_date desc",
                "limit": 500,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # CUSTOMER VISITS — Visit frequency tracking
    # ═══════════════════════════════════════════════════════════════
    "customer_visits": {
        "description": "Customer visit frequency tracking",
        "context_doctype": None,
        "sections": {
            "sales": ["recent_visits", "no_recent_visit"],
            "field": ["recent_visits"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "recent_visits": {
                "doctype": "Daily Call Report",
                "fields": ["customer", "customer_name", "date", "visit_purpose", "employee_name", "status"],
                "filters": [
                    ["date", ">=", "fy_start"],
                    ["status", "=", "Completed"],
                ],
                "order_by": "date desc",
                "limit": 200,
                "skip_company_filter": True,
            },
            "no_recent_visit": {
                "doctype": "Customer",
                "fields": ["name", "customer_name", "territory", "customer_group"],
                "filters": [
                    ["disabled", "=", 0],
                ],
                "order_by": "customer_name asc",
                "limit": 500,
                "skip_company_filter": True,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # AMC TRACKER — Active contracts, renewals, overdue visits
    # ═══════════════════════════════════════════════════════════════
    "amc_tracker": {
        "description": "AMC lifecycle — contracts, renewals, scheduled visits",
        "context_doctype": None,
        "sections": {
            "service": ["active_schedules", "upcoming_visits"],
            "sales": ["active_schedules"],
            "manager": ["active_schedules", "upcoming_visits"],
            "admin": ["*"],
        },
        "section_defs": {
            "active_schedules": {
                "doctype": "Maintenance Schedule",
                "fields": ["name", "customer", "transaction_date", "status"],
                "filters": [["docstatus", "=", 1]],
                "order_by": "transaction_date desc",
                "limit": 50,
            },
            "upcoming_visits": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type"],
                "filters": [["docstatus", "<", 2]],
                "order_by": "mntc_date asc",
                "limit": 50,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # SERVICE DASHBOARD — Personal service engineer workload
    # ═══════════════════════════════════════════════════════════════
    "service_dashboard": {
        "description": "Service engineer workload — installations, breakdowns, scheduled visits",
        "context_doctype": None,
        "sections": {
            "service": ["pending_installations", "open_breakdowns", "todays_visits", "recent_completed"],
            "field": ["pending_installations", "open_breakdowns", "todays_visits"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "pending_installations": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type", "contact_name"],
                "filters": [
                    ["maintenance_type", "=", "Scheduled"],
                    ["completion_status", "=", "Partially Completed"],
                    ["docstatus", "<", 2],
                ],
                "order_by": "mntc_date asc",
                "limit": 50,
            },
            "open_breakdowns": {
                "doctype": "Warranty Claim",
                "fields": ["name", "customer", "complaint_date", "complaint",
                           "status", "serial_no", "item_name", "territory"],
                "filters": [
                    ["status", "not in", ["Closed", "Cancelled"]],
                ],
                "order_by": "complaint_date desc",
                "limit": 50,
            },
            "todays_visits": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type"],
                "filters": [
                    ["mntc_date", "=", "today"],
                    ["docstatus", "<", 2],
                ],
                "order_by": "mntc_date asc",
                "limit": 20,
            },
            "recent_completed": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type"],
                "filters": [
                    ["completion_status", "=", "Fully Completed"],
                    ["mntc_date", ">=", "month_start"],
                ],
                "order_by": "mntc_date desc",
                "limit": 20,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # INSTALLATION TRACKER — Delivered orders pending installation
    # ═══════════════════════════════════════════════════════════════
    "installation_tracker": {
        "description": "Installation tracking — delivered orders pending installation",
        "context_doctype": None,
        "sections": {
            "service": ["delivered_orders", "scheduled_installs", "completed_installs"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "delivered_orders": {
                "doctype": "Sales Order",
                "fields": ["name", "customer", "grand_total", "transaction_date",
                           "delivery_date", "status", "per_delivered"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["per_delivered", ">", 0],
                    ["status", "not in", ["Completed", "Cancelled", "Closed"]],
                ],
                "order_by": "delivery_date desc",
                "limit": 50,
            },
            "scheduled_installs": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type", "contact_name"],
                "filters": [
                    ["maintenance_type", "=", "Scheduled"],
                    ["completion_status", "!=", "Fully Completed"],
                    ["docstatus", "<", 2],
                ],
                "order_by": "mntc_date asc",
                "limit": 50,
            },
            "completed_installs": {
                "doctype": "Maintenance Visit",
                "fields": ["name", "customer", "mntc_date", "completion_status",
                           "maintenance_type"],
                "filters": [
                    ["maintenance_type", "=", "Scheduled"],
                    ["completion_status", "=", "Fully Completed"],
                    ["mntc_date", ">=", "fy_start"],
                ],
                "order_by": "mntc_date desc",
                "limit": 30,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # BREAKDOWN LOG — Warranty claims and complaint tracking
    # ═══════════════════════════════════════════════════════════════
    "breakdown_log": {
        "description": "Breakdown response — warranty claims and complaint tracking",
        "context_doctype": None,
        "sections": {
            "service": ["open_claims", "in_progress", "resolved_this_month"],
            "field": ["open_claims", "in_progress"],
            "manager": ["*"],
            "admin": ["*"],
        },
        "section_defs": {
            "open_claims": {
                "doctype": "Warranty Claim",
                "fields": ["name", "customer", "complaint_date", "complaint",
                           "status", "serial_no", "item_name", "territory"],
                "filters": [
                    ["status", "=", "Open"],
                ],
                "order_by": "complaint_date asc",
                "limit": 50,
            },
            "in_progress": {
                "doctype": "Warranty Claim",
                "fields": ["name", "customer", "complaint_date", "complaint",
                           "status", "serial_no", "item_name", "resolution_date"],
                "filters": [
                    ["status", "=", "Work In Progress"],
                ],
                "order_by": "complaint_date asc",
                "limit": 50,
            },
            "resolved_this_month": {
                "doctype": "Warranty Claim",
                "fields": ["name", "customer", "complaint_date", "resolution_date",
                           "complaint", "status", "serial_no", "item_name", "resolution_details"],
                "filters": [
                    ["status", "=", "Closed"],
                    ["resolution_date", ">=", "month_start"],
                ],
                "order_by": "resolution_date desc",
                "limit": 30,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # PROCUREMENT DASHBOARD — Material Requests → POs → Receipts
    # ═══════════════════════════════════════════════════════════════
    "procurement_dashboard": {
        "description": "Procurement pipeline — requests, orders, receipts, and payables",
        "context_doctype": None,
        "sections": {
            "purchase": ["pending_requests", "open_orders", "pending_receipts", "supplier_payables"],
            "accounts": ["open_orders", "supplier_payables"],
            "manager": ["pending_requests", "open_orders", "pending_receipts", "supplier_payables"],
            "admin": ["*"],
        },
        "section_defs": {
            "pending_requests": {
                "doctype": "Material Request",
                "fields": ["name", "material_request_type", "transaction_date",
                           "status", "owner", "department"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "in", ["Pending", "Partially Ordered"]],
                ],
                "order_by": "transaction_date asc",
                "limit": 50,
            },
            "open_orders": {
                "doctype": "Purchase Order",
                "fields": ["name", "supplier_name", "grand_total", "status",
                           "transaction_date", "schedule_date", "per_received"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["status", "in", ["To Receive and Bill", "To Receive", "To Bill"]],
                ],
                "order_by": "schedule_date asc",
                "limit": 50,
            },
            "pending_receipts": {
                "doctype": "Purchase Order",
                "fields": ["name", "supplier_name", "grand_total",
                           "schedule_date", "per_received"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["per_received", "<", 100],
                    ["status", "not in", ["Cancelled", "Closed"]],
                ],
                "order_by": "schedule_date asc",
                "limit": 50,
            },
            "supplier_payables": {
                "doctype": "Purchase Invoice",
                "fields": ["name", "supplier_name", "grand_total",
                           "outstanding_amount", "due_date", "status"],
                "filters": [
                    ["docstatus", "=", 1],
                    ["outstanding_amount", ">", 0],
                ],
                "order_by": "due_date asc",
                "limit": 50,
            },
        },
    },

    # ═══════════════════════════════════════════════════════════════
    # CONVERSION FUNNEL — Visits to Wins
    # ═══════════════════════════════════════════════════════════════
    "conversion_funnel": {
        "description": "Sales conversion funnel — visits to wins by stage",
        "context_doctype": None,
        "sections": {
            "sales": ["funnel_data"],
            "manager": ["funnel_data"],
            "admin": ["*"],
        },
        "section_defs": {
            "funnel_data": {
                "doctype": "Daily Call Report",
                "fields": ["name", "date", "conversion_status", "employee_name",
                           "customer", "visit_purpose", "department"],
                "filters": [["date", ">=", "month_start"]],
                "order_by": "date desc",
                "limit": 500,
                "skip_company_filter": True,
            },
        },
    },
}
