"""Tool executor — runs ERPNext operations using native Frappe ORM."""
import frappe
import json
from datetime import date

COMPANY = "Dynamic Servitech Private Limited"
ABBR = "DSPL"


def _doctype_to_route(doctype):
    return doctype.lower().replace(" ", "-")


def _add_action(action):
    if not hasattr(frappe.local, "vaishali_actions"):
        frappe.local.vaishali_actions = []
    frappe.local.vaishali_actions.append(action)


def get_pending_actions():
    return getattr(frappe.local, "vaishali_actions", [])


def clear_pending_actions():
    frappe.local.vaishali_actions = []


# ── Tool Implementations ──────────────────────────────────────────

def _search_records(inp, **kw):
    doctype = inp.get("doctype", "")
    filters = inp.get("filters", [])
    fields = inp.get("fields", ["name"])
    order_by = inp.get("order_by", "creation desc")
    limit = min(inp.get("limit", 20), 100)

    if not any(f[0] == "company" for f in filters):
        meta = frappe.get_meta(doctype)
        if meta.has_field("company"):
            filters.append(["company", "=", COMPANY])

    data = frappe.get_list(doctype, filters=filters, fields=fields,
                           order_by=order_by, limit_page_length=limit)
    if data:
        if len(data) == 1:
            _add_action({"type": "navigate", "route": "/app/" + _doctype_to_route(doctype) + "/" + str(data[0].get("name", ""))})
        else:
            _add_action({"type": "navigate", "route": "/app/" + _doctype_to_route(doctype)})
    return json.dumps(data, default=str)


def _get_document(inp, **kw):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    _add_action({"type": "navigate", "route": "/app/" + _doctype_to_route(inp["doctype"]) + "/" + doc.name})
    return json.dumps(doc.as_dict(), default=str)


def _get_count(inp, **kw):
    filters = inp.get("filters", [])
    if not any(f[0] == "company" for f in filters):
        meta = frappe.get_meta(inp["doctype"])
        if meta.has_field("company"):
            filters.append(["company", "=", COMPANY])
    count = frappe.db.count(inp["doctype"], filters=filters)
    return json.dumps({"count": count})


def _search_link(inp, **kw):
    results = frappe.call("frappe.client.get_list",
        doctype=inp["doctype"],
        filters=[["name", "like", f"%{inp.get('txt', '')}%"]],
        fields=["name"],
        limit_page_length=10)
    return json.dumps([{"value": r["name"]} for r in results], default=str)


def _get_report(inp, **kw):
    report_name = inp.get("report_name", "")
    filters = inp.get("filters", {})
    if "company" not in filters:
        filters["company"] = COMPANY
    result = frappe.call("frappe.client.get_report",
        report_name=report_name, filters=filters)
    return json.dumps(result or {}, default=str)


def _business_dashboard(inp, **kw):
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    revenue = frappe.db.sql("""
        SELECT COALESCE(SUM(grand_total), 0) as total
        FROM `tabSales Invoice`
        WHERE company=%s AND docstatus=1 AND posting_date >= %s
    """, (COMPANY, month_start), as_dict=True)[0].total

    receivable = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0) as total
        FROM `tabSales Invoice`
        WHERE company=%s AND docstatus=1 AND outstanding_amount > 0
    """, (COMPANY,), as_dict=True)[0].total

    employees = frappe.db.count("Employee",
        filters={"company": COMPANY, "status": "Active"})

    return json.dumps({
        "revenue_this_month": float(revenue),
        "accounts_receivable": float(receivable),
        "active_employees": employees,
        "period": "this_month",
    }, default=str)


def _update_document(inp, **kw):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    for key, value in inp.get("values", inp.get("data", {})).items():
        doc.set(key, value)
    doc.save()
    frappe.db.commit()
    route = "/app/" + _doctype_to_route(inp["doctype"]) + "/" + doc.name
    _add_action({"type": "navigate", "route": route})
    for field in inp.get("values", inp.get("data", {})):
        _add_action({"type": "highlight", "field": field, "delay": 400})
    return json.dumps({"success": True, "name": doc.name})


def _submit_document(inp, user_role="user", **kw):
    doctype = inp["doctype"]
    name = inp["name"]

    meta = frappe.get_meta(doctype)
    if not meta.is_submittable:
        return json.dumps({"error": f"{doctype} is not a submittable DocType. Only submittable documents (Sales Order, Invoice, etc.) can be submitted."})

    doc = frappe.get_doc(doctype, name)

    if doc.docstatus != 0:
        status = {1: "already submitted", 2: "cancelled"}.get(doc.docstatus, f"docstatus={doc.docstatus}")
        return json.dumps({"error": f"{doctype} {name} is {status}. Only Draft documents (docstatus=0) can be submitted."})

    if user_role == "user":
        if not frappe.has_permission(doctype, "submit", doc):
            return json.dumps({"error": f"You don't have permission to submit {doctype}. Ask a manager to submit this document."})

    doc.submit()
    frappe.db.commit()
    route = "/app/" + _doctype_to_route(doctype) + "/" + doc.name
    _add_action({"type": "navigate", "route": route})
    _add_action({"type": "notify", "message": doctype + " " + doc.name + " submitted", "variant": "green"})
    return json.dumps({"success": True, "name": doc.name, "docstatus": 1})


def _cancel_document(inp, **kw):
    doctype = inp["doctype"]
    name = inp["name"]
    meta = frappe.get_meta(doctype)
    if not meta.is_submittable:
        return json.dumps({"error": f"{doctype} is not a submittable DocType and cannot be cancelled."})
    doc = frappe.get_doc(doctype, name)
    if doc.docstatus != 1:
        status = {0: "still in Draft", 2: "already cancelled"}.get(doc.docstatus, f"docstatus={doc.docstatus}")
        return json.dumps({"error": f"{doctype} {name} is {status}. Only submitted documents (docstatus=1) can be cancelled."})
    doc.cancel()
    frappe.db.commit()
    return json.dumps({"success": True, "name": doc.name, "docstatus": 2})


def _delete_document(inp, **kw):
    frappe.delete_doc(inp["doctype"], inp["name"])
    frappe.db.commit()
    return json.dumps({"success": True})


def _mark_attendance(inp, employee_id="", **kw):
    from datetime import datetime
    log_type = inp.get("log_type", "IN")
    doc = frappe.new_doc("Employee Checkin")
    doc.employee = employee_id
    doc.log_type = log_type
    doc.time = datetime.now()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return json.dumps({"success": True, "name": doc.name, "log_type": log_type})


def _amend_bom(inp, **kw):
    """Amend a submitted BOM: cancel → create amended copy → apply changes → submit."""
    bom_name = inp.get("name", "")
    changes = inp.get("changes", {})

    doc = frappe.get_doc("BOM", bom_name)
    if doc.docstatus != 1:
        return json.dumps({"error": f"BOM {bom_name} is not submitted (docstatus={doc.docstatus}). Only submitted BOMs can be amended."})

    doc.cancel()
    frappe.db.commit()

    new_doc = frappe.copy_doc(doc)
    new_doc.amended_from = bom_name
    new_doc.docstatus = 0

    item_changes = changes.get("items", {})
    for row in new_doc.items:
        item_key = row.item_code
        if item_key in item_changes:
            for field, value in item_changes[item_key].items():
                row.set(field, value)

    for field, value in changes.items():
        if field != "items":
            new_doc.set(field, value)

    new_doc.insert(ignore_permissions=True)
    new_doc.submit()
    frappe.db.commit()

    return json.dumps({
        "success": True,
        "old_bom": bom_name,
        "new_bom": new_doc.name,
        "status": "submitted",
        "message": f"BOM amended: {bom_name} cancelled → {new_doc.name} submitted"
    })


def _daily_summary(inp, employee_id="", employee_name="", **kw):
    today = date.today().isoformat()
    checkins = frappe.get_list("Employee Checkin",
        filters={"employee": employee_id, "time": [">=", f"{today} 00:00:00"]},
        fields=["log_type", "time"], order_by="time asc")
    visits = frappe.db.count("Daily Call Report",
        filters={"employee": employee_id, "date": today})

    return json.dumps({
        "employee": employee_name,
        "date": today,
        "checkins": len(checkins),
        "visits_today": visits,
        "checked_in": any(c.log_type == "IN" for c in checkins),
    }, default=str)


def _save_memory(inp, user="", **kw):
    """Save or update a persistent memory for the user."""
    key = inp.get("key", "").strip()
    content = inp.get("content", "").strip()
    if not key or not content:
        return json.dumps({"error": "Both key and content are required"})

    from frappe.utils import now_datetime
    existing = frappe.db.exists("Vaishali Memory", {"user": user, "key": key})
    if existing:
        doc = frappe.get_doc("Vaishali Memory", existing)
        doc.content = content
        doc.last_used = now_datetime()
        doc.save(ignore_permissions=True)
    else:
        doc = frappe.new_doc("Vaishali Memory")
        doc.user = user
        doc.key = key
        doc.content = content
        doc.source = "auto"
        doc.last_used = now_datetime()
        doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return json.dumps({"success": True, "key": key, "action": "updated" if existing else "created"})


def _get_memories(inp, user="", **kw):
    """Get all memories for the user."""
    memories = frappe.get_all("Vaishali Memory",
        filters={"user": user},
        fields=["key", "content", "source", "last_used"],
        order_by="last_used desc",
        limit_page_length=20)
    return json.dumps(memories, default=str)


def _query_view(inp, user_role="user", **kw):
    from vaishali.views.engine import fetch_view
    view_name = inp.get("view_name", "")
    context_id = inp.get("context_id")
    result = fetch_view(view_name, context_id, role=user_role)
    result_str = json.dumps(result, default=str)
    if len(result_str) > 4000:
        result_str = result_str[:4000] + "\n\n[... truncated]"
    return result_str


def _discover_tools(inp, **kw):
    from vaishali.agent.tools import TOOL_CATEGORIES
    cat = inp.get("category", "")
    if cat in TOOL_CATEGORIES:
        tools = TOOL_CATEGORIES[cat]["tools"]
        return json.dumps({"category": cat, "tools": tools,
                           "message": f"Loaded {len(tools)} tools from {cat}"})
    return json.dumps({"error": f"Unknown category: {cat}",
                       "available": list(TOOL_CATEGORIES.keys())})


def _get_system_settings(inp, **kw):
    return json.dumps({"company": COMPANY, "currency": "INR"})


# ── Dispatch Table ────────────────────────────────────────────────

TOOL_HANDLERS = {
    # Memory
    "save_memory": _save_memory,
    "get_memories": _get_memories,
    # Search & Read
    "search_records": _search_records,
    "get_document": _get_document,
    "get_count": _get_count,
    "search_link": _search_link,
    "get_report": _get_report,
    "business_dashboard": _business_dashboard,
    # Write
    "update_document": _update_document,
    "submit_document": _submit_document,
    "cancel_document": _cancel_document,
    "delete_document": _delete_document,
    # BOM
    "amend_bom": _amend_bom,
    # View Engine
    "query_view": _query_view,
    # Self-service
    "chat_mark_attendance": _mark_attendance,
    "my_daily_summary": _daily_summary,
    # Discovery
    "discover_tools": _discover_tools,
    # System
    "get_system_settings": _get_system_settings,
}

# Role gates — checked before dispatch
_ROLE_GATES = {
    "cancel_document": ("admin", "manager"),
    "delete_document": ("admin",),
    "amend_bom": ("admin", "manager"),
}


def execute_tool(tool_name, tool_input, user_role, employee_id="", employee_name="", user=None):
    """Execute a tool call. Returns JSON string."""
    try:
        # Role gate check
        allowed_roles = _ROLE_GATES.get(tool_name)
        if allowed_roles and user_role not in allowed_roles:
            role_str = " or ".join(allowed_roles)
            return json.dumps({"error": f"{tool_name} requires {role_str} role"})

        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            return json.dumps({"error": f"Tool not implemented: {tool_name}"})

        return handler(
            tool_input,
            user_role=user_role,
            employee_id=employee_id or "",
            employee_name=employee_name,
            user=user or frappe.session.user,
        )

    except frappe.PermissionError:
        return json.dumps({"error": f"Permission denied for {tool_name}. Your role doesn't have access."})
    except frappe.DoesNotExistError as e:
        return json.dumps({"error": f"Record not found: {str(e)[:200]}"})
    except Exception as e:
        return json.dumps({"error": f"{tool_name} failed: {str(e)[:200]}"})
