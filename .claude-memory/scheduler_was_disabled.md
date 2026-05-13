---
name: Frappe scheduler was disabled until 2026-04-24
description: Big correction — scheduler was OFF on dgoc.logstop.com until 2026-04-24. All the "daily 9AM alerts", "weekly Monday alerts", and Apollo sync in the ERP Polish memory were never actually firing before this date.
type: project
originSessionId: c5d63914-3824-4e93-b8d9-5ed94943b4b2
---
**Correction to MEMORY.md:** The "Scheduled alerts (daily 9 AM)" and "Weekly (Monday 9 AM)" and Apollo 30min sync described in the "ERP Polish" and "Apollo.io Integration" entries were **not firing** before 2026-04-24. `bench --site dgoc.logstop.com scheduler status` returned "Scheduler is disabled". The `frappe-bench-frappe-schedule` worker was running but had nothing to dispatch.

**Why:** The scheduler must be explicitly enabled on a Frappe site (`bench scheduler enable`). It was never turned on after site creation. This is separate from the supervisor worker process existing — the site-level flag gates whether the worker picks up jobs.

**Enabled on 2026-04-24** via `bench --site dgoc.logstop.com scheduler enable`. From this point forward, hooks in `scheduler_events` actually fire:
- Apollo bulk_enrich_leads (every 30 min)
- Apollo sync_apollo_list (every 30 min)
- Daily 9AM: complaint SLA, CAPA overdue, quotation expiry, overdue POs, unpaid PIs, overdue WOs, overdue SIs
- Weekly Monday 9AM: draft document reminder

**How to apply:** If the user reports "my scheduled thing didn't run" on a new Frappe site, check `bench scheduler status` first before debugging the hook. Also next time memory says "scheduler alerts live", actually verify they've fired (check Error Log for invocations, or `tabScheduled Job Log`).
