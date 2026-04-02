"""Accounting tool schemas -- journal entries, payment entries, invoices."""

ACCOUNTING_TOOLS = [
    {
        "name": "create_journal_entry",
        "description": "Create a Journal Entry. Use for expenses without named party, internal transfers, adjustments, owner equity. Total debits MUST equal total credits.\n\nExample \u2014 Record Rs.5000 electricity expense paid from cash:\n{\"posting_date\": \"2026-03-11\", \"voucher_type\": \"Cash Entry\", \"remark\": \"Electricity bill March 2026\", \"accounts\": [{\"account\": \"Electricity Expense - DSPL\", \"debit_in_account_currency\": 5000, \"credit_in_account_currency\": 0}, {\"account\": \"Cash - DSPL\", \"debit_in_account_currency\": 0, \"credit_in_account_currency\": 5000}]}",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "voucher_type": {
                    "type": "string",
                    "enum": [
                        "Journal Entry",
                        "Bank Entry",
                        "Cash Entry",
                        "Credit Card Entry",
                        "Contra Entry",
                        "Depreciation Entry",
                        "Write Off Entry",
                        "Opening Entry"
                    ]
                },
                "remark": {
                    "type": "string"
                },
                "cheque_no": {
                    "type": "string"
                },
                "cheque_date": {
                    "type": "string"
                },
                "accounts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account": {
                                "type": "string",
                                "description": "Full account name with ' - DSPL' suffix"
                            },
                            "debit_in_account_currency": {
                                "type": "number"
                            },
                            "credit_in_account_currency": {
                                "type": "number"
                            },
                            "party_type": {
                                "type": "string"
                            },
                            "party": {
                                "type": "string"
                            },
                            "cost_center": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "account",
                            "debit_in_account_currency",
                            "credit_in_account_currency"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "posting_date",
                "voucher_type",
                "remark",
                "accounts"
            ]
        }
    },
    {
        "name": "create_payment_entry",
        "description": "Create a Payment Entry for paying suppliers, receiving from customers, or internal transfers.\n\nExample \u2014 Pay Rs.25000 to supplier from bank:\n{\"payment_type\": \"Pay\", \"party_type\": \"Supplier\", \"party\": \"ABC Electronics\", \"paid_from\": \"Bank Account - DSPL\", \"paid_to\": \"Creditors - DSPL\", \"amount\": 25000, \"posting_date\": \"2026-03-11\", \"reference_no\": \"NEFT-12345\", \"remarks\": \"Payment for PCB order\"}",
        "input_schema": {
            "type": "object",
            "properties": {
                "payment_type": {
                    "type": "string",
                    "enum": [
                        "Pay",
                        "Receive",
                        "Internal Transfer"
                    ]
                },
                "party_type": {
                    "type": "string",
                    "enum": [
                        "Supplier",
                        "Customer",
                        "Employee"
                    ]
                },
                "party": {
                    "type": "string"
                },
                "paid_from": {
                    "type": "string"
                },
                "paid_to": {
                    "type": "string"
                },
                "amount": {
                    "type": "number"
                },
                "posting_date": {
                    "type": "string"
                },
                "reference_no": {
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
                "payment_type",
                "party_type",
                "party",
                "paid_from",
                "paid_to",
                "amount",
                "posting_date",
                "reference_no",
                "remarks"
            ]
        }
    },
    {
        "name": "create_sales_invoice",
        "description": "Create a Sales Invoice to bill a customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string"
                },
                "due_date": {
                    "type": "string"
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_name": {
                                "type": "string"
                            },
                            "description": {
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
                            },
                            "income_account": {
                                "type": "string"
                            },
                            "cost_center": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_name",
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
                "customer",
                "posting_date",
                "items"
            ]
        }
    },
    {
        "name": "create_purchase_invoice",
        "description": "Create a Purchase Invoice to record a supplier bill.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string"
                },
                "due_date": {
                    "type": "string"
                },
                "bill_no": {
                    "type": "string"
                },
                "bill_date": {
                    "type": "string"
                },
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_name": {
                                "type": "string"
                            },
                            "description": {
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
                            },
                            "expense_account": {
                                "type": "string"
                            },
                            "cost_center": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "item_name",
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
                "posting_date",
                "items"
            ]
        }
    }
]
