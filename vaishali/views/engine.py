"""
Frappe-native View Engine.
Uses frappe.get_list() instead of httpx — direct DB queries.
No async, no event loops, no connection pools.
"""
import frappe
import json
from datetime import date, timedelta
from vaishali.views.registry import VIEWS

COMPANY = "Dynamic Servitech Private Limited"

_DATE_MACROS = {
    "today": lambda: date.today().isoformat(),
    "today_plus_7": lambda: (date.today() + timedelta(days=7)).isoformat(),
    "fy_start": lambda: f"{date.today().year if date.today().month >= 4 else date.today().year - 1}-04-01",
    "month_start": lambda: date.today().replace(day=1).isoformat(),
}


def _resolve_role(user=None):
    if not user:
        user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if roles & {"System Manager", "Administrator"}:
        return "admin"
    if roles & {"HR Manager", "Sales Manager", "Expense Approver", "Leave Approver",
                "Purchase Manager", "Stock Manager"}:
        return "manager"
    return "field"


def _apply_macros(filters):
    """Resolve date macro strings like 'today', 'fy_start' to actual date values."""
    result = []
    for f in filters:
        row = list(f)
        # Handle 3-element filters: [field, operator, value]
        if len(row) >= 3 and isinstance(row[2], str) and row[2] in _DATE_MACROS:
            row[2] = _DATE_MACROS[row[2]]()
        # Handle 4-element filters: [doctype, field, operator, value]
        if len(row) >= 4 and isinstance(row[3], str) and row[3] in _DATE_MACROS:
            row[3] = _DATE_MACROS[row[3]]()
        result.append(row)
    return result


def _apply_context(filters, context_id):
    """Replace {context} placeholders in filter values with the actual context_id."""
    if not context_id:
        return filters
    result = []
    for f in filters:
        row = list(f)
        if len(row) >= 3 and isinstance(row[2], str) and "{context}" in row[2]:
            row[2] = row[2].replace("{context}", context_id)
        if len(row) >= 4 and isinstance(row[3], str) and "{context}" in row[3]:
            row[3] = row[3].replace("{context}", context_id)
        result.append(row)
    return result


def _run_report(report_name, filters):
    """Run a Frappe report and return columns + result.

    Uses frappe.get_doc().get_data() which works on Frappe Cloud.
    Falls back to frappe.call if the report is a Script Report.
    """
    try:
        report = frappe.get_doc("Report", report_name)
        # Script Reports and Query Reports use different execution paths
        if report.report_type in ("Script Report", "Custom Report"):
            # Use the proper internal method
            columns, data = report.get_data(
                filters=filters, as_dict=True, ignore_prepared_report=True
            )
            return {"columns": columns, "result": data}
        else:
            # Query Report / Report Builder
            data = frappe.get_list(
                report.ref_doctype,
                filters=filters,
                fields=["*"],
                limit_page_length=200,
            )
            return {"columns": [], "result": data}
    except Exception as e:
        frappe.log_error(
            title=f"View Engine Report Error: {report_name}",
            message=f"Filters: {filters}\nError: {str(e)}"
        )
        return {"columns": [], "result": [], "error": str(e)}


def fetch_view(view_name, context_id=None, role=None):
    """Fetch a complete view — role-filtered, direct DB queries."""
    if view_name not in VIEWS:
        frappe.throw(f"Unknown view: {view_name}", title="View Engine Error")

    if not role:
        role = _resolve_role()

    view = VIEWS[view_name]

    role_sections = view.get("sections", {})
    allowed = role_sections.get(role, role_sections.get("field", []))
    if allowed == ["*"]:
        allowed = list(view.get("section_defs", {}).keys())

    if not allowed:
        return {"view": view_name, "context": context_id, "role": role, "sections": {}}

    sections = {}
    for section_name in allowed:
        sdef = view.get("section_defs", {}).get(section_name)
        if not sdef:
            continue

        try:
            if sdef.get("single"):
                # Single-document fetch (e.g. Customer overview, Project overview)
                if context_id:
                    doc = frappe.get_doc(sdef["doctype"], context_id)
                    fields = sdef.get("fields", [])
                    if fields:
                        sections[section_name] = {f: doc.get(f) for f in fields}
                    else:
                        sections[section_name] = doc.as_dict()

                    # Enrich with linked addresses and contacts for Customer
                    if sdef["doctype"] == "Customer":
                        sections[section_name]["addresses"] = frappe.get_all(
                            "Address",
                            filters=[["Dynamic Link", "link_doctype", "=", "Customer"],
                                     ["Dynamic Link", "link_name", "=", context_id]],
                            fields=["name", "address_title", "address_line1", "address_line2",
                                    "city", "state", "pincode", "country", "phone", "gstin",
                                    "address_type"],
                            limit_page_length=10,
                        )
                        sections[section_name]["contacts"] = frappe.get_all(
                            "Contact",
                            filters=[["Dynamic Link", "link_doctype", "=", "Customer"],
                                     ["Dynamic Link", "link_name", "=", context_id]],
                            fields=["name", "first_name", "last_name", "email_id",
                                    "mobile_no", "phone", "designation", "department",
                                    "is_primary_contact"],
                            order_by="is_primary_contact desc",
                            limit_page_length=20,
                        )
                else:
                    sections[section_name] = {}

            elif "report" in sdef:
                # Frappe Report execution (Script Report, Query Report, etc.)
                filters = dict(sdef.get("filters", {}))
                if "company" not in filters:
                    filters["company"] = COMPANY
                if context_id:
                    for k, v in list(filters.items()):
                        if isinstance(v, str) and "{context}" in v:
                            filters[k] = v.replace("{context}", context_id)
                # Resolve any date macros in report filters
                for k, v in list(filters.items()):
                    if isinstance(v, str) and v in _DATE_MACROS:
                        filters[k] = _DATE_MACROS[v]()
                sections[section_name] = _run_report(sdef["report"], filters)

            else:
                # Standard frappe.get_list query
                filters = list(sdef.get("filters", []))
                filters = _apply_macros(filters)
                filters = _apply_context(filters, context_id)
                if not sdef.get("skip_company_filter"):
                    if not any(f[0] == "company" for f in filters):
                        filters.append(["company", "=", COMPANY])

                sections[section_name] = frappe.get_list(
                    sdef["doctype"],
                    filters=filters,
                    fields=sdef.get("fields", ["name"]),
                    order_by=sdef.get("order_by", "creation desc"),
                    limit_page_length=sdef.get("limit", 50),
                )
        except Exception as e:
            frappe.log_error(
                title=f"View Engine Error: {view_name}/{section_name}",
                message=f"Def: {json.dumps(sdef, default=str)}\nError: {str(e)}"
            )
            sections[section_name] = {"error": str(e)}

    return {
        "view": view_name,
        "context": context_id,
        "role": role,
        "sections": sections,
    }


def list_views():
    """Return list of all registered views with descriptions."""
    return [{"name": k, "description": v.get("description", "")}
            for k, v in VIEWS.items()]
