"""Manufacturing tool schemas -- work orders, job cards, production plans."""

MANUFACTURING_TOOLS = [
    {
        "name": "create_work_order",
        "description": "Create a Work Order for manufacturing a product from a BOM.",
        "input_schema": {
            "type": "object",
            "properties": {
                "production_item": {
                    "type": "string",
                    "description": "Item code of finished product"
                },
                "qty": {
                    "type": "number"
                },
                "bom_no": {
                    "type": "string",
                    "description": "BOM name (e.g. BOM-ITEM-001)"
                },
                "planned_start_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "expected_delivery_date": {
                    "type": "string"
                },
                "project": {
                    "type": "string"
                },
                "fg_warehouse": {
                    "type": "string"
                },
                "wip_warehouse": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "production_item",
                "qty",
                "bom_no"
            ]
        }
    },
    {
        "name": "create_job_card",
        "description": "Create a Job Card for tracking an operation in a Work Order.",
        "input_schema": {
            "type": "object",
            "properties": {
                "work_order": {
                    "type": "string"
                },
                "operation": {
                    "type": "string"
                },
                "workstation": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "for_quantity": {
                    "type": "number"
                },
                "time_logs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "from_time": {
                                "type": "string",
                                "description": "YYYY-MM-DD HH:MM:SS"
                            },
                            "to_time": {
                                "type": "string",
                                "description": "YYYY-MM-DD HH:MM:SS"
                            },
                            "completed_qty": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "from_time",
                            "to_time",
                            "completed_qty"
                        ]
                    }
                },
                "employee": {
                    "type": "string"
                },
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "work_order",
                "operation",
                "workstation"
            ]
        }
    },
    {
        "name": "create_production_plan",
        "description": "Create a Production Plan to plan manufacturing based on Sales Orders or Material Requests.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "get_items_from": {
                    "type": "string",
                    "enum": [
                        "Sales Order",
                        "Material Request"
                    ]
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {
                                "type": "string"
                            },
                            "planned_qty": {
                                "type": "number"
                            },
                            "bom_no": {
                                "type": "string"
                            },
                            "warehouse": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "planned_qty"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "posting_date"
            ]
        }
    }
]
