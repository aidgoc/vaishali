"""Master data tool schemas -- customers, suppliers, items, addresses, contacts."""

MASTER_DATA_TOOLS = [
    {
        "name": "create_customer",
        "description": "Create a new Customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_name": {
                    "type": "string"
                },
                "customer_group": {
                    "type": "string"
                },
                "customer_type": {
                    "type": "string",
                    "enum": [
                        "Company",
                        "Individual"
                    ]
                },
                "territory": {
                    "type": "string"
                }
            },
            "required": [
                "customer_name"
            ]
        }
    },
    {
        "name": "create_supplier",
        "description": "Create a new Supplier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "supplier_name": {
                    "type": "string"
                },
                "supplier_group": {
                    "type": "string"
                },
                "supplier_type": {
                    "type": "string",
                    "enum": [
                        "Company",
                        "Individual"
                    ]
                }
            },
            "required": [
                "supplier_name"
            ]
        }
    },
    {
        "name": "create_item",
        "description": "Create a new Item (product/service/component).",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_code": {
                    "type": "string"
                },
                "item_name": {
                    "type": "string"
                },
                "item_group": {
                    "type": "string",
                    "description": "Raw Material, Sub Assembly, Finished Goods, Consumable, Products, Services"
                },
                "stock_uom": {
                    "type": "string",
                    "description": "Nos, Kg, Meter, Liter, Box, Set"
                },
                "description": {
                    "type": "string"
                },
                "is_stock_item": {
                    "type": "boolean"
                },
                "standard_rate": {
                    "type": "number"
                },
                "default_warehouse": {
                    "type": "string"
                }
            },
            "required": [
                "item_code",
                "item_name"
            ]
        }
    },
    {
        "name": "create_address",
        "description": "Create an Address and link it to a Customer, Supplier, Company, or Lead. Use for billing/shipping addresses.",
        "input_schema": {
            "type": "object",
            "properties": {
                "address_title": {
                    "type": "string",
                    "description": "e.g. customer/supplier name"
                },
                "address_type": {
                    "type": "string",
                    "enum": [
                        "Billing",
                        "Shipping",
                        "Office",
                        "Personal",
                        "Plant",
                        "Postal",
                        "Shop",
                        "Subsidiary",
                        "Warehouse",
                        "Other"
                    ]
                },
                "address_line1": {
                    "type": "string"
                },
                "address_line2": {
                    "type": "string"
                },
                "city": {
                    "type": "string"
                },
                "state": {
                    "type": "string"
                },
                "pincode": {
                    "type": "string"
                },
                "country": {
                    "type": "string"
                },
                "phone": {
                    "type": "string"
                },
                "email_id": {
                    "type": "string"
                },
                "is_primary_address": {
                    "type": "boolean"
                },
                "is_shipping_address": {
                    "type": "boolean"
                },
                "links": {
                    "type": "array",
                    "description": "Link to Customer/Supplier/Lead/Company",
                    "items": {
                        "type": "object",
                        "properties": {
                            "link_doctype": {
                                "type": "string",
                                "enum": [
                                    "Customer",
                                    "Supplier",
                                    "Lead",
                                    "Company"
                                ]
                            },
                            "link_name": {
                                "type": "string",
                                "description": "Customer/Supplier/Lead/Company name"
                            }
                        },
                        "required": [
                            "link_doctype",
                            "link_name"
                        ]
                    }
                }
            },
            "required": [
                "address_title",
                "address_type",
                "address_line1",
                "city",
                "country"
            ]
        }
    },
    {
        "name": "create_contact",
        "description": "Create a Contact person and link to a Customer, Supplier, or Company. For storing phone numbers, emails, and designations of people.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {
                    "type": "string"
                },
                "last_name": {
                    "type": "string"
                },
                "email_id": {
                    "type": "string"
                },
                "phone": {
                    "type": "string"
                },
                "mobile_no": {
                    "type": "string"
                },
                "designation": {
                    "type": "string"
                },
                "department": {
                    "type": "string"
                },
                "is_primary_contact": {
                    "type": "boolean"
                },
                "is_billing_contact": {
                    "type": "boolean"
                },
                "links": {
                    "type": "array",
                    "description": "Link to Customer/Supplier/Company",
                    "items": {
                        "type": "object",
                        "properties": {
                            "link_doctype": {
                                "type": "string",
                                "enum": [
                                    "Customer",
                                    "Supplier",
                                    "Company"
                                ]
                            },
                            "link_name": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "link_doctype",
                            "link_name"
                        ]
                    }
                }
            },
            "required": [
                "first_name"
            ]
        }
    }
]
