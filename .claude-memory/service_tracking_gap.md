---
name: Service visit + phone call tracking — open decision
description: DSPL service team wants a view of all service visits and a way to log phone-resolved service calls. Design decision pending between new Service Call DocType vs DCR overload.
type: project
originSessionId: c5d63914-3824-4e93-b8d9-5ed94943b4b2
---
**Gap identified 2026-04-24:** Service team needs
1. A consolidated view of **all service visits** (DCRs where `service_purpose` is set). No dedicated screen/view today — service visits are interleaved with sales visits in the generic `#/dcr` list.
2. A way to log **phone-resolved service calls**. Today nothing fits: DCR forces GPS check-in (too heavy for a 2-min phone fix), Warranty Claim is for formal complaints with SLA/CAPA, Sales Interaction is sales-funnel-specific (stages like Lead Created, Opportunity).

**Why it matters:** Many service problems are resolved on the phone. These calls don't count toward service workload/metrics today, so team effort and customer response is invisible. Decision is stuck on schema shape, not priority.

**Options on the table:**
- **A. New `Service Call` DocType** — lightweight (customer, contact, problem, resolution = Resolved on Call / Requires Visit / Escalated to Warranty, equipment, engineer, duration, notes). "Requires Visit" auto-creates DCR; "Escalated" auto-creates Warranty Claim. Cleaner semantics, more surface to maintain (schema + permissions + PWA screen + AI tool).
- **B. Overload DCR with `Phone Call` visit type** — skip GPS, reuse existing plumbing. Simpler, but mixes on-site and phone activity in reports and breaks the "visit = on-site" semantic.

Recommendation proposed to user: Option A. User has not yet chosen.

**How to apply:** When user returns to this, don't re-open the debate — check which option they picked and implement. If A: create DocType → add PWA screen → add View Engine view `service_calls` → add AI tool → add Telegram notification on create. If B: add `visit_mode` field on DCR (On-site / Phone) and branch the PWA form.

Existing service-adjacent surface (as of 2026-04-23):
- `Daily Call Report` with `service_purpose` — 7 options (Installation, Breakdown/Repair, PM, Commissioning, Training, Warranty Service, Inspection)
- `Warranty Claim` with P1–P4 priority, SLA dates, RCA, CAPA link (13 custom fields)
- `CAPA` DocType with 5-Why RCA
