---
name: Leave + Attendance system shipped (2026-04-30)
description: DSPL leave policy, late-mark logger, auto-LWP, monthly half-day rollup, and the Office-vs-Field attendance-mode split. Field-mode is exempt from all attendance enforcement.
type: project
originSessionId: 26b463ef-1334-4e3e-8736-23448a7468dd
---
Shipped end-to-end on 2026-04-30 (commits `13c8451` through `54aa946`).

## What's now live

**Leave policy (encoded in ERPNext)**
- 12 Paid Leave / year (earned monthly)
- 6 Sick Leave / year (earned monthly)
- LWP available
- FY 2026-27 Leave Period
- DSPL Standard Leave Policy assigned in bulk to all 179 active employees → **454 Leave Allocations** created
- Holiday List resolved per company

**Setup scripts (idempotent, run with `bench execute`):**
- `vaishali.setup_leave_policy.run` — creates the policy + bulk-assigns + adds HR CC + adds `cancellation_reason` custom field on Leave Application
- `vaishali.setup_attendance.run` — creates Office Hours shift (09:00–18:00, 30 min grace) + `attendance_mode` (Office/Field) custom field on Employee + Late Mark DocType + auto-classifies Sales/Service depts as Field

**Runtime guards (`vaishali/leave_guard.py`)**
- `validate(doc, method)` on Leave Application:
  - Advance-notice tiers: 1d → 3d notice, 2-3d → 7d, 4-10d → 30d, 11+d → 30d
  - Sick Leave > 2 days requires file attachment
  - Sick Leave **exempt** from advance notice (verbal-intimation carve-out)
- `cc_hr_on_notification` on Leave Application on_update — adds `info@dgoc.in` to every notification email
- New endpoint `vaishali.api.field.cancel_approved_leave(name, reason)` — mandatory reason, sends thread-reply email to manager + HR

**Scheduler entries (`scheduler_events.cron` in `hooks.py`)**
- `30 23 * * *` (23:30 daily) → `vaishali.api.attendance.process_late_marks` — Office-mode only, IN > 09:30 logs Late Mark
- `0 23 * * *` (23:00 daily) → `vaishali.api.attendance.mark_lwp_for_unapproved_absence` — Office-mode with no IN and no approved leave gets auto-LWP Attendance row
- `0 1 1 * *` (1st of month, 01:00) → `vaishali.api.attendance.roll_late_marks_to_half_day` — every 3 unrolled lates → 1 Half Day Attendance

**Office geofence on `create_checkin`** — Office-mode only. `site_config.json::office_geofence` (lat/lon/radius_m, default 200m). Field-mode bypasses entirely.

## ⚠️ Attendance-mode rule (DON'T forget)

**Field-mode employees are exempt from all attendance enforcement** — late marks, auto-LWP, geofence. They can check in/out at any time, from anywhere.

Sales and Service field staff are auto-classified as Field by `setup_attendance.run`. Anyone with `Employee.attendance_mode = "Field"` is exempt.

**Reporting rule:** when generating attendance reports or AI agent answers, never flag a Field-mode employee for "late arrival" or "early departure" — those concepts don't exist for them. Legitimate Field-mode flags: misclicks (IN→OUT in <60s), missing GPS (data quality, not enforcement), or no check-in at all (hard to interpret without business context).

## Files

- `vaishali/api/attendance.py` — schedulers + late mark / LWP / rollup logic
- `vaishali/leave_guard.py` — Leave Application validate + HR CC
- `vaishali/setup_leave_policy.py` — idempotent setup
- `vaishali/setup_attendance.py` — idempotent setup
- `vaishali/api/field.py::create_checkin` — geofence enforcement (Office-mode)
- `vaishali/api/field.py::cancel_approved_leave` — new endpoint
- `vaishali/vaishali/doctype/late_mark/` — new DocType (custom fields frozen in fixtures)

## Today's snapshot (2026-04-30 16:35 IST)

- 22 / 179 active employees checked in (12% overall, **50% of the 44 DSPL ex-DCEPL base**)
- Service: 9/13 (69%, best adopting cohort)
- Sales: 5/8, Production: 4/7, R&D: 2/5
- 100% of check-ins captured GPS — geofence working
- 0 approved leaves today (auto-LWP cron at 23:00 will mark 7 unaccounted DSPL employees)
- Raghuvir Joshi at 09:31 (Field, no late mark applies)
- Dnyaneshwar Chavan IN→OUT in 8s — misclick, only legitimate flag
- Report saved at `~/Desktop/dspl-attendance-2026-04-30.html` (also sent to Jarvis Telegram msg_id 869)
