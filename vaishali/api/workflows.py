"""Vaishali Workflows API — Tutorial content with role-based access control.

Provides @frappe.whitelist endpoint to fetch tutorial content for DSPL Workflows page.
Requires System Manager role for access.
"""
import frappe
import json
import os


@frappe.whitelist()
def get_tutorials():
    """Fetch tutorial content with role-based access control.

    Requires System Manager role. Returns tutorial dictionary organized by role
    (sales, field, hr, operations) with content loaded from fixture.

    Returns:
        dict: Tutorial content with structure {"sales": {...}, "field": {...}, "hr": {...}, "operations": {...}}

    Raises:
        frappe.PermissionError: If user is not System Manager
    """
    # Check permission: only System Manager can access tutorials
    if not frappe.has_role("System Manager"):
        frappe.throw("Only System Manager can access tutorial content",
                     exc=frappe.PermissionError)

    # Load tutorial content from fixture
    tutorials = _load_tutorial_content()

    if not tutorials:
        tutorials = _get_default_tutorials()

    return tutorials


def _load_tutorial_content():
    """Load tutorial content from fixture JSON file.

    Returns:
        dict: Tutorial content or None if fixture not found
    """
    try:
        # Get the path to the fixture file
        fixture_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'data',
            'tutorial_content.json'
        )

        if not os.path.exists(fixture_path):
            frappe.log_error(
                f"Tutorial fixture not found at {fixture_path}",
                title="Workflows Tutorial Fixture Missing"
            )
            return None

        # Read and parse the fixture
        with open(fixture_path, 'r', encoding='utf-8') as f:
            content = json.load(f)

        return content

    except json.JSONDecodeError as e:
        frappe.log_error(
            f"Failed to parse tutorial fixture JSON: {str(e)}",
            title="Workflows Tutorial JSON Parse Error"
        )
        return None

    except Exception as e:
        frappe.log_error(
            f"Error loading tutorial fixture: {str(e)}",
            title="Workflows Tutorial Load Error"
        )
        return None


def _get_default_tutorials():
    """Return default empty tutorials structure as fallback.

    Returns:
        dict: Empty tutorial structure for all roles
    """
    return {
        "sales": {
            "title": "Sales Workflows",
            "description": "Tutorials for Sales team",
            "modules": []
        },
        "field": {
            "title": "Field Operations Workflows",
            "description": "Tutorials for Field staff",
            "modules": []
        },
        "hr": {
            "title": "HR Workflows",
            "description": "Tutorials for HR operations",
            "modules": []
        },
        "operations": {
            "title": "Operations Workflows",
            "description": "Tutorials for Operations team",
            "modules": []
        }
    }
