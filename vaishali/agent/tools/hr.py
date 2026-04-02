"""HR tool schemas -- employees, attendance, leave, salary, payroll, expenses, advances."""

HR_TOOLS = [
    {
        "name": "create_employee",
        "description": "Create a new employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {
                    "type": "string"
                },
                "last_name": {
                    "type": "string"
                },
                "designation": {
                    "type": "string"
                },
                "department": {
                    "type": "string"
                },
                "date_of_joining": {
                    "type": "string"
                },
                "gender": {
                    "type": "string",
                    "enum": [
                        "Male",
                        "Female",
                        "Other"
                    ]
                },
                "date_of_birth": {
                    "type": "string"
                },
                "cell_phone": {
                    "type": "string"
                }
            },
            "required": [
                "first_name",
                "designation",
                "date_of_joining"
            ]
        }
    },
    {
        "name": "mark_attendance",
        "description": "Mark attendance for an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string",
                    "description": "Employee ID (e.g. HR-EMP-00001)"
                },
                "date": {
                    "type": "string"
                },
                "status": {
                    "type": "string",
                    "enum": [
                        "Present",
                        "Absent",
                        "Half Day",
                        "On Leave"
                    ]
                }
            },
            "required": [
                "employee",
                "status"
            ]
        }
    },
    {
        "name": "create_leave_application",
        "description": "Create a leave request.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "leave_type": {
                    "type": "string"
                },
                "from_date": {
                    "type": "string"
                },
                "to_date": {
                    "type": "string"
                },
                "reason": {
                    "type": "string"
                }
            },
            "required": [
                "employee",
                "leave_type",
                "from_date",
                "to_date",
                "reason"
            ]
        }
    },
    {
        "name": "create_expense_claim",
        "description": "Create an Expense Claim for employee reimbursement.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string",
                    "description": "Employee ID (e.g. HR-EMP-00001)"
                },
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "expenses": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "expense_type": {
                                "type": "string"
                            },
                            "amount": {
                                "type": "number"
                            },
                            "description": {
                                "type": "string"
                            },
                            "sanctioned_amount": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "expense_type",
                            "amount"
                        ]
                    }
                },
                "payable_account": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "employee",
                "expenses"
            ]
        }
    },
    {
        "name": "create_salary_structure",
        "description": "Create a Salary Structure defining earning and deduction components.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name_template": {
                    "type": "string",
                    "description": "Name for this structure (e.g. 'Standard Monthly')"
                },
                "payroll_frequency": {
                    "type": "string",
                    "enum": [
                        "Monthly",
                        "Bimonthly",
                        "Fortnightly",
                        "Weekly"
                    ]
                },
                "earnings": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "salary_component": {
                                "type": "string"
                            },
                            "amount": {
                                "type": "number"
                            },
                            "formula": {
                                "type": "string"
                            },
                            "depends_on_payment_days": {
                                "type": "boolean"
                            }
                        },
                        "required": [
                            "salary_component"
                        ]
                    }
                },
                "deductions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "salary_component": {
                                "type": "string"
                            },
                            "amount": {
                                "type": "number"
                            },
                            "formula": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "salary_component"
                        ]
                    }
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "name_template",
                "payroll_frequency",
                "earnings"
            ]
        }
    },
    {
        "name": "create_salary_slip",
        "description": "Create a Salary Slip for an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "start_date": {
                    "type": "string"
                },
                "end_date": {
                    "type": "string"
                },
                "payroll_frequency": {
                    "type": "string",
                    "enum": [
                        "Monthly",
                        "Bimonthly",
                        "Fortnightly",
                        "Weekly"
                    ]
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "employee"
            ]
        }
    },
    {
        "name": "create_payroll_entry",
        "description": "Process payroll for multiple employees at once.",
        "input_schema": {
            "type": "object",
            "properties": {
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "payroll_frequency": {
                    "type": "string",
                    "enum": [
                        "Monthly",
                        "Bimonthly",
                        "Fortnightly",
                        "Weekly"
                    ]
                },
                "start_date": {
                    "type": "string"
                },
                "end_date": {
                    "type": "string"
                },
                "department": {
                    "type": "string"
                },
                "branch": {
                    "type": "string"
                },
                "designation": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "posting_date",
                "payroll_frequency"
            ]
        }
    },
    {
        "name": "create_employee_advance",
        "description": "Create an Employee Advance (pre-payment against future expenses).",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "advance_amount": {
                    "type": "number"
                },
                "purpose": {
                    "type": "string"
                },
                "posting_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "advance_account": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "employee",
                "advance_amount",
                "purpose"
            ]
        }
    },
    {
        "name": "create_shift_assignment",
        "description": "Assign a shift to an employee.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "shift_type": {
                    "type": "string"
                },
                "start_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "end_date": {
                    "type": "string"
                }
            },
            "required": [
                "employee",
                "shift_type",
                "start_date"
            ]
        }
    },
    {
        "name": "create_training_event",
        "description": "Create a Training Event for employees.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_name": {
                    "type": "string"
                },
                "start_time": {
                    "type": "string",
                    "description": "YYYY-MM-DD HH:MM:SS"
                },
                "end_time": {
                    "type": "string",
                    "description": "YYYY-MM-DD HH:MM:SS"
                },
                "type": {
                    "type": "string",
                    "enum": [
                        "Seminar",
                        "Theory",
                        "Workshop"
                    ]
                },
                "trainer_name": {
                    "type": "string"
                },
                "trainer_email": {
                    "type": "string"
                },
                "introduction": {
                    "type": "string"
                },
                "employees": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "employee": {
                                "type": "string"
                            },
                            "employee_name": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "employee"
                        ]
                    }
                }
            },
            "required": [
                "event_name",
                "start_time",
                "end_time"
            ]
        }
    },
    {
        "name": "create_appraisal",
        "description": "Create an employee performance Appraisal.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "appraisal_template": {
                    "type": "string"
                },
                "start_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "end_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "goals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "kra": {
                                "type": "string"
                            },
                            "per_weightage": {
                                "type": "number"
                            }
                        },
                        "required": [
                            "kra",
                            "per_weightage"
                        ]
                    }
                },
                "remarks": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "employee",
                "appraisal_template",
                "start_date",
                "end_date"
            ]
        }
    },
    {
        "name": "create_employee_checkin",
        "description": "Create an Employee Checkin record (clock in/out).",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string",
                    "description": "Employee ID (e.g. HR-EMP-00001)"
                },
                "time": {
                    "type": "string",
                    "description": "YYYY-MM-DD HH:MM:SS"
                },
                "log_type": {
                    "type": "string",
                    "enum": [
                        "IN",
                        "OUT"
                    ]
                },
                "device_id": {
                    "type": "string"
                }
            },
            "required": [
                "employee",
                "time"
            ]
        }
    },
    {
        "name": "create_leave_allocation",
        "description": "Allocate leave balance to an employee for a leave type and period.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string",
                    "description": "Employee ID (e.g. HR-EMP-00001)"
                },
                "leave_type": {
                    "type": "string"
                },
                "new_leaves_allocated": {
                    "type": "number"
                },
                "from_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "to_date": {
                    "type": "string",
                    "description": "YYYY-MM-DD"
                },
                "carry_forward": {
                    "type": "boolean"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "employee",
                "leave_type",
                "new_leaves_allocated",
                "from_date",
                "to_date"
            ]
        }
    }
]
