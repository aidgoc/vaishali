---
name: FY 2026-27 leave allocation final state
description: Leave allocation state after carry-forward + Apr/May accrual session on 2026-05-12. Captures who has what, plus the 31-May skip mechanism.
type: project
originSessionId: fd99023f-a4ef-4c5b-a489-f6d359d3ff32
---
# FY 2026-27 leave allocation — settled state as of 2026-05-12

**Final balances (180 active employees):**

| Cohort | Count | Paid Leave | Sick Leave |
|---|---|---|---|
| Carry-forward employees | 32 | 2.0 | 6.0 (5.5 carry + 0.5 monthly, capped at `max_leaves_allowed`=6) |
| Everyone else (incl. Anirudha Bhide, Shrinivas Nayak) | 148 | 2.0 | 1.0 |

The 32 carry-forward employees are those who had FY 25-26 Sick Leave allocations (the older bulk-seed batch with Casual/Privilege/Sick). Identified by:
```sql
SELECT DISTINCT employee FROM `tabLeave Allocation`
WHERE docstatus=1 AND leave_type='Sick Leave' AND from_date='2025-04-01'
```

**Why:** User wanted FY 25-26 unused leaves carried into FY 26-27 + the new earned-leave policy to keep accruing monthly. Carry policy chosen: "matching types only" — Sick → Sick (12 days unused), Casual + Privilege lapse.

**How to apply:** When asked about FY 26-27 leave balances, this is the authoritative snapshot. Casual Leave + Privilege Leave from FY 25-26 deliberately lapsed (not carried).

## Critical operational state — DO NOT FORGET

**Scheduled Job Type `utils.allocate_earned_leaves` is STOPPED.** It was stopped on 2026-05-12 to prevent double-accrual on 31 May, because I had already manually fired May's accrual via `frappe.flags.current_date='2026-05-31'`.

Auto-reenable mechanism: **Server Script `vaishali_reenable_earned_leaves_2026_06_01`** runs daily as a Scheduler Event. On any day >= 2026-06-01 it sets the Scheduled Job Type's `stopped=0` and deletes itself. If anyone touches Server Scripts before 1 June, verify this one survived.

If on/after 1 June the cron is still stopped: re-enable manually via desk → Scheduled Job Type → `utils.allocate_earned_leaves` → uncheck "Stopped".

## Anirudha Bhide

Joined 2 Mar 2026, was missed by the original 30-Apr bulk allocation pass. He was added to DCEPL Leave Policy `HR-LPOL-2026-00003` and given matching PL=2.0 / SL=1.0 in this session.

## Carry-forward Leave Allocation doc names

The 32 SL carry-forward allocations: `HR-LAL-2026-00455` through `HR-LAL-2026-00486`. PL allocations are the original numbers (no recreation needed for PL).
