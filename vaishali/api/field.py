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
    doc = frappe.new_doc("Daily Call Report")
    for field in ["employee", "date", "department", "visit_purpose", "service_purpose",
                  "customer", "prospect_name", "prospect_company", "prospect_phone",
                  "prospect_address", "check_in_time", "check_in_gps", "status",
                  "equipment_name", "serial_no", "job_card_no"]:
        if field in kwargs and kwargs[field]:
            # Map date_val to date if needed
            key = "date" if field == "date_val" else field
            doc.set(key, kwargs[field])
    if "date_val" in kwargs:
        doc.date = kwargs["date_val"]
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
