"""Project tool schemas -- projects, tasks, timesheets."""

PROJECTS_TOOLS = [
    {
        "name": "create_project",
        "description": "Create a new Project for R&D or client work.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string"
                },
                "project_type": {
                    "type": "string",
                    "enum": [
                        "External",
                        "Internal",
                        "Other"
                    ]
                },
                "expected_start_date": {
                    "type": "string"
                },
                "expected_end_date": {
                    "type": "string"
                },
                "customer": {
                    "type": "string"
                },
                "notes": {
                    "type": "string"
                }
            },
            "required": [
                "project_name"
            ]
        }
    },
    {
        "name": "create_task",
        "description": "Create a Task (belongs to a Project).",
        "input_schema": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string"
                },
                "project": {
                    "type": "string"
                },
                "priority": {
                    "type": "string",
                    "enum": [
                        "Low",
                        "Medium",
                        "High",
                        "Urgent"
                    ]
                },
                "exp_start_date": {
                    "type": "string"
                },
                "exp_end_date": {
                    "type": "string"
                },
                "description": {
                    "type": "string"
                },
                "parent_task": {
                    "type": "string"
                }
            },
            "required": [
                "subject"
            ]
        }
    },
    {
        "name": "create_timesheet",
        "description": "Log time spent on projects/tasks via a Timesheet.",
        "input_schema": {
            "type": "object",
            "properties": {
                "employee": {
                    "type": "string"
                },
                "time_logs": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "activity_type": {
                                "type": "string"
                            },
                            "hours": {
                                "type": "number"
                            },
                            "from_time": {
                                "type": "string",
                                "description": "YYYY-MM-DD HH:MM:SS"
                            },
                            "to_time": {
                                "type": "string"
                            },
                            "project": {
                                "type": "string"
                            },
                            "task": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "activity_type",
                            "hours",
                            "from_time"
                        ]
                    }
                },
                "note": {
                    "type": "string"
                },
                "submit": {
                    "type": "boolean"
                }
            },
            "required": [
                "time_logs"
            ]
        }
    }
]
