"""Pricing and budget tool schemas -- budgets, pricing rules, subscriptions."""

PRICING_TOOLS = [
    {
        "name": "create_budget",
        "description": "Create a Budget against a Cost Center, Project, or Department for a fiscal year.",
        "input_schema": {
            "type": "object",
            "properties": {
                "budget_against": {
                    "type": "string",
                    "enum": [
                        "Cost Center",
                        "Project",
                        "Department"
                    ]
                },
                "budget_against_value": {
                    "type": "string",
                    "description": "The actual cost center/project/department name"
                },
                "fiscal_year": {
                    "type": "string",
                    "description": "e.g. 2025-2026"
                },
                "accounts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account": {
                                "type": "string"
                            },
                            "budget_amount": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "account",
                            "budget_amount"
                        ]
                    }
                },
                "monthly_distribution": {
                    "type": "string"
                },
                "applicable_on_material_request": {
                    "type": "boolean"
                },
                "applicable_on_purchase_order": {
                    "type": "boolean"
                },
                "applicable_on_booking_actual_expenses": {
                    "type": "boolean"
                },
                "action_if_annual_budget_exceeded": {
                    "type": "string",
                    "enum": [
                        "Stop",
                        "Warn",
                        "Ignore"
                    ]
                },
                "action_if_accumulated_monthly_budget_exceeded": {
                    "type": "string",
                    "enum": [
                        "Stop",
                        "Warn",
                        "Ignore"
                    ]
                }
            },
            "required": [
                "budget_against",
                "budget_against_value",
                "fiscal_year",
                "accounts"
            ]
        }
    },
    {
        "name": "create_pricing_rule",
        "description": "Create a Pricing Rule for automatic discounts/rates on selling or buying transactions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string"
                },
                "selling": {
                    "type": "boolean"
                },
                "buying": {
                    "type": "boolean"
                },
                "applicable_for": {
                    "type": "string",
                    "enum": [
                        "Customer",
                        "Customer Group",
                        "Territory",
                        "Supplier",
                        "Supplier Group",
                        "Campaign"
                    ]
                },
                "apply_on": {
                    "type": "string",
                    "enum": [
                        "Item Code",
                        "Item Group",
                        "Brand",
                        "Transaction"
                    ]
                },
                "items": {
                    "type": "array",
                    "description": "Items/groups/brands depending on apply_on",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {
                                "type": "string"
                            },
                            "item_group": {
                                "type": "string"
                            },
                            "brand": {
                                "type": "string"
                            }
                        }
                    }
                },
                "min_qty": {
                    "type": "number"
                },
                "max_qty": {
                    "type": "number"
                },
                "min_amt": {
                    "type": "number"
                },
                "max_amt": {
                    "type": "number"
                },
                "rate_or_discount": {
                    "type": "string",
                    "enum": [
                        "Discount Percentage",
                        "Discount Amount",
                        "Rate"
                    ]
                },
                "discount_percentage": {
                    "type": "number"
                },
                "discount_amount": {
                    "type": "number"
                },
                "rate": {
                    "type": "number"
                },
                "valid_from": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "valid_upto": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "priority": {
                    "type": "string"
                },
                "company": {
                    "type": "string"
                }
            },
            "required": [
                "title",
                "selling",
                "buying",
                "applicable_for",
                "apply_on"
            ]
        }
    },
    {
        "name": "create_subscription",
        "description": "Create a Subscription for recurring invoicing to a Customer or Supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_type": {
                    "type": "string",
                    "enum": [
                        "Customer",
                        "Supplier"
                    ]
                },
                "party": {
                    "type": "string"
                },
                "plans": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "plan": {
                                "type": "string"
                            },
                            "qty": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "plan",
                            "qty"
                        ]
                    }
                },
                "start_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "generate_invoice_at": {
                    "type": "string",
                    "enum": [
                        "Beginning of the current subscription period",
                        "End of the current subscription period"
                    ]
                },
                "submit_invoice": {
                    "type": "boolean",
                    "description": "Default: true"
                },
                "company": {
                    "type": "string",
                    "description": "Default: Dynamic Servitech Private Limited"
                }
            },
            "required": [
                "party_type",
                "party",
                "plans"
            ]
        }
    }
]
