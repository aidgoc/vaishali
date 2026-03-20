"""Field API — @frappe.whitelist endpoints for the DSPL Field PWA."""
import frappe
from frappe import _
from datetime import date, datetime
import calendar

COMPANY = "Dynamic Servitech Private Limited"


def _get_employee(user=None):
    if not user:
        user = frappe.session.user
    emps = frappe.get_list("Employee",
        filters={"user_id": user, "company": COMPANY, "status": "Active"},
        fields=["name", "employee_name", "department", "designation"],
        limit_page_length=1)
    if not emps:
        frappe.throw(_("No active DSPL employee found for {0}").format(user))
    return emps[0]


def _get_nav_tier(user=None):
    if not user:
        user = frappe.session.user
    roles = set(frappe.get_roles(user))
    if roles & {"System Manager", "Administrator"}:
        return "admin"
    if roles & {"HR Manager", "Sales Manager", "Expense Approver", "Leave Approver",
                "Purchase Manager", "Stock Manager"}:
        return "manager"
    return "field"


# ── Attendance ────────────────────────────────────────────────────

@frappe.whitelist()
def attendance_today():
    emp = _get_employee()
    today = date.today().isoformat()
    checkins = frappe.get_list("Employee Checkin",
        filters={"employee": emp.name, "time": [">=", f"{today} 00:00:00"]},
        fields=["name", "log_type", "time", "latitude", "longitude"],
        order_by="time asc", limit_page_length=50)

    result = {"employee": emp.employee_name, "checked_in": False,
              "check_in_time": None, "check_out_time": None,
              "checkin_time": None, "checkout_time": None, "checkins": checkins}
    for c in checkins:
        if c.log_type == "IN" and not result["check_in_time"]:
            result["checked_in"] = True
            result["check_in_time"] = str(c.time)
            result["checkin_time"] = str(c.time)
        if c.log_type == "OUT":
            result["check_out_time"] = str(c.time)
            result["checkout_time"] = str(c.time)
    return result


@frappe.whitelist(methods=["POST"])
def create_checkin(log_type, latitude=None, longitude=None, time=None):
    emp = _get_employee()
    if log_type == "Checkin": log_type = "IN"
    if log_type == "Checkout": log_type = "OUT"

    doc = frappe.new_doc("Employee Checkin")
    doc.employee = emp.name
    doc.log_type = log_type
    doc.time = time or datetime.now()
    if latitude: doc.latitude = float(latitude)
    if longitude: doc.longitude = float(longitude)
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── DCR (Visits) ─────────────────────────────────────────────────

@frappe.whitelist()
def get_dcrs(date_filter=None, start_date=None, end_date=None, department=None):
    emp = _get_employee()
    filters = [["employee", "=", emp.name]]
    if start_date and end_date:
        filters.extend([["date", ">=", start_date], ["date", "<=", end_date]])
    elif date_filter:
        filters.append(["date", "=", date_filter])
    if department:
        filters.append(["department", "=", department])

    return frappe.get_list("Daily Call Report",
        filters=filters,
        fields=["name", "employee", "employee_name", "date", "department", "status",
                "visit_purpose", "service_purpose", "customer", "customer_name",
                "prospect_name", "check_in_time", "check_in_gps", "check_out_time",
                "check_out_gps", "remarks"],
        order_by="date desc, check_in_time desc",
        limit_page_length=100)


@frappe.whitelist(methods=["POST"])
def create_dcr(**kwargs):
    emp = _get_employee()
    doc = frappe.new_doc("Daily Call Report")
    doc.employee = emp.name
    doc.employee_name = emp.employee_name
    for field in ["date", "department", "visit_purpose", "service_purpose",
                  "customer", "prospect_name", "prospect_company", "prospect_phone",
                  "prospect_address", "check_in_time", "check_in_gps", "status",
                  "equipment_name", "serial_no", "job_card_no"]:
        if field in kwargs and kwargs[field]:
            doc.set(field, kwargs[field])
    if not doc.department:
        doc.department = emp.department
    if not doc.status:
        doc.status = "Ongoing"
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist()
def get_dcr(dcr_id):
    return frappe.get_doc("Daily Call Report", dcr_id).as_dict()


@frappe.whitelist(methods=["POST"])
def checkout_dcr(dcr_id, check_out_time=None, check_out_gps=None, remarks=None, status="Completed"):
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.status == "Completed":
        frappe.throw(_("DCR already completed"))
    doc.status = status
    if check_out_time: doc.check_out_time = check_out_time
    if check_out_gps: doc.check_out_gps = check_out_gps
    if remarks: doc.remarks = remarks
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()


# ── Profile ───────────────────────────────────────────────────────

@frappe.whitelist()
def get_me():
    emp = _get_employee()
    doc = frappe.get_doc("Employee", emp.name)
    return {
        "name": doc.name, "employee_name": doc.employee_name,
        "department": doc.department, "designation": doc.designation,
        "company": doc.company, "image": doc.image,
        "date_of_joining": str(doc.date_of_joining) if doc.date_of_joining else None,
        "status": doc.status,
    }


@frappe.whitelist()
def get_nav_tier():
    return _get_nav_tier()


# ── Customers ─────────────────────────────────────────────────────

@frappe.whitelist()
def get_customers(search=None):
    filters = [["disabled", "=", 0]]
    if search:
        filters.append(["customer_name", "like", f"%{search}%"])
    return frappe.get_list("Customer",
        filters=filters,
        fields=["name", "customer_name", "territory"],
        order_by="customer_name asc",
        limit_page_length=200)


# ── Stats ─────────────────────────────────────────────────────────

@frappe.whitelist()
def get_stats(month=None):
    emp = _get_employee()
    if not month:
        month = date.today().strftime("%Y-%m")
    y, m = int(month.split("-")[0]), int(month.split("-")[1])
    start = f"{month}-01"
    last_day = calendar.monthrange(y, m)[1]
    end = f"{month}-{last_day:02d}"

    visit_count = frappe.db.count("Daily Call Report",
        filters={"employee": emp.name, "date": ["between", [start, end]]})

    checkins = frappe.get_list("Employee Checkin",
        filters={"employee": emp.name, "time": ["between", [f"{start} 00:00:00", f"{end} 23:59:59"]]},
        fields=["time", "log_type"], order_by="time asc", limit_page_length=0)

    days_present = set()
    total_hours = 0
    day_in = {}
    for c in checkins:
        d = str(c.time)[:10]
        if c.log_type == "IN" and d not in day_in:
            day_in[d] = c.time
            days_present.add(d)
        elif c.log_type == "OUT" and d in day_in:
            diff = (c.time - day_in[d]).total_seconds() / 3600
            total_hours += diff
            del day_in[d]

    from datetime import timedelta
    working_days = 0
    current = date(y, m, 1)
    while current.month == m:
        if current.weekday() < 5:
            working_days += 1
        current += timedelta(days=1)

    return {
        "visit_count": visit_count,
        "total_hours": round(total_hours, 1),
        "attendance_days": len(days_present),
        "working_days": working_days,
    }


# ── Team (Manager) ───────────────────────────────────────────────

@frappe.whitelist()
def get_team():
    """Team overview for managers — today's attendance status of all DSPL employees."""
    today = date.today().isoformat()
    employees = frappe.get_list("Employee",
        filters={"company": COMPANY, "status": "Active"},
        fields=["name", "employee_name", "department", "designation"],
        order_by="employee_name asc", limit_page_length=0)

    # Get today's checkins for all employees
    checkins = frappe.get_list("Employee Checkin",
        filters={"time": [">=", f"{today} 00:00:00"]},
        fields=["employee", "log_type", "time"],
        order_by="time asc", limit_page_length=0)

    # Build per-employee status
    emp_status = {}
    for c in checkins:
        if c.employee not in emp_status:
            emp_status[c.employee] = {"checked_in": False, "checked_out": False}
        if c.log_type == "IN":
            emp_status[c.employee]["checked_in"] = True
            emp_status[c.employee]["in_time"] = str(c.time)
        if c.log_type == "OUT":
            emp_status[c.employee]["checked_out"] = True

    # Get today's active DCRs (visits)
    active_dcrs = frappe.get_list("Daily Call Report",
        filters={"date": today, "status": "Ongoing"},
        fields=["employee"], limit_page_length=0)
    in_field = {d.employee for d in active_dcrs}

    members = []
    present_count = 0
    for emp in employees:
        st = emp_status.get(emp.name, {})
        status = "Absent"
        if emp.name in in_field:
            status = "In Field"
        elif st.get("checked_in") and not st.get("checked_out"):
            status = "Present"
            present_count += 1
        elif st.get("checked_in"):
            status = "Present"
            present_count += 1
        members.append({
            "name": emp.name, "employee_name": emp.employee_name,
            "department": emp.department, "designation": emp.designation,
            "status": status
        })

    return {
        "present_count": present_count,
        "total_count": len(employees),
        "members": members,
        "data": members,
    }


# ── Approvals (Manager) ─────────────────────────────────────────

@frappe.whitelist()
def get_approvals():
    """Pending approvals for the current user (leave, expense, advance)."""
    user = frappe.session.user
    results = []

    # Pending leave applications
    leaves = frappe.get_list("Leave Application",
        filters={"status": "Open", "leave_approver": user},
        fields=["name", "employee", "employee_name", "leave_type",
                "from_date", "to_date", "total_leave_days", "status"],
        order_by="creation desc", limit_page_length=20)
    for l in leaves:
        l["doctype"] = "Leave Application"
        l["type"] = "Leave Application"
        results.append(l)

    # Pending expense claims
    expenses = frappe.get_list("Expense Claim",
        filters={"approval_status": "Draft", "expense_approver": user},
        fields=["name", "employee", "employee_name", "total_claimed_amount",
                "approval_status"],
        order_by="creation desc", limit_page_length=20)
    for e in expenses:
        e["doctype"] = "Expense Claim"
        e["type"] = "Expense Claim"
        results.append(e)

    # Pending employee advances
    advances = frappe.get_list("Employee Advance",
        filters={"docstatus": 0},
        fields=["name", "employee", "employee_name", "advance_amount", "status"],
        order_by="creation desc", limit_page_length=20)
    for a in advances:
        a["doctype"] = "Employee Advance"
        a["type"] = "Employee Advance"
        results.append(a)

    return results


# ── Holidays ─────────────────────────────────────────────────────

@frappe.whitelist()
def get_upcoming_holidays(limit=5):
    """Get upcoming holidays from the active Holiday List."""
    today = date.today().isoformat()
    # Find the active holiday list covering today
    lists = frappe.get_list("Holiday List",
        filters=[["from_date", "<=", today], ["to_date", ">=", today]],
        fields=["name"], limit_page_length=1)
    if not lists:
        return []
    doc = frappe.get_doc("Holiday List", lists[0].name)
    holidays = [{"holiday_date": str(h.holiday_date), "description": h.description}
                for h in doc.holidays if str(h.holiday_date) >= today]
    holidays.sort(key=lambda x: x["holiday_date"])
    return holidays[:int(limit)]


# ── Approval Actions (Manager) ────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def process_approval(doctype, name, action):
    """Approve or reject a Leave Application, Expense Claim, or Employee Advance."""
    allowed_doctypes = {"Leave Application", "Expense Claim", "Employee Advance"}
    if doctype not in allowed_doctypes:
        frappe.throw(_(f"Cannot process approval for {doctype}"))

    tier = _get_nav_tier()
    if tier == "field":
        frappe.throw(_("Only managers and admins can process approvals"))

    doc = frappe.get_doc(doctype, name)

    if action == "approve":
        if doctype == "Leave Application":
            doc.status = "Approved"
            doc.save(ignore_permissions=True)
            doc.submit()
        elif doctype == "Expense Claim":
            doc.approval_status = "Approved"
            doc.save(ignore_permissions=True)
            doc.submit()
        elif doctype == "Employee Advance":
            doc.save(ignore_permissions=True)
            doc.submit()
    elif action == "reject":
        if doctype == "Leave Application":
            doc.status = "Rejected"
            doc.save(ignore_permissions=True)
            doc.submit()
        elif doctype == "Expense Claim":
            doc.approval_status = "Rejected"
            doc.save(ignore_permissions=True)
        elif doctype == "Employee Advance":
            doc.add_comment("Comment", "Rejected via DSPL ERP")
    else:
        frappe.throw(_(f"Invalid action: {action}"))

    frappe.db.commit()
    return {"success": True, "action": action, "doctype": doctype, "name": name}


# ── Session Info ──────────────────────────────────────────────────

@frappe.whitelist()
def get_session_info():
    """Called after login to populate PWA session."""
    if frappe.session.user == "Guest":
        frappe.throw("Not logged in", frappe.AuthenticationError)
    emp = _get_employee()
    return {
        "employee": {
            "name": emp.name,
            "employee_name": emp.employee_name,
            "department": emp.department,
            "designation": emp.get("designation", ""),
        },
        "nav_tier": _get_nav_tier(),
        "user": frappe.session.user,
    }


# ── Leads ─────────────────────────────────────────────────────────

@frappe.whitelist(methods=["POST"])
def create_lead(**kwargs):
    """Create a Lead doctype from the field PWA."""
    doc = frappe.new_doc("Lead")
    doc.lead_owner = frappe.session.user
    for field in ["lead_name", "company_name", "mobile_no", "email_id",
                  "source", "territory", "notes"]:
        if field in kwargs and kwargs[field]:
            doc.set(field, kwargs[field])
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist()
def get_leads(search=None, limit=50):
    """List recent leads owned by the current user."""
    filters = [["lead_owner", "=", frappe.session.user]]
    if search:
        filters.append(["lead_name", "like", f"%{search}%"])
    return frappe.get_list("Lead",
        filters=filters,
        fields=["name", "lead_name", "company_name", "mobile_no", "email_id",
                "source", "territory", "status", "creation"],
        order_by="creation desc",
        limit_page_length=int(limit))


# ── Doc Event: Auto-create Lead on DCR checkout ──────────────────

def on_dcr_update(doc, method):
    if doc.status != "Completed" or not doc.prospect_name or doc.customer:
        return
    if frappe.db.exists("Lead", {"lead_name": doc.prospect_name}):
        return
    try:
        lead = frappe.new_doc("Lead")
        lead.lead_name = doc.prospect_name
        lead.company_name = doc.get("prospect_company") or ""
        lead.mobile_no = doc.get("prospect_phone") or ""
        lead.source = "Campaign"
        lead.notes = f"Auto-created from visit {doc.name} on {doc.date}"
        lead.insert(ignore_permissions=True)
        frappe.db.commit()
    except Exception:
        pass


# ── Telegram Linking ─────────────────────────────────────────────

@frappe.whitelist()
def generate_telegram_token():
    """Generate a one-time token for Telegram linking."""
    import uuid
    user = frappe.session.user
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    if not employee:
        frappe.throw("No employee record found for your account")

    token = str(uuid.uuid4())
    cache_key = f"telegram_link_{token}"
    frappe.cache().set_value(cache_key, employee, expires_in_sec=300)

    return {
        "token": token,
        "bot_url": f"https://t.me/DGOCerp_bot?start={token}",
    }


@frappe.whitelist()
def verify_telegram_token(token):
    """Verify a Telegram linking token. Called by FastAPI via service API key."""
    cache_key = f"telegram_link_{token}"
    employee_id = frappe.cache().get_value(cache_key)
    if employee_id:
        frappe.cache().delete_value(cache_key)
    return {"employee_id": employee_id}


# ── Leave Balance ────────────────────────────────────────────

@frappe.whitelist()
def get_leave_balance():
    """Get current user's leave balance summary."""
    emp = _get_employee()
    from frappe.utils import today
    balances = frappe.get_list("Leave Allocation",
        filters={"employee": emp.name, "docstatus": 1, "to_date": [">=", today()]},
        fields=["leave_type", "total_leaves_allocated", "total_leaves_encashed", "new_leaves_allocated"],
        order_by="leave_type asc")
    # Get used leaves
    result = []
    for bal in balances:
        used = frappe.db.sql("""
            SELECT SUM(total_leave_days) FROM `tabLeave Application`
            WHERE employee=%s AND leave_type=%s AND status='Approved' AND docstatus=1
        """, (emp.name, bal.leave_type))[0][0] or 0
        remaining = bal.total_leaves_allocated - used
        result.append({"leave_type": bal.leave_type, "remaining": remaining})
    return result


# ── Pending Expenses ─────────────────────────────────────────

@frappe.whitelist()
def get_pending_expenses():
    """Get count and total of pending expense claims."""
    emp = _get_employee()
    claims = frappe.get_list("Expense Claim",
        filters={"employee": emp.name, "status": ["in", ["Unpaid", "Draft"]], "docstatus": ["<", 2]},
        fields=["grand_total"])
    total = sum(c.grand_total or 0 for c in claims)
    return {"count": len(claims), "total": total}


# ── Items (for quotation picker) ─────────────────────────────

@frappe.whitelist()
def get_items(search=None):
    filters = [["disabled", "=", 0]]
    if search:
        filters.append(["item_name", "like", f"%{search}%"])
    return frappe.get_list("Item",
        filters=filters,
        fields=["name", "item_name", "item_group", "stock_uom",
                "standard_rate", "image"],
        order_by="item_name asc",
        limit_page_length=50)


# ── Quotations ───────────────────────────────────────────────

@frappe.whitelist()
def get_my_quotations(status=None):
    emp = _get_employee()
    user = frappe.session.user
    filters = [["owner", "=", user]]
    if status:
        filters.append(["status", "=", status])
    return frappe.get_list("Quotation",
        filters=filters,
        fields=["name", "party_name", "grand_total", "status",
                "transaction_date", "valid_till"],
        order_by="transaction_date desc",
        limit_page_length=50)


@frappe.whitelist(methods=["POST"])
def create_quotation(**kwargs):
    items = kwargs.get("items", [])
    if not items:
        frappe.throw(_("At least one item is required"))

    customer = kwargs.get("customer")
    if not customer:
        frappe.throw(_("Customer is required"))

    if isinstance(items, str):
        import json
        items = json.loads(items)

    doc = frappe.new_doc("Quotation")
    doc.quotation_to = "Customer"
    doc.party_name = customer
    doc.company = COMPANY
    doc.transaction_date = date.today().isoformat()
    doc.order_type = "Sales"

    for item in items:
        doc.append("items", {
            "item_code": item.get("item_code"),
            "qty": float(item.get("qty", 1)),
            "rate": float(item.get("rate", 0)),
        })

    if kwargs.get("remarks"):
        doc.terms = kwargs["remarks"]

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()


# ── Warehouses ───────────────────────────────────────────────

@frappe.whitelist()
def get_warehouses():
    return frappe.get_list("Warehouse",
        filters=[["company", "=", COMPANY], ["is_group", "=", 0], ["disabled", "=", 0]],
        fields=["name", "warehouse_name"],
        order_by="warehouse_name asc",
        limit_page_length=100)


# ── Stock ────────────────────────────────────────────────────

@frappe.whitelist()
def get_stock_items(search=None, warehouse=None):
    filters = []
    if warehouse:
        filters.append(["warehouse", "=", warehouse])
    if search:
        filters.append(["item_code", "like", f"%{search}%"])
    filters.append(["actual_qty", ">", 0])
    return frappe.get_list("Bin",
        filters=filters,
        fields=["item_code", "warehouse", "actual_qty", "projected_qty",
                "reserved_qty", "ordered_qty"],
        order_by="item_code asc",
        limit_page_length=100)


@frappe.whitelist(methods=["POST"])
def create_stock_entry(**kwargs):
    items = kwargs.get("items", [])
    if not items:
        frappe.throw(_("At least one item is required"))

    if isinstance(items, str):
        import json
        items = json.loads(items)

    doc = frappe.new_doc("Stock Entry")
    doc.stock_entry_type = "Material Receipt"
    doc.company = COMPANY

    for item in items:
        doc.append("items", {
            "item_code": item.get("item_code"),
            "qty": float(item.get("qty", 1)),
            "t_warehouse": item.get("warehouse"),
        })

    if kwargs.get("remarks"):
        doc.remarks = kwargs["remarks"]

    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


# ── Sales Targets ─────────────────────────────────────────────

@frappe.whitelist()
def get_sales_targets():
    """Get sales target vs actual for the current financial year."""
    from datetime import date
    today = date.today()
    if today.month >= 4:
        fy_start = f"{today.year}-04-01"
        fy_end = f"{today.year + 1}-03-31"
    else:
        fy_start = f"{today.year - 1}-04-01"
        fy_end = f"{today.year}-03-31"

    # Hardcoded targets from ABP (until we have a Target DocType)
    targets = [
        {"product": "ACD with SLI", "target_qty": 50, "target_amount": 11250000, "rate": 225000},
        {"product": "DRM 3400", "target_qty": 60, "target_amount": 21000000, "rate": 350000},
        {"product": "DJ-1005", "target_qty": 20, "target_amount": 2000000, "rate": 100000},
        {"product": "E-DASH EOT", "target_qty": 100, "target_amount": 6000000, "rate": 60000},
        {"product": "E-Dash Chain Hoist", "target_qty": 100, "target_amount": 2800000, "rate": 28000},
        {"product": "WWSI", "target_qty": 100, "target_amount": 1700000, "rate": 17000},
        {"product": "F-Dash", "target_qty": 40, "target_amount": 1600000, "rate": 40000},
        {"product": "MRT Systems", "target_qty": 2, "target_amount": 5000000, "rate": 2500000},
        {"product": "MRT Service", "target_qty": 100, "target_amount": 800000, "rate": 8000},
        {"product": "TPS", "target_qty": 50, "target_amount": 1250000, "rate": 25000},
        {"product": "Installation", "target_qty": 310, "target_amount": 3600000, "rate": 10000},
        {"product": "Spares & Services", "target_qty": 50, "target_amount": 2500000, "rate": 50000},
    ]

    # Get actual sales orders this FY
    orders = frappe.get_list("Sales Order",
        filters=[["docstatus", "=", 1], ["transaction_date", ">=", fy_start], ["transaction_date", "<=", fy_end],
                 ["company", "=", COMPANY]],
        fields=["grand_total"],
        limit_page_length=0)
    total_actual = sum(o.grand_total or 0 for o in orders)

    # Get quotation count this FY
    quotes = frappe.db.count("Quotation", filters={
        "docstatus": 1, "transaction_date": [">=", fy_start], "company": COMPANY
    })

    total_target = sum(t["target_amount"] for t in targets)

    return {
        "fy": f"{fy_start[:4]}-{fy_end[2:4]}",
        "total_target": total_target,
        "total_actual": total_actual,
        "total_quotes": quotes,
        "products": targets
    }
