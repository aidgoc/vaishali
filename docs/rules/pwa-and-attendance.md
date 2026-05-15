# PWA, Attendance, IST

## DateTime — naive IST everywhere (post 2026-05-06, commit `a0de241`)

- **Server is UTC, but every DB datetime in this app is naive IST.** Employee Checkin.time was the last UTC holdout — migrated to naive IST in a single `UPDATE INTERVAL 330 MINUTE` pass (796 rows shifted). `create_checkin` now writes `datetime.now(_IST).replace(tzinfo=None)`.
- The old `_to_ist` helper in `vaishali/api/field.py` is now a no-op formatter (adds `+05:30` suffix to naive IST datetime — does NOT shift).
- `_ist_day_window_in_utc` was deleted; replaced by `_ist_day_window` returning IST date strings directly.
- **Implication:** any new attendance / checkin / scheduling code should treat DB column as naive IST. Don't reintroduce UTC shifts on read or write.

## Attendance Rules

- **Attendance rules apply to Office-mode only — Field-mode is exempt for all attendance enforcement.** Sales and Service field staff (`Employee.attendance_mode = "Field"`) can check in/out at any time, from anywhere — no late mark (09:30 threshold doesn't apply), no auto-LWP, no geofence rejection. Both `process_late_marks` and `mark_lwp_for_unapproved_absence` filter on `attendance_mode = "Office"`.
- **Never flag a Field-mode employee for "late arrival" or "early departure"** — those concepts don't exist for Field. The only legitimate flags are misclicks (IN→OUT in <60s) and missing GPS.
- **`mark_present_attendance` cron at 23:35 IST** fills the Present-row gap. Order: 23:00 LWP for absences → 23:30 Late Mark + Half Day on >11:00 IN → 23:35 Present rows → 23:45 Overtime Log. The 23:35 job is idempotent. Backfill: `bench --site dgoc.logstop.com execute vaishali.api.attendance.backfill_present_attendance --kwargs "{'from_date':'YYYY-MM-DD','to_date':'YYYY-MM-DD'}"`.

## DCR Mandatory Fields (commit `62b85e8`)

- `customer` and `lead` `mandatory_depends_on` now respect `prospect_name`. Property Setters in fixtures:
  - `customer.mandatory_depends_on = "eval:!doc.prospect_name && (in_list([Quotation Follow-up,Order Follow-up,Recovery,Relationship Building], doc.visit_purpose) || doc.department == 'Service')"`
  - `lead.mandatory_depends_on = "eval:!doc.prospect_name && doc.visit_purpose == 'Lead Follow-up'"`
- Reps logging brand-new prospects on follow-up purposes no longer get blocked. Don't tighten without reconsidering.

## PWA Patterns

- **Frappe desk navbar leaks into PWA** when `/field` is accessed by a logged-in desk user. CSS hides it: `header.navbar, .navbar.navbar-expand, body > nav.navbar { display: none !important }`. Be narrow with selectors — `body > .page-container` hides EVERYTHING.
- **Visit detail re-renders in place after checkout, not via hash bounce** (commit `446117e`). Pattern: `appEl.textContent = ''; window.Screens.visitDetail(appEl, { id: dcrName });`. Use for any "refresh after server action" need.
- **Camera-only photo attach:** `UI.attachPhotos({doctype, docname})` + `fieldAPI.uploadFile()`. Input `<input type="file" accept="image/*" capture="environment">`. Auto-downscales to 1600px / 0.85 JPEG, defaults `is_private=1`.
- **`Auth.saveSession()` only fires at login** — roles/employee info cached in IndexedDB go stale when an admin grants a role mid-session. Server `get_me` returns fresh fields; PWA `home.js` calls `Auth.refreshRoles(...)` + `Auth.refreshEmployee(...)` before rendering banner check.
- **`Auth.clearSession()` MUST POST `/api/method/logout`.** Clearing IndexedDB alone leaves Frappe's `sid`/`user_id` cookies; on reload the user is silently re-authenticated. Pattern: (a) POST `/api/method/logout`, (b) nuke `sid / user_id / user_image / full_name / system_user / csrf_token` cookies under `/` and `/api`, (c) `idbDelete('session','current')` (NOT `idbPut`), (d) `location.replace('/field#/login') + reload`.

## FastAPI Sidecar

- **`_get_csrf_token` extracts csrf from inbound Cookie header.** The user's Cookie already contains `csrf_token=...` (set at login); lift it with a regex. Don't call `GET /api/method/frappe.auth.get_logged_user` — that endpoint doesn't set the `X-Frappe-CSRF-Token` header.

## Leaflet Quirks

- **`divIcon({ html })` — pass HTML as a string, not a DOM node.** Some Leaflet builds skip the element-typed code path and the marker silently fails. Set an explicit `className` (e.g. `dcr-form-pin`) AND inject CSS that resets `background:transparent !important; border:0 !important;` — Leaflet's default `.leaflet-marker-icon` may inherit a white background + grey border.
