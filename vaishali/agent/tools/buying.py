"""Buying and procurement tool schemas -- purchase orders, receipts, RFQs, material requests."""

BUYING_TOOLS = [
    {
        "name": "create_purchase_order",
        "description": "Create a Purchase Order to order items from a supplier.",
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
                "schedule_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD \u2014 expected delivery date"
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
                            "schedule_date": {
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
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "supplier",
                "transaction_date",
                "schedule_date",
                "items"
            ]
        }
    },
    {
        "name": "create_purchase_receipt",
        "description": "Create a Purchase Receipt when goods are received from a supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {
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
                "purchase_order": {
                    "type": "string",
                    "description": "Link to Purchase Order if receiving against one"
                },
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "supplier",
                "posting_date",
                "items"
            ]
        }
    },
    {
        "name": "create_material_request",
        "description": "Create a Material Request to request items for purchase, transfer, or manufacture.",
        "input_schema": {
            "type": "object",
            "properties": {
                "material_request_type": {
                    "type": "string",
                    "enum": [
                        "Purchase",
                        "Material Transfer",
                        "Material Issue",
                        "Manufacture",
                        "Customer Provided"
                    ]
                },
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "schedule_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD \u2014 required by date"
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
                            "warehouse": {
                                "type": "string"
                            },
                            "schedule_date": {
                                "type": "string"
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
                            "qty"
                        ]
                    }
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
                "material_request_type",
                "transaction_date",
                "schedule_date",
                "items"
            ]
        }
    },
    {
        "name": "create_item_price",
        "description": "Set a buying or selling price for an item in a price list.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {
                    "type": "string"
                },
                "price_list": {
                    "type": "string",
                    "description": "e.g. Standard Buying, Standard Selling"
                },
                "price_list_rate": {
                    "type": "number"
                },
                "currency": {
                    "type": "string",
                    "description": "Default INR"
                },
                "buying": {
                    "type": "boolean",
                    "description": "True if buying price"
                },
                "selling": {
                    "type": "boolean",
                    "description": "True if selling price"
                }
            },
            "required": [
                "item_code",
                "price_list",
                "price_list_rate"
            ]
        }
    },
    {
        "name": "create_request_for_quotation",
        "description": "Create a Request for Quotation to solicit quotes from multiple suppliers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "suppliers": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "supplier": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "supplier"
                        ]
                    }
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
                            "uom": {
                                "type": "string"
                            },
                            "warehouse": {
                                "type": "string"
                            },
                            "schedule_date": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty"
                        ]
                    }
                },
                "schedule_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD \u2014 default required-by date"
                },
                "message_for_supplier": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "transaction_date",
                "suppliers",
                "items"
            ]
        }
    }
]
