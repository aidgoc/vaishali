"""Field API — @frappe.whitelist endpoints for the DSPL Field PWA."""
import frappe
from frappe import _
from datetime import date, datetime
import calendar

COMPANY = "Dynamic Servitech Private Limited"
COMPANIES = [
    "Dynamic Servitech Private Limited",
    "Dynamic Crane Engineers Private Limited",
]


def _get_employee(user=None):
    if not user:
        user = frappe.session.user
    emps = frappe.get_list("Employee",
        filters={"user_id": user, "company": ["in", COMPANIES], "status": "Active"},
        fields=["name", "employee_name", "department", "designation", "company",
                "reports_to"],
        limit_page_length=1)
    if not emps:
        frappe.throw(_("No active employee found for {0}").format(user))
    emp = emps[0]
    # Fetch vertical (custom field, may not be in get_list)
    emp.vertical = frappe.db.get_value("Employee", emp.name, "vertical") or ""
    return emp


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
                "check_out_gps", "remarks", "lead_generated", "opportunity_generated",
                "order_received", "discussion_remarks", "next_action", "next_action_date",
                "opportunity", "quotation", "sales_order", "conversion_status"],
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
                  "equipment_name", "serial_no", "job_card_no",
                  "follow_up_doctype", "follow_up_name"]:
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
    emp = _get_employee()
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.employee != emp.name:
        frappe.throw(_("You do not have access to this visit"), frappe.PermissionError)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def checkout_dcr(dcr_id, check_out_time=None, check_out_gps=None, remarks=None,
                 status="Completed", lead_generated=0, opportunity_generated=0,
                 order_received=0, discussion_remarks=None, next_action=None,
                 next_action_date=None):
    emp = _get_employee()
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.employee != emp.name:
        frappe.throw(_("You do not have access to this visit"), frappe.PermissionError)
    if doc.status == "Completed":
        frappe.throw(_("DCR already completed"))
    doc.status = status
    if check_out_time: doc.check_out_time = check_out_time
    if check_out_gps: doc.check_out_gps = check_out_gps
    if remarks: doc.remarks = remarks
    doc.lead_generated = int(lead_generated)
    doc.opportunity_generated = int(opportunity_generated)
    doc.order_received = int(order_received)
    if discussion_remarks: doc.discussion_remarks = discussion_remarks
    if next_action: doc.next_action = next_action
    if next_action_date: doc.next_action_date = next_action_date
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


# ── Customer Timeline ─────────────────────────────────────────────

@frappe.whitelist()
def get_customer_timeline(customer_id):
    """Get merged timeline of visits, opportunities, quotations, orders for a customer."""
    events = []

    dcrs = frappe.get_list("Daily Call Report",
        filters={"customer": customer_id},
        fields=["name", "date", "visit_purpose", "employee_name", "status",
                "conversion_status", "check_in_time", "check_out_time",
                "discussion_remarks", "next_action"],
        order_by="date desc", limit_page_length=50)
    for d in dcrs:
        events.append({"type": "visit", "date": str(d.date), "data": d})

    opps = frappe.get_list("Opportunity",
        filters={"party_name": customer_id},
        fields=["name", "creation", "opportunity_amount", "status", "source"],
        order_by="creation desc", limit_page_length=20)
    for o in opps:
        events.append({"type": "opportunity", "date": str(o.creation)[:10], "data": o})

    quotes = frappe.get_list("Quotation",
        filters={"party_name": customer_id, "docstatus": ["<", 2]},
        fields=["name", "transaction_date", "grand_total", "status", "quotation_temperature"],
        order_by="transaction_date desc", limit_page_length=20)
    for q in quotes:
        events.append({"type": "quotation", "date": str(q.transaction_date), "data": q})

    orders = frappe.get_list("Sales Order",
        filters={"customer": customer_id, "docstatus": 1},
        fields=["name", "transaction_date", "grand_total", "status"],
        order_by="transaction_date desc", limit_page_length=20)
    for so in orders:
        events.append({"type": "order", "date": str(so.transaction_date), "data": so})

    events.sort(key=lambda e: e["date"], reverse=True)
    return events[:50]


# ── Conversion Funnel ─────────────────────────────────────────────

@frappe.whitelist()
def get_conversion_funnel(period="month", employee=None, department=None):
    """Get conversion funnel counts for DCR visits."""
    from frappe.utils import today, get_first_day, getdate, add_months

    filters = {}
    if period == "month":
        filters["date"] = [">=", get_first_day(today())]
    elif period == "quarter":
        filters["date"] = [">=", add_months(get_first_day(today()), -2)]
    elif period == "fy":
        t = getdate(today())
        fy_start = f"{t.year}-04-01" if t.month >= 4 else f"{t.year - 1}-04-01"
        filters["date"] = [">=", fy_start]

    if employee:
        filters["employee"] = employee
    if department:
        filters["department"] = department

    total = frappe.db.count("Daily Call Report", filters)
    leads = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Lead Created", "Opportunity", "Quoted", "Won"]]})
    opportunities = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Opportunity", "Quoted", "Won"]]})
    quoted = frappe.db.count("Daily Call Report", {**filters, "conversion_status": ["in", ["Quoted", "Won"]]})
    won = frappe.db.count("Daily Call Report", {**filters, "conversion_status": "Won"})
    lost = frappe.db.count("Daily Call Report", {**filters, "conversion_status": "Lost"})

    return {
        "visits": total,
        "leads": leads,
        "opportunities": opportunities,
        "quoted": quoted,
        "won": won,
        "lost": lost,
    }


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
        limit_page_length=0)


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

    # Pending employee advances — only those whose employee reports to current user
    employee = _get_employee()
    my_reports = frappe.get_all("Employee", filters={"reports_to": employee.name}, pluck="name")
    if my_reports:
        advances = frappe.get_list("Employee Advance",
            filters={"docstatus": 0, "employee": ["in", my_reports]},
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

    # Verify current user is the designated approver
    if doctype == "Leave Application":
        if doc.leave_approver != frappe.session.user:
            frappe.throw(_("You are not the designated approver"), frappe.PermissionError)
    elif doctype == "Expense Claim":
        if doc.expense_approver != frappe.session.user:
            frappe.throw(_("You are not the designated approver"), frappe.PermissionError)
    elif doctype == "Employee Advance":
        current_emp = _get_employee()
        advance_emp = frappe.db.get_value("Employee", doc.employee, "reports_to")
        if advance_emp != current_emp.name:
            frappe.throw(_("You are not the designated approver"), frappe.PermissionError)

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
    if frappe.session.user not in ("vaishali@frappeflo.com", "Administrator"):
        frappe.throw(_("Only the service account can verify Telegram tokens"), frappe.PermissionError)
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


# ── Budget Dashboard ─────────────────────────────────────────

def _budget_month_range(posting_date=None):
    """Return (first_day, last_day) ISO strings for the month of posting_date."""
    from datetime import date as dt_date
    d = posting_date or dt_date.today()
    if isinstance(d, str):
        parts = d.split("-")
        y, m = int(parts[0]), int(parts[1])
    else:
        y, m = d.year, d.month
    last = calendar.monthrange(y, m)[1]
    return dt_date(y, m, 1).isoformat(), dt_date(y, m, last).isoformat()


def _get_emp_budget(vertical, employee, fiscal_year):
    """Find matching Expense Budget: employee-specific first, then vertical."""
    b = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "employee": employee},
        ["monthly_cap", "annual_budget", "alert_threshold", "escalate_threshold"],
        as_dict=True)
    if b:
        return b
    return frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "vertical": vertical,
         "employee": ["in", ["", None]]},
        ["monthly_cap", "annual_budget", "alert_threshold", "escalate_threshold"],
        as_dict=True)


def _employee_spend(employee_name, date_start, date_end):
    """Sum submitted, non-rejected Expense Claims for an employee in a date range."""
    return frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0)
        FROM `tabExpense Claim`
        WHERE employee = %s
          AND posting_date BETWEEN %s AND %s
          AND docstatus = 1
          AND approval_status != 'Rejected'
    """, (employee_name, date_start, date_end))[0][0]


def _employee_spend_by_type(employee_name, date_start, date_end):
    """Breakdown by expense_type for an employee in a date range."""
    return frappe.db.sql("""
        SELECT ed.expense_type as type, SUM(ed.amount) as amount
        FROM `tabExpense Claim Detail` ed
        JOIN `tabExpense Claim` ec ON ec.name = ed.parent
        WHERE ec.employee = %s
          AND ec.posting_date BETWEEN %s AND %s
          AND ec.docstatus = 1
          AND ec.approval_status != 'Rejected'
        GROUP BY ed.expense_type
        ORDER BY amount DESC
    """, (employee_name, date_start, date_end), as_dict=True)


@frappe.whitelist()
def get_budget_summary(fiscal_year=None):
    """Budget vs actual summary. Returns role-appropriate data."""
    employee = _get_employee()
    tier = _get_nav_tier()

    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year", "2025-2026")

    fy_dates = frappe.db.get_value("Fiscal Year", fiscal_year,
                                    ["year_start_date", "year_end_date"])
    if not fy_dates:
        frappe.throw(_(f"Fiscal Year {fiscal_year} not found"))
    fy_start, fy_end = str(fy_dates[0]), str(fy_dates[1])

    month_start, month_end = _budget_month_range()

    # --- My budget (all users) ---
    budget = _get_emp_budget(employee.vertical, employee.name, fiscal_year)
    cap = budget.monthly_cap if budget else 0
    annual = (budget.annual_budget or cap * 12) if budget else 0

    spent_month = _employee_spend(employee.name, month_start, month_end)
    spent_ytd = _employee_spend(employee.name, fy_start, fy_end)

    pct_month = round(spent_month / cap * 100, 1) if cap else 0
    pct_ytd = round(spent_ytd / annual * 100, 1) if annual else 0
    status = "exceeded" if pct_month >= 100 else "warning" if pct_month >= 80 else "ok"

    result = {
        "my_budget": {
            "monthly_cap": cap,
            "spent_this_month": spent_month,
            "annual_budget": annual,
            "spent_ytd": spent_ytd,
            "pct_month": pct_month,
            "pct_ytd": pct_ytd,
            "status": status,
            "by_type": _employee_spend_by_type(employee.name, month_start, month_end),
        }
    }

    # --- Manager: vertical view ---
    if tier in ("manager", "admin"):
        vertical = employee.vertical
        if vertical:
            result["vertical"] = _vertical_budget(vertical, fiscal_year,
                                                   fy_start, fy_end,
                                                   month_start, month_end)
        result["trend"] = _expense_trend(fy_start, fy_end,
                                          vertical if tier == "manager" else None)

    # --- Admin: all verticals ---
    if tier == "admin":
        result["verticals"] = []
        for v in ["EPS"]:
            vdata = _vertical_budget(v, fiscal_year, fy_start, fy_end,
                                      month_start, month_end)
            if vdata["employee_count"] > 0:
                result["verticals"].append(vdata)

        total_exp = sum(v["spent_ytd"] for v in result["verticals"])
        result["expense_to_revenue"] = {
            "total_expenses": total_exp,
            "total_revenue": 70000000,
            "ratio_pct": round(total_exp / 70000000 * 100, 1) if total_exp else 0,
        }
        result["top_spenders"] = _top_spenders(fy_start, fy_end, limit=10)

    return result


def _vertical_budget(vertical, fiscal_year, fy_start, fy_end,
                     month_start, month_end):
    """Budget vs actual for a vertical."""
    employees = frappe.get_all("Employee",
        filters={"vertical": vertical, "status": "Active"},
        fields=["name", "employee_name"],
        limit_page_length=0)
    emp_names = [e.name for e in employees]

    if not emp_names:
        return {"name": vertical, "annual_budget": 0, "spent_ytd": 0, "pct": 0,
                "employee_count": 0, "over_cap_count": 0, "employees": []}

    vbudget = frappe.db.get_value("Expense Budget",
        {"fiscal_year": fiscal_year, "vertical": vertical,
         "employee": ["in", ["", None]]},
        "annual_budget") or 0

    spent_ytd = frappe.db.sql("""
        SELECT IFNULL(SUM(total_claimed_amount), 0)
        FROM `tabExpense Claim`
        WHERE employee IN %s
          AND posting_date BETWEEN %s AND %s
          AND docstatus = 1 AND approval_status != 'Rejected'
    """, (emp_names, fy_start, fy_end))[0][0]

    # Per-employee this month
    emp_spend = frappe.db.sql("""
        SELECT employee, IFNULL(SUM(total_claimed_amount), 0) as spent
        FROM `tabExpense Claim`
        WHERE employee IN %s
          AND posting_date BETWEEN %s AND %s
          AND docstatus = 1 AND approval_status != 'Rejected'
        GROUP BY employee
    """, (emp_names, month_start, month_end), as_dict=True)
    spend_map = {e.employee: e.spent for e in emp_spend}

    over_cap = 0
    emp_list = []
    for emp in employees:
        spent = spend_map.get(emp.name, 0)
        cap = frappe.db.get_value("Expense Budget",
            {"fiscal_year": fiscal_year, "employee": emp.name},
            "monthly_cap") or 15000
        st = "exceeded" if spent > cap else "warning" if spent > cap * 0.8 else "ok"
        if spent > cap:
            over_cap += 1
        emp_list.append({"name": emp.employee_name, "employee": emp.name,
                         "spent_month": spent, "cap": cap, "status": st})
    emp_list.sort(key=lambda x: -x["spent_month"])

    return {
        "name": vertical,
        "annual_budget": vbudget,
        "spent_ytd": spent_ytd,
        "pct": round(spent_ytd / vbudget * 100, 1) if vbudget else 0,
        "employee_count": len(employees),
        "over_cap_count": over_cap,
        "employees": emp_list,
    }


def _expense_trend(fy_start, fy_end, vertical=None):
    """Monthly expense totals for the fiscal year."""
    vert_filter = "AND e.vertical = %s" if vertical else ""
    params = [fy_start, fy_end]
    if vertical:
        params.append(vertical)

    rows = frappe.db.sql(f"""
        SELECT DATE_FORMAT(ec.posting_date, '%%b %%y') as month,
               MONTH(ec.posting_date) as month_num,
               IFNULL(SUM(ec.total_claimed_amount), 0) as actual
        FROM `tabExpense Claim` ec
        JOIN `tabEmployee` e ON e.name = ec.employee
        WHERE ec.posting_date BETWEEN %s AND %s
          AND ec.docstatus = 1 AND ec.approval_status != 'Rejected'
          {vert_filter}
        GROUP BY month, month_num
        ORDER BY YEAR(ec.posting_date), month_num
    """, params, as_dict=True)
    return [{"month": r.month, "actual": r.actual} for r in rows]


def _top_spenders(fy_start, fy_end, limit=10):
    """Top N spenders across all verticals."""
    return frappe.db.sql("""
        SELECT ec.employee_name as name, e.vertical,
               SUM(ec.total_claimed_amount) as spent_ytd
        FROM `tabExpense Claim` ec
        JOIN `tabEmployee` e ON e.name = ec.employee
        WHERE ec.posting_date BETWEEN %s AND %s
          AND ec.docstatus = 1 AND ec.approval_status != 'Rejected'
        GROUP BY ec.employee, ec.employee_name, e.vertical
        ORDER BY spent_ytd DESC
        LIMIT %s
    """, (fy_start, fy_end, limit), as_dict=True)


@frappe.whitelist()
def get_budget_detail(vertical, employee=None, month=None, fiscal_year=None):
    """Drill-down budget detail. Manager+ only."""
    tier = _get_nav_tier()
    if tier == "field":
        frappe.throw(_("Only managers and admins can view budget details"))

    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year", "2025-2026")

    fy_dates = frappe.db.get_value("Fiscal Year", fiscal_year,
                                    ["year_start_date", "year_end_date"])
    if not fy_dates:
        return []
    fy_start, fy_end = str(fy_dates[0]), str(fy_dates[1])

    if employee:
        if month:
            ms, me = _budget_month_range(month + "-15")
        else:
            ms, me = fy_start, fy_end

        claims = frappe.get_list("Expense Claim",
            filters={
                "employee": employee, "docstatus": 1,
                "approval_status": ["!=", "Rejected"],
                "posting_date": ["between", [ms, me]],
            },
            fields=["name", "posting_date", "total_claimed_amount",
                     "approval_status"],
            order_by="posting_date desc",
            limit_page_length=50)
        return {"employee": employee, "claims": claims}
    else:
        month_start, month_end = _budget_month_range()
        return _vertical_budget(vertical, fiscal_year, fy_start, fy_end,
                                 month_start, month_end)


@frappe.whitelist(methods=["POST"])
def set_budget(fiscal_year, vertical, monthly_cap, employee=None,
               alert_threshold=80, escalate_threshold=100, name=None):
    """Create or update an Expense Budget record. Admin only."""
    tier = _get_nav_tier()
    if tier != "admin":
        frappe.throw(_("Only admins can set budgets"))

    monthly_cap = float(monthly_cap)
    if monthly_cap <= 0:
        frappe.throw(_("Monthly cap must be greater than 0"))
    if not frappe.db.exists("Fiscal Year", fiscal_year):
        frappe.throw(_(f"Fiscal Year {fiscal_year} does not exist"))

    # Upsert: find existing or create
    is_new = False
    if name and frappe.db.exists("Expense Budget", name):
        doc = frappe.get_doc("Expense Budget", name)
    else:
        filters = {"fiscal_year": fiscal_year, "vertical": vertical}
        if employee:
            filters["employee"] = employee
        else:
            filters["employee"] = ["in", ["", None]]
        existing = frappe.db.get_value("Expense Budget", filters, "name")
        if existing:
            doc = frappe.get_doc("Expense Budget", existing)
        else:
            is_new = True
            doc = frappe.new_doc("Expense Budget")
            doc.fiscal_year = fiscal_year
            doc.vertical = vertical
            doc.employee = employee or ""

    doc.monthly_cap = monthly_cap
    doc.alert_threshold = float(alert_threshold)
    doc.escalate_threshold = float(escalate_threshold)
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"name": doc.name, "action": "created" if is_new else "updated"}


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
        limit_page_length=200)


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
        limit_page_length=0)


@frappe.whitelist(methods=["POST"])
def create_quotation(**kwargs):
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(_("You do not have permission to create quotations"), frappe.PermissionError)

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
    quotation_to = kwargs.get("quotation_to", "Customer")
    doc.quotation_to = quotation_to
    doc.party_name = customer
    doc.company = COMPANY
    doc.transaction_date = date.today().isoformat()
    doc.order_type = "Sales"

    if kwargs.get("opportunity"):
        doc.opportunity = kwargs["opportunity"]

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
    if _get_nav_tier() == "field":
        frappe.throw(_("You do not have permission to create stock entries"), frappe.PermissionError)

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


# ── Personal Sales Performance ───────────────────────────────

@frappe.whitelist()
def get_my_sales_performance():
    """Get current user's personal sales performance — orders, quotations, visits this FY."""
    emp = _get_employee()
    user = frappe.session.user
    from datetime import date
    today = date.today()
    fy_start = f"{today.year}-04-01" if today.month >= 4 else f"{today.year - 1}-04-01"

    # My orders this FY
    orders = frappe.get_list("Sales Order",
        filters=[["docstatus", "=", 1], ["owner", "=", user],
                 ["transaction_date", ">=", fy_start], ["company", "=", COMPANY]],
        fields=["grand_total", "transaction_date"])
    order_total = sum(o.grand_total or 0 for o in orders)

    # My quotations this FY
    quotes = frappe.get_list("Quotation",
        filters=[["docstatus", "=", 1], ["owner", "=", user],
                 ["transaction_date", ">=", fy_start]],
        fields=["grand_total", "transaction_date"])
    quote_total = sum(q.grand_total or 0 for q in quotes)

    # My visits this month
    month_start = today.replace(day=1).isoformat()
    visits = frappe.db.count("Daily Call Report",
        filters={"employee": emp.name, "date": [">=", month_start]})

    # My leads this FY
    leads = frappe.db.count("Lead",
        filters={"lead_owner": user, "creation": [">=", fy_start]})

    # Personal sales target from Sales Target DocType
    fiscal_year = frappe.defaults.get_defaults().get("fiscal_year")
    personal_target = frappe.db.get_value("Sales Target", {
        "fiscal_year": fiscal_year,
        "employee": emp.name,
        "product_category": "All Products",
    }, "annual_target")
    # Fall back to company-wide target if no personal target
    if not personal_target:
        personal_target = frappe.db.get_value("Sales Target", {
            "fiscal_year": fiscal_year,
            "product_category": "All Products",
            "employee": ["in", ["", None]],
        }, "annual_target")
    annual_target = float(personal_target) if personal_target else 0
    monthly_target = round(annual_target / 12) if annual_target else 0

    return {
        "employee": emp.employee_name,
        "fy_start": fy_start,
        "orders": {"count": len(orders), "total": order_total},
        "quotations": {"count": len(quotes), "total": quote_total},
        "visits_this_month": visits,
        "leads_this_fy": leads,
        "target": {
            "annual": annual_target,
            "monthly": monthly_target,
        },
        "conversion": {
            "quote_to_order": round(len(orders) / len(quotes) * 100, 1) if len(quotes) > 0 else 0,
            "target_qo": 75
        }
    }


# ── Sales Funnel ─────────────────────────────────────────────

@frappe.whitelist()
def get_sales_funnel():
    """Get sales funnel metrics for current FY."""
    from datetime import date
    today = date.today()
    fy_start = f"{today.year}-04-01" if today.month >= 4 else f"{today.year - 1}-04-01"
    month_start = today.replace(day=1).isoformat()

    # This FY counts
    visits_fy = frappe.db.count("Daily Call Report",
        filters={"date": [">=", fy_start], "company": COMPANY})
    leads_fy = frappe.db.count("Lead",
        filters={"creation": [">=", fy_start]})
    quotes_fy = frappe.db.count("Quotation",
        filters={"docstatus": 1, "transaction_date": [">=", fy_start], "company": COMPANY})
    orders_fy = frappe.db.count("Sales Order",
        filters={"docstatus": 1, "transaction_date": [">=", fy_start], "company": COMPANY})

    # This month counts
    visits_month = frappe.db.count("Daily Call Report",
        filters={"date": [">=", month_start], "company": COMPANY})
    leads_month = frappe.db.count("Lead",
        filters={"creation": [">=", month_start]})
    quotes_month = frappe.db.count("Quotation",
        filters={"docstatus": 1, "transaction_date": [">=", month_start], "company": COMPANY})
    orders_month = frappe.db.count("Sales Order",
        filters={"docstatus": 1, "transaction_date": [">=", month_start], "company": COMPANY})

    # Revenue
    order_value = frappe.db.sql("""
        SELECT COALESCE(SUM(grand_total), 0) FROM `tabSales Order`
        WHERE docstatus=1 AND transaction_date >= %s AND company = %s
    """, (fy_start, COMPANY))[0][0]

    quote_value = frappe.db.sql("""
        SELECT COALESCE(SUM(grand_total), 0) FROM `tabQuotation`
        WHERE docstatus=1 AND transaction_date >= %s AND company = %s
    """, (fy_start, COMPANY))[0][0]

    return {
        "fy": {
            "visits": visits_fy, "leads": leads_fy,
            "quotations": quotes_fy, "orders": orders_fy,
            "order_value": float(order_value), "quote_value": float(quote_value)
        },
        "month": {
            "visits": visits_month, "leads": leads_month,
            "quotations": quotes_month, "orders": orders_month
        },
        "ratios": {
            "visit_to_lead": round(leads_fy / visits_fy * 100, 1) if visits_fy > 0 else 0,
            "lead_to_quote": round(quotes_fy / leads_fy * 100, 1) if leads_fy > 0 else 0,
            "quote_to_order": round(orders_fy / quotes_fy * 100, 1) if quotes_fy > 0 else 0,
            "target_vi": 50, "target_iq": 50, "target_qo": 75
        }
    }


def _get_fy_sales_target(fy_start):
    """Get the 'All Products' sales target for the FY containing fy_start."""
    fiscal_year = frappe.defaults.get_defaults().get("fiscal_year")
    target = frappe.db.get_value("Sales Target", {
        "fiscal_year": fiscal_year,
        "product_category": "All Products",
        "employee": ["in", ["", None]],
    }, "annual_target")
    return float(target) if target else 0


# ── Monthly Report Card ───────────────────────────────────────

@frappe.whitelist()
def get_monthly_report():
    """Generate monthly report card with key metrics."""
    from datetime import date
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    fy_start = f"{today.year}-04-01" if today.month >= 4 else f"{today.year - 1}-04-01"

    months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    month_name = months[today.month - 1] + ' ' + str(today.year)

    # This month metrics
    orders_month = frappe.get_list("Sales Order",
        filters=[["docstatus","=",1],["transaction_date",">=",month_start],["company","=",COMPANY]],
        fields=["grand_total"])
    revenue_month = sum(o.grand_total or 0 for o in orders_month)

    visits_month = frappe.db.count("Daily Call Report",
        filters={"date": [">=", month_start]})

    leads_month = frappe.db.count("Lead",
        filters={"creation": [">=", month_start]})

    quotes_month = frappe.get_list("Quotation",
        filters=[["docstatus","=",1],["transaction_date",">=",month_start],["company","=",COMPANY]],
        fields=["grand_total"])
    quote_value = sum(q.grand_total or 0 for q in quotes_month)

    # Outstanding receivables
    outstanding = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0) FROM `tabSales Invoice`
        WHERE docstatus=1 AND outstanding_amount > 0 AND company = %s
    """, COMPANY)[0][0]

    # Attendance this month
    attendance = frappe.db.count("Attendance",
        filters={"attendance_date": [">=", month_start], "status": "Present", "company": COMPANY})

    # YTD totals
    orders_ytd = frappe.get_list("Sales Order",
        filters=[["docstatus","=",1],["transaction_date",">=",fy_start],["company","=",COMPANY]],
        fields=["grand_total"])
    revenue_ytd = sum(o.grand_total or 0 for o in orders_ytd)

    return {
        "month": month_name,
        "this_month": {
            "revenue": revenue_month,
            "orders": len(orders_month),
            "visits": visits_month,
            "leads": leads_month,
            "quotations": len(quotes_month),
            "quote_value": quote_value
        },
        "ytd": {
            "revenue": revenue_ytd,
            "orders": len(orders_ytd),
            "target": _get_fy_sales_target(fy_start),
        },
        "health": {
            "outstanding": outstanding,
            "attendance_days": attendance
        }
    }


# ── Sales Targets ─────────────────────────────────────────────

# Maps ERPNext Item Group → Sales Target product_category
PRODUCT_CATEGORY_MAP = {
    "ACD": "ACD",
    "ACD with SLI System": "ACD",
    "DRM 3400": "DRM-3400",
    "DJ-1005": "DJ-1005",
    "E-DASH EOT": "E-DASH EOT",
    "EOT Crane": "E-DASH EOT",
    "E-Dash Chain Hoist": "E-Dash Chain Hoist",
    "F-Dash": "F-Dash",
    "TPS": "TPS",
    "Tilt Prevention": "TPS",
    "MRT": "MRT",
    "MRT Systems": "MRT",
    "DC-1005": "DC-1005",
    "Mobile Crane": "DC-1005",
    "Installation": "Installation",
    "Spares & Services": "Spares",
    "Spares": "Spares",
    "WWSI": "WWSI",
}


@frappe.whitelist()
def get_sales_targets(fiscal_year=None):
    """Get sales target vs actual for the current financial year from Sales Target DocType."""
    if not fiscal_year:
        fiscal_year = frappe.defaults.get_defaults().get("fiscal_year")

    fy = frappe.db.get_value("Fiscal Year", fiscal_year,
                             ["year_start_date", "year_end_date"], as_dict=True)
    if not fy:
        frappe.throw(_("Fiscal Year {0} not found").format(fiscal_year))
    fy_start = fy.year_start_date
    fy_end = fy.year_end_date

    # Get company-wide targets from Sales Target DocType
    targets = frappe.get_all("Sales Target",
        filters={"fiscal_year": fiscal_year, "employee": ["in", ["", None]]},
        fields=["product_category", "annual_target", "quarterly_target"])

    target_map = {}
    total_target = 0
    for t in targets:
        if t.product_category == "All Products":
            total_target = float(t.annual_target or 0)
        else:
            target_map[t.product_category] = float(t.annual_target or 0)

    # If no "All Products" record, sum the individual targets
    if not total_target:
        total_target = sum(target_map.values())

    # Get actuals from Sales Order items grouped by item_group
    actuals_raw = frappe.db.sql("""
        SELECT soi.item_group, SUM(soi.amount) as actual
        FROM `tabSales Order Item` soi
        JOIN `tabSales Order` so ON so.name = soi.parent
        WHERE so.docstatus = 1
          AND so.transaction_date BETWEEN %s AND %s
          AND so.company IN %s
        GROUP BY soi.item_group
    """, (fy_start, fy_end, COMPANIES), as_dict=True)

    # Map item_groups to product categories
    actual_map = {}
    for row in actuals_raw:
        cat = PRODUCT_CATEGORY_MAP.get(row.item_group)
        if cat:
            actual_map[cat] = actual_map.get(cat, 0) + float(row.actual or 0)

    # Build product list (all categories that have either a target or an actual)
    all_cats = set(list(target_map.keys()) + list(actual_map.keys()))
    products = []
    total_actual = 0
    for cat in sorted(all_cats):
        target = target_map.get(cat, 0)
        actual = actual_map.get(cat, 0)
        total_actual += actual
        pct = round(actual / target * 100, 1) if target > 0 else 0
        products.append({
            "category": cat,
            "target": target,
            "actual": actual,
            "pct": pct,
        })

    total_pct = round(total_actual / total_target * 100, 1) if total_target > 0 else 0
    monthly_target = round(total_target / 12)

    return {
        "fiscal_year": fiscal_year,
        "total_target": total_target,
        "total_actual": total_actual,
        "total_pct": total_pct,
        "monthly_target": monthly_target,
        "products": products,
    }


# ── Equipment Tracker ────────────────────────────────────────

@frappe.whitelist()
def get_devices(search=None, status=None, customer=None):
    """Equipment register — list serial numbers with equipment metadata."""
    _get_employee()  # auth check

    filters = [["company", "in", COMPANIES]]
    if status:
        filters.append(["status", "=", status])
    if customer:
        filters.append(["customer", "like", f"%{customer}%"])

    or_filters = None
    if search:
        or_filters = [
            ["serial_no", "like", f"%{search}%"],
            ["item_code", "like", f"%{search}%"],
            ["customer", "like", f"%{search}%"],
            ["krisp_asset_id", "like", f"%{search}%"],
        ]

    # Get status counts (unfiltered by search for summary)
    status_counts = frappe.db.sql("""
        SELECT status, COUNT(*) as cnt
        FROM `tabSerial No`
        WHERE company IN %s
        GROUP BY status
    """, (COMPANIES,), as_dict=True)
    by_status = {}
    total = 0
    for row in status_counts:
        by_status[row.status] = row.cnt
        total += row.cnt

    # Fetch equipment list
    equipment_raw = frappe.get_list("Serial No",
        filters=filters,
        or_filters=or_filters,
        fields=[
            "name as serial_no", "item_code", "item_name",
            "customer", "customer_name", "status",
            "warranty_expiry_date as warranty_expiry",
            "delivery_date", "creation",
            # Custom fields
            "krisp_asset_id as krisp_id",
            "customer_site", "dc_number",
            "asset_type_1", "asset_type_2", "asset_type_3",
            "next_calibration", "next_maintenance",
        ],
        order_by="creation desc",
        limit_page_length=50)

    # Enrich with item_name from Item if not on Serial No
    for eq in equipment_raw:
        if not eq.get("item_name") and eq.get("item_code"):
            eq["item_name"] = frappe.db.get_value("Item", eq["item_code"], "item_name") or eq["item_code"]
        # Use customer_name if available, fall back to customer link
        if eq.get("customer_name"):
            eq["customer"] = eq["customer_name"]
        # Convert dates to strings
        for dt_field in ["warranty_expiry", "delivery_date", "next_calibration", "next_maintenance"]:
            if eq.get(dt_field):
                eq[dt_field] = str(eq[dt_field])

    return {
        "total": total,
        "by_status": by_status,
        "equipment": equipment_raw,
    }


# ── Sales Orders ─────────────────────────────────────────────

@frappe.whitelist()
def get_sales_orders(status=None):
    """List sales orders. Managers see all, field staff see own."""
    tier = _get_nav_tier()
    filters = [["company", "=", COMPANY], ["docstatus", "<", 2]]
    if tier == "field":
        filters.append(["owner", "=", frappe.session.user])
    if status and status != "All":
        if status == "Draft":
            filters.append(["docstatus", "=", 0])
        else:
            filters.append(["status", "=", status])
    return frappe.get_list("Sales Order",
        filters=filters,
        fields=["name", "customer", "customer_name", "grand_total", "status",
                "transaction_date", "delivery_date", "per_delivered", "per_billed",
                "docstatus"],
        order_by="transaction_date desc",
        limit_page_length=100)


@frappe.whitelist()
def get_submitted_quotations():
    """List submitted quotations that can be converted to Sales Orders."""
    tier = _get_nav_tier()
    filters = [["docstatus", "=", 1], ["status", "not in", ["Ordered", "Lost", "Cancelled"]],
               ["company", "=", COMPANY]]
    if tier == "field":
        filters.append(["owner", "=", frappe.session.user])
    return frappe.get_list("Quotation",
        filters=filters,
        fields=["name", "party_name", "grand_total", "status", "transaction_date", "valid_till"],
        order_by="transaction_date desc",
        limit_page_length=50)


@frappe.whitelist(methods=["POST"])
def create_sales_order_from_quotation(quotation, delivery_date=None):
    """Convert a submitted Quotation to a draft Sales Order using ERPNext make_sales_order."""
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(_("You do not have permission to create sales orders"), frappe.PermissionError)

    from erpnext.selling.doctype.quotation.quotation import make_sales_order
    so = make_sales_order(quotation)
    if delivery_date:
        so.delivery_date = delivery_date
    elif not so.delivery_date:
        from frappe.utils import add_days, today
        so.delivery_date = add_days(today(), 30)
    so.insert(ignore_permissions=True)
    frappe.db.commit()
    return so.as_dict()


# ── Delivery Notes ───────────────────────────────────────────

@frappe.whitelist()
def get_delivery_notes(status=None):
    """List delivery notes. Stock managers/managers see all, field sees own."""
    tier = _get_nav_tier()
    filters = [["company", "=", COMPANY], ["docstatus", "<", 2]]
    if tier == "field":
        filters.append(["owner", "=", frappe.session.user])
    if status and status != "All":
        if status == "Draft":
            filters.append(["docstatus", "=", 0])
        else:
            filters.append(["status", "=", status])
    return frappe.get_list("Delivery Note",
        filters=filters,
        fields=["name", "customer", "customer_name", "grand_total", "status",
                "posting_date", "docstatus"],
        order_by="posting_date desc",
        limit_page_length=100)


@frappe.whitelist()
def get_pending_delivery_orders():
    """List submitted SOs that have items pending delivery."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Stock Manager" not in roles:
        frappe.throw(_("You do not have permission to create delivery notes"), frappe.PermissionError)
    return frappe.get_list("Sales Order",
        filters=[["docstatus", "=", 1], ["per_delivered", "<", 100],
                 ["status", "not in", ["Closed", "Cancelled"]], ["company", "=", COMPANY]],
        fields=["name", "customer", "customer_name", "grand_total", "transaction_date",
                "delivery_date", "per_delivered", "status"],
        order_by="delivery_date asc",
        limit_page_length=50)


@frappe.whitelist(methods=["POST"])
def create_delivery_note_from_so(sales_order):
    """Convert a submitted Sales Order to a draft Delivery Note."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Stock Manager" not in roles:
        frappe.throw(_("You do not have permission to create delivery notes"), frappe.PermissionError)

    from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note
    dn = make_delivery_note(sales_order)
    dn.insert(ignore_permissions=True)
    frappe.db.commit()
    return dn.as_dict()


# ── Sales Invoices ───────────────────────────────────────────

@frappe.whitelist()
def get_sales_invoices(status=None):
    """List sales invoices."""
    tier = _get_nav_tier()
    filters = [["company", "=", COMPANY], ["docstatus", "<", 2]]
    if tier == "field":
        filters.append(["owner", "=", frappe.session.user])
    if status and status != "All":
        if status == "Draft":
            filters.append(["docstatus", "=", 0])
        elif status == "Unpaid":
            filters.append(["outstanding_amount", ">", 0])
            filters.append(["docstatus", "=", 1])
        else:
            filters.append(["status", "=", status])
    return frappe.get_list("Sales Invoice",
        filters=filters,
        fields=["name", "customer", "customer_name", "grand_total", "outstanding_amount",
                "status", "posting_date", "due_date", "docstatus"],
        order_by="posting_date desc",
        limit_page_length=100)


@frappe.whitelist()
def get_billable_documents():
    """List submitted DNs and SOs that can be invoiced."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Accounts Manager" not in roles:
        frappe.throw(_("You do not have permission to create invoices"), frappe.PermissionError)

    # Delivery Notes not fully billed
    dns = frappe.get_list("Delivery Note",
        filters=[["docstatus", "=", 1], ["per_billed", "<", 100],
                 ["status", "not in", ["Closed", "Cancelled"]], ["company", "=", COMPANY]],
        fields=["name", "customer", "customer_name", "grand_total", "posting_date",
                "per_billed", "status"],
        order_by="posting_date desc",
        limit_page_length=50)
    for d in dns:
        d["source_type"] = "Delivery Note"

    # Sales Orders not fully billed (direct invoice without DN)
    sos = frappe.get_list("Sales Order",
        filters=[["docstatus", "=", 1], ["per_billed", "<", 100],
                 ["status", "not in", ["Closed", "Cancelled"]], ["company", "=", COMPANY]],
        fields=["name", "customer", "customer_name", "grand_total", "transaction_date",
                "per_billed", "status"],
        order_by="transaction_date desc",
        limit_page_length=50)
    for s in sos:
        s["source_type"] = "Sales Order"

    return {"delivery_notes": dns, "sales_orders": sos}


@frappe.whitelist(methods=["POST"])
def create_sales_invoice(source_type, source_name):
    """Create a draft Sales Invoice from DN or SO."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Accounts Manager" not in roles:
        frappe.throw(_("You do not have permission to create invoices"), frappe.PermissionError)

    if source_type == "Delivery Note":
        from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice
        si = make_sales_invoice(source_name)
    elif source_type == "Sales Order":
        from erpnext.selling.doctype.sales_order.sales_order import make_sales_invoice
        si = make_sales_invoice(source_name)
    else:
        frappe.throw(_("Invalid source type"))

    si.insert(ignore_permissions=True)
    frappe.db.commit()
    return si.as_dict()


# ── Payment Entry ────────────────────────────────────────────

@frappe.whitelist()
def get_unpaid_invoices():
    """List submitted sales invoices with outstanding amount."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Accounts Manager" not in roles:
        frappe.throw(_("You do not have permission to record payments"), frappe.PermissionError)
    return frappe.get_list("Sales Invoice",
        filters=[["docstatus", "=", 1], ["outstanding_amount", ">", 0],
                 ["company", "=", COMPANY]],
        fields=["name", "customer", "customer_name", "grand_total", "outstanding_amount",
                "posting_date", "due_date"],
        order_by="due_date asc",
        limit_page_length=50)


@frappe.whitelist(methods=["POST"])
def create_payment_entry(sales_invoice, amount=None, mode_of_payment=None, reference_no=None,
                         reference_date=None):
    """Create and submit a Payment Entry against a Sales Invoice."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Accounts Manager" not in roles:
        frappe.throw(_("You do not have permission to record payments"), frappe.PermissionError)

    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    pe = get_payment_entry("Sales Invoice", sales_invoice)
    if amount:
        pe.paid_amount = float(amount)
        pe.received_amount = float(amount)
    if mode_of_payment:
        pe.mode_of_payment = mode_of_payment
    if reference_no:
        pe.reference_no = reference_no
    if reference_date:
        pe.reference_date = reference_date
    pe.insert(ignore_permissions=True)
    pe.submit()
    frappe.db.commit()
    return pe.as_dict()


# ── Customer Open Items (for DCR follow-up linking) ──────────

@frappe.whitelist()
def get_customer_open_items(customer):
    """Get open leads, quotations, and opportunities for a customer."""
    _get_employee()  # auth check

    leads = frappe.get_list("Lead",
        filters=[["company_name", "like", f"%{customer}%"],
                 ["status", "not in", ["Converted", "Do Not Contact"]]],
        fields=["name", "lead_name", "company_name", "status", "source", "creation"],
        order_by="creation desc",
        limit_page_length=20)

    # Also check leads linked by lead_owner
    leads_by_owner = frappe.get_list("Lead",
        filters=[["lead_owner", "=", frappe.session.user],
                 ["status", "not in", ["Converted", "Do Not Contact"]]],
        fields=["name", "lead_name", "company_name", "status", "source", "creation"],
        order_by="creation desc",
        limit_page_length=20)
    # Merge unique
    seen = {l.name for l in leads}
    for l in leads_by_owner:
        if l.name not in seen:
            leads.append(l)
            seen.add(l.name)

    quotations = frappe.get_list("Quotation",
        filters=[["party_name", "=", customer], ["docstatus", "=", 1],
                 ["status", "not in", ["Ordered", "Lost", "Cancelled"]]],
        fields=["name", "party_name", "grand_total", "status", "transaction_date", "valid_till"],
        order_by="transaction_date desc",
        limit_page_length=20)

    opportunities = frappe.get_list("Opportunity",
        filters=[["party_name", "=", customer], ["status", "=", "Open"]],
        fields=["name", "party_name", "opportunity_amount", "status", "source", "creation"],
        order_by="creation desc",
        limit_page_length=20)

    return {"leads": leads, "quotations": quotations, "opportunities": opportunities}


# ── Opportunities ─────────────────────────────────────────────

@frappe.whitelist()
def get_opportunities(status=None):
    """List opportunities. Managers see all, field staff see own."""
    tier = _get_nav_tier()
    filters = [["company", "=", COMPANY]]
    if tier == "field":
        filters.append(["owner", "=", frappe.session.user])
    if status and status != "All":
        filters.append(["status", "=", status])
    return frappe.get_list("Opportunity",
        filters=filters,
        fields=["name", "party_name", "opportunity_amount", "status", "source",
                "opportunity_type", "creation", "modified"],
        order_by="creation desc",
        limit_page_length=100)


@frappe.whitelist()
def get_opportunity(name):
    """Get a single opportunity."""
    _get_employee()  # auth check
    doc = frappe.get_doc("Opportunity", name)
    result = doc.as_dict()
    # Include linked items
    result["items"] = [{"item_code": i.item_code, "item_name": i.item_name or "",
                         "qty": i.qty, "rate": i.rate, "amount": i.amount}
                        for i in (doc.items or [])]
    return result


@frappe.whitelist(methods=["POST"])
def create_opportunity_from_lead(lead_name):
    """Convert a Lead to an Opportunity using ERPNext make_opportunity."""
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(_("You do not have permission to create opportunities"), frappe.PermissionError)

    from erpnext.crm.doctype.lead.lead import make_opportunity
    opp = make_opportunity(lead_name)
    opp.company = COMPANY
    opp.insert(ignore_permissions=True)
    frappe.db.commit()
    return opp.as_dict()
