---
name: Employee Checkin UTC→IST migration (2026-05-06)
description: One-shot migration that flipped Employee Checkin.time from naive UTC to naive IST and removed all UTC↔IST conversion helpers in the attendance pipeline. Every datetime column in this app is now naive IST.
type: project
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. **Commit:** `a0de241`.

User reported desk Employee Checkin list / HRMS Daily Checkin Report were showing times ~5:30 hours behind real IST. Root cause: `Employee Checkin.time` was the only datetime column still stored as naive UTC because `create_checkin` did `datetime.now()` on a UTC-OS server, but Frappe's desk renders naive datetimes using `System Settings.time_zone = "Asia/Kolkata"`. Every other field (DCR, Late Mark, Attendance, Service Call, Overtime Log) had been migrated to naive IST in the 2026-05-04 batch (commit `14681ea`).

**Migration steps executed:**
1. Fresh backup `20260506_152026-dgoc_logstop_com-database.sql.gz` (DB + files).
2. Stopped `frappe-bench-frappe-web` + `dspl-fastapi`.
3. Single SQL: `SET SQL_SAFE_UPDATES=0; UPDATE tabEmployee Checkin SET time = DATE_ADD(time, INTERVAL 330 MINUTE) WHERE name IS NOT NULL;` — 796 rows shifted.
4. Pulled `a0de241` on EC2.
5. Restarted services.

**Code changes in `a0de241`:**
- `field.create_checkin`: writes `datetime.now(_IST).replace(tzinfo=None)`.
- `field._to_ist`: rewritten as a no-op formatter — naive datetime in → IST-suffixed ISO string out (`%Y-%m-%dT%H:%M:%S+05:30`). Does NOT shift.
- `field.attendance_today` + `field.get_team`: drop UTC-window helper, filter against IST date strings directly.
- `attendance.py`: `_ist_day_window_in_utc` deleted; `_ist_day_window` (returns IST naive strings) replaces it. `_to_ist` (the attendance.py-level converter) deleted. `process_late_marks` / `mark_lwp_for_unapproved_absence` / `_create_ot_logs` now read `Employee Checkin.time` as naive IST directly.
- `field.py:1503-1504`: was double-shifting Attendance.in_time / out_time (already IST). Now just IST-formats.

**Why:** Going forward never reintroduce UTC shifts on Employee Checkin.time or any datetime column. They are all naive IST. Frappe desk + every consumer assumes that.

**How to apply:** When writing new attendance / scheduling code in `vaishali/api/`:
- Use `datetime.now(_IST).replace(tzinfo=None)` to write timestamps.
- Filter date windows with `f"{target_date} 00:00:00"` / `f"{target_date} 23:59:59"` strings — no UTC translation.
- For wire-format output to PWA, use `_to_ist()` to add the `+05:30` suffix (does NOT shift).
- Old code that calls `_to_ist()` on a datetime expecting a shift is now a bug. Audit before relying.

**Verification:** Pre-migration MIN/MAX `time`: 2026-03-05 15:54:39 / 2026-05-06 08:59:12. Post: 2026-03-05 21:24:39 / 2026-05-06 14:29:12. Exactly +5h30m. 796 rows preserved (no data loss).
