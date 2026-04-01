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


def execute_tool(tool_name, tool_input, user_role, employee_id="", employee_name="", user=None):
    """Execute a tool call. Returns JSON string."""
    try:
        # ── Memory ──
        if tool_name == "save_memory":
            return _save_memory(tool_input, user or frappe.session.user)
        elif tool_name == "get_memories":
            return _get_memories(user or frappe.session.user)

        # ── Search & Read ──
        elif tool_name == "search_records":
            return _search_records(tool_input)
        elif tool_name == "get_document":
            return _get_document(tool_input)
        elif tool_name == "get_count":
            return _get_count(tool_input)
        elif tool_name == "search_link":
            return _search_link(tool_input)
        elif tool_name == "get_report":
            return _get_report(tool_input)
        elif tool_name == "business_dashboard":
            return _business_dashboard(tool_input)

        # ── Write ──
        elif tool_name == "update_document":
            return _update_document(tool_input)
        elif tool_name == "submit_document":
            return _submit_document(tool_input)
        elif tool_name == "cancel_document":
            if user_role not in ("admin", "manager"):
                return json.dumps({"error": "Cancel requires manager or admin role"})
            return _cancel_document(tool_input)
        elif tool_name == "delete_document":
            if user_role != "admin":
                return json.dumps({"error": "Delete requires admin role"})
            return _delete_document(tool_input)

        # ── BOM Amendment ──
        elif tool_name == "amend_bom":
            if user_role not in ("admin", "manager"):
                return json.dumps({"error": "Amend BOM requires manager or admin role"})
            return _amend_bom(tool_input)

        # ── View Engine ──
        elif tool_name == "query_view":
            from vaishali.views.engine import fetch_view
            view_name = tool_input.get("view_name", "")
            context_id = tool_input.get("context_id")
            result = fetch_view(view_name, context_id, role=user_role)
            result_str = json.dumps(result, default=str)
            if len(result_str) > 4000:
                result_str = result_str[:4000] + "\n\n[... truncated]"
            return result_str

        # ── Self-service tools ──
        elif tool_name == "chat_mark_attendance":
            return _mark_attendance(tool_input, employee_id)
        elif tool_name == "my_daily_summary":
            return _daily_summary(employee_id, employee_name)

        # ── Discovery ──
        elif tool_name == "discover_tools":
            from vaishali.agent.tools import TOOL_CATEGORIES
            cat = tool_input.get("category", "")
            if cat in TOOL_CATEGORIES:
                tools = TOOL_CATEGORIES[cat]["tools"]
                return json.dumps({"category": cat, "tools": tools,
                                   "message": f"Loaded {len(tools)} tools from {cat}"})
            return json.dumps({"error": f"Unknown category: {cat}",
                               "available": list(TOOL_CATEGORIES.keys())})

        # ── System ──
        elif tool_name == "get_system_settings":
            return json.dumps({"company": COMPANY, "currency": "INR"})

        else:
            return json.dumps({"error": f"Tool not implemented: {tool_name}"})

    except frappe.PermissionError:
        return json.dumps({"error": f"Permission denied for {tool_name}. Your role doesn't have access."})
    except frappe.DoesNotExistError as e:
        return json.dumps({"error": f"Record not found: {str(e)[:200]}"})
    except Exception as e:
        return json.dumps({"error": f"{tool_name} failed: {str(e)[:200]}"})


# ── Tool Implementations ──────────────────────────────────────────

def _search_records(inp):
    doctype = inp.get("doctype", "")
    filters = inp.get("filters", [])
    fields = inp.get("fields", ["name"])
    order_by = inp.get("order_by", "creation desc")
    limit = min(inp.get("limit", 20), 100)

    # Add company filter for doctypes that have it
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


def _get_document(inp):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    _add_action({"type": "navigate", "route": "/app/" + _doctype_to_route(inp["doctype"]) + "/" + doc.name})
    return json.dumps(doc.as_dict(), default=str)


def _get_count(inp):
    filters = inp.get("filters", [])
    if not any(f[0] == "company" for f in filters):
        meta = frappe.get_meta(inp["doctype"])
        if meta.has_field("company"):
            filters.append(["company", "=", COMPANY])
    count = frappe.db.count(inp["doctype"], filters=filters)
    return json.dumps({"count": count})


def _search_link(inp):
    results = frappe.call("frappe.client.get_list",
        doctype=inp["doctype"],
        filters=[["name", "like", f"%{inp.get('txt', '')}%"]],
        fields=["name"],
        limit_page_length=10)
    return json.dumps([{"value": r["name"]} for r in results], default=str)


def _get_report(inp):
    report_name = inp.get("report_name", "")
    filters = inp.get("filters", {})
    if "company" not in filters:
        filters["company"] = COMPANY
    result = frappe.call("frappe.client.get_report",
        report_name=report_name, filters=filters)
    return json.dumps(result or {}, default=str)


def _business_dashboard(inp):
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


def _update_document(inp):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    for key, value in inp.get("values", {}).items():
        doc.set(key, value)
    doc.save()
    frappe.db.commit()
    route = "/app/" + _doctype_to_route(inp["doctype"]) + "/" + doc.name
    _add_action({"type": "navigate", "route": route})
    for field in inp.get("values", {}):
        _add_action({"type": "highlight", "field": field, "delay": 400})
    return json.dumps({"success": True, "name": doc.name})


def _submit_document(inp):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    doc.submit()
    frappe.db.commit()
    route = "/app/" + _doctype_to_route(inp["doctype"]) + "/" + doc.name
    _add_action({"type": "navigate", "route": route})
    _add_action({"type": "notify", "message": inp["doctype"] + " " + doc.name + " submitted", "variant": "green"})
    return json.dumps({"success": True, "name": doc.name, "docstatus": 1})


def _cancel_document(inp):
    doc = frappe.get_doc(inp["doctype"], inp["name"])
    doc.cancel()
    frappe.db.commit()
    return json.dumps({"success": True, "name": doc.name, "docstatus": 2})


def _delete_document(inp):
    frappe.delete_doc(inp["doctype"], inp["name"])
    frappe.db.commit()
    return json.dumps({"success": True})


def _mark_attendance(inp, employee_id):
    from datetime import datetime
    log_type = inp.get("log_type", "IN")
    doc = frappe.new_doc("Employee Checkin")
    doc.employee = employee_id
    doc.log_type = log_type
    doc.time = datetime.now()
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return json.dumps({"success": True, "name": doc.name, "log_type": log_type})


def _amend_bom(inp):
    """Amend a submitted BOM: cancel → create amended copy → apply changes → submit."""
    bom_name = inp.get("name", "")
    changes = inp.get("changes", {})

    doc = frappe.get_doc("BOM", bom_name)
    if doc.docstatus != 1:
        return json.dumps({"error": f"BOM {bom_name} is not submitted (docstatus={doc.docstatus}). Only submitted BOMs can be amended."})

    # Step 1: Cancel the existing BOM
    doc.cancel()
    frappe.db.commit()

    # Step 2: Create amended copy via ERPNext's amend pattern
    new_doc = frappe.copy_doc(doc)
    new_doc.amended_from = bom_name
    new_doc.docstatus = 0

    # Step 3: Apply item-level changes (rate, qty updates)
    item_changes = changes.get("items", {})
    for row in new_doc.items:
        item_key = row.item_code
        if item_key in item_changes:
            for field, value in item_changes[item_key].items():
                row.set(field, value)

    # Apply top-level field changes
    for field, value in changes.items():
        if field != "items":
            new_doc.set(field, value)

    # Step 4: Save and submit the amended BOM
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


def _daily_summary(employee_id, employee_name):
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


# ── Memory Tools ─────────────────────────────────────────────────

def _save_memory(inp, user):
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


def _get_memories(user):
    """Get all memories for the user."""
    memories = frappe.get_all("Vaishali Memory",
        filters={"user": user},
        fields=["key", "content", "source", "last_used"],
        order_by="last_used desc",
        limit_page_length=20)
    return json.dumps(memories, default=str)
