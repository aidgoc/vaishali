app_name = "vaishali"
app_title = "Vaishali"
app_publisher = "Dynamic Servitech Private Limited"
app_description = "AI-powered ERP assistant with View Engine for DSPL Org OS"
app_email = "harsh@dgoc.in"
app_license = "MIT"
app_icon = "octicon octicon-robot"
app_color = "#E60005"

# Website routes — serve the Field PWA at /field
website_route_rules = [
    {"from_route": "/field", "to_route": "field"},
    {"from_route": "/field/<path:app_path>", "to_route": "field"},
]

# Doc Events
doc_events = {
    "Daily Call Report": {
        "on_update": "vaishali.api.field.on_dcr_update",
    },
}
