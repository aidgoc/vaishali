---
name: PWA timestamp convention — naive IST (post 2026-05-04)
description: After commit 14681ea (deployed 2026-05-04 evening), PWA-written DCR / Service Call datetimes are naive IST in DB. parseUTC no longer appends Z. Employee Checkin still uses naive UTC.
type: project
originSessionId: 1506db6c-06dd-4e4e-970f-db2db1197aba
---
**Convention split (post 14681ea):**

| DocType / Field | DB stored as | Why |
|---|---|---|
| `Daily Call Report.check_in_time` / `check_out_time` | naive IST | PWA sends `nowIST()` → "YYYY-MM-DD HH:MM:SS"; server `_normalise_dt_to_ist()` enforces |
| `Service Call.form_opened_at` / `form_saved_at` / `call_datetime` | naive IST | Same path as DCR |
| `Late Mark.checkin_time`, `Attendance.in_time` / `out_time` | naive IST | `attendance.py:107` strips tz from IST-aware datetime before persist |
| `Employee Checkin.time` | **naive UTC** | Server uses `datetime.now()` (UTC OS); read paths convert via `_to_ist()` |

**Why:** Pre-fix, PWA sent `new Date().toISOString()` (UTC with Z); server stripped Z without timezone math; DB had naive UTC. Frappe desk treats DB datetimes as site-local IST → all DCR / Service Call times displayed 5h30m off in desk, reports, Number Cards. PWA was correct only because every read path used a `parseUTC()` that appended Z to compensate.

**How to apply:**
- New code that writes a datetime from the PWA: use `nowIST()` (defined locally in visits.js, service-call.js — copy if needed elsewhere). Never `.toISOString()`.
- New code that reads a datetime from `get_dcrs` / `get_service_calls` / similar: parse the bare ISO directly. Don't append Z. (5 PWA `parseUTC()` definitions already flipped — match that pattern.)
- Reading `Employee Checkin.time` directly from DB (Python): convert via `_to_ist()` first — it's still naive UTC.
- Server-side normaliser: `vaishali.api.field._normalise_dt_to_ist(val)` handles both new (naive IST) and stale (UTC with Z) PWA payloads. Use it in any new endpoint that accepts a client-supplied datetime.

**Old rows NOT migrated.** DCRs / Service Calls created before 2026-05-04 evening still hold naive UTC and will display 5h30m off in PWA. User declined the migration ("from tomorrow this should be in place"). Old data ages out as new visits / calls come in.

**Files touched (commit 14681ea):**
- `vaishali/api/field.py` — `_normalise_dt_to_ist()` helper + 3 wire-ins (`create_dcr`, `checkout_dcr`, `create_service_call`)
- `vaishali/public/field/screens/visits.js` — `nowIST()`, 2× call-site swap, `parseUTC` flipped
- `vaishali/public/field/screens/service-call.js` — `nowIST()`, 2× call-site swap, `formatDateTime` parser flipped
- `vaishali/public/field/screens/{attendance,home,_activity,inbox}.js` — `parseUTC` flipped (no more `Z` append)
- `vaishali/public/field/sw.js` v80 → v81; `hooks.py` CSS bust → `20260504a`
