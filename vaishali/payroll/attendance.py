"""Synthesise Mar 2026 Attendance from Excel attendance sheets — only if
existing Attendance is sparse. The live PWA check-in system populates
Attendance daily; we don't want to duplicate or overwrite real data.

Strategy:
  1. Count existing Mar 2026 Attendance records.
  2. If >= 100, skip synthesis — existing data is the source of truth.
  3. If < 100, create one Attendance per (employee, working day) based
     on Excel days_present + unpaid_leaves columns.
"""
from __future__ import annotations
from datetime import date, timedelta
import frappe

from vaishali.payroll.ingest import excel_path
from vaishali.payroll.ingest.parse_dcepl_staff import parse as parse_a
from vaishali.payroll.ingest.parse_dspl_staff import parse as parse_b
from vaishali.payroll.ingest.parse_dcepl_operator import parse as parse_c
from vaishali.payroll.ingest.parse_overhead import parse as parse_d


MAR_START = date(2026, 3, 1)
MAR_DAYS = 31
SKIP_THRESHOLD = 100


def existing_count() -> int:
    return frappe.db.count("Attendance", {
        "attendance_date": ["between", ["2026-03-01", "2026-03-31"]],
    })


def _emp(emp_code, name="", expected_company=None):
    """Resolve emp_code → Employee.name with name fallback. Same shape as
    vaishali.payroll.ssa._resolve_employee."""
    import re
    if emp_code and re.match(r"^[A-Z]+\d+$", str(emp_code)):
        row = frappe.db.get_value(
            "Employee",
            {"legacy_emp_code": emp_code, "status": "Active"},
            ["name", "company"],
        )
        if row:
            if expected_company and row[1] != expected_company:
                return None, None
            return row[0], row[1]
    if not name:
        return None, None
    filters = {"employee_name": ["like", name], "status": "Active"}
    if expected_company:
        filters["company"] = expected_company
    res = frappe.db.get_value("Employee", filters, ["name", "company"])
    if res:
        return res[0], res[1]
    return None, None


def _employment_window(emp: str) -> tuple[date, date]:
    """Return (window_start, window_end) clamped to Mar 2026 by the
    employee's date_of_joining and relieving_date. HRMS rejects
    attendance before DOJ or after relieving."""
    from frappe.utils import getdate
    doj, relieving = frappe.db.get_value(
        "Employee", emp, ["date_of_joining", "relieving_date"]
    ) or (None, None)
    start = MAR_START
    end = MAR_START + timedelta(days=MAR_DAYS - 1)
    if doj:
        d = getdate(doj)
        if d > start:
            start = d
    if relieving:
        d = getdate(relieving)
        if d < end:
            end = d
    return start, end


def _create_attendance(emp: str, company: str, day: date, status: str,
                       leave_type: str = None) -> str:
    if frappe.db.exists("Attendance", {"employee": emp, "attendance_date": day}):
        return "skipped-existing"
    doc = frappe.new_doc("Attendance")
    doc.employee = emp
    doc.attendance_date = day
    doc.status = status
    doc.company = company
    if leave_type:
        doc.leave_type = leave_type
    doc.insert(ignore_permissions=True)
    doc.submit()
    return doc.name


def synthesise_for(rows, days_present_key, unpaid_leaves_key, expected_company=None) -> dict:
    counts = {"created": 0, "skipped": 0, "missing_employee": 0}
    for row in rows:
        ec = str(row.get("emp_code") or "").strip()
        nm = str(row.get("name") or "").strip()
        emp, company = _emp(ec, nm, expected_company)
        if not emp:
            counts["missing_employee"] += 1
            continue
        days_present = int(float(row.get(days_present_key) or 0))
        unpaid = int(float(row.get(unpaid_leaves_key) or 0)) if unpaid_leaves_key else 0
        # Clamp to employee's actual employment window — HRMS rejects
        # attendance dates before DOJ or after relieving_date.
        win_start, win_end = _employment_window(emp)
        window_days = (win_end - win_start).days + 1
        if window_days <= 0:
            counts["skipped"] += days_present + unpaid
            continue
        days_present = min(days_present, window_days)
        unpaid = min(unpaid, window_days - days_present)
        for offset in range(days_present):
            r = _create_attendance(emp, company, win_start + timedelta(days=offset), "Present")
            if r != "skipped-existing":
                counts["created"] += 1
            else:
                counts["skipped"] += 1
        for offset in range(days_present, days_present + unpaid):
            r = _create_attendance(
                emp, company, win_start + timedelta(days=offset),
                "On Leave", leave_type="Leave Without Pay",
            )
            if r != "skipped-existing":
                counts["created"] += 1
            else:
                counts["skipped"] += 1
    frappe.db.commit()
    return counts


DCEPL = "Dynamic Crane Engineers Private Limited"
DSPL = "Dynamic Servitech Private Limited"


def _synth_dcepl_staff() -> dict:
    return synthesise_for(
        list(parse_a(excel_path("dcepl_staff"))),
        "days_worked", None, expected_company=DCEPL,
    )


def _synth_dspl_staff() -> dict:
    return synthesise_for(
        list(parse_b(excel_path("dspl_staff"))),
        "days_worked", None, expected_company=DSPL,
    )


def _synth_operator() -> dict:
    return synthesise_for(
        list(parse_c(excel_path("dcepl_operator"))),
        "days_present", None, expected_company=DCEPL,
    )


def _synth_overhead() -> dict:
    return synthesise_for(
        list(parse_d(excel_path("overhead"))),
        "days_present", None, expected_company=DSPL,
    )


def synthesise_all() -> dict:
    """Top-level entry. Skips if existing count >= 100."""
    n = existing_count()
    if n >= SKIP_THRESHOLD:
        print(f"  Skip: {n} Attendance records already exist for Mar 2026 — "
              f"trusting live PWA data.")
        return {"skipped": True, "existing": n}

    print(f"  Synthesising — existing count {n} < {SKIP_THRESHOLD}")
    s_dcepl = _synth_dcepl_staff()
    s_dspl = _synth_dspl_staff()
    o = _synth_operator()
    h = _synth_overhead()
    print(f"  DCEPL Staff: {s_dcepl}")
    print(f"  DSPL Staff:  {s_dspl}")
    print(f"  Operator:    {o}")
    print(f"  Overhead:    {h}")
    return {"dcepl_staff": s_dcepl, "dspl_staff": s_dspl,
            "operator": o, "overhead": h}


def force_synthesise_missing_pools() -> dict:
    """Run all four pools regardless of the global skip threshold. Each
    Attendance is still deduped on (employee, attendance_date), so this
    is safe to re-run after a partial failure. Used to recover from a
    crash that synthesised some pools but not others."""
    print("  Force-synthesising all pools (idempotent on existing rows)")
    s_dcepl = _synth_dcepl_staff()
    s_dspl = _synth_dspl_staff()
    o = _synth_operator()
    h = _synth_overhead()
    print(f"  DCEPL Staff: {s_dcepl}")
    print(f"  DSPL Staff:  {s_dspl}")
    print(f"  Operator:    {o}")
    print(f"  Overhead:    {h}")
    return {"dcepl_staff": s_dcepl, "dspl_staff": s_dspl,
            "operator": o, "overhead": h}
