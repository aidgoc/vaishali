"""Custom Fields on Employee for the payroll module + emp_code → name resolver.

Idempotent — safe to re-run. Uses Frappe's create_custom_field which is upsert.
"""
from __future__ import annotations
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


CUSTOM_FIELDS = [
    {
        "fieldname": "legacy_emp_code",
        "label": "Legacy Emp Code",
        "fieldtype": "Data",
        "insert_after": "employee_number",
        "search_index": 1,
        "description": "Employee code from the Mar 2026 salary registers (ST109, OP003, VB, etc.). Used to look up payroll inputs.",
    },
    {
        "fieldname": "pf_applicable",
        "label": "PF applicable",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "overtime_eligible",
        "description": "When checked, Provident Fund deduction applies (12% capped at INR 1,800).",
    },
    {
        "fieldname": "esic_applicable",
        "label": "ESIC applicable",
        "fieldtype": "Check",
        "default": "0",
        "insert_after": "pf_applicable",
        "description": "When checked, ESIC deduction (0.75%) applies — typically for employees with gross at most INR 21,000.",
    },
    {
        "fieldname": "payroll_subgroup",
        "label": "Payroll subgroup",
        "fieldtype": "Select",
        "options": "Standard\nVB",
        "default": "Standard",
        "insert_after": "esic_applicable",
        "description": "Payment routing within DCEPL operators — Standard or VB (Victory Bharat-routed).",
    },
    {
        "fieldname": "base_basic_da",
        "label": "Base Basic + DA (operator min wage)",
        "fieldtype": "Currency",
        "options": "INR",
        "default": "0",
        "insert_after": "payroll_subgroup",
        "description": "Maharashtra minimum-wage anchor (Basic + DA) for DCEPL operators. Ignored for Staff and Overhead.",
    },
    {
        "fieldname": "site_allowance",
        "label": "Site allowance (INR/month)",
        "fieldtype": "Currency",
        "options": "INR",
        "default": "0",
        "insert_after": "base_basic_da",
        "description": "Monthly site allowance for operators paid via the Operator structure.",
    },
]


def ensure_custom_fields():
    """Create or upsert all 6 Employee Custom Fields. Idempotent."""
    for f in CUSTOM_FIELDS:
        create_custom_field("Employee", f)
    frappe.db.commit()
    print(f"  Custom Fields: {len(CUSTOM_FIELDS)} ensured on Employee")
