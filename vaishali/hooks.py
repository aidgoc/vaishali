app_name = "vaishali"
app_title = "DSPL ERP"
app_publisher = "Dynamic Servitech Private Limited"
app_description = "AI-native ERP for DSPL — Vaishali agent, View Engine, Field PWA"
app_email = "harsh@dgoc.in"
app_license = "MIT"
app_icon = "octicon octicon-robot"
app_color = "#E60005"

# Desk theme + chat widget
app_include_css = "/assets/vaishali/css/vaishali.css?v=20260410b"
app_include_js = "vaishali.bundle.js"

# Client scripts for desk forms
doctype_js = {
    "Quotation": "public/js/quotation.js",
    "Lead": "public/js/lead.js",
    "Customer": "public/js/customer.js",
    "Communication": "public/js/communication.js",
}

# SPA catch-all: /field/* → www/field.py (same pattern as HRMS, CRM, Helpdesk)
website_route_rules = [
    {"from_route": "/field/<path:app_path>", "to_route": "field"},
]

# Convert Guest → /api/method/vaishali.* hits into 401 SessionExpired so even
# stale PWA clients (without the 403 "not whitelisted" handler) auto-recover.
before_request = ["vaishali.auth_guard.auth_guard"]

# Doc Events
doc_events = {
    "Daily Call Report": {
        "before_save": "vaishali.visit_guard.enforce",
        "on_update": "vaishali.api.linking.on_dcr_update",
    },
    "Service Call": {
        "before_save": "vaishali.service_call_guard.enforce",
    },
    "Quotation": {
        "on_submit": [
            "vaishali.api.linking.link_quotation_to_dcr",
            "vaishali.notifications.on_quotation_submit",
        ],
        "on_update_after_submit": "vaishali.api.linking.on_quotation_status_change",
    },
    "Sales Order": {
        "on_submit": [
            "vaishali.api.linking.link_sales_order_to_dcr",
            "vaishali.notifications.on_sales_order_submit",
            "vaishali.notifications.on_sales_order_submit_production",
            "vaishali.notifications.on_sales_order_email_draft",
        ],
    },
    "Delivery Note": {
        "on_submit": "vaishali.notifications.on_delivery_note_submit",
    },
    "Sales Invoice": {
        "on_submit": [
            "vaishali.notifications.on_sales_invoice_submit",
            "vaishali.notifications.on_sales_invoice_email_draft",
        ],
    },
    "Payment Entry": {
        "on_submit": [
            "vaishali.notifications.on_payment_entry_submit",
            "vaishali.notifications.on_supplier_payment_submit",
        ],
    },
    "Customer": {
        "after_insert": "vaishali.api.linking.on_customer_created",
    },
    "Warranty Claim": {
        "validate": "vaishali.complaint.on_warranty_claim_save",
        "after_insert": "vaishali.complaint.on_warranty_claim_update",
        "on_update_after_submit": "vaishali.notifications.on_warranty_claim_status_update",
    },
    "Material Request": {
        "on_submit": "vaishali.notifications.on_material_request_submit",
    },
    "Purchase Order": {
        "on_submit": [
            "vaishali.notifications.on_purchase_order_submit",
            "vaishali.notifications.on_purchase_order_email_draft",
        ],
    },
    "Purchase Receipt": {
        "on_submit": "vaishali.notifications.on_purchase_receipt_submit",
    },
    "Purchase Invoice": {
        "on_submit": "vaishali.notifications.on_purchase_invoice_submit",
    },
    "Work Order": {
        "on_submit": "vaishali.notifications.on_work_order_submit",
        "on_update_after_submit": "vaishali.notifications.on_work_order_complete",
    },
    "Stock Entry": {
        "on_submit": [
            "vaishali.notifications.on_stock_entry_submit",
            "vaishali.notifications.on_stock_entry_general",
        ],
    },
    "Quality Inspection": {
        "on_submit": "vaishali.notifications.on_quality_inspection_submit",
    },
    "Production Plan": {
        "on_submit": "vaishali.notifications.on_production_plan_submit",
    },
    "Journal Entry": {
        "on_submit": "vaishali.notifications.on_journal_entry_submit",
    },
    "Leave Application": {
        "on_submit": "vaishali.notifications.on_leave_application_submit",
        "on_update": "vaishali.notifications.on_leave_application_update",
    },
    "Expense Claim": {
        "before_submit": "vaishali.budget.check_budget_cap",
        "on_submit": "vaishali.notifications.on_expense_claim_submit",
        "on_update": "vaishali.notifications.on_expense_claim_update",
    },
    "Employee Advance": {
        "on_submit": "vaishali.notifications.on_employee_advance_submit",
        "on_update": "vaishali.notifications.on_employee_advance_update",
    },
    "Communication": {
        "after_insert": "vaishali.notifications.on_communication_receive",
    },
}

# Fixtures — everything not version-controlled in the DB that we
# need to survive `bench update` and a fresh-bench reinstall.
# Run `bench --site <site> export-fixtures --app vaishali` after
# adding/changing any of these on a live site, then commit the
# resulting JSON files under vaishali/fixtures/.
fixtures = [
    "Custom Field",          # 697 in prod (2026-04-30 audit)
    "Property Setter",       # 282 in prod
    "Custom DocPerm",        # 472 in prod — role tweaks across stock + custom DocTypes
    "Client Script",         # 1 today; future-proofed
    {"dt": "Print Format", "filters": [["custom", "=", 1]]},
    {"dt": "Notification", "filters": [["module", "=", "Vaishali"]]},
    {"dt": "Number Card", "filters": [["module", "=", "Vaishali"]]},
    {"dt": "Dashboard", "filters": [["module", "=", "Vaishali"]]},
    {"dt": "Dashboard Chart", "filters": [["module", "=", "Vaishali"]]},
    {"dt": "Workspace", "filters": [["module", "=", "Vaishali"]]},
]

# Custom pages and modules
module_config = [
    {
        "label": "DSPL",
        "color": "#E60005",
        "icon": "octicon octicon-organization",
        "type": "module",
        "items": [
            {
                "label": "ERP Guides",
                "icon": "octicon octicon-book",
                "route": "/guides",
            }
        ]
    }
]

# Apollo.io scheduled sync (every 30 minutes)
# SLA breach + CAPA overdue checks (daily at 9 AM)
scheduler_events = {
    "cron": {
        "*/30 * * * *": [
            "vaishali.api.apollo.bulk_enrich_leads",
            "vaishali.api.apollo.sync_apollo_list",
        ],
        "0 9 * * *": [
            "vaishali.complaint.check_sla_breaches",
            "vaishali.complaint.check_capa_overdue",
            "vaishali.notifications.check_expiring_quotations",
            "vaishali.notifications.check_overdue_purchase_orders",
            "vaishali.notifications.check_pending_purchase_invoices",
            "vaishali.notifications.check_overdue_work_orders",
            "vaishali.notifications.check_overdue_sales_invoices",
            "vaishali.notifications.remind_pending_visit_needed_calls",
        ],
        "0 9 * * 1": [
            "vaishali.notifications.check_draft_documents_reminder",
        ],
    },
}
