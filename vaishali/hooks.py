app_name = "vaishali"
app_title = "DSPL ERP"
app_publisher = "Dynamic Servitech Private Limited"
app_description = "AI-native ERP for DSPL — Vaishali agent, View Engine, Field PWA"
app_email = "harsh@dgoc.in"
app_license = "MIT"
app_icon = "octicon octicon-robot"
app_color = "#E60005"

# Desk theme
app_include_css = "/assets/vaishali/css/vaishali.css"

# Client scripts for desk forms
doctype_js = {
    "Quotation": "public/js/quotation.js",
    "Lead": "public/js/lead.js",
    "Customer": "public/js/customer.js",
}

# SPA catch-all: /field/* → www/field.py (same pattern as HRMS, CRM, Helpdesk)
website_route_rules = [
    {"from_route": "/field/<path:app_path>", "to_route": "field"},
]

# Doc Events
doc_events = {
    "Daily Call Report": {
        "on_update": "vaishali.api.linking.on_dcr_update",
    },
    "Quotation": {
        "on_submit": "vaishali.api.linking.link_quotation_to_dcr",
        "on_update_after_submit": "vaishali.api.linking.on_quotation_status_change",
    },
    "Sales Order": {
        "on_submit": "vaishali.api.linking.link_sales_order_to_dcr",
    },
    "Customer": {
        "after_insert": "vaishali.api.linking.on_customer_created",
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
}

# Fixtures
fixtures = ["custom_field", "tutorial_content"]

# Custom pages and modules
module_config = [
    {
        "label": "DSPL",
        "color": "#E60005",
        "icon": "octicon octicon-organization",
        "type": "module",
        "items": [
            {
                "label": "Workflows Guide",
                "icon": "octicon octicon-workflow",
                "route": "/app/dspl-workflows",
                "roles": ["System Manager"]
            }
        ]
    }
]
