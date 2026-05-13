---
name: Server Script (Scheduler Event) for one-shot future actions
description: Pattern for scheduling a future-dated action in Frappe without touching hooks.py or deploying code — use a Server Script of script_type=Scheduler Event with a date-gated body that self-deletes when done.
type: reference
originSessionId: fd99023f-a4ef-4c5b-a489-f6d359d3ff32
---
When you need a one-shot future action (e.g. "re-enable this cron on 1 June"), Frappe doesn't have built-in `enqueue_at(future_datetime)`. The Scheduled Job Type system runs cron-style schedules but nothing one-shot.

**Pattern: a daily Scheduler Event Server Script that gates on date and self-deletes.**

```python
import frappe
from frappe.utils import getdate, today

if getdate(today()) >= getdate("2026-06-01"):
    # ... do the thing ...
    # then delete self
    self_name = "vaishali_<descriptive_name>"
    if frappe.db.exists("Server Script", self_name):
        frappe.delete_doc("Server Script", self_name, ignore_permissions=True)
        frappe.db.commit()
```

Created via:
```python
frappe.get_doc({
    "doctype": "Server Script",
    "name": "vaishali_<descriptive_name>",
    "script_type": "Scheduler Event",
    "event_frequency": "Daily",
    "disabled": 0,
    "script": body,
}).insert(ignore_permissions=True)
```

**Why:** No `hooks.py` edit, no deploy, no migration. Survives bench updates because Server Scripts are stored in the DB.

**How to apply:** Use whenever you need a date-gated future action — re-enable a job, send a reminder, run a one-time fix script after a known event. Always include the self-delete branch so the script doesn't run forever.

**Live example:** `vaishali_reenable_earned_leaves_2026_06_01` (set up 2026-05-12 to re-enable `utils.allocate_earned_leaves` Scheduled Job Type on 1 June 2026 and self-delete).
