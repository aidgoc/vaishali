"""Attendance rules — late marks, half-day rollup, auto-LWP, overtime.

Scheduler entry points (registered in hooks.py):
    daily 23:00: mark_lwp_for_unapproved_absence()
    daily 23:30: process_late_marks()
    daily 23:35: mark_present_attendance()
    daily 23:45: compute_overtime()
    monthly 1st: roll_late_marks_to_half_day()

DSPL/DCEPL attendance policy (Office mode only):
- 09:00 shift start, 09:30 grace cutoff
- 09:31–11:00 first IN → Late Mark (3 in a calendar month → 1 Half Day)
- After 11:00 first IN → straight Half Day (Attendance row + Late Mark
  with rolled_into_half_day=1 so it isn't counted twice in the rollup)
- No checkin and no approved leave → auto-LWP via Leave Without Pay

Overtime:
- Per-Employee Custom Field `overtime_eligible` (default 0)
- For eligible employees with both IN and OUT logs, daily cron creates
  an Overtime Log row with regular_hours capped at REGULAR_HOURS_CAP
  and the rest as ot_hours
"""
import frappe
from frappe.utils import getdate, today, add_days, get_datetime, nowdate
from datetime import time, timedelta, timezone

OFFICE_SHIFT = "Office Hours"
LATE_THRESHOLD = time(9, 30)             # 09:30 IST → late mark
STRAIGHT_HALF_DAY_THRESHOLD = time(11, 0)  # 11:00 IST → straight half day
HALF_DAY_THRESHOLD = 3  # 3 lates in a month → 1 half day
REGULAR_HOURS_CAP = 9.0  # daily hours beyond this count as overtime

# Post-2026-05-06 migration: Employee Checkin.time is stored as naive
# IST (the rest of the app — DCR, Late Mark, Attendance, Service Call —
# was already on this convention). Date-window filters and threshold
# comparisons can run directly against the IST calendar day. Helpers
# kept for backwards compatibility but now no-op shift.
_IST = timezone(timedelta(hours=5, minutes=30))


def _ist_day_window(target_date):
    """Return (start_str, end_str) covering the IST calendar day
    `target_date`. Used in SQL WHERE clauses against naive-IST datetime
    columns."""
    return (
        f"{target_date} 00:00:00",
        f"{target_date} 23:59:59",
    )


# ── Late-mark daily logger ────────────────────────────────────────

def process_late_marks(target_date=None):
    """For each Office-mode active employee, apply the late-mark / half-day rules.

    - First IN ≤ 09:30 → no action
    - 09:31 – 11:00 → Late Mark (rolled_into_half_day=0)
    - After 11:00 → Late Mark (rolled_into_half_day=1) AND submitted Attendance
      row with status='Half Day' so the deduction is immediate, not deferred to
      the monthly rollup. The flagged Late Mark prevents the rollup from
      double-counting it.

    Idempotent: skips if a Late Mark already exists for (employee, date).
    """
    target_date = getdate(target_date or today())
    if _is_holiday(target_date):
        return

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active", "attendance_mode": "Office"},
        fields=["name", "company"],
    )
    late_created = 0
    half_day_created = 0
    day_start, day_end = _ist_day_window(target_date)
    for emp in employees:
        if frappe.db.exists("Late Mark", {"employee": emp.name, "date": target_date}):
            continue
        first_in = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='IN'
               AND time >= %s AND time <= %s
               ORDER BY time ASC LIMIT 1""",
            (emp.name, day_start, day_end),
            as_dict=True,
        )
        if not first_in:
            continue  # absent — handled by mark_lwp_for_unapproved_absence
        # Employee Checkin.time is naive IST; compare directly against the
        # IST threshold walls.
        checkin_dt = get_datetime(first_in[0]["time"])
        ist_time = checkin_dt.time()
        if ist_time <= LATE_THRESHOLD:
            continue

        is_straight_half_day = ist_time > STRAIGHT_HALF_DAY_THRESHOLD
        minutes_late = int((
            ist_time.hour * 60 + ist_time.minute
            - (LATE_THRESHOLD.hour * 60 + LATE_THRESHOLD.minute)
        ))
        frappe.get_doc({
            "doctype": "Late Mark",
            "employee": emp.name,
            "date": target_date,
            "checkin_time": checkin_dt,
            "minutes_late": minutes_late,
            # If we are creating the Half Day attendance row immediately, mark
            # the Late Mark as already rolled so the monthly cron skips it.
            "rolled_into_half_day": 1 if is_straight_half_day else 0,
        }).insert(ignore_permissions=True)
        late_created += 1

        if is_straight_half_day and not frappe.db.exists("Attendance", {
            "employee": emp.name, "attendance_date": target_date
        }):
            try:
                frappe.get_doc({
                    "doctype": "Attendance",
                    "employee": emp.name,
                    "attendance_date": target_date,
                    "status": "Half Day",
                    "shift": OFFICE_SHIFT,
                    "company": emp.company,
                    "in_time": checkin_dt,
                }).insert(ignore_permissions=True).submit()
                half_day_created += 1
            except Exception as e:
                frappe.log_error(
                    f"Straight half-day failed for {emp.name} on {target_date}: {e}",
                    "Straight Half Day"
                )
    frappe.db.commit()
    return {
        "date": str(target_date),
        "late_marks_created": late_created,
        "half_days_created": half_day_created,
    }


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
        emp_company = frappe.db.get_value("Employee", row["employee"], "company")
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
                    # Attendance requires `company` — was missing previously
                    # so the rollup crashed mid-loop on the 1st of every month.
                    "company": emp_company,
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
    day_start, day_end = _ist_day_window(target_date)
    for emp in employees:
        # Employee Checkin.time is naive IST → filter by IST calendar day.
        if frappe.db.sql(
            """SELECT 1 FROM `tabEmployee Checkin`
               WHERE employee=%s AND time >= %s AND time <= %s LIMIT 1""",
            (emp.name, day_start, day_end),
        ):
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


# ── Overtime — daily compute for OT-eligible employees ───────────

def compute_overtime(target_date=None):
    """For each Active Office-mode employee with overtime_eligible=1, log
    overtime hours into the custom Overtime Log DocType.

    Hours model:
        total_hours = (last OUT − first IN) − 1h break
        regular_hours = min(total_hours, REGULAR_HOURS_CAP)
        ot_hours = max(0, total_hours − REGULAR_HOURS_CAP)

    Idempotent: skips (employee, date) pairs that already have an
    Overtime Log row.
    """
    target_date = getdate(target_date or today())
    if _is_holiday(target_date):
        # Holiday work counts entirely as overtime
        all_eligible = frappe.get_all(
            "Employee",
            filters={"status": "Active", "overtime_eligible": 1},
            fields=["name", "company"],
        )
        return _create_ot_logs(all_eligible, target_date, holiday=True)

    eligible = frappe.get_all(
        "Employee",
        filters={"status": "Active", "overtime_eligible": 1},
        fields=["name", "company"],
    )
    return _create_ot_logs(eligible, target_date, holiday=False)


def _create_ot_logs(employees, target_date, holiday=False):
    created = 0
    day_start, day_end = _ist_day_window(target_date)
    for emp in employees:
        if frappe.db.exists("Overtime Log", {"employee": emp.name, "date": target_date}):
            continue
        first_in_row = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='IN'
               AND time >= %s AND time <= %s ORDER BY time ASC LIMIT 1""",
            (emp.name, day_start, day_end), as_dict=True,
        )
        last_out_row = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='OUT'
               AND time >= %s AND time <= %s ORDER BY time DESC LIMIT 1""",
            (emp.name, day_start, day_end), as_dict=True,
        )
        if not first_in_row or not last_out_row:
            continue  # incomplete — skip; will retry only if cron re-runs
        # Employee Checkin.time is naive IST — use directly.
        first_in = get_datetime(first_in_row[0]["time"])
        last_out = get_datetime(last_out_row[0]["time"])
        if last_out <= first_in:
            continue
        gross = (last_out - first_in).total_seconds() / 3600.0
        # 1h unpaid lunch deducted from working day; not from holiday work
        total_hours = round(max(0.0, gross - (0.0 if holiday else 1.0)), 2)
        if holiday:
            regular = 0.0
            ot = total_hours
        else:
            regular = min(total_hours, REGULAR_HOURS_CAP)
            ot = max(0.0, total_hours - REGULAR_HOURS_CAP)
        if ot <= 0 and not holiday:
            continue  # no OT to log
        try:
            frappe.get_doc({
                "doctype": "Overtime Log",
                "employee": emp.name,
                "date": target_date,
                "in_time": first_in,
                "out_time": last_out,
                "total_hours": total_hours,
                "regular_hours": round(regular, 2),
                "ot_hours": round(ot, 2),
                "is_holiday_work": 1 if holiday else 0,
                # Pirangut policy: 1:1 OT pay rate. Payroll multiplies
                # ot_hours × pay_multiplier × hourly_rate.
                "pay_multiplier": 1.0,
                "status": "Open",
                "company": emp.company,
            }).insert(ignore_permissions=True)
            created += 1
        except Exception as e:
            frappe.log_error(
                f"OT log failed for {emp.name} on {target_date}: {e}",
                "Overtime Log",
            )
    frappe.db.commit()
    return {"date": str(target_date), "ot_logs_created": created, "holiday": holiday}


# ── Mark Present Attendance ───────────────────────────────────────

OFFICE_LUNCH_HOURS = 1.0  # unpaid lunch deducted from working_hours for Office mode


def mark_present_attendance(target_date=None):
    """Daily 23:35: for each employee with at least one IN checkin and no
    existing Attendance row for the day, create a submitted Attendance row
    with status='Present'.

    Runs *after* `process_late_marks` (which may have inserted Half Day
    rows for 11:00+ first-IN) and `mark_lwp_for_unapproved_absence`
    (which inserts LWP rows for unapproved absences). Both leave the
    existing Attendance row in place; this job only fills the gap for
    employees who came in but have no row yet.

    Holidays: skipped via _is_holiday — same as the other crons.

    Field-mode is included (they check in on the PWA too). They get a
    Present row but no late_entry flag (no shift threshold to compare).
    """
    target_date = getdate(target_date or today())
    if _is_holiday(target_date):
        return {"date": str(target_date), "marked": 0, "reason": "holiday"}

    employees = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "company", "department", "default_shift",
                "attendance_mode"],
    )

    day_start, day_end = _ist_day_window(target_date)
    marked = 0
    skipped_existing = 0
    skipped_no_company = 0

    for emp in employees:
        if not emp.company:
            skipped_no_company += 1
            continue

        # Idempotent — leave any existing Attendance row alone (Half Day
        # from late mark cron, LWP from absence cron, leave-derived,
        # manually corrected).
        if frappe.db.exists("Attendance", {
            "employee": emp.name, "attendance_date": target_date,
            "docstatus": ["!=", 2],  # not cancelled
        }):
            skipped_existing += 1
            continue

        # First IN and last OUT for this IST day
        in_row = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='IN'
               AND time >= %s AND time <= %s
               ORDER BY time ASC LIMIT 1""",
            (emp.name, day_start, day_end), as_dict=True,
        )
        if not in_row:
            continue  # absent — Office handled by LWP cron, Field just absent

        out_row = frappe.db.sql(
            """SELECT time FROM `tabEmployee Checkin`
               WHERE employee=%s AND log_type='OUT'
               AND time >= %s AND time <= %s
               ORDER BY time DESC LIMIT 1""",
            (emp.name, day_start, day_end), as_dict=True,
        )

        in_time = get_datetime(in_row[0]["time"])
        out_time = get_datetime(out_row[0]["time"]) if out_row else None

        working_hours = None
        if out_time and out_time > in_time:
            gross = (out_time - in_time).total_seconds() / 3600.0
            lunch = OFFICE_LUNCH_HOURS if (emp.attendance_mode or "Office") == "Office" else 0.0
            working_hours = round(max(0.0, gross - lunch), 2)

        # Office staff: flag late_entry if first IN crossed the grace
        # threshold. Field staff have no shift wall — never flagged.
        late_entry = 0
        if (emp.attendance_mode or "Office") == "Office" and in_time.time() > LATE_THRESHOLD:
            late_entry = 1

        try:
            doc = frappe.get_doc({
                "doctype": "Attendance",
                "employee": emp.name,
                "attendance_date": target_date,
                "status": "Present",
                "company": emp.company,
                "department": emp.department,
                "shift": emp.default_shift if (emp.attendance_mode or "Office") == "Office" else None,
                "in_time": in_time,
                "out_time": out_time,
                "working_hours": working_hours,
                "late_entry": late_entry,
            })
            doc.insert(ignore_permissions=True)
            doc.submit()
            marked += 1
        except Exception as e:
            frappe.log_error(
                f"Mark-present failed for {emp.name} on {target_date}: {e}",
                "Mark Present Attendance",
            )

    frappe.db.commit()
    return {
        "date": str(target_date),
        "marked": marked,
        "skipped_existing": skipped_existing,
        "skipped_no_company": skipped_no_company,
    }


@frappe.whitelist()
def backfill_present_attendance(from_date, to_date=None):
    """Re-run mark_present_attendance for each date in [from_date, to_date].

    Skips dates that are already covered (the underlying job is idempotent
    on existing Attendance rows). Useful to populate the gap from any
    point in the past up to yesterday.

    Admin only — guarded by `frappe.only_for(["System Manager"])`.
    """
    frappe.only_for(["System Manager"])
    start = getdate(from_date)
    end = getdate(to_date) if to_date else getdate(today())
    if end < start:
        frappe.throw("to_date must be ≥ from_date")

    cursor = start
    summary = []
    while cursor <= end:
        result = mark_present_attendance(cursor)
        summary.append(result)
        cursor = add_days(cursor, 1)
    return {"days_processed": len(summary), "details": summary}


# ── Helpers ───────────────────────────────────────────────────────

def _is_holiday(d, holiday_list=None):
    """True if d is in the named Holiday List, or in any default Company
    Holiday List when holiday_list is None.

    Defaulting to "any holiday on any list" was the previous behaviour, but
    that incorrectly treated a DCEPL workshop holiday as a holiday for DSPL
    Office staff too. We now restrict to the active companies' default
    holiday lists."""
    if holiday_list:
        return bool(frappe.db.sql(
            "SELECT 1 FROM `tabHoliday` WHERE holiday_date=%s AND parent=%s LIMIT 1",
            (d, holiday_list),
        ))
    company_lists = frappe.get_all(
        "Company",
        filters={"default_holiday_list": ["is", "set"]},
        pluck="default_holiday_list",
    )
    if not company_lists:
        return False
    placeholders = ", ".join(["%s"] * len(company_lists))
    return bool(frappe.db.sql(
        f"SELECT 1 FROM `tabHoliday` WHERE holiday_date=%s AND parent IN ({placeholders}) LIMIT 1",
        tuple([d] + list(company_lists)),
    ))
