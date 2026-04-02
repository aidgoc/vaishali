"""Communication tool schemas -- email, bulk updates, export, rename, amend."""

COMMUNICATION_TOOLS = [
    {
        "name": "send_email",
        "description": "Send an email through ERPNext's email system. Can be linked to a document for tracking.\n\nExample: {\"recipients\": \"client@example.com\", \"subject\": \"Invoice Attached\", \"message\": \"Please find the invoice attached.\", \"reference_doctype\": \"Sales Invoice\", \"reference_name\": \"ACC-SINV-2026-00001\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "recipients": {
                    "type": "string",
                    "description": "Comma-separated email addresses"
                },
                "subject": {
                    "type": "string"
                },
                "message": {
                    "type": "string",
                    "description": "Email body (HTML supported)"
                },
                "cc": {
                    "type": "string",
                    "description": "CC email addresses (comma-separated)"
                },
                "bcc": {
                    "type": "string",
                    "description": "BCC email addresses (comma-separated)"
                },
                "reference_doctype": {
                    "type": "string",
                    "description": "Link email to a DocType"
                },
                "reference_name": {
                    "type": "string",
                    "description": "Link email to a specific document"
                }
            },
            "required": [
                "recipients",
                "subject",
                "message"
            ]
        }
    },
    {
        "name": "bulk_update",
        "description": "Mass update multiple records of the same DocType with the same field values. Provide filters to select records or explicit list of names.\n\nExample \u2014 Mark all open leads as 'Replied':\n{\"doctype\": \"Lead\", \"filters\": [[\"status\", \"=\", \"Open\"]], \"data\": {\"status\": \"Replied\"}}\n\nExample \u2014 Update specific items:\n{\"doctype\": \"Item\", \"names\": [\"ITEM-001\", \"ITEM-002\"], \"data\": {\"item_group\": \"Finished Goods\"}}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "filters": {
                    "type": "array",
                    "description": "Filters to select records",
                    "items": {
                        "type": "array"
                    }
                },
                "names": {
                    "type": "array",
                    "description": "Explicit list of document names to update",
                    "items": {
                        "type": "string"
                    }
                },
                "data": {
                    "type": "object",
                    "description": "Fields to update as key-value pairs"
                },
                "limit": {
                    "type": "number",
                    "description": "Max records to update (default 50, max 200)"
                }
            },
            "required": [
                "doctype",
                "data"
            ]
        }
    },
    {
        "name": "export_records",
        "description": "Export records as CSV data. Generates a CSV file and sends it to the user. Use for data export, generating Excel-ready data, or creating reports.\n\nExample \u2014 Export all customers:\n{\"doctype\": \"Customer\", \"fields\": [\"name\", \"customer_name\", \"customer_group\", \"territory\"]}\n\nExample \u2014 Export sales invoices for March:\n{\"doctype\": \"Sales Invoice\", \"filters\": [[\"posting_date\", \">=\", \"2026-03-01\"]], \"fields\": [\"name\", \"customer\", \"posting_date\", \"grand_total\", \"status\"], \"limit\": 100}",
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
                },
                "fields": {
                    "type": "array",
                    "description": "Fields to include in export",
                    "items": {
                        "type": "string"
                    }
                },
                "order_by": {
                    "type": "string"
                },
                "limit": {
                    "type": "number",
                    "description": "Max records (default 100, max 500)"
                }
            },
            "required": [
                "doctype",
                "fields"
            ]
        }
    },
    {
        "name": "rename_document",
        "description": "Rename a document (change its ID/name). Admin only.\n\nExample: {\"doctype\": \"Item\", \"old_name\": \"ITEM-OLD\", \"new_name\": \"ITEM-NEW\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "old_name": {
                    "type": "string"
                },
                "new_name": {
                    "type": "string"
                },
                "merge": {
                    "type": "boolean",
                    "description": "Merge with existing record of same name? Default false."
                }
            },
            "required": [
                "doctype",
                "old_name",
                "new_name"
            ]
        }
    },
    {
        "name": "amend_document",
        "description": "Create an amended copy of a cancelled document. Use when a submitted document was cancelled and needs to be re-created with modifications.\n\nExample: {\"doctype\": \"Sales Invoice\", \"name\": \"ACC-SINV-2026-00001\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string"
                },
                "name": {
                    "type": "string",
                    "description": "The cancelled document to amend"
                }
            },
            "required": [
                "doctype",
                "name"
            ]
        }
    }
]
