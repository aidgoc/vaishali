"""Inventory tool schemas -- stock entries, warehouses, BOMs, quality, landed costs."""

INVENTORY_TOOLS = [
    {
        "name": "create_stock_entry",
        "description": "Create a Stock Entry for material receipt, issue, transfer, or manufacture.",
        "input_schema": {
            "type": "object",
            "properties": {
                "stock_entry_type": {
                    "type": "string",
                    "enum": [
                        "Material Receipt",
                        "Material Issue",
                        "Material Transfer",
                        "Manufacture",
                        "Repack",
                        "Send to Subcontractor"
                    ]
                },
                "posting_date": {
                    "type": "string"
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
                            "s_warehouse": {
                                "type": "string"
                            },
                            "t_warehouse": {
                                "type": "string"
                            },
                            "basic_rate": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "item_code",
                            "qty"
                        ]
                    }
                },
                "from_bom": {
                    "type": "boolean"
                },
                "bom_no": {
                    "type": "string"
                },
                "fg_completed_qty": {
                    "type": "number"
                },
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "stock_entry_type",
                "posting_date",
                "items"
            ]
        }
    },
    {
        "name": "create_warehouse",
        "description": "Create a new Warehouse.",
        "input_schema": {
            "type": "object",
            "properties": {
                "warehouse_name": {
                    "type": "string"
                },
                "parent_warehouse": {
                    "type": "string"
                }
            },
            "required": [
                "warehouse_name"
            ]
        }
    },
    {
        "name": "create_bom",
        "description": "Create a Bill of Materials for manufacturing.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item": {
                    "type": "string",
                    "description": "Finished product item_code"
                },
                "quantity": {
                    "type": "number"
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
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "item",
                "quantity",
                "items"
            ]
        }
    },
    {
        "name": "stock_reconciliation",
        "description": "Adjust stock to match physical count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {
                    "type": "string"
                },
                "purpose": {
                    "type": "string",
                    "enum": [
                        "Stock Reconciliation",
                        "Opening Stock"
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
                            "warehouse": {
                                "type": "string"
                            },
                            "qty": {
                                "type": "number"
                            },
                            "valuation_rate": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "item_code",
                            "warehouse",
                            "qty"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "posting_date",
                "items"
            ]
        }
    },
    {
        "name": "create_quality_inspection",
        "description": "Create a Quality Inspection for incoming or outgoing items.",
        "input_schema": {
            "type": "object",
            "properties": {
                "inspection_type": {
                    "type": "string",
                    "enum": [
                        "Incoming",
                        "Outgoing",
                        "In Process"
                    ]
                },
                "item_code": {
                    "type": "string"
                },
                "reference_type": {
                    "type": "string",
                    "description": "e.g. Purchase Receipt, Delivery Note, Stock Entry"
                },
                "reference_name": {
                    "type": "string"
                },
                "inspected_by": {
                    "type": "string"
                },
                "readings": {
                    "type": "array",
                    "description": "Inspection parameter readings",
                    "items": {
                        "type": "object",
                        "properties": {
                            "specification": {
                                "type": "string"
                            },
                            "value": {
                                "type": "string"
                            },
                            "status": {
                                "type": "string",
                                "enum": [
                                    "Accepted",
                                    "Rejected"
                                ]
                            },
                            "min_value": {
                                "type": "number"
                            },
                            "max_value": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "specification",
                            "value",
                            "status"
                        ]
                    }
                },
                "status": {
                    "type": "string",
                    "enum": [
                        "Accepted",
                        "Rejected"
                    ]
                },
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "inspection_type",
                "item_code",
                "reference_type",
                "reference_name"
            ]
        }
    },
    {
        "name": "create_landed_cost_voucher",
        "description": "Add additional costs (freight, customs, insurance) to purchased items via Purchase Receipts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "purchase_receipts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "receipt_document_type": {
                                "type": "string",
                                "description": "Usually 'Purchase Receipt'"
                            },
                            "receipt_document": {
                                "type": "string",
                                "description": "Purchase Receipt name"
                            },
                            "supplier": {
                                "type": "string"
                            },
                            "posting_date": {
                                "type": "string"
                            },
                            "grand_total": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "receipt_document_type",
                            "receipt_document"
                        ]
                    }
                },
                "taxes": {
                    "type": "array",
                    "description": "Additional costs to distribute",
                    "items": {
                        "type": "object",
                        "properties": {
                            "expense_account": {
                                "type": "string"
                            },
                            "description": {
                                "type": "string"
                            },
                            "amount": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "expense_account",
                            "description",
                            "amount"
                        ]
                    }
                },
                "distribute_charges_based_on": {
                    "type": "string",
                    "enum": [
                        "Qty",
                        "Amount",
                        "Distribute Manually"
                    ],
                    "description": "How to split additional costs across items. Default: Amount"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "purchase_receipts",
                "taxes"
            ]
        }
    }
]
