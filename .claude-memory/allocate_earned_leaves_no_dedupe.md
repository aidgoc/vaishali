---
name: hrms.hr.utils.allocate_earned_leaves does NOT dedupe
description: Re-running the earned-leave accrual function adds another month's worth every call — there is no idempotency check. Use frappe.flags.current_date carefully and stop the Scheduled Job Type if firing manually for a date the natural cron will also hit.
type: feedback
originSessionId: fd99023f-a4ef-4c5b-a489-f6d359d3ff32
---
`hrms.hr.utils.allocate_earned_leaves` (HRMS app) iterates every active Leave Allocation and calls `update_previous_leave_allocation` for each, which:
1. Increments `total_leaves_allocated` by the monthly chunk (capped at `max_leaves_allowed`)
2. Creates a new Leave Ledger Entry (LLE) row via `create_additional_leave_ledger_entry`

**There is NO check for "already accrued this period."** It only checks `check_effective_date(from_date, today, frequency, allocate_on_day)` which just verifies today is the right day-of-month for the configured frequency.

**Why:** Burned 2026-05-12 — fired the function with `frappe.flags.current_date='2026-05-31'` to push May's accrual, then later fired it again for both `2026-04-30` AND `2026-05-31` in a "fix the lagging employee" script. End result: 720 extra LLE rows and balances at PL=4.0/SL=2.0 instead of PL=2.0/SL=1.0. Had to manually delete LLEs and force-set `total_leaves_allocated`.

**How to apply:**
1. Before manually firing `allocate_earned_leaves`, **STOP** the Scheduled Job Type (`utils.allocate_earned_leaves`, frequency `Daily Long`) so the natural cron doesn't double-fire on the actual target date.
2. After the period in question has passed, re-enable the cron.
3. If you must re-fire for catch-up, target only employees that are behind (don't run the global function — it touches every allocation).
4. To find the Scheduled Job Type: `frappe.db.exists("Scheduled Job Type", {"method": "hrms.hr.utils.allocate_earned_leaves"})`.

## Footgun bonus

`allocate_on_day = Last Day` on our Leave Types means manually firing with `current_date='2026-05-01'` is a no-op (silently). The function only fires when `today == get_last_day(today)`. You must use the actual last day of the target month.

## Recovery pattern

If you over-accrue, the cleanest fix is to **delete all LLEs for the affected allocation(s) and rebuild them deterministically**, then `frappe.db.set_value` the `total_leaves_allocated` to match the sum. Trying to incrementally subtract gets messy because of cap interactions. The restore script lived at `/home/frappe/frappe-bench/apps/vaishali/vaishali/restore.py` (cleaned up after use).
