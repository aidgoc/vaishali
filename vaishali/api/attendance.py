"""Attendance rules — late marks, half-day rollup, auto-LWP for unapproved absence.

Scheduler entry points (registered in hooks.py):
    daily 23:30: process_late_marks()
    monthly 1st: roll_late_marks_to_half_day()
    daily 23:00: mark_lwp_for_unapproved_absence()
"""
import frappe
from frappe.utils import getdate, today, add_days, get_datetime, nowdate
from datetime import time, timedelta

OFFICE_SHIFT = "Office Hours"
LATE_THRESHOLD = time(9, 30)  # 09:30 IST
HALF_DAY_THRESHOLD = 3  # 3 lates in a month → 1 half day


# ── Late-mark daily logger ────────────────────────────────────────

def process_late_marks(target_date=None):
    """For each Office-mode active employee, log a Late Mark if first IN is after 09:30.

    Idempotent: skips if a Late Mark already exists for (employee, date).
    """
    target_date = getdate(target_date or today())
    if _is_holiday(target_date):
        return

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active", "attendance_mode": "Office"},
        pluck="name",
    )
    created = 0
    for emp in employees:
        if frappe.db.exists("Late Mark", {"employee": emp, "date": target_date}):
            continue
        first_in = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='IN'
               AND DATE(time)=%s
               ORDER BY time ASC LIMIT 1""",
            (emp, target_date),
            as_dict=True,
        )
        if not first_in:
            continue  # absent — handled by mark_lwp_for_unapproved_absence
        checkin_dt = get_datetime(first_in[0]["time"])
        if checkin_dt.time() <= LATE_THRESHOLD:
            continue
        minutes_late = int((checkin_dt - checkin_dt.replace(
            hour=LATE_THRESHOLD.hour, minute=LATE_THRESHOLD.minute, second=0
        )).total_seconds() // 60)
        frappe.get_doc({
            "doctype": "Late Mark",
            "employee": emp,
            "date": target_date,
            "checkin_time": checkin_dt,
            "minutes_late": minutes_late,
        }).insert(ignore_permissions=True)
        created += 1
    frappe.db.commit()
    return {"date": str(target_date), "late_marks_created": created}


# ── Monthly rollup → Half-day Attendance ──────────────────────────

def roll_late_marks_to_half_day():
    """On the 1st of each month, count last-month's Late Marks per employee.

    Every 3 unrolled lates → one Attendance row with status='Half Day'.
    """
    today_d = getdate(nowdate())
    last_day = add_days(today_d.replace(day=1), -1)
    month_start = last_day.replace(day=1)
    employees_with_lates = frappe.db.sql(
        """SELECT employee, COUNT(*) AS late_count
           FROM `tabLate Mark`
           WHERE date BETWEEN %s AND %s AND IFNULL(rolled_into_half_day,0)=0
           GROUP BY employee""",
        (month_start, last_day),
        as_dict=True,
    )
    rolled = 0
    for row in employees_with_lates:
        half_days = row["late_count"] // HALF_DAY_THRESHOLD
        if not half_days:
            continue
        late_rows = frappe.get_all(
            "Late Mark",
            filters={
                "employee": row["employee"],
                "date": ["between", [month_start, last_day]],
                "rolled_into_half_day": 0,
            },
            fields=["name", "date"],
            order_by="date asc",
            limit=half_days * HALF_DAY_THRESHOLD,
        )
        for i in range(half_days):
            chunk = late_rows[i * HALF_DAY_THRESHOLD:(i + 1) * HALF_DAY_THRESHOLD]
            anchor_date = chunk[-1].date
            if not frappe.db.exists("Attendance", {
                "employee": row["employee"], "attendance_date": anchor_date
            }):
                frappe.get_doc({
                    "doctype": "Attendance",
                    "employee": row["employee"],
                    "attendance_date": anchor_date,
                    "status": "Half Day",
                    "shift": OFFICE_SHIFT,
                }).insert(ignore_permissions=True).submit()
                rolled += 1
            for lm in chunk:
                frappe.db.set_value("Late Mark", lm.name, "rolled_into_half_day", 1)
    frappe.db.commit()
    return {"month": str(month_start), "half_days_created": rolled}


# ── Auto-LWP for unapproved absence ───────────────────────────────

def mark_lwp_for_unapproved_absence(target_date=None):
    """Daily 23:00: for Office-mode employees with no checkin and no approved leave, mark LWP."""
    target_date = getdate(target_date or today())
    if _is_holiday(target_date):
        return {"date": str(target_date), "lwp_marked": 0, "reason": "holiday"}

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active", "attendance_mode": "Office"},
        fields=["name", "company"],
    )
    marked = 0
    for emp in employees:
        if frappe.db.exists("Employee Checkin", {
            "employee": emp.name, "time": ["between", [
                f"{target_date} 00:00:00", f"{target_date} 23:59:59"
            ]],
        }):
            continue
        on_approved_leave = frappe.db.sql(
            """SELECT 1 FROM `tabLeave Application`
               WHERE employee=%s AND status='Approved' AND docstatus=1
               AND %s BETWEEN from_date AND to_date LIMIT 1""",
            (emp.name, target_date),
        )
        if on_approved_leave:
            continue
        if frappe.db.exists("Attendance", {
            "employee": emp.name, "attendance_date": target_date
        }):
            continue
        try:
            frappe.get_doc({
                "doctype": "Attendance",
                "employee": emp.name,
                "attendance_date": target_date,
                "status": "On Leave",
                "leave_type": "Leave Without Pay",
                "company": emp.company,
            }).insert(ignore_permissions=True).submit()
            marked += 1
        except Exception as e:
            frappe.log_error(f"Auto-LWP failed for {emp.name}: {e}", "Auto-LWP")
    frappe.db.commit()
    return {"date": str(target_date), "lwp_marked": marked}


# ── Helpers ───────────────────────────────────────────────────────

def _is_holiday(d):
    """True if d is in any active Holiday List."""
    return bool(frappe.db.sql(
        "SELECT 1 FROM `tabHoliday` WHERE holiday_date=%s LIMIT 1", (d,)
    ))
