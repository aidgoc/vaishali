---
name: mark_present_attendance cron + backfill helper
description: Daily 23:35 IST cron that writes status=Present Attendance rows for everyone with at least one IN checkin and no existing Attendance row, filling the gap left by Late Mark / LWP / OT crons.
type: project
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. **Commit:** `ce7f9c0`.

**Why:** Before this, the four custom attendance jobs (`mark_lwp_for_unapproved_absence`, `process_late_marks`, `compute_overtime`) only wrote rows for **exception cases** (LWP / Half Day / late). A regular present employee had **zero rows** in `tabAttendance`, breaking payroll days-paid math, HR dashboards, and any standard ERPNext attendance report.

**Cron schedule (now in `hooks.py` scheduler_events):**
- `00 23 * * *` — `mark_lwp_for_unapproved_absence` (Office-mode absences → LWP rows)
- `30 23 * * *` — `process_late_marks` (Late Mark + Half Day on >11:00 IN)
- **`35 23 * * *` — `mark_present_attendance` (this job — fills Present rows)**
- `45 23 * * *` — `compute_overtime` (Overtime Log from IN/OUT diff)
- `0 1 1 * *` — `roll_late_marks_to_half_day` (monthly late→half-day rollup)

**Rules in `mark_present_attendance(target_date=None)`:**
- Skips if `_is_holiday(target_date)`.
- Skips employees with an existing `Attendance` row (any `docstatus != 2`) for `(employee, attendance_date)` — Half Day from late marks, LWP from absence cron, leave-derived rows are preserved.
- Skips employees with no IN checkin for the IST day window.
- Computes `working_hours = (last_OUT − first_IN) − lunch` where lunch is 1.0h for Office mode, 0h for Field.
- Sets `late_entry=1` for Office-mode employees whose first IN > 09:30 IST. Field-mode is never flagged.
- Inserts and submits the row. Errors get logged via `frappe.log_error`.

**Field-mode treatment:** Included (sales/service field staff DO get Present rows when they check in), but no late_entry, no shift assignment. Consistent with the project rule "Field-mode is exempt from ALL attendance enforcement."

**Backfill helper:** `vaishali.api.attendance.backfill_present_attendance(from_date, to_date)`. Admin-only (`frappe.only_for(["System Manager"])`). Loops over each date in range, runs `mark_present_attendance` per day. Idempotent. Use:
```bash
bench --site dgoc.logstop.com execute vaishali.api.attendance.backfill_present_attendance \
  --kwargs "{'from_date':'2026-04-01','to_date':'2026-05-05'}"
```
**Note:** User explicitly said "no backfill, all of this is from this point onwards" on 2026-05-06. Don't run backfill without re-confirming.

**How to apply:** When debugging "why isn't this employee marked Present", check (1) did they actually check in on the IST day, (2) does an Attendance row already exist that the cron skipped, (3) was the date a holiday. The cron's stdout returns `{date, marked, skipped_existing, skipped_no_company}` — exec it manually for a target date to see counts:
```bash
bench --site dgoc.logstop.com execute vaishali.api.attendance.mark_present_attendance \
  --kwargs "{'target_date':'2026-05-06'}"
```
