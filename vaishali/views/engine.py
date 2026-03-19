"""
Frappe-native View Engine.
Uses frappe.get_list() instead of httpx — direct DB queries.
No async, no event loops, no connection pools.
"""
import frappe
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
    result = []
    for f in filters:
        row = list(f)
        if len(row) >= 3 and isinstance(row[2], str) and row[2] in _DATE_MACROS:
            row[2] = _DATE_MACROS[row[2]]()
        result.append(row)
    return result


def _apply_context(filters, context_id):
    if not context_id:
        return filters
    result = []
    for f in filters:
        row = list(f)
        if len(row) >= 3 and isinstance(row[2], str) and "{context}" in row[2]:
            row[2] = row[2].replace("{context}", context_id)
        result.append(row)
    return result


def fetch_view(view_name, context_id=None, role=None):
    """Fetch a complete view — role-filtered, direct DB queries."""
    if view_name not in VIEWS:
        return {"error": f"Unknown view: {view_name}"}

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
                if context_id:
                    doc = frappe.get_doc(sdef["doctype"], context_id)
                    fields = sdef.get("fields", [])
                    sections[section_name] = {f: doc.get(f) for f in fields} if fields else doc.as_dict()
                else:
                    sections[section_name] = {}

            elif "report" in sdef:
                filters = dict(sdef.get("filters", {}))
                if "company" not in filters:
                    filters["company"] = COMPANY
                if context_id:
                    for k, v in filters.items():
                        if isinstance(v, str) and "{context}" in v:
                            filters[k] = v.replace("{context}", context_id)
                result = frappe.call("frappe.client.get_report",
                    report_name=sdef["report"], filters=filters)
                sections[section_name] = result or {"columns": [], "result": []}

            else:
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
            sections[section_name] = {"error": str(e)}

    return {
        "view": view_name,
        "context": context_id,
        "role": role,
        "sections": sections,
    }


def list_views():
    return [{"name": k, "description": v.get("description", "")}
            for k, v in VIEWS.items()]
