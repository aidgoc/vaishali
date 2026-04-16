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


# ── Leave Balance ────────────────────────────────────────────────

def _get_leave_balance(inp, employee_id="", **kw):
    """Get leave balance for an employee."""
    emp = inp.get("employee_id") or employee_id
    if not emp:
        return json.dumps({"error": "Employee ID not found"})

    from frappe.utils import getdate, get_year_start, get_year_end
    today = date.today()

    # Get leave allocations for current period
    allocations = frappe.get_all("Leave Allocation",
        filters={
            "employee": emp,
            "docstatus": 1,
            "from_date": ["<=", today.isoformat()],
            "to_date": [">=", today.isoformat()],
        },
        fields=["leave_type", "total_leaves_allocated", "new_leaves_allocated"])

    result = []
    for alloc in allocations:
        # Count approved leaves taken
        taken = frappe.db.sql("""
            SELECT IFNULL(SUM(total_leave_days), 0) as taken
            FROM `tabLeave Application`
            WHERE employee = %s AND leave_type = %s
              AND docstatus = 1 AND status = 'Approved'
              AND from_date >= %s AND to_date <= %s
        """, (emp, alloc.leave_type, get_year_start(today), get_year_end(today)), as_dict=True)

        leaves_taken = taken[0].taken if taken else 0
        balance = alloc.total_leaves_allocated - leaves_taken

        result.append({
            "leave_type": alloc.leave_type,
            "allocated": alloc.total_leaves_allocated,
            "taken": leaves_taken,
            "balance": balance,
        })

    return json.dumps({"employee": emp, "balances": result}, default=str)


# ── Approvals ────────────────────────────────────────────────────

def _list_pending_approvals(inp, user="", **kw):
    """List all documents pending the current user's approval."""
    pending = []

    # Leave Applications
    leaves = frappe.get_all("Leave Application",
        filters={"docstatus": 0, "status": "Open", "leave_approver": user},
        fields=["name", "employee_name", "leave_type", "from_date", "to_date",
                "total_leave_days", "posting_date"],
        order_by="posting_date desc", limit_page_length=20)
    for l in leaves:
        pending.append({"type": "Leave Application", "name": l.name,
                        "summary": f"{l.employee_name}: {l.leave_type} {l.from_date} to {l.to_date} ({l.total_leave_days}d)"})

    # Expense Claims
    expenses = frappe.get_all("Expense Claim",
        filters={"docstatus": 0, "approval_status": "Draft", "expense_approver": user},
        fields=["name", "employee_name", "total_claimed_amount", "posting_date"],
        order_by="posting_date desc", limit_page_length=20)
    for e in expenses:
        pending.append({"type": "Expense Claim", "name": e.name,
                        "summary": f"{e.employee_name}: ₹{e.total_claimed_amount:,.0f}"})

    return json.dumps({"pending_count": len(pending), "items": pending}, default=str)


def _approve_document(inp, user="", **kw):
    """Approve or reject a Leave Application or Expense Claim."""
    doctype = inp.get("doctype")
    name = inp.get("name")
    action = inp.get("action")
    reason = inp.get("reason", "")

    if doctype not in ("Leave Application", "Expense Claim"):
        return json.dumps({"error": "Only Leave Application and Expense Claim can be approved via chat"})

    doc = frappe.get_doc(doctype, name)

    if doctype == "Leave Application":
        if action == "Approve":
            doc.status = "Approved"
        else:
            doc.status = "Rejected"
            if reason:
                doc.add_comment("Comment", f"Rejected: {reason}")
        doc.save(ignore_permissions=True)
        doc.submit()
        frappe.db.commit()
        return json.dumps({"success": True, "doctype": doctype, "name": name,
                           "status": doc.status})

    elif doctype == "Expense Claim":
        if action == "Approve":
            doc.approval_status = "Approved"
        else:
            doc.approval_status = "Rejected"
            if reason:
                doc.add_comment("Comment", f"Rejected: {reason}")
        doc.save(ignore_permissions=True)
        doc.submit()
        frappe.db.commit()
        return json.dumps({"success": True, "doctype": doctype, "name": name,
                           "status": doc.approval_status})


# ── Daily Action Items ───────────────────────────────────────────

def _daily_action_items(inp, employee_id="", user="", user_role="user", **kw):
    """Get prioritized daily action items for the user."""
    from frappe.utils import add_days
    today_str = date.today().isoformat()
    items = []

    # 1. Expiring quotations (within 3 days)
    threshold = add_days(today_str, 3)
    expiring = frappe.get_all("Quotation",
        filters={"status": "Open", "docstatus": 1, "valid_till": ["between", [today_str, threshold]], "owner": user},
        fields=["name", "party_name", "grand_total", "valid_till"],
        limit_page_length=10)
    for q in expiring:
        items.append({"priority": "high", "category": "Quotation Expiry",
                      "action": f"Follow up on {q.name} — {q.party_name} (₹{q.grand_total:,.0f}, expires {q.valid_till})"})

    # 2. Pending approvals (managers only)
    if user_role in ("manager", "admin"):
        leaves = frappe.db.count("Leave Application",
            {"docstatus": 0, "status": "Open", "leave_approver": user})
        expenses = frappe.db.count("Expense Claim",
            {"docstatus": 0, "approval_status": "Draft", "expense_approver": user})
        if leaves:
            items.append({"priority": "high", "category": "Approvals",
                          "action": f"{leaves} leave application(s) pending your approval"})
        if expenses:
            items.append({"priority": "high", "category": "Approvals",
                          "action": f"{expenses} expense claim(s) pending your approval"})

    # 3. SLA-breaching warranty claims
    sla_breach = frappe.get_all("Warranty Claim",
        filters={"status": ["in", ["Open", "Work In Progress"]],
                 "resolution_due_date": ["<", today_str]},
        fields=["name", "customer_name", "priority"],
        limit_page_length=10)
    for wc in sla_breach:
        items.append({"priority": "critical", "category": "SLA Breach",
                      "action": f"Warranty Claim {wc.name} — {wc.customer_name} ({wc.priority}) past resolution SLA"})

    # 4. Overdue work orders (manufacturing roles)
    if user_role in ("manager", "admin") or "Manufacturing" in (frappe.get_roles(user) or []):
        overdue_wo = frappe.get_all("Work Order",
            filters={"docstatus": 1, "status": ["in", ["Not Started", "In Process"]],
                     "planned_start_date": ["<", today_str]},
            fields=["name", "item_name", "production_item"],
            limit_page_length=5)
        for wo in overdue_wo:
            items.append({"priority": "medium", "category": "Overdue Work Order",
                          "action": f"{wo.name} — {wo.item_name or wo.production_item} past planned start"})

    # 5. Overdue purchase orders
    overdue_po = frappe.get_all("Purchase Order",
        filters={"docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive"]],
                 "schedule_date": ["<", today_str]},
        fields=["name", "supplier_name"],
        limit_page_length=5)
    for po in overdue_po:
        items.append({"priority": "medium", "category": "Overdue PO",
                      "action": f"{po.name} — {po.supplier_name} past expected delivery"})

    # Sort by priority
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items.sort(key=lambda x: priority_order.get(x["priority"], 9))

    return json.dumps({"date": today_str, "total_items": len(items), "items": items}, default=str)


# ── Stock Check ──────────────────────────────────────────────────

def _check_stock(inp, **kw):
    """Check stock availability across warehouses."""
    item_code = inp.get("item_code", "")
    if not item_code:
        return json.dumps({"error": "item_code is required"})

    bins = frappe.get_all("Bin",
        filters={"item_code": item_code},
        fields=["warehouse", "actual_qty", "projected_qty", "reserved_qty"],
        order_by="actual_qty desc")

    item_name = frappe.db.get_value("Item", item_code, "item_name")

    total_actual = sum(b.actual_qty for b in bins)
    total_projected = sum(b.projected_qty for b in bins)

    return json.dumps({
        "item_code": item_code,
        "item_name": item_name,
        "total_actual_qty": total_actual,
        "total_projected_qty": total_projected,
        "warehouses": [dict(b) for b in bins],
    }, default=str)


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
    "get_leave_balance": _get_leave_balance,
    "list_pending_approvals": _list_pending_approvals,
    "approve_document": _approve_document,
    "daily_action_items": _daily_action_items,
    "check_stock": _check_stock,
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
    "list_pending_approvals": ("admin", "manager"),
    "approve_document": ("admin", "manager"),
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
