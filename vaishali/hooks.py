app_name = "vaishali"
app_title = "DSPL ERP"
app_publisher = "Dynamic Servitech Private Limited"
app_description = "AI-native ERP for DSPL — Vaishali agent, View Engine, Field PWA"
app_email = "harsh@dgoc.in"
app_license = "MIT"
app_icon = "octicon octicon-robot"
app_color = "#E60005"

# SPA catch-all: /field/* → www/field.py (same pattern as HRMS, CRM, Helpdesk)
website_route_rules = [
    {"from_route": "/field/<path:app_path>", "to_route": "field"},
]

# Doc Events
doc_events = {
    "Daily Call Report": {
        "on_update": "vaishali.api.field.on_dcr_update",
    },
}
