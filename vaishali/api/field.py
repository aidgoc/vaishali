"""Field API — @frappe.whitelist endpoints for the Field PWA."""
import frappe
from frappe import _
from datetime import date, datetime, timezone, timedelta
import calendar

COMPANY = "Dynamic Servitech Private Limited"

_IST = timezone(timedelta(hours=5, minutes=30))

def _to_ist(dt):
    """Format a naive-IST datetime as an IST-suffixed ISO string for clients.

    Post-2026-05-06 migration, every datetime field in this app (Employee
    Checkin.time included) is stored as naive IST. This helper just decorates
    the ISO output with `+05:30` so the browser parses it unambiguously — it
    no longer shifts. Pre-migration callers that relied on the old UTC→IST
    shift have been updated in lockstep.
    """
    if not dt:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.strptime(dt, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return dt
    if hasattr(dt, 'strftime'):
        return dt.strftime("%Y-%m-%dT%H:%M:%S+05:30")
    return str(dt)


def _normalise_dt_to_ist(val):
    """Coerce a client-supplied datetime into a naive-IST MySQL string.

    The PWA now sends naive IST ("YYYY-MM-DD HH:MM:SS"). Older cached
    PWA builds send UTC ISO with a trailing 'Z' (or +offset). Honour the
    suffix if present and shift to IST; otherwise treat as already-IST.
    """
    if not val or not isinstance(val, str):
        return val
    s = val.strip()
    if "T" not in s and "Z" not in s and "+" not in s:
        return s  # already naive IST, keep verbatim
    # Normalise ISO separator
    iso = s.replace(" ", "T")
    try:
        # Python 3.11+ accepts 'Z' suffix natively; pre-3.11 needs +00:00.
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        # Fall back to the old behaviour rather than 500 the request.
        return iso.replace("T", " ").replace("Z", "").split(".")[0]
    if dt.tzinfo is not None:
        dt = dt.astimezone(_IST).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")
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
                "reports_to", "attendance_mode"],
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
                "Purchase Manager", "Stock Manager", "Service Manager"}:
        return "manager"
    return "field"


# ── Attendance ────────────────────────────────────────────────────

@frappe.whitelist()
def attendance_today():
    emp = _get_employee()
    # Employee Checkin.time is naive IST. Filter against the IST calendar
    # day directly — no UTC shifting needed.
    today_iso = date.today().isoformat()
    checkins = frappe.get_list("Employee Checkin",
        filters={"employee": emp.name,
                 "time": ["between", [f"{today_iso} 00:00:00",
                                       f"{today_iso} 23:59:59"]]},
        fields=["name", "log_type", "time", "latitude", "longitude"],
        order_by="time asc", limit_page_length=50)

    for c in checkins:
        c.time = _to_ist(c.time)

    result = {"employee": emp.employee_name, "checked_in": False,
              "check_in_time": None, "check_out_time": None,
              "checkin_time": None, "checkout_time": None, "checkins": checkins}
    for c in checkins:
        if c.log_type == "IN" and not result["check_in_time"]:
            result["checked_in"] = True
            result["check_in_time"] = c.time
            result["checkin_time"] = c.time
        if c.log_type == "OUT":
            result["check_out_time"] = c.time
            result["checkout_time"] = c.time
    return result


@frappe.whitelist(methods=["POST"])
def create_checkin(log_type, latitude=None, longitude=None, time=None):
    emp = _get_employee()
    if log_type == "Checkin": log_type = "IN"
    if log_type == "Checkout": log_type = "OUT"

    lat = float(latitude) if latitude else None
    lon = float(longitude) if longitude else None
    _enforce_geofence(emp, lat, lon)

    # Bound any caller-supplied `time` to within ±2h of now. Stops an
    # employee from posting backdated check-ins to dodge the late-mark
    # threshold. The PWA does not currently send `time` — server uses
    # the IST clock — but a direct API caller might.
    now_ist = datetime.now(_IST).replace(tzinfo=None)
    if time:
        from frappe.utils import get_datetime as _gd
        try:
            requested = _gd(time)
        except Exception:
            frappe.throw(_("Invalid checkin time"))
        # Coerce to naive IST. tz-aware → astimezone(IST). Naive → assumed
        # IST per the new convention (server runs UTC OS but stores IST).
        if requested.tzinfo is not None:
            requested = requested.astimezone(_IST).replace(tzinfo=None)
        delta_minutes = abs((now_ist - requested).total_seconds()) / 60
        if delta_minutes > 120:
            frappe.throw(_("Check-in time must be within 2 hours of now"))
        checkin_time = requested
    else:
        checkin_time = now_ist

    doc = frappe.new_doc("Employee Checkin")
    doc.employee = emp.name
    doc.log_type = log_type
    doc.time = checkin_time
    if lat is not None: doc.latitude = lat
    if lon is not None: doc.longitude = lon
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


# ── Geofence ──────────────────────────────────────────────────────

def _enforce_geofence(emp, lat, lon):
    """Office-mode employees must check in within radius of office centre.

    Config in site_config.json:
        office_geofence: { "lat": 18.4773, "lon": 73.7958, "radius_m": 200 }

    Field-mode employees (Sales/Service field staff) bypass this check.
    Missing config → no enforcement (backwards compatible).
    """
    mode = emp.get("attendance_mode") or "Office"
    if mode == "Field":
        return
    cfg = frappe.conf.get("office_geofence")
    if not cfg or not cfg.get("lat") or not cfg.get("lon"):
        return  # Geofence not configured — allow
    if lat is None or lon is None:
        frappe.throw(_("Location is required for office check-in. Please enable GPS and try again."))
    distance_m = _haversine_m(lat, lon, cfg["lat"], cfg["lon"])
    radius = cfg.get("radius_m", 200)
    if distance_m > radius:
        frappe.throw(_(
            "You appear to be {0} m from the office. "
            "Office check-ins must be within {1} m. "
            "If you're on field work, ask HR to switch your Attendance Mode to Field."
        ).format(int(distance_m), int(radius)))


def _haversine_m(lat1, lon1, lat2, lon2):
    """Great-circle distance in metres between two GPS points."""
    from math import radians, sin, cos, asin, sqrt
    R = 6371000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


# ── Cancel approved leave (with thread-reply email) ───────────────

@frappe.whitelist(methods=["POST"])
def cancel_approved_leave(leave_name, reason):
    """Cancel a Leave Application that's already been approved (docstatus=1).

    Sends an email reply on the original approval thread to manager + HR.
    """
    emp = _get_employee()
    doc = frappe.get_doc("Leave Application", leave_name)
    if doc.employee != emp.name:
        frappe.throw(_("You can only cancel your own leave applications."))
    if doc.status != "Approved":
        frappe.throw(_("Only approved leaves can be cancelled here. Open drafts can be deleted directly."))
    if not reason or len(reason.strip()) < 10:
        frappe.throw(_("Please provide a cancellation reason (at least 10 characters)."))

    doc.cancellation_reason = reason.strip()
    doc.status = "Cancelled"
    doc.save(ignore_permissions=True)
    doc.cancel()

    _send_cancellation_email(doc)
    frappe.db.commit()
    return {"success": True, "name": doc.name}


def _send_cancellation_email(doc):
    """Reply on the existing leave-application email thread to manager + HR."""
    HR_EMAIL = "info@dgoc.in"
    recipients = []
    if doc.leave_approver:
        recipients.append(doc.leave_approver)
    cc = [HR_EMAIL]

    last_comm = frappe.get_all(
        "Communication",
        filters={"reference_doctype": "Leave Application", "reference_name": doc.name},
        fields=["name", "subject"],
        order_by="creation desc",
        limit=1,
    )
    in_reply_to = last_comm[0]["name"] if last_comm else None
    base_subject = (last_comm[0]["subject"] if last_comm else f"Leave Application {doc.name}")
    subject = base_subject if base_subject.lower().startswith("re:") else f"Re: {base_subject}"

    body = f"""<p>Hi,</p>
<p>I am cancelling my approved leave application <b>{doc.name}</b>.</p>
<ul>
  <li><b>Type:</b> {doc.leave_type}</li>
  <li><b>From:</b> {doc.from_date}</li>
  <li><b>To:</b> {doc.to_date}</li>
  <li><b>Days:</b> {doc.total_leave_days}</li>
  <li><b>Reason for cancellation:</b> {doc.cancellation_reason}</li>
</ul>
<p>Thanks,<br>{doc.employee_name}</p>"""

    frappe.sendmail(
        recipients=recipients,
        cc=cc,
        subject=subject,
        message=body,
        reference_doctype="Leave Application",
        reference_name=doc.name,
        in_reply_to=in_reply_to,
        now=False,
    )


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
                "lead", "opportunity", "quotation", "sales_order", "conversion_status",
                "follow_up_doctype", "follow_up_name"],
        order_by="date desc, check_in_time desc",
        limit_page_length=100)


@frappe.whitelist(methods=["POST"])
def create_dcr(**kwargs):
    # Marker for visit_guard.enforce — PWA-originated, GPS legitimate.
    frappe.local.flags["from_pwa"] = True
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
    # DCR only accepts Sales/Service/Office — fall back if employee dept doesn't match
    valid_dcr_depts = {"Sales", "Service", "Office"}
    if doc.department not in valid_dcr_depts:
        doc.department = "Office"
    # Normalise to naive IST for both new IST clients and stale Z-suffixed
    # clients (see _normalise_dt_to_ist).
    for dt_field in ("check_in_time", "check_out_time"):
        val = doc.get(dt_field)
        if val:
            doc.set(dt_field, _normalise_dt_to_ist(val))
    if not doc.status:
        doc.status = "Ongoing"
    # Wire follow-up selection into the DCR Link fields used by linking.py
    fu_dt = kwargs.get("follow_up_doctype")
    fu_name = kwargs.get("follow_up_name")
    if fu_dt and fu_name:
        link_map = {"Lead": "lead", "Opportunity": "opportunity", "Quotation": "quotation"}
        link_field = link_map.get(fu_dt)
        if link_field:
            doc.set(link_field, fu_name)
    doc.insert(ignore_permissions=True)
    # Service Call → DCR backlink (when DCR was created from a "Visit needed" call)
    from_svc = kwargs.get("from_service_call")
    if from_svc:
        try:
            frappe.db.set_value("Service Call", from_svc, "follow_up_dcr", doc.name)
        except Exception:
            frappe.log_error(
                title="Service Call backlink failed",
                message=f"DCR {doc.name} could not link back to Service Call {from_svc}",
            )
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
def update_dcr(dcr_id, remarks=None, **kwargs):
    """Partial update for an ongoing DCR. Currently supports `remarks` only."""
    frappe.local.flags["from_pwa"] = True
    emp = _get_employee()
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.employee != emp.name:
        frappe.throw(_("You do not have access to this visit"), frappe.PermissionError)
    if doc.status == "Completed":
        frappe.throw(_("Cannot update a completed visit"))
    if remarks is not None:
        doc.remarks = remarks
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def checkout_dcr(dcr_id, check_out_time=None, check_out_gps=None, remarks=None,
                 status="Completed", lead_generated=0, opportunity_generated=0,
                 order_received=0, discussion_remarks=None, next_action=None,
                 next_action_date=None):
    frappe.local.flags["from_pwa"] = True
    emp = _get_employee()
    doc = frappe.get_doc("Daily Call Report", dcr_id)
    if doc.employee != emp.name:
        frappe.throw(_("You do not have access to this visit"), frappe.PermissionError)
    if doc.status == "Completed":
        frappe.throw(_("DCR already completed"))
    doc.status = status
    # Normalise client-supplied datetime to naive IST.
    if check_out_time:
        check_out_time = _normalise_dt_to_ist(check_out_time)
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
        "telegram_chat_id": doc.telegram_chat_id,
        "company_abbr": (frappe.db.get_value("Company", doc.company, "abbr") or "")
                        if doc.company else "",
        # Roles surface so the PWA can re-sync Auth.hasRole() on every load
        # instead of relying on the at-login snapshot in IndexedDB.
        "roles": frappe.get_roles(frappe.session.user),
        "user_id": frappe.session.user,
        "nav_tier": _get_nav_tier(),
        # Director-only: current default company so the PWA switcher knows
        # which option to mark as selected on render.
        "default_company": frappe.defaults.get_user_default("Company") or "",
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

    # Field-tier callers can only see their own funnel; manager/admin can
    # filter to any employee. Without this gate, any authenticated employee
    # could read another rep's pipeline counts via this endpoint.
    tier = _get_nav_tier()
    if tier == "field":
        filters["employee"] = _get_employee().name
    else:
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
    # Name-lookup helper for PWA visit/call/breakdown forms. Every authenticated
    # employee needs to be able to attach a Customer to their work; service team
    # roles ("Employee" / "Desk User" only) don't carry Customer read perm by
    # default, which silently emptied the dropdown and blocked Pratik & co. from
    # creating any DCR. Returned fields are intentionally minimal (no
    # financials, no addresses) so this is safe to expose.
    _get_employee()  # gates to active employees only — Guest/external users still rejected
    filters = [["disabled", "=", 0]]
    if search:
        filters.append(["customer_name", "like", f"%{search}%"])
    return frappe.get_all("Customer",
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
    """Team overview for managers — today's attendance status of all DSPL employees.

    Manager / admin only. Without the role gate, any authenticated
    employee could enumerate the entire roster + real-time presence.
    """
    if _get_nav_tier() == "field":
        frappe.throw(_("Only managers can view team status"),
                     frappe.PermissionError)

    today = date.today().isoformat()
    day_start = f"{today} 00:00:00"
    day_end = f"{today} 23:59:59"

    employees = frappe.get_list("Employee",
        filters={"company": COMPANY, "status": "Active"},
        fields=["name", "employee_name", "department", "designation"],
        order_by="employee_name asc", limit_page_length=0)

    # Scope today's checkins to the DSPL employee set (not every company's
    # checkins). Employee Checkin.time is naive IST so an IST date window
    # captures the right rows directly.
    emp_names = [e.name for e in employees]
    checkins = []
    if emp_names:
        checkins = frappe.get_list("Employee Checkin",
            filters={"employee": ["in", emp_names],
                     "time": ["between", [day_start, day_end]]},
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
        l["type"] = "Leave"
        results.append(l)

    # Pending expense claims
    expenses = frappe.get_list("Expense Claim",
        filters={"approval_status": "Draft", "expense_approver": user},
        fields=["name", "employee", "employee_name", "total_claimed_amount",
                "approval_status"],
        order_by="creation desc", limit_page_length=20)
    for e in expenses:
        e["doctype"] = "Expense Claim"
        e["type"] = "Expense"
        e["amount"] = e.get("total_claimed_amount")
        results.append(e)

    # Pending employee advances — only those whose employee reports to current user
    employee = _get_employee()
    my_reports = frappe.get_all("Employee", filters={"reports_to": employee.name}, pluck="name")
    if my_reports:
        advances = frappe.get_list("Employee Advance",
            filters={"docstatus": 0, "employee": ["in", my_reports]},
            fields=["name", "employee", "employee_name", "advance_amount",
                    "purpose", "posting_date", "status"],
            order_by="creation desc", limit_page_length=20)
        for a in advances:
            a["doctype"] = "Employee Advance"
            a["type"] = "Advance"
            a["amount"] = a.get("advance_amount")
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
def process_approval(doctype, name, action, approved_amount=None, reason=None):
    """Approve or reject a Leave Application, Expense Claim, or Employee Advance.

    Accepts either the full doctype name ("Leave Application") or the short
    form the PWA uses in URLs ("leave"/"expense"/"advance"). The PWA passes
    `item.type.toLowerCase()` in the URL path; we normalise here so both old
    and new clients work without a SW bump.

    Partial approval (Employee Advance only):
    pass `approved_amount` lower than `doc.advance_amount` to reduce the
    amount before submit. ERPNext has no native partial-approval field —
    convention is to edit `advance_amount` down. Original vs approved is
    captured in a Comment so the approver's intent is auditable beyond
    the bare Version Log.
    """
    _DT_ALIASES = {
        "leave": "Leave Application",
        "leave application": "Leave Application",
        "expense": "Expense Claim",
        "expense claim": "Expense Claim",
        "advance": "Employee Advance",
        "employee advance": "Employee Advance",
    }
    doctype = _DT_ALIASES.get((doctype or "").strip().lower(), doctype)
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
            requested = float(doc.advance_amount or 0)
            approved = requested
            if approved_amount is not None and str(approved_amount).strip() != "":
                try:
                    approved = float(approved_amount)
                except (TypeError, ValueError):
                    frappe.throw(_("Approved amount must be a number"))
                if approved <= 0:
                    frappe.throw(_("Approved amount must be greater than zero"))
                if approved > requested:
                    frappe.throw(_(
                        "Approved amount (₹{0}) cannot exceed the requested amount (₹{1})"
                    ).format(f"{approved:,.0f}", f"{requested:,.0f}"))
            partial = approved < requested
            if partial:
                doc.advance_amount = approved
            doc.save(ignore_permissions=True)
            doc.submit()
            if partial:
                note = (f"Partially approved: requested ₹{requested:,.0f}, "
                        f"approved ₹{approved:,.0f}.")
                if reason:
                    note += f" Reason: {frappe.utils.escape_html(reason)}"
                doc.add_comment("Info", note)
            elif reason:
                doc.add_comment("Info",
                    f"Approved with note: {frappe.utils.escape_html(reason)}")
    elif action == "reject":
        rej_note = "Rejected via DSPL ERP"
        if reason:
            rej_note = f"Rejected: {frappe.utils.escape_html(reason)}"
        if doctype == "Leave Application":
            doc.status = "Rejected"
            doc.save(ignore_permissions=True)
            doc.submit()
            doc.add_comment("Info", rej_note)
        elif doctype == "Expense Claim":
            doc.approval_status = "Rejected"
            doc.save(ignore_permissions=True)
            doc.add_comment("Info", rej_note)
        elif doctype == "Employee Advance":
            doc.add_comment("Info", rej_note)
    else:
        frappe.throw(_(f"Invalid action: {action}"))

    frappe.db.commit()
    return {"success": True, "action": action, "doctype": doctype, "name": name}


@frappe.whitelist()
def get_my_approvals(days=30):
    """History of what the current user has approved/rejected via the PWA.

    Drives the 'My approvals' history view. Source of truth: docstatus +
    modified_by + Comments (for advance partial-approval reductions and
    rejection notes).
    """
    user = frappe.session.user
    try:
        days = int(days)
    except (TypeError, ValueError):
        days = 30
    days = max(1, min(days, 180))
    cutoff = frappe.utils.add_days(frappe.utils.nowdate(), -days)
    results = []

    leaves = frappe.get_all("Leave Application",
        filters={"modified_by": user, "modified": [">=", cutoff],
                 "status": ["in", ["Approved", "Rejected"]]},
        fields=["name", "employee", "employee_name", "leave_type",
                "from_date", "to_date", "total_leave_days", "status", "modified"],
        order_by="modified desc", limit_page_length=50)
    for l in leaves:
        l["doctype"] = "Leave Application"
        l["type"] = "Leave"
        l["action"] = "approved" if l["status"] == "Approved" else "rejected"
        results.append(l)

    expenses = frappe.get_all("Expense Claim",
        filters={"modified_by": user, "modified": [">=", cutoff],
                 "approval_status": ["in", ["Approved", "Rejected"]]},
        fields=["name", "employee", "employee_name", "total_claimed_amount",
                "approval_status", "modified"],
        order_by="modified desc", limit_page_length=50)
    for e in expenses:
        e["doctype"] = "Expense Claim"
        e["type"] = "Expense"
        e["action"] = "approved" if e["approval_status"] == "Approved" else "rejected"
        e["amount"] = e.get("total_claimed_amount")
        results.append(e)

    # Submitted advances modified by me — these are approvals.
    advances = frappe.get_all("Employee Advance",
        filters={"modified_by": user, "modified": [">=", cutoff], "docstatus": 1},
        fields=["name", "employee", "employee_name", "advance_amount",
                "purpose", "posting_date", "status", "modified"],
        order_by="modified desc", limit_page_length=50)
    for a in advances:
        a["doctype"] = "Employee Advance"
        a["type"] = "Advance"
        a["action"] = "approved"
        a["amount"] = a.get("advance_amount")
        results.append(a)

    # Stable sort by modified desc across types
    results.sort(key=lambda r: str(r.get("modified") or ""), reverse=True)
    return results


# ── Operator Logsheet (Phase 2 — PWA replaces the paper logsheet) ─

@frappe.whitelist()
def get_my_logsheets(period_from=None, period_to=None, limit=50):
    """Operator's own logsheets, most recent first. Used by the PWA list."""
    emp = _get_employee()
    # Cap caller-supplied limit. A field operator could otherwise pass
    # limit=999999 and force a full-table scan of their logsheets.
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 50
    if limit <= 0 or limit > 500:
        limit = 50
    filters = {"operator": emp.name}
    if period_from and period_to:
        filters["log_date"] = ["between", [period_from, period_to]]
    rows = frappe.get_all("Operator Logsheet",
        filters=filters,
        fields=["name", "log_date", "customer", "customer_name", "site_name",
                "equipment_label", "equipment_item", "work_type", "shift",
                "total_hours", "idle_hours", "amount", "status", "docstatus",
                "supervisor_signature", "signed_by", "sales_invoice"],
        order_by="log_date desc, creation desc",
        limit_page_length=int(limit))
    return rows


@frappe.whitelist()
def get_logsheet_summary():
    """This-month roll-up for the operator's home tile.

    Returns hours / amount totals split by status so the operator can see
    what's done, what's pending verification, and what the customer has
    been billed for."""
    from frappe.utils import today, get_first_day, get_last_day
    emp = _get_employee()
    today_iso = today()
    month_start = str(get_first_day(today_iso))
    month_end = str(get_last_day(today_iso))

    rows = frappe.get_all("Operator Logsheet",
        filters={"operator": emp.name,
                 "log_date": ["between", [month_start, month_end]]},
        fields=["status", "docstatus", "total_hours", "amount"])

    out = {
        "month_start": month_start,
        "month_end": month_end,
        "draft":    {"count": 0, "hours": 0.0, "amount": 0.0},
        "open":     {"count": 0, "hours": 0.0, "amount": 0.0},
        "verified": {"count": 0, "hours": 0.0, "amount": 0.0},
        "billed":   {"count": 0, "hours": 0.0, "amount": 0.0},
    }
    for r in rows:
        if r.docstatus == 0:
            bucket = out["draft"]
        elif r.status == "Verified":
            bucket = out["verified"]
        elif r.status == "Billed":
            bucket = out["billed"]
        else:
            bucket = out["open"]
        bucket["count"] += 1
        bucket["hours"] += float(r.total_hours or 0)
        bucket["amount"] += float(r.amount or 0)
    return out


@frappe.whitelist()
def get_recent_equipment_labels(limit=20):
    """Distinct equipment_labels recently used by the operator — used by the
    PWA to autocomplete the equipment field."""
    emp = _get_employee()
    rows = frappe.db.sql("""
        SELECT DISTINCT equipment_label
        FROM `tabOperator Logsheet`
        WHERE operator=%s AND IFNULL(equipment_label,'') != ''
        ORDER BY log_date DESC
        LIMIT %s
    """, (emp.name, int(limit)), as_dict=True)
    return [r.equipment_label for r in rows]


@frappe.whitelist(methods=["POST"])
def submit_logsheet(log_date, customer, site_name, total_hours,
                    work_type="Lifting", shift="Day", idle_hours=0,
                    equipment_label=None, equipment_item=None,
                    signed_by=None, remarks=None,
                    rate_per_hour=0, do_submit=0, name=None):
    """Create or update an Operator Logsheet from the PWA.

    Pass `name` to update an existing draft; omit to create new.
    Pass `do_submit=1` to also submit (requires signed_by + photo).
    The supervisor_signature photo is uploaded separately via
    /api/method/upload_file (standard Frappe upload) and the file URL
    is stamped here once available.
    """
    emp = _get_employee()
    tier = _get_nav_tier()
    do_submit = bool(int(do_submit))

    if name:
        doc = frappe.get_doc("Operator Logsheet", name)
        if doc.operator != emp.name:
            frappe.throw(_("Not your logsheet"), frappe.PermissionError)
        if doc.docstatus != 0:
            frappe.throw(_("Only draft logsheets can be edited"))
    else:
        doc = frappe.new_doc("Operator Logsheet")
        doc.operator = emp.name
        doc.company = emp.company

    # ── Bounds & sanity checks ───────────────────────────────────
    # log_date: reject backdates older than 7 days, reject future dates.
    # Without this an operator could file for a closed month and force
    # a surprise invoice on the next billing run.
    from frappe.utils import getdate, today, date_diff
    try:
        ld = getdate(log_date)
    except Exception:
        frappe.throw(_("Invalid log_date"))
    diff = date_diff(today(), ld)
    if diff < 0:
        frappe.throw(_("log_date cannot be in the future"))
    if diff > 7:
        frappe.throw(_("log_date must be within the last 7 days"))

    # total_hours bounds (0–24); idle_hours non-negative and ≤ total.
    th = float(total_hours or 0)
    if th < 0 or th > 24:
        frappe.throw(_("total_hours must be between 0 and 24"))
    ih = float(idle_hours or 0)
    if ih < 0 or ih > th:
        frappe.throw(_("idle_hours cannot be negative or exceed total_hours"))

    # Free-text length caps (DB columns are typically VARCHAR(140); cap
    # before write rather than relying on Frappe's CharacterLengthExceeded)
    if site_name and len(site_name) > 140:
        site_name = site_name[:140]
    if equipment_label and len(equipment_label) > 140:
        equipment_label = equipment_label[:140]
    if signed_by and len(signed_by) > 140:
        signed_by = signed_by[:140]
    if remarks and len(remarks) > 2000:
        remarks = remarks[:2000]

    doc.log_date = log_date
    doc.customer = customer
    doc.site_name = site_name
    doc.total_hours = th
    doc.idle_hours = ih
    doc.work_type = work_type
    doc.shift = shift
    if equipment_label is not None:
        doc.equipment_label = equipment_label
    if equipment_item is not None:
        doc.equipment_item = equipment_item
    if signed_by is not None:
        doc.signed_by = signed_by
    if remarks is not None:
        doc.remarks = remarks
    # rate_per_hour: only managers/admins can set this. Operators cannot
    # influence the customer-billing rate from the API; manager fills
    # it on the desk before billing runs.
    if rate_per_hour and tier in ("manager", "admin"):
        rate = float(rate_per_hour)
        if rate < 0 or rate > 100000:
            frappe.throw(_("rate_per_hour out of range (0–100000)"))
        doc.rate_per_hour = rate

    if name:
        doc.save(ignore_permissions=True)
    else:
        doc.insert(ignore_permissions=True)

    if do_submit:
        doc.submit()

    frappe.db.commit()
    return {"name": doc.name, "amount": doc.amount, "docstatus": doc.docstatus}


@frappe.whitelist()
def get_logsheet_approval_link(name):
    """Return the public approval URL for a logsheet the operator owns.

    Used by the PWA "Send to client for approval" share flow. Stamps
    approval_status='Sent' so the rest of the system knows the link has
    been issued."""
    doc = frappe.get_doc("Operator Logsheet", name)
    emp = _get_employee()
    if doc.operator != emp.name:
        frappe.throw(_("Not your logsheet"), frappe.PermissionError)
    if doc.docstatus == 2:
        frappe.throw(_("This logsheet has been cancelled"))
    if not doc.approval_token:
        # Legacy rows pre-token — generate one now via save trigger
        doc.save(ignore_permissions=True)
        doc.reload()
    site_url = frappe.utils.get_url()
    public_url = f"{site_url}/logsheet_approve?t={doc.approval_token}"
    if doc.approval_status == "Pending":
        frappe.db.set_value("Operator Logsheet", doc.name, "approval_status", "Sent")
        frappe.db.commit()
    return {
        "url": public_url,
        "approval_status": frappe.db.get_value("Operator Logsheet", doc.name, "approval_status"),
        "customer_name": doc.customer_name,
        "operator_name": doc.operator_name,
        "log_date": str(doc.log_date) if doc.log_date else None,
        "total_hours": doc.total_hours,
    }


@frappe.whitelist(methods=["POST"])
def cancel_logsheet(name):
    """Delete a draft, or cancel a submitted logsheet (only if not yet billed)."""
    doc = frappe.get_doc("Operator Logsheet", name)
    emp = _get_employee()
    if doc.operator != emp.name:
        frappe.throw(_("Not your logsheet"), frappe.PermissionError)
    if doc.docstatus == 0:
        _cleanup_logsheet_files(name)
        frappe.delete_doc("Operator Logsheet", name, ignore_permissions=True)
    elif doc.docstatus == 1:
        if doc.sales_invoice:
            frappe.throw(_("Logsheet has been billed — cannot cancel"))
        if doc.status == "Verified":
            frappe.throw(_("Logsheet already verified by manager — ask them to cancel"))
        # Once the client has digitally approved (Phase 2.2), the operator
        # cannot unilaterally erase that sign-off — it would leave billing
        # records out of sync with what the client actually approved.
        if doc.approval_status == "Approved":
            frappe.throw(_(
                "Client has already approved this logsheet — contact "
                "management to cancel."
            ))
        doc.cancel()
        _cleanup_logsheet_files(name)
    frappe.db.commit()
    return {"deleted": True}


def _cleanup_logsheet_files(logsheet_name):
    """Delete File rows attached to a logsheet — supervisor signature
    photo and any other uploads. Without this, the public signature
    image lives on disk indefinitely after a cancellation."""
    files = frappe.get_all("File",
        filters={"attached_to_doctype": "Operator Logsheet",
                 "attached_to_name": logsheet_name},
        pluck="name")
    for f in files:
        try:
            frappe.delete_doc("File", f, ignore_permissions=True, force=True)
        except Exception as exc:
            frappe.log_error(
                f"Failed to delete File {f} for logsheet {logsheet_name}: {exc}",
                "Logsheet File cleanup",
            )


# ── Expense Claim CRUD ────────────────────────────────────────────

def _resolve_expense_approver(emp):
    """Resolve the User who should receive an expense claim for approval.

    Order: Employee.expense_approver → reports_to.user_id → Department head.
    Returns User (email) or empty string."""
    approver = frappe.db.get_value("Employee", emp.name, "expense_approver")
    if approver:
        return approver
    if emp.get("reports_to"):
        approver = frappe.db.get_value("Employee", emp.reports_to, "user_id")
        if approver:
            return approver
    if emp.get("department"):
        # Department.expense_approvers is a child table — pick first row
        rows = frappe.get_all("Department Approver",
            filters={"parent": emp.department, "parentfield": "expense_approvers"},
            fields=["approver"], order_by="idx asc", limit_page_length=1)
        if rows:
            return rows[0].approver
    return ""


@frappe.whitelist()
def get_expense_claim_types():
    """List enabled Expense Claim Types for the PWA dropdown."""
    return frappe.get_all("Expense Claim Type", fields=["name"],
                          order_by="name asc", pluck="name")


@frappe.whitelist()
def get_modes_of_payment():
    """List enabled Modes of Payment for the PWA dropdown."""
    return frappe.get_all("Mode of Payment",
                          filters={"enabled": 1},
                          fields=["name", "type"],
                          order_by="name asc")


@frappe.whitelist(methods=["POST"])
def submit_expense_claim(expenses, posting_date=None, approver=None,
                          advances=None, receipt_files=None):
    """Create a draft Expense Claim for the current employee.

    Auto-resolves company and expense_approver. Stays in Draft so the
    approver can act on it via the Approvals queue.

    `advances`: optional [{employee_advance, allocated_amount}] — appends
    to the doc.advances child table so the claim is netted off against
    the named outstanding advance (native ERPNext flow).

    `receipt_files`: optional list of {file_name, line_index, code}.
    Re-parents staged File docs (uploaded to the user during entry, since
    the claim didn't exist yet) onto the new claim and writes the
    receipt code into the matching expense line's description.
    """
    import json
    if isinstance(expenses, str):
        expenses = json.loads(expenses)
    if not expenses:
        frappe.throw(_("Add at least one expense item"))
    if isinstance(advances, str):
        advances = json.loads(advances or "[]")
    if isinstance(receipt_files, str):
        receipt_files = json.loads(receipt_files or "[]")

    emp = _get_employee()
    doc = frappe.new_doc("Expense Claim")
    doc.employee = emp.name
    doc.company = emp.company
    doc.posting_date = posting_date or date.today().isoformat()
    doc.expense_approver = approver or _resolve_expense_approver(emp)

    # Group receipts by line index so we can stamp the codes into the
    # description as we walk the expenses list below.
    receipts_by_line = {}
    for rf in (receipt_files or []):
        idx = rf.get("line_index")
        if idx is None:
            continue
        receipts_by_line.setdefault(int(idx), []).append(rf)

    for i, line in enumerate(expenses):
        amt = float(line.get("amount") or 0)
        if amt <= 0:
            frappe.throw(_("Amount must be greater than zero"))
        if not line.get("expense_type"):
            frappe.throw(_("Expense type is required"))
        desc = line.get("description") or ""
        line_receipts = receipts_by_line.get(i, [])
        if line_receipts:
            codes = ", ".join(r.get("code") for r in line_receipts if r.get("code"))
            if codes:
                desc = (desc + ("\n" if desc else "") + f"Receipts: {codes}").strip()
        doc.append("expenses", {
            "expense_date": line.get("expense_date") or doc.posting_date,
            "expense_type": line.get("expense_type"),
            "amount": amt,
            # Default sanctioned = amount so HRMS's
            # 'advance amount > total sanctioned' guard doesn't fire on
            # Draft insert. The approver can reduce this on approval (partial
            # sanction) — process_approval picks up the modified value.
            "sanctioned_amount": amt,
            "description": desc,
        })

    # Advances child table — restricted to the requester's own advances
    for adv in (advances or []):
        adv_name = adv.get("employee_advance")
        alloc = float(adv.get("allocated_amount") or 0)
        if not adv_name or alloc <= 0:
            continue
        adv_doc = frappe.db.get_value("Employee Advance", adv_name,
            ["employee", "advance_amount", "paid_amount", "claimed_amount",
             "return_amount", "docstatus"], as_dict=True)
        if not adv_doc:
            frappe.throw(_("Advance {0} not found").format(adv_name))
        if adv_doc.employee != emp.name:
            frappe.throw(_("Advance {0} doesn't belong to you").format(adv_name),
                         frappe.PermissionError)
        if adv_doc.docstatus != 1:
            frappe.throw(_("Advance {0} is not approved yet").format(adv_name))
        # ERPNext only allows claiming against money that's been PAID —
        # mirror that here so the user gets a clear error rather than a
        # cryptic HRMS validation message at insert time.
        paid = float(adv_doc.paid_amount or 0)
        claimed = float(adv_doc.claimed_amount or 0)
        returned = float(adv_doc.return_amount or 0)
        claimable = paid - claimed - returned
        if claimable <= 0:
            frappe.throw(_(
                "Advance {0} hasn't been paid by Accounts yet — claimable "
                "headroom is ₹0. Ask Accounts to book a Payment Entry "
                "against it before claiming."
            ).format(adv_name))
        if alloc > claimable:
            frappe.throw(_("Allocated ₹{0} exceeds claimable ₹{1} on advance {2}")
                .format(f"{alloc:,.0f}", f"{claimable:,.0f}", adv_name))
        doc.append("advances", {
            "employee_advance": adv_name,
            "posting_date": adv_doc.get("posting_date") or doc.posting_date,
            "advance_account": frappe.db.get_value("Employee Advance",
                adv_name, "advance_account"),
            "advance_paid": paid,
            "unclaimed_amount": claimable,
            "allocated_amount": alloc,
        })

    doc.insert(ignore_permissions=True)

    # Re-parent staged receipt files (uploaded against User) onto the
    # new claim so Accounts can find them attached to the right record.
    for rf in (receipt_files or []):
        fname = rf.get("file_name")
        if not fname or not frappe.db.exists("File", fname):
            continue
        try:
            f = frappe.get_doc("File", fname)
            if f.attached_to_doctype != "Expense Claim":
                f.attached_to_doctype = "Expense Claim"
                f.attached_to_name = doc.name
                f.save(ignore_permissions=True)
        except Exception:
            frappe.log_error(title=f"Receipt re-parent failed for {fname}",
                             message=frappe.get_traceback())

    frappe.db.commit()
    return {"name": doc.name, "approver": doc.expense_approver,
            "total": doc.total_claimed_amount}


# ── Outstanding advances + receipt code endpoints ─────────────────

@frappe.whitelist()
def get_outstanding_advances():
    """Current employee's submitted Employee Advances with money available
    to claim against (paid_amount - claimed_amount - return_amount > 0).

    ERPNext's hrms.validate_advances enforces that you can only claim
    against PAID money — if an advance is still Unpaid (paid_amount = 0),
    Accounts must book a Payment Entry first. This endpoint mirrors that
    rule so the PWA dropdown never shows an option that would fail
    submission. Each item also carries `pending_unpaid` so the UI can
    surface 'awaiting payment by Accounts' to the user."""
    emp = _get_employee()
    rows = frappe.db.sql("""
        SELECT name, advance_amount, paid_amount, claimed_amount,
               return_amount, status, posting_date, purpose
        FROM `tabEmployee Advance`
        WHERE employee = %s AND docstatus = 1
        ORDER BY posting_date DESC
    """, (emp.name,), as_dict=True) or []
    out = []
    for r in rows:
        paid = float(r["paid_amount"] or 0)
        claimed = float(r["claimed_amount"] or 0)
        returned = float(r["return_amount"] or 0)
        # ERPNext's "claimable headroom" = what's been paid minus what's
        # already been settled. If the advance is still Unpaid, this is 0.
        claimable = paid - claimed - returned
        if claimable <= 0 and float(r["advance_amount"] or 0) - claimed - returned <= 0:
            # fully settled — skip
            continue
        out.append({
            "name": r["name"],
            "advance_amount": float(r["advance_amount"] or 0),
            "paid_amount": paid,
            "claimed_amount": claimed,
            "return_amount": returned,
            "remaining": claimable,             # what the PWA can allocate
            "pending_unpaid": claimable <= 0,   # surfaced as 'awaiting payment'
            "status": r["status"],
            "posting_date": str(r["posting_date"]) if r["posting_date"] else "",
            "purpose": r["purpose"] or "",
        })
    return out


_RECEIPT_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O, 1/I — easy to write


def _generate_receipt_code():
    import secrets
    return "R-" + "".join(secrets.choice(_RECEIPT_ALPHABET) for _ in range(5))


@frappe.whitelist(methods=["POST"])
def tag_receipt(file_name):
    """Generate a short human-writable receipt code for an uploaded File
    and persist it as a `[CODE] ` prefix on File.file_name. The PWA shows
    the code to the user immediately after capture so they can write it
    on the physical receipt — that makes the paper match the digital
    record. (File doesn't expose a `description` field, so the code
    rides on `file_name` which appears wherever the file is referenced.)"""
    emp = _get_employee()
    if not frappe.db.exists("File", file_name):
        frappe.throw(_("File not found"))
    f = frappe.get_doc("File", file_name)
    # Only allow tagging files that this user owns
    if f.owner != frappe.session.user:
        frappe.throw(_("Not your file"), frappe.PermissionError)
    # If already tagged, return the existing code (idempotent)
    import re as _re
    existing_match = _re.match(r"^\[(R-[A-Z0-9]{5})\]\s+", f.file_name or "")
    if existing_match:
        return {"file_name": f.name, "file_url": f.file_url,
                "code": existing_match.group(1),
                "employee": emp.employee_name}
    # Collision avoidance: regenerate up to 10 times
    code = None
    for _ in range(10):
        candidate = _generate_receipt_code()
        clash = frappe.db.exists("File", {"file_name": ["like", f"[{candidate}]%"]})
        if not clash:
            code = candidate
            break
    if not code:
        code = _generate_receipt_code()  # collision unlikely after 10 tries
    f.file_name = f"[{code}] " + (f.file_name or "")
    f.save(ignore_permissions=True)
    frappe.db.commit()
    return {"file_name": f.name, "file_url": f.file_url, "code": code,
            "employee": emp.employee_name}


@frappe.whitelist(methods=["POST"])
def update_expense_claim(name, expenses=None, posting_date=None, approver=None):
    """Edit a draft Expense Claim. Owner only, docstatus=0 only."""
    import json
    doc = frappe.get_doc("Expense Claim", name)
    emp = _get_employee()
    if doc.employee != emp.name:
        frappe.throw(_("This is not your expense claim"), frappe.PermissionError)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft claims can be edited"))

    if posting_date:
        doc.posting_date = posting_date
    if approver is not None:
        doc.expense_approver = approver

    if expenses is not None:
        if isinstance(expenses, str):
            expenses = json.loads(expenses)
        doc.set("expenses", [])
        for line in expenses:
            amt = float(line.get("amount") or 0)
            if amt <= 0:
                frappe.throw(_("Amount must be greater than zero"))
            if not line.get("expense_type"):
                frappe.throw(_("Expense type is required"))
            doc.append("expenses", {
                "expense_date": line.get("expense_date") or doc.posting_date,
                "expense_type": line.get("expense_type"),
                "amount": amt,
                "description": line.get("description") or "",
            })

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name, "total": doc.total_claimed_amount}


@frappe.whitelist(methods=["POST"])
def cancel_expense_claim(name):
    """Delete a draft, or cancel a submitted Expense Claim. Owner only."""
    doc = frappe.get_doc("Expense Claim", name)
    emp = _get_employee()
    if doc.employee != emp.name:
        frappe.throw(_("This is not your expense claim"), frappe.PermissionError)

    if doc.docstatus == 0:
        frappe.delete_doc("Expense Claim", name, ignore_permissions=True)
    elif doc.docstatus == 1:
        if doc.approval_status == "Approved":
            frappe.throw(_("Approved claims cannot be cancelled from the app"))
        doc.cancel()
    frappe.db.commit()
    return {"deleted": True}


# ── Employee Advance CRUD ─────────────────────────────────────────

def _resolve_advance_account(company):
    """Find the Employee Advance account for a company."""
    acc = frappe.db.get_value("Company", company, "default_employee_advance_account")
    if acc:
        return acc
    # Fall back to first ledger named like "Employee Advance%"
    rows = frappe.get_all("Account",
        filters={"company": company, "account_name": ["like", "Employee Advance%"],
                 "is_group": 0},
        fields=["name"], limit_page_length=1)
    return rows[0].name if rows else ""


@frappe.whitelist(methods=["POST"])
def submit_advance_request(advance_amount, purpose, posting_date=None,
                            mode_of_payment=None):
    """Create a draft Employee Advance for the current employee.

    Auto-resolves company and advance_account. Stays in Draft so the
    approver can submit it via the Approvals queue."""
    emp = _get_employee()
    amt = float(advance_amount or 0)
    if amt <= 0:
        frappe.throw(_("Amount must be greater than zero"))
    if not purpose:
        frappe.throw(_("Purpose is required"))

    advance_account = _resolve_advance_account(emp.company)
    if not advance_account:
        frappe.throw(_("Set 'Default Employee Advance Account' on the Company {0}")
                     .format(emp.company))

    doc = frappe.new_doc("Employee Advance")
    doc.employee = emp.name
    doc.company = emp.company
    doc.posting_date = posting_date or date.today().isoformat()
    doc.purpose = purpose
    doc.advance_amount = amt
    doc.advance_account = advance_account
    doc.currency = "INR"
    doc.exchange_rate = 1
    if mode_of_payment:
        doc.mode_of_payment = mode_of_payment

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
def update_advance_request(name, advance_amount=None, purpose=None,
                            posting_date=None, mode_of_payment=None):
    """Edit a draft Employee Advance. Owner only, docstatus=0 only."""
    doc = frappe.get_doc("Employee Advance", name)
    emp = _get_employee()
    if doc.employee != emp.name:
        frappe.throw(_("This is not your advance"), frappe.PermissionError)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft advances can be edited"))

    if advance_amount is not None:
        amt = float(advance_amount)
        if amt <= 0:
            frappe.throw(_("Amount must be greater than zero"))
        doc.advance_amount = amt
    if purpose is not None:
        if not purpose.strip():
            frappe.throw(_("Purpose is required"))
        doc.purpose = purpose
    if posting_date:
        doc.posting_date = posting_date
    if mode_of_payment is not None:
        doc.mode_of_payment = mode_of_payment

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
def cancel_advance_request(name):
    """Delete a draft, or cancel a submitted Employee Advance. Owner only."""
    doc = frappe.get_doc("Employee Advance", name)
    emp = _get_employee()
    if doc.employee != emp.name:
        frappe.throw(_("This is not your advance"), frappe.PermissionError)

    if doc.docstatus == 0:
        frappe.delete_doc("Employee Advance", name, ignore_permissions=True)
    elif doc.docstatus == 1:
        if (doc.paid_amount or 0) > 0:
            frappe.throw(_("Advance has been paid out — cannot cancel from the app"))
        doc.cancel()
    frappe.db.commit()
    return {"deleted": True}


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
            "company": emp.get("company", ""),
        },
        "nav_tier": _get_nav_tier(),
        "user": frappe.session.user,
    }


# ── Leads ─────────────────────────────────────────────────────────

@frappe.whitelist()
def get_lead_sources():
    """Get all Lead Source records for the PWA dropdown."""
    return frappe.get_all("Lead Source", pluck="name", order_by="name asc")


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
        "bot_url": f"https://t.me/HNGcode_bot?start={token}",
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


@frappe.whitelist()
def get_leave_types_for_pwa():
    """List Leave Types available to the current employee for self-application.

    Filters out:
    - Types with `pwa_visible = 0` (Privilege/Casual/Compensatory Off legacy types,
      and LWP which is system-applied for unapproved absences).
    Returns each type with the employee's current allocated, used and remaining
    balance for the active period."""
    from frappe.utils import today

    emp = _get_employee()
    today_iso = today()

    types = frappe.get_all("Leave Type",
        filters={"pwa_visible": 1},
        fields=["name", "max_leaves_allowed", "is_earned_leave",
                "is_carry_forward", "include_holiday", "is_compensatory"],
        order_by="name asc")

    # Pull all current allocations once
    allocs = frappe.get_all("Leave Allocation",
        filters={"employee": emp.name, "docstatus": 1, "to_date": [">=", today_iso]},
        fields=["leave_type", "total_leaves_allocated"])
    alloc_by_type = {}
    for a in allocs:
        alloc_by_type[a.leave_type] = float(a.total_leaves_allocated or 0)

    # Pull all used (approved) leaves once
    used_rows = frappe.db.sql("""
        SELECT leave_type, SUM(total_leave_days) AS used
        FROM `tabLeave Application`
        WHERE employee=%s AND status='Approved' AND docstatus=1
        GROUP BY leave_type
    """, (emp.name,), as_dict=True)
    used_by_type = {r.leave_type: float(r.used or 0) for r in used_rows}

    result = []
    for t in types:
        allocated = alloc_by_type.get(t.name, 0)
        used = used_by_type.get(t.name, 0)
        result.append({
            "leave_type": t.name,
            "allocated": allocated,
            "used": used,
            "remaining": max(0, allocated - used),
            "is_earned_leave": t.is_earned_leave,
            "include_holiday": t.include_holiday,
        })
    return result


@frappe.whitelist()
def get_attendance_summary():
    """Today's attendance status + this-month late marks + open leaves.

    Surfaces the connection between attendance policy (late marks, half-day
    threshold) and leaves (pending applications, balance). Used by the
    PWA leave home + attendance screens."""
    from frappe.utils import today, getdate, get_first_day, get_last_day

    emp = _get_employee()
    today_iso = today()
    month_start = str(get_first_day(today_iso))
    month_end = str(get_last_day(today_iso))

    # Today's attendance record (if any) — submitted only
    att_today = frappe.db.get_value("Attendance",
        {"employee": emp.name, "attendance_date": today_iso, "docstatus": 1},
        ["name", "status", "in_time", "out_time", "working_hours"], as_dict=True)

    # Late marks this month (submitted-or-saved Late Mark records)
    late_marks_this_month = frappe.db.count("Late Mark",
        {"employee": emp.name, "date": ["between", [month_start, month_end]]})
    half_day_rolled_this_month = frappe.db.count("Late Mark",
        {"employee": emp.name, "date": ["between", [month_start, month_end]],
         "rolled_into_half_day": 1})
    # Straight half-days from check-in after 11:00 (Attendance rows)
    straight_half_days_this_month = frappe.db.count("Attendance",
        {"employee": emp.name, "status": "Half Day", "docstatus": 1,
         "attendance_date": ["between", [month_start, month_end]]})

    # Pending leave applications (not yet approved/rejected)
    pending_leaves = frappe.get_all("Leave Application",
        filters={"employee": emp.name, "status": "Open", "docstatus": 0},
        fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day"],
        order_by="from_date asc")

    # Approved upcoming leaves (today or future)
    upcoming_leaves = frappe.get_all("Leave Application",
        filters={"employee": emp.name, "status": "Approved", "docstatus": 1,
                 "to_date": [">=", today_iso]},
        fields=["name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day"],
        order_by="from_date asc",
        limit_page_length=5)

    # Overtime — only relevant when Employee.overtime_eligible
    emp_meta = frappe.db.get_value("Employee", emp.name,
        ["attendance_mode", "overtime_eligible"], as_dict=True) or {}
    ot_hours_total = 0.0
    ot_open_count = 0
    if emp_meta.get("overtime_eligible"):
        rows = frappe.db.sql("""
            SELECT IFNULL(SUM(ot_hours), 0) AS hrs,
                   SUM(CASE WHEN status='Open' THEN 1 ELSE 0 END) AS open_ct
            FROM `tabOvertime Log`
            WHERE employee=%s AND date BETWEEN %s AND %s
        """, (emp.name, month_start, month_end), as_dict=True)
        if rows:
            ot_hours_total = float(rows[0].hrs or 0)
            ot_open_count = int(rows[0].open_ct or 0)

    return {
        "attendance_mode": emp_meta.get("attendance_mode") or "Office",
        "overtime_eligible": int(emp_meta.get("overtime_eligible") or 0),
        "today": {
            "date": today_iso,
            "status": att_today.status if att_today else None,
            "in_time": _to_ist(att_today.in_time) if att_today and att_today.in_time else None,
            "out_time": _to_ist(att_today.out_time) if att_today and att_today.out_time else None,
            "working_hours": att_today.working_hours if att_today else None,
        },
        "this_month": {
            "late_marks": late_marks_this_month,
            "half_day_deductions": half_day_rolled_this_month,
            "straight_half_days": straight_half_days_this_month,
            "ot_hours": round(ot_hours_total, 2),
            "ot_open_count": ot_open_count,
            "month_start": month_start,
            "month_end": month_end,
        },
        "pending_leaves": pending_leaves,
        "upcoming_leaves": upcoming_leaves,
    }


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
    """List sales orders. Managers see all, field staff see own.
    Manufacturing roles see orders but without financial data."""
    tier = _get_nav_tier()
    user_roles = frappe.get_roles()
    is_production = ("Manufacturing User" in user_roles or "Manufacturing Manager" in user_roles)
    is_sales = ("Sales User" in user_roles or "Sales Manager" in user_roles
                or "Accounts User" in user_roles or "Accounts Manager" in user_roles)

    filters = [["company", "=", COMPANY], ["docstatus", "<", 2]]
    if tier == "field" and not is_production:
        filters.append(["owner", "=", frappe.session.user])
    if status and status != "All":
        if status == "Draft":
            filters.append(["docstatus", "=", 0])
        else:
            filters.append(["status", "=", status])

    if is_production and not is_sales:
        fields = ["name", "customer", "customer_name", "status",
                  "transaction_date", "delivery_date", "per_delivered",
                  "docstatus"]
    else:
        fields = ["name", "customer", "customer_name", "grand_total", "status",
                  "transaction_date", "delivery_date", "per_delivered", "per_billed",
                  "docstatus"]

    return frappe.get_list("Sales Order",
        filters=filters,
        fields=fields,
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


# ── CRM submit actions (advance the funnel) ──────────────────

@frappe.whitelist(methods=["POST"])
def submit_quotation(name):
    """Submit a draft Quotation. Same gate as create_quotation."""
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(_("You do not have permission to submit quotations"), frappe.PermissionError)
    doc = frappe.get_doc("Quotation", name)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft quotations can be submitted"))
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def submit_sales_order(name):
    """Submit a draft Sales Order. Same gate as create_sales_order_from_quotation."""
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(_("You do not have permission to submit sales orders"), frappe.PermissionError)
    doc = frappe.get_doc("Sales Order", name)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft sales orders can be submitted"))
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def submit_sales_invoice(name):
    """Submit a draft Sales Invoice. Requires Accounts Manager for field tier."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Accounts Manager" not in roles:
        frappe.throw(_("You do not have permission to submit invoices"), frappe.PermissionError)
    doc = frappe.get_doc("Sales Invoice", name)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft invoices can be submitted"))
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def submit_delivery_note(name):
    """Submit a draft Delivery Note. Requires Stock Manager for field tier."""
    tier = _get_nav_tier()
    roles = set(frappe.get_roles())
    if tier == "field" and "Stock Manager" not in roles:
        frappe.throw(_("You do not have permission to submit delivery notes"), frappe.PermissionError)
    doc = frappe.get_doc("Delivery Note", name)
    if doc.docstatus != 0:
        frappe.throw(_("Only draft delivery notes can be submitted"))
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


# ── SPANCO sales kanban ──────────────────────────────────────

@frappe.whitelist()
def get_spanco_kanban():
    """Return 6-stage SPANCO board: suspect, prospect, approach, negotiation, closing, order.

    Stage rules (one or two doctypes per stage; queries are kept simple):
        Suspect:     Lead.status in (Lead, Open)
        Prospect:    Lead.status='Interested' UNION Opportunity.status='Open' with no submitted Quotation
        Approach:    Opportunity.status='Replied'
        Negotiation: Quotation docstatus=1, status='Open'
        Closing:     Quotation docstatus=1, status='Open', quotation_temperature='Hot'
                     (these also appear in Negotiation — Closing column flags ones to push first)
        Order:       Sales Order docstatus=1, last 90 days

    Field-tier sees rows they own; manager+ sees all (within COMPANY for Opp/Quote/SO).
    """
    from frappe.utils import add_days, today

    tier = _get_nav_tier()
    own = (tier == "field")
    user = frappe.session.user
    cutoff = add_days(today(), -90)

    def _scope(filters):
        if own:
            filters["owner"] = user
        return filters

    sections = {}

    # Suspect — fresh leads. Capped at 200; cold-lead pool is large
    # (Apollo enrichment + organic) and 50 hides too much.
    suspect = frappe.get_all("Lead",
        filters=_scope({"status": ["in", ["Lead", "Open"]]}),
        fields=["name", "lead_name", "company_name", "source", "status",
                "creation", "modified", "mobile_no", "email_id"],
        order_by="creation desc",
        limit_page_length=200)
    for r in suspect:
        r["doctype"] = "Lead"
    sections["suspect"] = suspect

    # Prospect — interested leads + open opps without a submitted quotation
    interested = frappe.get_all("Lead",
        filters=_scope({"status": "Interested"}),
        fields=["name", "lead_name", "company_name", "source", "status",
                "creation", "modified", "mobile_no", "email_id"],
        order_by="creation desc",
        limit_page_length=50)
    for r in interested:
        r["doctype"] = "Lead"

    own_clause = "AND o.owner = %(user)s" if own else ""
    open_opps = frappe.db.sql(f"""
        SELECT o.name, o.party_name, o.customer_name, o.opportunity_amount,
               o.status, o.creation, o.modified, o.source,
               o.contact_email, o.contact_mobile
        FROM `tabOpportunity` o
        LEFT JOIN `tabQuotation` q
            ON q.opportunity = o.name AND q.docstatus = 1
        WHERE o.status = 'Open'
          AND o.company = %(company)s
          AND q.name IS NULL
          {own_clause}
        ORDER BY o.creation DESC
        LIMIT 50
    """, {"user": user, "company": COMPANY}, as_dict=True)
    for r in open_opps:
        r["doctype"] = "Opportunity"
    sections["prospect"] = interested + open_opps

    # Approach — opportunities the customer has engaged with
    approach = frappe.get_all("Opportunity",
        filters=_scope({"status": "Replied", "company": COMPANY}),
        fields=["name", "party_name", "customer_name", "opportunity_amount",
                "status", "creation", "modified", "source",
                "contact_email", "contact_mobile"],
        order_by="modified desc",
        limit_page_length=100)
    for r in approach:
        r["doctype"] = "Opportunity"
    sections["approach"] = approach

    # Negotiation — submitted quotations awaiting decision
    negotiation = frappe.get_all("Quotation",
        filters=_scope({"docstatus": 1, "status": "Open", "company": COMPANY}),
        fields=["name", "party_name", "customer_name", "grand_total", "status",
                "transaction_date", "modified", "valid_till",
                "quotation_temperature", "contact_email", "contact_mobile"],
        order_by="transaction_date desc",
        limit_page_length=100)
    for r in negotiation:
        r["doctype"] = "Quotation"
    sections["negotiation"] = negotiation

    # Closing — hot quotes (subset of Negotiation, intentionally duplicated)
    closing = frappe.get_all("Quotation",
        filters=_scope({"docstatus": 1, "status": "Open",
                        "quotation_temperature": "Hot", "company": COMPANY}),
        fields=["name", "party_name", "customer_name", "grand_total", "status",
                "transaction_date", "modified", "valid_till",
                "quotation_temperature"],
        order_by="transaction_date desc",
        limit_page_length=100)
    for r in closing:
        r["doctype"] = "Quotation"
    sections["closing"] = closing

    # Order — won, last 90 days
    orders = frappe.get_all("Sales Order",
        filters=_scope({"docstatus": 1, "company": COMPANY,
                        "transaction_date": [">=", cutoff]}),
        fields=["name", "customer_name", "customer", "grand_total", "status",
                "transaction_date", "modified", "delivery_date",
                "per_billed", "per_delivered"],
        order_by="transaction_date desc",
        limit_page_length=100)
    for r in orders:
        r["doctype"] = "Sales Order"
    sections["order"] = orders

    return {"sections": sections}


def _check_sales_role():
    """Field tier needs sales/marketing dept (or manager+)."""
    tier = _get_nav_tier()
    if tier == "field":
        emp = _get_employee()
        dept = (emp.get("department") or "").lower()
        if "sales" not in dept and "marketing" not in dept:
            frappe.throw(
                _("You do not have permission to move pipeline stages"),
                frappe.PermissionError,
            )


@frappe.whitelist(methods=["POST"])
def move_kanban_stage(doctype, name, target_stage,
                      lost_reason=None, lost_remark=None):
    """Move a SPANCO card to `target_stage`.

    Handles in-place status flips (Lead.status, Opp.status, Quote.quotation_temperature,
    Quote.status=Lost) and one cross-doctype create (Quote → Sales Order).

    Lead → Approach also creates an Opportunity (via ERPNext's make_opportunity).
    Opp → Negotiation needs items, so we return action='navigate' to send the user
    to the new-quotation form prefilled from the Opp.

    Returns {action, doctype, name, message}:
        action='updated': existing doc was changed
        action='created': new doc was created (caller routes there)
        action='navigate': caller routes to a form to finish input
    """
    _check_sales_role()

    if not doctype or not name or not target_stage:
        frappe.throw(_("doctype, name, and target_stage are required"))

    target = (target_stage or "").strip().lower()

    # ── Lead ─────────────────────────────────────────────────────
    if doctype == "Lead":
        doc = frappe.get_doc("Lead", name)
        if target == "suspect":
            doc.status = "Open"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Lead",
                    "name": name, "message": "Moved to Suspect"}
        if target == "prospect":
            doc.status = "Interested"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Lead",
                    "name": name, "message": "Moved to Prospect"}
        if target == "lost":
            # Lead status options don't include "Lost". "Do Not Contact"
            # is ERPNext's terminal cold-storage state for dead leads.
            doc.status = "Do Not Contact"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Lead",
                    "name": name, "message": "Marked as Lost"}
        if target == "approach":
            from erpnext.crm.doctype.lead.lead import make_opportunity
            opp = make_opportunity(name)
            opp.company = COMPANY
            opp.status = "Replied"
            opp.insert(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "created", "doctype": "Opportunity",
                    "name": opp.name,
                    "message": "Lead converted to Opportunity (Approach)"}
        frappe.throw(_("Cannot move a Lead directly to {0}").format(target_stage))

    # ── Opportunity ──────────────────────────────────────────────
    if doctype == "Opportunity":
        doc = frappe.get_doc("Opportunity", name)
        if target == "prospect":
            doc.status = "Open"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Opportunity",
                    "name": name, "message": "Moved to Prospect"}
        if target == "approach":
            doc.status = "Replied"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Opportunity",
                    "name": name, "message": "Moved to Approach"}
        if target == "lost":
            doc.status = "Lost"
            doc.save(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Opportunity",
                    "name": name, "message": "Marked as Lost"}
        if target == "negotiation":
            return {"action": "navigate",
                    "url": "#/quotations/new?opportunity=" + name,
                    "message": "Add items + submit to enter Negotiation"}
        frappe.throw(_("Cannot move an Opportunity directly to {0}").format(target_stage))

    # ── Quotation ────────────────────────────────────────────────
    if doctype == "Quotation":
        if target == "negotiation":
            frappe.db.set_value("Quotation", name, "quotation_temperature", "Warm")
            frappe.db.commit()
            return {"action": "updated", "doctype": "Quotation",
                    "name": name, "message": "Marked as Warm"}
        if target == "closing":
            frappe.db.set_value("Quotation", name, "quotation_temperature", "Hot")
            frappe.db.commit()
            return {"action": "updated", "doctype": "Quotation",
                    "name": name, "message": "Marked as Hot"}
        if target == "lost":
            updates = {
                "status": "Lost",
                "lost_reason_category": (lost_reason or "Other"),
                "lost_remark": (lost_remark or ""),
            }
            frappe.db.set_value("Quotation", name, updates)
            frappe.db.commit()
            return {"action": "updated", "doctype": "Quotation",
                    "name": name, "message": "Marked as Lost"}
        if target == "order":
            from erpnext.selling.doctype.quotation.quotation import make_sales_order
            so = make_sales_order(name)
            from frappe.utils import add_days, today as _today
            if not so.delivery_date:
                so.delivery_date = add_days(_today(), 30)
            so.insert(ignore_permissions=True)
            frappe.db.commit()
            return {"action": "created", "doctype": "Sales Order",
                    "name": so.name, "message": "Sales Order created"}
        frappe.throw(_("Cannot move a Quotation directly to {0}").format(target_stage))

    # ── Sales Order ──────────────────────────────────────────────
    if doctype == "Sales Order":
        frappe.throw(_("Sales Orders can only be cancelled from the desk"))

    frappe.throw(_("Unsupported doctype: {0}").format(doctype))


# ── Lost Reasons Dashboard ──────────────────────────────────

@frappe.whitelist()
def get_lost_reasons(period="90", owner=None):
    """Aggregate Lost quotations by reason category + recent drill-down.

    Args:
        period: "30", "90", "365", or "all"
        owner:  optional user-id filter (defaults to all)

    Returns:
        {
          "summary": [
            {"category": "Price", "count": 12, "amount": 4500000},
            ...
          ],
          "total_lost": {"count": 24, "amount": 9800000},
          "recent": [{name, customer_name, transaction_date, grand_total,
                      lost_reason_category, lost_remark, owner_name}, ...],
          "by_owner": [{owner, owner_name, count, amount}, ...],
          "period": "90",
          "from_date": "YYYY-MM-DD"
        }
    """
    _get_employee()

    # Period filter — only count submitted quotations marked Lost
    # (skip drafts and cancelled — those represent abandoned/rolled-back work,
    #  not lost deals)
    filters = {"status": "Lost", "docstatus": 1}
    from_date = None
    try:
        days = int(period) if period and period != "all" else None
    except (TypeError, ValueError):
        days = 90
    if days:
        from_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        filters["transaction_date"] = [">=", from_date]
    if owner:
        filters["owner"] = owner

    rows = frappe.get_all(
        "Quotation",
        filters=filters,
        fields=["name", "party_name", "customer_name", "transaction_date",
                "grand_total", "lost_reason_category", "lost_remark",
                "owner", "modified"],
        order_by="transaction_date desc",
        limit_page_length=0,
    )

    # Aggregate by category
    cat_buckets = {}
    owner_buckets = {}
    total_count = 0
    total_amount = 0.0
    for r in rows:
        cat = r.get("lost_reason_category") or "Unspecified"
        amt = float(r.get("grand_total") or 0)
        b = cat_buckets.setdefault(cat, {"category": cat, "count": 0, "amount": 0.0})
        b["count"] += 1
        b["amount"] += amt

        ow = r.get("owner") or "Unknown"
        ob = owner_buckets.setdefault(ow, {"owner": ow, "count": 0, "amount": 0.0})
        ob["count"] += 1
        ob["amount"] += amt

        total_count += 1
        total_amount += amt

    summary = sorted(cat_buckets.values(), key=lambda x: x["count"], reverse=True)

    # Resolve owner display names
    owner_names = {}
    if owner_buckets:
        owner_ids = list(owner_buckets.keys())
        users = frappe.get_all("User",
                               filters=[["name", "in", owner_ids]],
                               fields=["name", "full_name"])
        owner_names = {u["name"]: u.get("full_name") or u["name"] for u in users}

    by_owner = []
    for ow, b in owner_buckets.items():
        by_owner.append({
            "owner": ow,
            "owner_name": owner_names.get(ow, ow),
            "count": b["count"],
            "amount": b["amount"],
        })
    by_owner.sort(key=lambda x: x["count"], reverse=True)

    # Recent drill-down (last 25)
    recent = []
    for r in rows[:25]:
        recent.append({
            "name": r["name"],
            "customer_name": r.get("customer_name") or r.get("party_name") or "",
            "transaction_date": r.get("transaction_date").isoformat() if r.get("transaction_date") else None,
            "grand_total": float(r.get("grand_total") or 0),
            "lost_reason_category": r.get("lost_reason_category") or "Unspecified",
            "lost_remark": r.get("lost_remark") or "",
            "owner": r.get("owner"),
            "owner_name": owner_names.get(r.get("owner"), r.get("owner") or ""),
        })

    return {
        "summary": summary,
        "total_lost": {"count": total_count, "amount": total_amount},
        "recent": recent,
        "by_owner": by_owner,
        "period": str(period),
        "from_date": from_date,
    }


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


# ── Sales Interactions ─────────────────────────────────────────────────

@frappe.whitelist()
def get_interactions(search=None, customer=None, limit=50):
    """List sales interactions for the current employee (or team for managers)."""
    emp = _get_employee()
    tier = _get_nav_tier()

    filters = [["docstatus", "=", 1]]

    if customer:
        filters.append(["customer", "=", customer])
    elif tier == "field":
        filters.append(["employee", "=", emp.name])
    elif tier in ("manager", "admin"):
        pass  # see all

    if search:
        filters.append(["summary", "like", f"%{search}%"])

    return frappe.get_list("Sales Interaction",
        filters=filters,
        fields=["name", "date", "channel", "direction", "employee", "employee_name",
                "customer", "customer_name", "lead", "lead_name",
                "purpose", "summary", "outcome", "conversion_stage",
                "next_action", "next_action_date", "docstatus"],
        order_by="date desc, creation desc",
        limit_page_length=int(limit))


@frappe.whitelist()
def get_interaction(interaction_id):
    """Get a single sales interaction."""
    emp = _get_employee()
    doc = frappe.get_doc("Sales Interaction", interaction_id)
    tier = _get_nav_tier()
    if tier == "field" and doc.employee != emp.name:
        frappe.throw(_("Access denied"), frappe.PermissionError)
    return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def create_interaction(**kwargs):
    """Create a new sales interaction from the PWA."""
    emp = _get_employee()

    doc = frappe.new_doc("Sales Interaction")
    doc.employee = emp.name

    allowed_fields = [
        "date", "channel", "direction", "duration_minutes",
        "customer", "lead", "contact", "contact_phone",
        "purpose", "summary", "outcome",
        "opportunity", "quotation", "sales_order",
        "conversion_stage", "win_probability",
        "next_action", "next_action_date",
        "daily_call_report",
    ]
    for field in allowed_fields:
        val = kwargs.get(field)
        if val is not None and val != "":
            if field == "date" and "T" in str(val):
                val = str(val).replace("T", " ").replace("Z", "").split(".")[0][:10]
            doc.set(field, val)

    if not doc.date:
        doc.date = frappe.utils.today()

    if doc.customer and not frappe.db.exists("Customer", doc.customer):
        frappe.throw(_("Customer '{0}' not found").format(doc.customer))
    if doc.lead and not frappe.db.exists("Lead", doc.lead):
        frappe.throw(_("Lead '{0}' not found").format(doc.lead))

    doc.insert(ignore_permissions=True)
    doc.submit()
    frappe.db.commit()
    return doc.as_dict()


# ── Service Calls ────────────────────────────────────────────────


@frappe.whitelist()
def get_service_calls(date_from=None, date_to=None, outcome=None, channel=None,
                     scope="my", limit=50):
	"""List service calls. scope = my | team | all (manager+ only for team/all)."""
	emp = _get_employee()
	filters = []
	if scope == "my":
		filters.append(["employee", "=", emp.name])
	elif scope == "team":
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			filters.append(["employee", "=", emp.name])
		else:
			reports = frappe.get_all("Employee", filters={"reports_to": emp.name},
				pluck="name") or []
			reports.append(emp.name)
			filters.append(["employee", "in", reports])
	elif scope == "all":
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier != "admin":
			frappe.throw(_("Not allowed"), frappe.PermissionError)
	if date_from:
		filters.append(["call_datetime", ">=", date_from])
	if date_to:
		filters.append(["call_datetime", "<=", date_to])
	if outcome:
		filters.append(["outcome", "=", outcome])
	if channel:
		filters.append(["channel", "=", channel])

	return frappe.get_all("Service Call",
		filters=filters,
		fields=["name", "call_datetime", "employee", "employee_name",
		        "customer", "customer_name", "channel", "outcome",
		        "summary", "direction", "duration_minutes",
		        "device", "warranty_claim", "follow_up_dcr"],
		order_by="call_datetime desc",
		limit_page_length=int(limit) if limit else 50)


@frappe.whitelist(methods=["POST"])
def create_service_call(**kwargs):
	"""Create a Service Call from the PWA."""
	frappe.local.flags["from_pwa"] = True
	emp = _get_employee()
	doc = frappe.new_doc("Service Call")
	doc.employee = emp.name
	for field in ["call_datetime", "customer", "channel", "outcome", "summary",
	              "direction", "duration_minutes", "device", "warranty_claim",
	              "contact", "form_opened_at", "form_saved_at"]:
		if field in kwargs and kwargs[field] not in (None, ""):
			doc.set(field, kwargs[field])
	# Normalise client-supplied datetimes to naive IST.
	for dt_field in ("call_datetime", "form_opened_at", "form_saved_at"):
		val = doc.get(dt_field)
		if val:
			doc.set(dt_field, _normalise_dt_to_ist(val))
	if not doc.call_datetime:
		doc.call_datetime = frappe.utils.now()
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def get_service_call(svc_id):
	"""Read a single Service Call. Owner must match unless manager+."""
	emp = _get_employee()
	doc = frappe.get_doc("Service Call", svc_id)
	if doc.employee != emp.name:
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			frappe.throw(_("You do not have access to this call"), frappe.PermissionError)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def update_service_call(svc_id, remarks=None, **kwargs):
	"""Partial update. Truth-fields are guarded by service_call_guard."""
	frappe.local.flags["from_pwa"] = True
	emp = _get_employee()
	doc = frappe.get_doc("Service Call", svc_id)
	if doc.employee != emp.name:
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			frappe.throw(_("You do not have access to this call"), frappe.PermissionError)
	if remarks is not None:
		doc.remarks = remarks
	for field in ("direction", "duration_minutes", "device", "warranty_claim", "contact"):
		if field in kwargs and kwargs[field] not in (None, ""):
			doc.set(field, kwargs[field])
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def get_customer_context(customer_id):
	"""Form auto-suggests: recent devices, open warranty claims, recent calls, contacts."""
	if not customer_id:
		frappe.throw(_("customer_id required"))

	# DocType is "Serial No" on this site (used as the equipment register;
	# get_devices() above queries the same table).
	devices = frappe.get_all("Serial No",
		filters={"customer": customer_id},
		fields=["name as serial_no", "item_code", "item_name",
		        "warranty_expiry_date as warranty_expiry"],
		order_by="modified desc",
		limit_page_length=20) or []

	open_claims = frappe.get_all("Warranty Claim",
		filters={"customer": customer_id, "status": ["in", ["Open", "Work In Progress"]]},
		fields=["name", "complaint", "status", "complaint_date"],
		order_by="complaint_date desc",
		limit_page_length=20) or []

	recent_calls = frappe.get_all("Service Call",
		filters={"customer": customer_id},
		fields=["name", "call_datetime", "employee_name", "channel", "outcome", "summary"],
		order_by="call_datetime desc",
		limit_page_length=10) or []

	contacts = frappe.db.sql("""
		SELECT c.name, c.first_name, c.last_name, c.mobile_no
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
		WHERE dl.link_doctype = 'Customer' AND dl.link_name = %s
		ORDER BY c.is_primary_contact DESC, c.modified DESC
		LIMIT 5
	""", (customer_id,), as_dict=True) or []

	return {
		"devices": devices,
		"open_warranty_claims": open_claims,
		"recent_calls": recent_calls,
		"contacts": contacts,
	}


# ── Management Dashboard ──────────────────────────────────────────────

_DIRECTORS = {"harsh@dgoc.in", "njg@dgoc.in", "bng@dgoc.in"}


def _is_director(user=None):
	user = user or frappe.session.user
	return user in _DIRECTORS or "DSPL Director" in (frappe.get_roles(user) or [])


@frappe.whitelist()
def get_management_dashboard(company=None):
	"""Aggregate KPIs for the directors' dashboard. Same numbers as the
	desk Workspace 'Management', surfaced in one round-trip for the PWA.
	Restricted to DSPL Directors.

	`company` filters everything that has a company field. Empty/None =
	consolidated across all companies. Defaults to the user's default
	company so the PWA reflects the same toggle the desk uses."""
	if not _is_director():
		frappe.throw(_("Restricted to directors"), frappe.PermissionError)

	from frappe.utils import nowdate, get_first_day, add_days
	month_start = get_first_day(nowdate())
	thirty_ago = add_days(nowdate(), -30)
	year_start = get_first_day(nowdate()).replace(day=1)  # placeholder; FY logic below

	if company == "":
		company = None
	if company is None:
		company = frappe.defaults.get_user_default("Company")
	# `company=ALL` is an explicit opt-out, used by the PWA switcher when
	# the user picks "All companies".
	if company == "ALL":
		company = None

	def _co_clause(table_alias=""):
		"""Optional WHERE-AND clause for the current company filter."""
		if not company:
			return "", ()
		prefix = f"{table_alias}." if table_alias else ""
		return f"AND {prefix}company = %s", (company,)

	def _count(dt, filters, has_company=True):
		"""Count with the active company filter merged in when the doctype
		has a `company` column."""
		f = dict(filters)
		if company and has_company:
			f["company"] = company
		return int(frappe.db.count(dt, filters=f) or 0)

	def _scalar(sql, values=()):
		row = frappe.db.sql(sql, values)
		return float((row[0][0] if row and row[0][0] is not None else 0))

	# Pre-build the per-table company suffix once so the SQL stays readable
	co_si, co_si_vals = _co_clause("")  # for tabSales Invoice
	co_so, co_so_vals = _co_clause("")  # same suffix, kept for readability
	co_ea, co_ea_vals = _co_clause("")
	co_pi, co_pi_vals = _co_clause("")
	co_po, co_po_vals = _co_clause("")
	co_pe, co_pe_vals = _co_clause("")

	cash = {
		"outstanding_ar": _scalar(
			f"SELECT COALESCE(SUM(outstanding_amount),0) FROM `tabSales Invoice` "
			f"WHERE docstatus=1 AND outstanding_amount > 0 {co_si}",
			co_si_vals),
		"ar_over_30d": _scalar(
			f"SELECT COALESCE(SUM(outstanding_amount),0) FROM `tabSales Invoice` "
			f"WHERE docstatus=1 AND outstanding_amount > 0 AND due_date < %s {co_si}",
			(add_days(nowdate(), -30),) + co_si_vals),
		"ar_over_60d": _scalar(
			f"SELECT COALESCE(SUM(outstanding_amount),0) FROM `tabSales Invoice` "
			f"WHERE docstatus=1 AND outstanding_amount > 0 AND due_date < %s {co_si}",
			(add_days(nowdate(), -60),) + co_si_vals),
		"ar_over_90d": _scalar(
			f"SELECT COALESCE(SUM(outstanding_amount),0) FROM `tabSales Invoice` "
			f"WHERE docstatus=1 AND outstanding_amount > 0 AND due_date < %s {co_si}",
			(add_days(nowdate(), -90),) + co_si_vals),
		"draft_invoices": _count("Sales Invoice", {"docstatus": 0}),
		"unpaid_invoices": _count("Sales Invoice",
			{"docstatus": 1, "outstanding_amount": [">", 0]}),
	}
	sales = {
		"mtd_so_amount": _scalar(
			f"SELECT COALESCE(SUM(grand_total),0) FROM `tabSales Order` "
			f"WHERE docstatus=1 AND transaction_date >= %s {co_so}",
			(month_start,) + co_so_vals),
		"mtd_so_count": _count("Sales Order",
			{"docstatus": 1, "transaction_date": [">=", month_start]}),
		"mtd_quotations": _count("Quotation",
			{"docstatus": 1, "transaction_date": [">=", month_start]}),
		"mtd_quotation_amount": _scalar(
			f"SELECT COALESCE(SUM(grand_total),0) FROM `tabQuotation` "
			f"WHERE docstatus=1 AND transaction_date >= %s {co_so}",
			(month_start,) + co_so_vals),
		"mtd_new_leads": _count("Lead", {"creation": [">=", month_start]}, has_company=False),
		"open_opportunities": _count("Opportunity", {"status": "Open"}),
		"mtd_won_quotations": _count("Quotation",
			{"docstatus": 1, "status": "Ordered",
			 "transaction_date": [">=", month_start]}),
		"mtd_lost_quotations": _count("Quotation",
			{"docstatus": 1, "status": "Lost",
			 "transaction_date": [">=", month_start]}),
	}
	# Purchase
	purchase = {
		"mtd_po_amount": _scalar(
			f"SELECT COALESCE(SUM(grand_total),0) FROM `tabPurchase Order` "
			f"WHERE docstatus=1 AND transaction_date >= %s {co_po}",
			(month_start,) + co_po_vals),
		"pending_pos": _count("Purchase Order",
			{"docstatus": 1, "status": ["in", ["To Receive and Bill", "To Receive"]]}),
		"outstanding_ap": _scalar(
			f"SELECT COALESCE(SUM(outstanding_amount),0) FROM `tabPurchase Invoice` "
			f"WHERE docstatus=1 AND outstanding_amount > 0 {co_pi}",
			co_pi_vals),
		"unpaid_pinvoices": _count("Purchase Invoice",
			{"docstatus": 1, "outstanding_amount": [">", 0]}),
		"draft_pinvoices": _count("Purchase Invoice", {"docstatus": 0}),
		"open_material_requests": _count("Material Request",
			{"docstatus": 1, "status": "Pending"}),
	}
	# Payments
	payments = {
		"mtd_pe_in": _scalar(
			f"SELECT COALESCE(SUM(paid_amount),0) FROM `tabPayment Entry` "
			f"WHERE docstatus=1 AND payment_type='Receive' AND posting_date >= %s {co_pe}",
			(month_start,) + co_pe_vals),
		"mtd_pe_out": _scalar(
			f"SELECT COALESCE(SUM(paid_amount),0) FROM `tabPayment Entry` "
			f"WHERE docstatus=1 AND payment_type='Pay' AND posting_date >= %s {co_pe}",
			(month_start,) + co_pe_vals),
	}
	# People & HR — most of these are employee-scoped, so we filter Active
	# Employees by company first and pass that set down to each query
	emp_filters = {"status": "Active"}
	if company:
		emp_filters["company"] = company
	co_emp_ids = frappe.get_all("Employee", filters=emp_filters, pluck="name")
	people = {
		"active_employees": len(co_emp_ids),
		"pending_advances": _count("Employee Advance",
			{"docstatus": 0,
			 **({"employee": ["in", co_emp_ids]} if company else {})}),
		"pending_leaves": _count("Leave Application",
			{"status": "Open",
			 **({"employee": ["in", co_emp_ids]} if company else {})},
			has_company=False),
		"pending_expenses": _count("Expense Claim",
			{"approval_status": "Draft", "docstatus": 0,
			 **({"employee": ["in", co_emp_ids]} if company else {})}),
		"visits_today": _count("Daily Call Report",
			{"date": nowdate(),
			 **({"employee": ["in", co_emp_ids]} if company else {})},
			has_company=False),
		"advances_approved_mtd": _scalar(
			f"SELECT COALESCE(SUM(advance_amount),0) FROM `tabEmployee Advance` "
			f"WHERE docstatus=1 AND posting_date >= %s {co_ea}",
			(month_start,) + co_ea_vals),
		"on_leave_today": frappe.db.count("Leave Application",
			{"status": "Approved", "docstatus": 1,
			 "from_date": ["<=", nowdate()], "to_date": [">=", nowdate()],
			 **({"employee": ["in", co_emp_ids]} if company else {})}),
		"late_marks_today": (frappe.db.count("Late Mark",
			{"date": nowdate(),
			 **({"employee": ["in", co_emp_ids]} if company else {})})
			if frappe.db.exists("DocType", "Late Mark") else 0),
	}
	# Service & Operations — guard each in case the doctype isn't present.
	def _safe_count(dt, filters):
		try:
			return _count(dt, filters)
		except Exception:
			return 0
	service = {
		"open_breakdowns": _safe_count("Warranty Claim", {"status": "Open"}),
		"open_complaints": _safe_count("Issue", {"status": "Open"}),
		"open_service_calls": (frappe.db.count("Service Call",
			{"outcome": ["in", ["Pending", "Visit needed"]]})
			if frappe.db.exists("DocType", "Service Call") else 0),
		"amc_expiring_30d": (frappe.db.count("Warranty Claim",
			{"warranty_expiry_date": ["<=", add_days(nowdate(), 30)],
			 "warranty_expiry_date": [">=", nowdate()]})
			if frappe.db.exists("DocType", "Warranty Claim") else 0),
	}
	operations = {
		"active_sales_orders": _count("Sales Order",
			{"docstatus": 1, "status": ["in", ["To Deliver and Bill", "To Deliver"]]}),
		"active_so_amount": _scalar(
			f"SELECT COALESCE(SUM(grand_total - per_billed * grand_total / 100), 0) "
			f"FROM `tabSales Order` "
			f"WHERE docstatus=1 AND status IN ('To Deliver and Bill','To Deliver') {co_so}",
			co_so_vals),
		"pending_delivery_notes": _count("Delivery Note", {"docstatus": 0}),
		"active_work_orders": _count("Work Order",
			{"status": ["in", ["Not Started", "In Process"]]}),
		"completed_work_orders_mtd": _count("Work Order",
			{"status": "Completed",
			 "actual_end_date": [">=", month_start]}),
	}
	# Sparkline: last 30d daily SO total
	rows = frappe.db.sql(
		f"""SELECT transaction_date AS d, SUM(grand_total) AS v
		FROM `tabSales Order`
		WHERE docstatus=1 AND transaction_date >= %s {co_so}
		GROUP BY transaction_date ORDER BY transaction_date""",
		(thirty_ago,) + co_so_vals, as_dict=True) or []
	sales_30d = [{"d": str(r["d"]), "v": float(r["v"] or 0)} for r in rows]

	# Cash & Bank position — sum GL Entry balances on accounts where
	# account_type IN (Cash, Bank). Sign convention: debit is asset
	# increase, so balance = SUM(debit) - SUM(credit).
	co_acc, co_acc_vals = (" AND a.company = %s", (company,)) if company else ("", ())
	cash_rows = frappe.db.sql(
		f"""SELECT a.company, a.name AS account, a.account_name, a.account_type,
		           COALESCE(SUM(gle.debit - gle.credit), 0) AS balance
		FROM `tabAccount` a
		LEFT JOIN `tabGL Entry` gle
		     ON gle.account = a.name AND gle.is_cancelled = 0
		WHERE a.account_type IN ('Cash', 'Bank')
		  AND a.is_group = 0 AND a.disabled = 0 {co_acc}
		GROUP BY a.name
		HAVING balance != 0
		ORDER BY balance DESC""",
		co_acc_vals, as_dict=True) or []
	cash_position = {
		"total": sum(float(r["balance"] or 0) for r in cash_rows),
		"by_account": [{"company": r["company"], "account": r["account"],
		                "name": r["account_name"], "type": r["account_type"],
		                "balance": float(r["balance"] or 0)} for r in cash_rows[:8]],
	}

	# Top 5 overdue invoices by outstanding amount
	top_overdue = frappe.db.sql(
		f"""SELECT name, customer, customer_name, posting_date, due_date,
		           grand_total, outstanding_amount,
		           DATEDIFF(%s, due_date) AS days_overdue
		FROM `tabSales Invoice`
		WHERE docstatus=1 AND outstanding_amount > 0 AND due_date < %s {co_si}
		ORDER BY outstanding_amount DESC
		LIMIT 5""",
		(nowdate(), nowdate()) + co_si_vals, as_dict=True) or []
	top_overdue = [{"name": r["name"], "customer_name": r["customer_name"] or r["customer"],
	                "outstanding": float(r["outstanding_amount"] or 0),
	                "days_overdue": int(r["days_overdue"] or 0),
	                "due_date": str(r["due_date"])} for r in top_overdue]

	# Receivables aging — buckets in days past due
	ar_aging_rows = frappe.db.sql(
		f"""SELECT
		    CASE
		        WHEN DATEDIFF(%s, due_date) <= 0 THEN 'Not yet due'
		        WHEN DATEDIFF(%s, due_date) <= 30 THEN '0-30 days'
		        WHEN DATEDIFF(%s, due_date) <= 60 THEN '31-60 days'
		        WHEN DATEDIFF(%s, due_date) <= 90 THEN '61-90 days'
		        ELSE '90+ days'
		    END AS bucket,
		    COALESCE(SUM(outstanding_amount), 0) AS amount,
		    COUNT(*) AS count
		FROM `tabSales Invoice`
		WHERE docstatus=1 AND outstanding_amount > 0 {co_si}
		GROUP BY bucket""",
		(nowdate(), nowdate(), nowdate(), nowdate()) + co_si_vals, as_dict=True) or []
	# Force canonical order even if some buckets are empty
	_order = ["Not yet due", "0-30 days", "31-60 days", "61-90 days", "90+ days"]
	_lookup = {r["bucket"]: r for r in ar_aging_rows}
	ar_aging = [{"bucket": b,
	             "amount": float((_lookup.get(b) or {}).get("amount") or 0),
	             "count": int((_lookup.get(b) or {}).get("count") or 0)} for b in _order]

	return {
		"company": company,
		"cash": cash,
		"sales": sales,
		"purchase": purchase,
		"payments": payments,
		"people": people,
		"service": service,
		"operations": operations,
		"sales_30d": sales_30d,
		"cash_position": cash_position,
		"top_overdue": top_overdue,
		"ar_aging": ar_aging,
		"as_of": frappe.utils.now(),
	}


# ── Company switcher endpoints ─────────────────────────────────────

@frappe.whitelist()
def get_companies():
	"""List of companies for the director's company switcher. Public to
	authenticated users — the switcher itself is director-gated in the UI."""
	_get_employee()  # authenticated employees only
	rows = frappe.get_all("Company", fields=["name", "abbr"], order_by="abbr")
	return [{"name": r["name"], "abbr": r["abbr"]} for r in rows]


@frappe.whitelist(methods=["POST"])
def set_default_company(company=None):
	"""Set the user's default company so desk dashboards (which read
	`frappe.defaults.get_user_default("Company")` in their dynamic filters)
	pick up the same toggle as the PWA. company=None / "" clears it
	(consolidated view across companies)."""
	if not _is_director():
		frappe.throw(_("Restricted to directors"), frappe.PermissionError)
	user = frappe.session.user
	if company and company != "ALL":
		if not frappe.db.exists("Company", company):
			frappe.throw(_("Unknown company: {0}").format(company))
		frappe.defaults.set_user_default("Company", company, user=user)
	else:
		# Clear: ERPNext interprets blank as "all companies" in dashboards
		frappe.defaults.clear_user_default("Company", user=user)
	return {"company": company or None}
