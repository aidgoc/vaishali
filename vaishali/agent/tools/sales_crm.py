"""Sales and CRM tool schemas -- leads, opportunities, quotations, sales orders, delivery notes."""

SALES_CRM_TOOLS = [
    {
        "name": "create_delivery_note",
        "description": "Create a Delivery Note when shipping items to a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {
                                "type": "string"
                            },
                            "qty": {
                                "type": "number"
                            },
                            "rate": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            },
                            "uom": {
                                "type": "string"
                            },
                            "warehouse": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty",
                            "rate"
                        ]
                    }
                },
                "sales_order": {
                    "type": "string",
                    "description": "Link to Sales Order if delivering against one"
                },
                "project": {
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
                "customer",
                "posting_date",
                "items"
            ]
        }
    },
    {
        "name": "create_lead",
        "description": "Create a new Lead (potential customer/prospect).",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_name": {
                    "type": "string"
                },
                "company_name": {
                    "type": "string"
                },
                "email_id": {
                    "type": "string"
                },
                "phone": {
                    "type": "string"
                },
                "source": {
                    "type": "string",
                    "enum": [
                        "Advertisement",
                        "Campaign",
                        "Cold Calling",
                        "Reference",
                        "Website",
                        "Existing Customer"
                    ]
                },
                "territory": {
                    "type": "string"
                },
                "notes": {
                    "type": "string"
                }
            },
            "required": [
                "lead_name"
            ]
        }
    },
    {
        "name": "create_opportunity",
        "description": "Create an Opportunity (sales prospect from a Lead or Customer).",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_name": {
                    "type": "string",
                    "description": "Lead or Customer name"
                },
                "opportunity_from": {
                    "type": "string",
                    "enum": [
                        "Lead",
                        "Customer"
                    ]
                },
                "opportunity_type": {
                    "type": "string",
                    "enum": [
                        "Sales",
                        "Maintenance",
                        "Support"
                    ]
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "expected_closing": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "sales_stage": {
                    "type": "string"
                },
                "source": {
                    "type": "string"
                },
                "notes": {
                    "type": "string"
                }
            },
            "required": [
                "party_name",
                "opportunity_from"
            ]
        }
    },
    {
        "name": "create_quotation",
        "description": "Create a Quotation (price offer) for a Customer or Lead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "party_name": {
                    "type": "string"
                },
                "quotation_to": {
                    "type": "string",
                    "enum": [
                        "Customer",
                        "Lead"
                    ]
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "valid_till": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "order_type": {
                    "type": "string",
                    "enum": [
                        "Sales",
                        "Maintenance",
                        "Shopping Cart"
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
                            "qty": {
                                "type": "number"
                            },
                            "rate": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            },
                            "uom": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty",
                            "rate"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "party_name",
                "items"
            ]
        }
    },
    {
        "name": "create_sales_order",
        "description": "Create a Sales Order (confirmed order from a customer).",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string"
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "delivery_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD \u2014 required delivery date"
                },
                "order_type": {
                    "type": "string",
                    "enum": [
                        "Sales",
                        "Maintenance",
                        "Shopping Cart"
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
                            "qty": {
                                "type": "number"
                            },
                            "rate": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            },
                            "uom": {
                                "type": "string"
                            },
                            "warehouse": {
                                "type": "string"
                            },
                            "delivery_date": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty",
                            "rate"
                        ]
                    }
                },
                "project": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "customer",
                "delivery_date",
                "items"
            ]
        }
    },
    {
        "name": "create_supplier_quotation",
        "description": "Record a price quote received from a supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {
                    "type": "string"
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "valid_till": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_code": {
                                "type": "string"
                            },
                            "qty": {
                                "type": "number"
                            },
                            "rate": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            },
                            "uom": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty",
                            "rate"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "supplier",
                "items"
            ]
        }
    }
]
