"""Asset tool schemas -- fixed assets, movements, maintenance."""

ASSETS_TOOLS = [
    {
        "name": "create_asset",
        "description": "Register a company Asset (equipment, vehicle, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_name": {
                    "type": "string"
                },
                "item_code": {
                    "type": "string"
                },
                "asset_category": {
                    "type": "string"
                },
                "location": {
                    "type": "string"
                },
                "purchase_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "gross_purchase_amount": {
                    "type": "number"
                },
                "available_for_use_date": {
                    "type": "string"
                },
                "is_existing_asset": {
                    "type": "boolean"
                }
            },
            "required": [
                "asset_name",
                "item_code",
                "asset_category",
                "location"
            ]
        }
    },
    {
        "name": "create_asset_movement",
        "description": "Create an Asset Movement to transfer, receive, or issue assets between locations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "purpose": {
                    "type": "string",
                    "enum": [
                        "Transfer",
                        "Receipt",
                        "Issue"
                    ]
                },
                "assets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "asset": {
                                "type": "string"
                            },
                            "source_location": {
                                "type": "string"
                            },
                            "target_location": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "asset",
                            "source_location",
                            "target_location"
                        ]
                    }
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "company": {
                    "type": "string",
                    "description": "Default: Dynamic Servitech Private Limited"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "purpose",
                "assets"
            ]
        }
    },
    {
        "name": "create_asset_maintenance",
        "description": "Create an Asset Maintenance schedule for preventive maintenance or calibration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_name": {
                    "type": "string"
                },
                "item_code": {
                    "type": "string"
                },
                "maintenance_team": {
                    "type": "string"
                },
                "company": {
                    "type": "string",
                    "description": "Default: Dynamic Servitech Private Limited"
                },
                "maintenance_tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "maintenance_task": {
                                "type": "string"
                            },
                            "maintenance_type": {
                                "type": "string",
                                "enum": [
                                    "Preventive Maintenance",
                                    "Calibration"
                                ]
                            },
                            "start_date": {
                                "type": "string",
                                "description": "YYYY-MM-DD"
                            },
                            "periodicity": {
                                "type": "string",
                                "enum": [
                                    "Daily",
                                    "Weekly",
                                    "Monthly",
                                    "Quarterly",
                                    "Yearly"
                                ]
                            },
                            "assign_to": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "maintenance_task",
                            "maintenance_type",
                            "start_date",
                            "periodicity"
                        ]
                    }
                }
            },
            "required": [
                "asset_name",
                "item_code"
            ]
        }
    }
]
