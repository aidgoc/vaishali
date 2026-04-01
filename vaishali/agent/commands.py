"""Slash command registry for Vaishali AI."""

COMMANDS = {
    "/quotation": {
        "description": "Create or find a quotation",
        "prompt": "The user wants to work with quotations. Args: {args}. If args contain a customer name, search for their recent quotations. If args say 'new', guide through creation.",
        "tools": ["search_records", "get_document", "get_count", "discover_tools"],
    },
    "/follow-up": {
        "description": "Check overdue follow-ups and pending actions",
        "prompt": "Show the user their pending follow-ups: expiring quotations (within 7 days), open opportunities without activity in 14 days, and leads without contact in 30 days. {args}",
        "tools": ["search_records", "get_count"],
    },
    "/report": {
        "description": "Generate a quick report",
        "prompt": "Generate a report based on: {args}. Use business_dashboard for overview, search_records for specific data, get_report for standard reports.",
        "tools": ["business_dashboard", "search_records", "get_report", "get_count"],
    },
    "/dcr": {
        "description": "Daily call report summary",
        "prompt": "Show today's DCR summary for the user: visits done, leads generated, follow-ups completed. {args}",
        "tools": ["search_records", "get_count", "my_daily_summary"],
    },
    "/pipeline": {
        "description": "Sales pipeline overview",
        "prompt": "Show the sales pipeline: open quotations by temperature (Hot/Warm/Cold), total value, aging. {args}",
        "tools": ["search_records", "get_count", "query_view"],
    },
    "/customer": {
        "description": "Customer 360 view",
        "prompt": "Show full customer details for: {args}. Use query_view with customer_360 view.",
        "tools": ["query_view", "search_records", "get_document"],
    },
}


def get_command_list():
    """Return list of commands for autocomplete UI."""
    return [{"name": k, "description": v["description"]} for k, v in COMMANDS.items()]
