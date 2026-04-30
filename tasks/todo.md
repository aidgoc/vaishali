# Plan: Leave Policy + Attendance Rules + PWA Apply-Leave Fix

**Owner:** Harsh
**Created:** 2026-04-30
**Status:** awaiting confirmation on assumptions

---

## 1. Why "I cannot apply for leaves" is happening (most likely)

The PWA Apply form POSTs to `/api/resource/Leave Application` (vaishali/public/field/screens/leave.js:271). ERPNext rejects on `validate()` whenever ANY of these is true:

1. **No Leave Allocation exists** for that employee + leave type covering the requested dates → "Insufficient leave balance for X"
2. **No Leave Approver** can be resolved (no `leave_approver` on Employee, no Department leave approver, no user with "Leaves Approver" role) → `LeaveApproverIdentificationError`
3. **No Holiday List** assigned to Employee → date-validity errors

Current state (very likely): **none of the leave plumbing has been set up**, so submit always fails. Fixing the policy in §2 fixes the apply bug as a side effect.

---

## 2. Leave Policy — proposed configuration

Inputs from Harsh:
- 1.5 leaves credited every month per employee (1 paid + 0.5 sick)
- Annual: 12 paid + 6 sick = 18 leaves/year
- 10 public holidays
- Saturday is a working day (only Sunday weekly off)

ERPNext objects to create (idempotent, via setup script):

| # | DocType | Name | Key fields |
|---|---|---|---|
| 1 | Holiday List | `DSPL 2026-27` | `weekly_off = Sunday`, 10 public-holiday rows, valid 1 Apr 2026 – 31 Mar 2027 |
| 2 | Leave Type | `Paid Leave` | `is_earned_leave=1`, `earned_leave_frequency=Monthly`, `rounding=0.5`, `is_carry_forward=0`, `max_leaves_allowed=12` |
| 3 | Leave Type | `Sick Leave` | `is_earned_leave=1`, `earned_leave_frequency=Monthly`, `rounding=0.5`, `max_leaves_allowed=6` |
| 4 | Leave Type | `Leave Without Pay` | `is_lwp=1` — already exists, verify only |
| 5 | Leave Period | `FY 2026-27` | 1 Apr 2026 – 31 Mar 2027, `is_active=1` |
| 6 | Leave Policy | `DSPL Standard` | Paid 12 + Sick 6 |
| 7 | Leave Policy Assignment | per-employee | bulk-assign for FY 2026-27 |
| 8 | Holiday List on every Employee | — | set `holiday_list = "DSPL 2026-27"` on all 179 employees |

Allocation strategy: **`is_earned_leave=1` is the ERPNext-native way to credit monthly**. The built-in scheduler `allocate_earned_leaves()` runs on the 1st of each month and adds `max_leaves_allowed / 12` per leave type. So Paid 12/12 = 1.0/month, Sick 6/12 = 0.5/month → exactly 1.5/month.

Leave Approver: default to **department head**. Where the department has no head, fall back to the System Manager. We'll set this on each Employee record so the PWA submit always resolves an approver.

---

## 3. Attendance Rules — proposed configuration

Inputs from Harsh:
- Field team: PWA from anywhere
- HO team: PWA only from office location
- Office hours: 9:00–18:00
- 9:30+ check-in = 1 late mark
- 3 late marks = 0.5 day deduction

### 3a. Shift Type
Create `Office Hours` shift: start 09:00, end 18:00, `late_entry_grace_period_in_minutes = 30`. Assign to all HO employees via `shift` field on Employee.

### 3b. Field vs HO classification
Add a custom field on Employee: `attendance_mode` (Select: `Field`, `Office`). Default to `Office`. We'll bulk-set `Field` for the Sales + Service field staff (37 employees per memory: Mumbai, Delhi, Hinjewadi). HO = everyone else.

### 3c. Geofence enforcement (custom — ERPNext doesn't ship this)
Add `vaishali.api.field.create_checkin` validation:
1. If `attendance_mode == "Office"` → require `latitude` + `longitude` AND distance to office centre ≤ radius
2. If `attendance_mode == "Field"` → no geofence
3. Office centre + radius: stored in `site_config.json` (so it's tunable without code changes)

Open: **what are the office GPS coordinates and acceptable radius?** (e.g. 100m / 200m)

### 3d. Late mark counting (custom — ERPNext shift only flags individual entries)
Daily scheduler at 23:30 IST runs `vaishali.api.attendance.process_late_marks`:
- For each Employee on Office Hours shift, find today's earliest IN checkin
- If after 09:30 → create a `Late Mark` log entry (custom DocType, 3 fields: employee, date, reason)
- At end-of-month: count Late Marks per employee, every 3 → `Attendance Request` of type "Half Day" deduction (or directly write Attendance with `status="Half Day"`)

Open: **does the half-day deduction come out of Paid Leave balance, Sick Leave balance, or unpaid?** The cleanest is "unpaid" (logged but not auto-deducted from leave balance). Confirm.

---

## 4. Application & approval rules (from Harsh's screenshot, 2026-04-30)

These are enforced as a mix of `validate()` hooks on Leave Application + scheduler + email-template changes.

### 4a. Advance-notice validation (server-side `validate()`)
| Total leave days | Min days notice |
|---|---|
| 1 day | 3 days |
| 2 to 3 days | 7 days |
| 4 to 10 days | 30 days |
| 11+ days | 30 days (treat same as 4-10 unless Harsh says otherwise) |

Computed at apply time: `(from_date - posting_date).days`. If less, throw — **except** when `leave_type == "Sick Leave"` (sickness/emergency carve-out below).

### 4b. Sickness / emergency carve-out
- `Sick Leave` is exempt from advance-notice rule (verbal intimation allowed)
- BUT: `post-facto approval is mandatory` — Sick Leave applications cannot be left in `Open` status indefinitely; auto-flag if older than N days unprocessed

### 4c. Sick leave > 2 days → medical docs mandatory
- If `leave_type == "Sick Leave"` AND `total_leave_days > 2`:
  - On apply: validate that at least one File is attached to the document
  - Throw: "Supporting medical documents are mandatory for sick leave exceeding 2 days. Please attach before submitting."
- PWA Apply form: add file-attachment field that appears conditionally when sick leave > 2 days selected

### 4d. HR must be CC'd on all leave emails
- Override ERPNext's default Leave Application notification recipients
- Add HR group (default: `hr@dgoc.in` or whatever Harsh confirms) to `cc` on every notification:
  - Submitted (notify approver)
  - Approved (notify employee)
  - Rejected (notify employee)
  - Cancelled

### 4e. Unapproved absence → auto-LWP
- Daily scheduler `vaishali.api.attendance.mark_lwp_for_unapproved_absence` runs at 23:00 IST:
  - For each Employee with no Checkin today AND no approved Leave AND today is not a Holiday
  - Create Attendance with `status = "On Leave"`, `leave_type = "Leave Without Pay"`
- Skips employees on `Field` attendance_mode (they may be on legitimate field travel without checking in — handle via DCR presence)

### 4f. Cancellation of approved leave
- PWA: cancel button on detail screen (already exists for `Open` status; extend to `Approved`)
- On cancel: status → `Cancelled`, send email on same thread (Re: subject) to manager + HR
- Custom field on Leave Application: `cancellation_reason` (Small Text, required when cancelling Approved leave)

---

## 5. Open questions for Harsh (please answer before we start)

1. **Office GPS coordinates** + acceptable radius for HO geofence?
2. **List of 10 public holidays** for FY 2026-27 (dates + names)?
3. **Leave approver hierarchy** — department head, or single fallback approver (e.g. ai.dgoc@gmail.com)?
4. **New joiners** — do leaves credit pro-rata from join date, or wait till next 1st of month? (ERPNext earned-leave is "wait till next allocation cycle" by default.)
5. **Carry forward** unused Paid + Sick leaves to next FY? Y/N
6. **Encashment** of unused leaves on resignation/year-end? Y/N
7. **Negative balance** — can an employee apply when balance is 0 (auto-becomes LWP), or block?
8. **Late mark scope** — 3 lates **per month** = half day, or 3 lates **ever** = half day?
9. **Half-day deduction source** — paid leave, sick leave, or unpaid?
10. **Sandwich rule** — if someone takes Friday leave + Monday leave, do Sat (working) + Sun (off) get auto-counted? (Most Indian companies say yes for the holiday in between.)
11. **Field team list** — should I auto-detect from Sales + Service department, or do you want to mark them manually?
12. **HR email address(es)** to CC on all leave emails — `hr@dgoc.in`? Multiple?
13. **"Reasonable time" for manager response** — should we add a daily nag at, say, 24h with no response? Auto-escalate to skip-level after 48h?
14. **11+ day leave** — same 30-day notice as 4-10 days, or stricter?
15. **Sick leave aging** — if a Sick Leave application sits in `Open` for >N days unprocessed, what should happen? Auto-approve? Auto-escalate? Auto-mark LWP?
16. **Auto-LWP for absence** — should we mark LWP for Field staff too (and rely on DCR check-ins to clear it), or only for Office staff?

---

## 6. Execution order (after answers)

1. ✅ **PR 1** — `vaishali/setup_leave_policy.py` (new) — Holiday List resolve, Paid/Sick earned-monthly Leave Types, FY 2026-27 Leave Period, DSPL Standard Leave Policy, bulk Policy Assignment, `cancellation_reason` custom field, HR CC on all Leave-Application Notifications
2. ✅ **PR 2** — `vaishali/setup_attendance.py` (new) — `Office Hours` Shift Type 09:00-18:00 with 30-min late grace, `Employee.attendance_mode` custom field (Office/Field), custom DocType `Late Mark`, auto-classify Sales/Service as Field
3. ✅ **PR 3** — `vaishali/api/field.py` — geofence enforcement in `create_checkin` using `site_config.json: office_geofence`, Office-mode 200m radius, Field-mode bypass, `_haversine_m` helper
4. ✅ **PR 4** — `vaishali/api/attendance.py` (new) — `process_late_marks` (daily 23:30), `roll_late_marks_to_half_day` (monthly 1st 01:00), 3-lates-→-half-day rollup
5. ✅ **PR 5** — `vaishali/leave_guard.py` (new) — `validate()` with advance-notice tiers (3/7/30 days), Sick Leave > 2 days mandatory attachment, HR CC handled via Notification config in PR 1
6. ✅ **PR 6** — `vaishali/api/attendance.py` — `mark_lwp_for_unapproved_absence` (daily 23:00) for Office mode only, skips holidays and approved leaves
7. ✅ **PR 7** — `vaishali/api/field.py` (`cancel_approved_leave`) + `screens/leave.js` (bottom-sheet reason prompt on Approved status) — sends thread-reply email to manager + HR
8. ✅ **PR 8** — `hooks.py` wired: `Leave Application.validate` → `leave_guard.validate`, scheduler cron entries for 3 jobs; `sw.js` bumped v65→v66

Each PR ≤ 200 lines. After running setup once on prod, run `bench export-fixtures --app vaishali` and commit the resulting JSON updates.

**Status: code complete, awaiting prod deploy + setup-script run.**

---

## 7. Out of scope (deliberate)

- Salary deduction integration — half-day logic only marks attendance; payroll integration is a separate piece
- Comp-off / overtime tracking
- Multiple shifts per day
- Mobile push notifications on approval/rejection (already handled by existing notification framework)
