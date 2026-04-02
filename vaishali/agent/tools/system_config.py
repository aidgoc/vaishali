"""System configuration tool schemas -- custom fields, workflows, permissions, print formats."""

SYSTEM_CONFIG_TOOLS = [
    {
        "name": "list_doctype_fields",
        "description": "Get all fields of a DocType (standard + custom). Use this to understand DocType structure, find field names, check field types, see what's required, etc. Essential before modifying DocType structure.\n\nExample: {\"doctype\": \"Sales Invoice\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "DocType name e.g. Sales Invoice, Customer, Item"
                }
            },
            "required": [
                "doctype"
            ]
        }
    },
    {
        "name": "create_custom_field",
        "description": "Add a Custom Field to any DocType. This is how you extend ERPNext without modifying core code. Admin only. Use to add new fields to forms.\n\nField types: Data, Text, Small Text, Long Text, Text Editor, HTML Editor, Select, Link, Dynamic Link, Check, Int, Float, Currency, Date, Datetime, Time, Duration, Phone, Autocomplete, Password, Read Only, Section Break, Column Break, Tab Break, Table, Table MultiSelect, Attach, Attach Image, Color, Barcode, Geolocation, Rating.\n\nExample \u2014 Add a custom 'Brand Ambassador' field to Customer:\n{\"doctype\": \"Customer\", \"fieldname\": \"brand_ambassador\", \"label\": \"Brand Ambassador\", \"fieldtype\": \"Data\", \"insert_after\": \"customer_name\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "Target DocType to add field to"
                },
                "fieldname": {
                    "type": "string",
                    "description": "Internal field name (lowercase, underscores)"
                },
                "label": {
                    "type": "string",
                    "description": "Display label"
                },
                "fieldtype": {
                    "type": "string",
                    "description": "Field type",
                    "enum": [
                        "Data",
                        "Text",
                        "Small Text",
                        "Long Text",
                        "Text Editor",
                        "HTML Editor",
                        "Select",
                        "Link",
                        "Dynamic Link",
                        "Check",
                        "Int",
                        "Float",
                        "Currency",
                        "Date",
                        "Datetime",
                        "Time",
                        "Duration",
                        "Phone",
                        "Autocomplete",
                        "Password",
                        "Read Only",
                        "Section Break",
                        "Column Break",
                        "Tab Break",
                        "Table",
                        "Table MultiSelect",
                        "Attach",
                        "Attach Image",
                        "Color",
                        "Barcode",
                        "Geolocation",
                        "Rating",
                        "HTML",
                        "Heading",
                        "Image"
                    ]
                },
                "insert_after": {
                    "type": "string",
                    "description": "Fieldname after which to insert this field"
                },
                "options": {
                    "type": "string",
                    "description": "For Select: newline-separated options. For Link: target DocType. For Table: child DocType."
                },
                "default": {
                    "type": "string",
                    "description": "Default value"
                },
                "reqd": {
                    "type": "boolean",
                    "description": "Is this field mandatory?"
                },
                "hidden": {
                    "type": "boolean",
                    "description": "Hide field from form view?"
                },
                "read_only": {
                    "type": "boolean",
                    "description": "Make field read-only?"
                },
                "unique": {
                    "type": "boolean",
                    "description": "Enforce unique values?"
                },
                "in_list_view": {
                    "type": "boolean",
                    "description": "Show in list view?"
                },
                "in_standard_filter": {
                    "type": "boolean",
                    "description": "Add to standard filters?"
                },
                "description": {
                    "type": "string",
                    "description": "Help text shown below field"
                },
                "depends_on": {
                    "type": "string",
                    "description": "Conditional visibility formula e.g. eval:doc.status=='Active'"
                },
                "mandatory_depends_on": {
                    "type": "string",
                    "description": "Conditional mandatory formula"
                },
                "fetch_from": {
                    "type": "string",
                    "description": "Auto-fetch from linked field e.g. customer.customer_name"
                },
                "fetch_if_empty": {
                    "type": "boolean",
                    "description": "Only fetch if field is empty"
                },
                "allow_on_submit": {
                    "type": "boolean",
                    "description": "Allow editing after submit"
                },
                "bold": {
                    "type": "boolean",
                    "description": "Show in bold"
                },
                "collapsible": {
                    "type": "boolean",
                    "description": "For Section Break: make collapsible"
                },
                "collapsible_depends_on": {
                    "type": "string",
                    "description": "Conditional collapse formula"
                }
            },
            "required": [
                "doctype",
                "fieldname",
                "label",
                "fieldtype"
            ]
        }
    },
    {
        "name": "modify_doctype_property",
        "description": "Modify a property of an existing field in a DocType using Property Setter. This is the 'Customize Form' equivalent via API. Admin only.\n\nCommon properties you can change:\n- label: Change display name\n- reqd: Make mandatory (1) or optional (0)\n- hidden: Hide (1) or show (0)\n- read_only: Make read-only (1) or editable (0)\n- default: Set default value\n- options: Change select options or link target\n- in_list_view: Show in list view (1/0)\n- in_standard_filter: Add to filters (1/0)\n- description: Change help text\n- allow_on_submit: Allow editing after submit (1/0)\n- bold: Make bold (1/0)\n- print_hide: Hide from print (1/0)\n- permlevel: Permission level\n- width: Column width in list\n- depends_on: Conditional visibility\n\nExample \u2014 Make customer_name mandatory on Customer:\n{\"doctype\": \"Customer\", \"fieldname\": \"customer_name\", \"property\": \"reqd\", \"value\": \"1\"}\n\nExample \u2014 Change label:\n{\"doctype\": \"Item\", \"fieldname\": \"item_name\", \"property\": \"label\", \"value\": \"Product Name\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "Target DocType"
                },
                "fieldname": {
                    "type": "string",
                    "description": "Field to modify"
                },
                "property": {
                    "type": "string",
                    "description": "Property to change",
                    "enum": [
                        "label",
                        "reqd",
                        "hidden",
                        "read_only",
                        "default",
                        "options",
                        "in_list_view",
                        "in_standard_filter",
                        "description",
                        "allow_on_submit",
                        "bold",
                        "print_hide",
                        "permlevel",
                        "width",
                        "depends_on",
                        "mandatory_depends_on",
                        "read_only_depends_on",
                        "fetch_from",
                        "fetch_if_empty",
                        "translatable",
                        "fieldtype",
                        "precision",
                        "columns",
                        "collapsible",
                        "collapsible_depends_on"
                    ]
                },
                "value": {
                    "type": "string",
                    "description": "New value for the property"
                }
            },
            "required": [
                "doctype",
                "fieldname",
                "property",
                "value"
            ]
        }
    },
    {
        "name": "delete_custom_field",
        "description": "Delete a Custom Field from a DocType. Only custom fields can be deleted, not standard ones. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "custom_field_name": {
                    "type": "string",
                    "description": "Custom Field name (format: 'DocType-fieldname' e.g. 'Customer-brand_ambassador')"
                }
            },
            "required": [
                "custom_field_name"
            ]
        }
    },
    {
        "name": "list_doctypes",
        "description": "List available DocTypes in the system. Filter by module, custom status, or search by name. Use to discover what DocTypes exist.\n\nExample: {\"module\": \"Accounts\"}\nExample: {\"search\": \"invoice\"}\nExample: {\"is_custom\": true}  \u2014 list only custom DocTypes",
        "input_schema": {
            "type": "object",
            "properties": {
                "module": {
                    "type": "string",
                    "description": "Filter by module e.g. Accounts, HR, Stock, Selling, Buying"
                },
                "search": {
                    "type": "string",
                    "description": "Search DocType names"
                },
                "is_custom": {
                    "type": "boolean",
                    "description": "Only show custom DocTypes"
                },
                "limit": {
                    "type": "number",
                    "description": "Max results (default 50)"
                }
            }
        }
    },
    {
        "name": "manage_role_permission",
        "description": "Add or modify role permissions for a DocType. Admin only. Controls who can read/write/create/delete/submit/amend documents.\n\nExample \u2014 Give 'Sales User' write access to Quotation:\n{\"doctype\": \"Quotation\", \"role\": \"Sales User\", \"permlevel\": 0, \"permissions\": {\"read\": 1, \"write\": 1, \"create\": 1, \"delete\": 0, \"submit\": 0}}\n\nExample \u2014 Remove delete permission for 'Accounts User' on Journal Entry:\n{\"doctype\": \"Journal Entry\", \"role\": \"Accounts User\", \"permlevel\": 0, \"permissions\": {\"delete\": 0}}",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "Target DocType"
                },
                "role": {
                    "type": "string",
                    "description": "Role name e.g. 'System Manager', 'Accounts User', 'Sales User'"
                },
                "permlevel": {
                    "type": "number",
                    "description": "Permission level (0 = top level, default 0)"
                },
                "permissions": {
                    "type": "object",
                    "description": "Permission flags to set",
                    "properties": {
                        "read": {
                            "type": "number",
                            "description": "Can read (0/1)"
                        },
                        "write": {
                            "type": "number",
                            "description": "Can write/edit (0/1)"
                        },
                        "create": {
                            "type": "number",
                            "description": "Can create new (0/1)"
                        },
                        "delete": {
                            "type": "number",
                            "description": "Can delete (0/1)"
                        },
                        "submit": {
                            "type": "number",
                            "description": "Can submit (0/1)"
                        },
                        "cancel": {
                            "type": "number",
                            "description": "Can cancel (0/1)"
                        },
                        "amend": {
                            "type": "number",
                            "description": "Can amend (0/1)"
                        },
                        "report": {
                            "type": "number",
                            "description": "Can view reports (0/1)"
                        },
                        "export": {
                            "type": "number",
                            "description": "Can export (0/1)"
                        },
                        "import": {
                            "type": "number",
                            "description": "Can import (0/1)"
                        },
                        "print": {
                            "type": "number",
                            "description": "Can print (0/1)"
                        },
                        "email": {
                            "type": "number",
                            "description": "Can email (0/1)"
                        },
                        "share": {
                            "type": "number",
                            "description": "Can share (0/1)"
                        }
                    }
                }
            },
            "required": [
                "doctype",
                "role",
                "permissions"
            ]
        }
    },
    {
        "name": "list_roles",
        "description": "List all roles in the system. Use to find valid role names before managing permissions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Search role names"
                }
            }
        }
    },
    {
        "name": "list_role_permissions",
        "description": "List current permissions for a DocType across all roles.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctype": {
                    "type": "string",
                    "description": "DocType to check permissions for"
                }
            },
            "required": [
                "doctype"
            ]
        }
    },
    {
        "name": "create_workflow",
        "description": "Create an approval Workflow for a DocType. Admin only. Workflows define states and transitions (who can approve/reject and move between states).\n\nExample \u2014 Simple approval workflow for Purchase Order:\n{\"workflow_name\": \"PO Approval\", \"document_type\": \"Purchase Order\", \"workflow_state_field\": \"workflow_state\", \"is_active\": true, \"states\": [{\"state\": \"Draft\", \"doc_status\": 0, \"allow_edit\": \"Accounts User\"}, {\"state\": \"Pending Approval\", \"doc_status\": 0, \"allow_edit\": \"Accounts Manager\"}, {\"state\": \"Approved\", \"doc_status\": 1, \"allow_edit\": \"Accounts Manager\"}, {\"state\": \"Rejected\", \"doc_status\": 0, \"allow_edit\": \"Accounts Manager\"}], \"transitions\": [{\"state\": \"Draft\", \"action\": \"Submit for Approval\", \"next_state\": \"Pending Approval\", \"allowed\": \"Accounts User\"}, {\"state\": \"Pending Approval\", \"action\": \"Approve\", \"next_state\": \"Approved\", \"allowed\": \"Accounts Manager\"}, {\"state\": \"Pending Approval\", \"action\": \"Reject\", \"next_state\": \"Rejected\", \"allowed\": \"Accounts Manager\"}]}",
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_name": {
                    "type": "string"
                },
                "document_type": {
                    "type": "string",
                    "description": "DocType this workflow applies to"
                },
                "workflow_state_field": {
                    "type": "string",
                    "description": "Field to store state (default: workflow_state)"
                },
                "is_active": {
                    "type": "boolean",
                    "description": "Activate immediately? Default true"
                },
                "override_status": {
                    "type": "boolean",
                    "description": "Override document Status field with workflow state"
                },
                "send_email_alert": {
                    "type": "boolean",
                    "description": "Send email on state change"
                },
                "states": {
                    "type": "array",
                    "description": "Workflow states",
                    "items": {
                        "type": "object",
                        "properties": {
                            "state": {
                                "type": "string",
                                "description": "State name e.g. Draft, Pending Approval, Approved"
                            },
                            "doc_status": {
                                "type": "number",
                                "description": "0=Draft, 1=Submitted, 2=Cancelled"
                            },
                            "allow_edit": {
                                "type": "string",
                                "description": "Role that can edit in this state"
                            },
                            "is_optional_state": {
                                "type": "boolean"
                            },
                            "update_field": {
                                "type": "string",
                                "description": "Field to update when entering this state"
                            },
                            "update_value": {
                                "type": "string",
                                "description": "Value to set in update_field"
                            }
                        },
                        "required": [
                            "state",
                            "doc_status",
                            "allow_edit"
                        ]
                    }
                },
                "transitions": {
                    "type": "array",
                    "description": "State transitions (who can move from one state to another)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "state": {
                                "type": "string",
                                "description": "Current state"
                            },
                            "action": {
                                "type": "string",
                                "description": "Button label e.g. Approve, Reject, Submit"
                            },
                            "next_state": {
                                "type": "string",
                                "description": "Target state after action"
                            },
                            "allowed": {
                                "type": "string",
                                "description": "Role allowed to perform this transition"
                            },
                            "allow_self_approval": {
                                "type": "boolean"
                            },
                            "condition": {
                                "type": "string",
                                "description": "Python condition e.g. doc.grand_total < 50000"
                            }
                        },
                        "required": [
                            "state",
                            "action",
                            "next_state",
                            "allowed"
                        ]
                    }
                }
            },
            "required": [
                "workflow_name",
                "document_type",
                "states",
                "transitions"
            ]
        }
    },
    {
        "name": "create_print_format",
        "description": "Create a custom Print Format for any DocType. Admin only. Supports HTML/Jinja templates for invoices, orders, receipts, etc.\n\nUse Jinja2 template syntax with access to:\n- doc: the document object\n- doc.items: child table rows\n- frappe.format_value(): format numbers/dates\n- frappe.utils: utility functions\n\nExample \u2014 Simple Sales Invoice print:\n{\"name\": \"DSPL Invoice\", \"doc_type\": \"Sales Invoice\", \"print_format_type\": \"Jinja\", \"html\": \"<h1>{{ doc.company }}</h1><p>Invoice: {{ doc.name }}</p>...\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Print format name"
                },
                "doc_type": {
                    "type": "string",
                    "description": "DocType this format applies to"
                },
                "print_format_type": {
                    "type": "string",
                    "enum": [
                        "Jinja",
                        "JS"
                    ],
                    "description": "Template type (Jinja recommended)"
                },
                "html": {
                    "type": "string",
                    "description": "HTML/Jinja template content"
                },
                "css": {
                    "type": "string",
                    "description": "Custom CSS styles"
                },
                "custom_format": {
                    "type": "boolean",
                    "description": "Is custom format? Default true"
                },
                "standard": {
                    "type": "string",
                    "description": "No for custom formats"
                },
                "default_print_language": {
                    "type": "string",
                    "description": "Default language e.g. en"
                },
                "align_labels_right": {
                    "type": "boolean"
                },
                "show_section_headings": {
                    "type": "boolean"
                },
                "line_breaks": {
                    "type": "boolean"
                },
                "disabled": {
                    "type": "boolean"
                }
            },
            "required": [
                "name",
                "doc_type",
                "html"
            ]
        }
    },
    {
        "name": "list_print_formats",
        "description": "List print formats for a DocType. Shows both standard and custom formats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doc_type": {
                    "type": "string",
                    "description": "DocType to list print formats for"
                }
            },
            "required": [
                "doc_type"
            ]
        }
    },
    {
        "name": "create_letter_head",
        "description": "Create a Letter Head for use in print formats. Admin only. Letter heads appear at the top of printed documents.\n\nExample: {\"letter_head_name\": \"DSPL Official\", \"content\": \"<div style='text-align:center'><h2>Dynamic Servitech Pvt Ltd</h2><p>Electronic Solutions for Heavy Equipment</p></div>\", \"is_default\": true}",
        "input_schema": {
            "type": "object",
            "properties": {
                "letter_head_name": {
                    "type": "string"
                },
                "content": {
                    "type": "string",
                    "description": "HTML content for the header"
                },
                "footer": {
                    "type": "string",
                    "description": "HTML content for footer"
                },
                "is_default": {
                    "type": "boolean",
                    "description": "Set as default letter head?"
                },
                "disabled": {
                    "type": "boolean"
                }
            },
            "required": [
                "letter_head_name",
                "content"
            ]
        }
    },
    {
        "name": "create_notification",
        "description": "Create an automatic Notification/Alert rule. Admin only. Sends email/system notification when conditions are met.\n\nEvents: New, Save, Submit, Cancel, Days After, Days Before, Value Change, Method, Custom.\n\nExample \u2014 Email alert when Sales Invoice is overdue:\n{\"subject\": \"Overdue Invoice: {{ doc.name }}\", \"document_type\": \"Sales Invoice\", \"event\": \"Days After\", \"days_in_advance\": -1, \"date_changed\": \"due_date\", \"channel\": \"Email\", \"recipients\": [{\"receiver_by_document_field\": \"contact_email\"}], \"message\": \"Dear {{ doc.customer }}, Invoice {{ doc.name }} for Rs. {{ doc.grand_total }} is overdue.\"}\n\nExample \u2014 System notification on new Lead:\n{\"subject\": \"New Lead: {{ doc.lead_name }}\", \"document_type\": \"Lead\", \"event\": \"New\", \"channel\": \"System Notification\", \"recipients\": [{\"receiver_by_role\": \"Sales Manager\"}], \"message\": \"New lead {{ doc.lead_name }} from {{ doc.source }}\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": "Notification subject (Jinja supported)"
                },
                "document_type": {
                    "type": "string",
                    "description": "DocType to watch"
                },
                "event": {
                    "type": "string",
                    "enum": [
                        "New",
                        "Save",
                        "Submit",
                        "Cancel",
                        "Days After",
                        "Days Before",
                        "Value Change",
                        "Method",
                        "Custom"
                    ]
                },
                "channel": {
                    "type": "string",
                    "enum": [
                        "Email",
                        "System Notification",
                        "SMS",
                        "Slack"
                    ],
                    "description": "Notification channel (default Email)"
                },
                "message": {
                    "type": "string",
                    "description": "Message body (Jinja/HTML supported)"
                },
                "message_type": {
                    "type": "string",
                    "enum": [
                        "Markdown",
                        "HTML"
                    ],
                    "description": "Default Markdown"
                },
                "condition": {
                    "type": "string",
                    "description": "Python condition e.g. doc.grand_total > 50000"
                },
                "recipients": {
                    "type": "array",
                    "description": "Who to notify",
                    "items": {
                        "type": "object",
                        "properties": {
                            "receiver_by_document_field": {
                                "type": "string",
                                "description": "Field containing email e.g. contact_email"
                            },
                            "receiver_by_role": {
                                "type": "string",
                                "description": "Role to notify e.g. Accounts Manager"
                            },
                            "cc": {
                                "type": "string"
                            },
                            "bcc": {
                                "type": "string"
                            }
                        }
                    }
                },
                "days_in_advance": {
                    "type": "number",
                    "description": "For Days After/Before events. Negative = days after."
                },
                "date_changed": {
                    "type": "string",
                    "description": "Date field to check for Days After/Before"
                },
                "value_changed": {
                    "type": "string",
                    "description": "Field to watch for Value Change event"
                },
                "set_property_after_alert": {
                    "type": "string",
                    "description": "Field to update after alert is sent"
                },
                "property_value": {
                    "type": "string",
                    "description": "Value to set in the field"
                },
                "enabled": {
                    "type": "boolean",
                    "description": "Enable immediately? Default true"
                }
            },
            "required": [
                "subject",
                "document_type",
                "event",
                "message"
            ]
        }
    },
    {
        "name": "update_system_settings",
        "description": "Update ERPNext system settings. Admin only. Use with caution.\n\nCommon settings: language, time_zone, date_format, number_format, currency_precision, float_precision, country, disable_rounded_total.\n\nExample: {\"settings\": {\"date_format\": \"dd-mm-yyyy\", \"currency_precision\": 2}}",
        "input_schema": {
            "type": "object",
            "properties": {
                "settings": {
                    "type": "object",
                    "description": "Settings to update as key-value pairs"
                }
            },
            "required": [
                "settings"
            ]
        }
    },
    {
        "name": "list_erp_users",
        "description": "List ERPNext users with their roles and status. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "enabled": {
                    "type": "boolean",
                    "description": "Filter by enabled status"
                },
                "search": {
                    "type": "string",
                    "description": "Search by name or email"
                }
            }
        }
    },
    {
        "name": "manage_user_roles",
        "description": "Add or remove roles for an ERPNext user. Admin only.\n\nExample \u2014 Add 'Accounts User' role:\n{\"user\": \"vaishali@dspl.com\", \"add_roles\": [\"Accounts User\", \"Sales User\"]}\n\nExample \u2014 Remove a role:\n{\"user\": \"employee@dspl.com\", \"remove_roles\": [\"System Manager\"]}",
        "input_schema": {
            "type": "object",
            "properties": {
                "user": {
                    "type": "string",
                    "description": "User email/ID"
                },
                "add_roles": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Roles to add"
                },
                "remove_roles": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    },
                    "description": "Roles to remove"
                }
            },
            "required": [
                "user"
            ]
        }
    },
    {
        "name": "get_backup_info",
        "description": "Get information about recent backups and backup configuration. Admin only.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]
