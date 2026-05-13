---
name: CRM forward funnel shipped 2026-05-04
description: SPANCO kanban + one-tap submit/convert + lost-reasons dashboard + discount-approval guard live in PWA
type: project
originSessionId: b43a019a-5fa1-4e00-bf0a-86fe14771c97
---
# CRM forward funnel (shipped 2026-05-04)

The full Lead → Opportunity → Quotation → Sales Order → Delivery Note → Sales Invoice → Payment Entry chain is now navigable end-to-end from the PWA without going to the desk. ERPNext-native DocTypes throughout (no custom forks of the funnel itself); custom fields only on Quotation (lost_reason_category, lost_remark, quotation_temperature) and DCR.

## What's live

- **SPANCO kanban** at `#/pipeline` (`226bc0a`) — 6 stages (Suspect/Prospect/Approach/Negotiation/Closing/Order), suspect cap=200 / others=100, in-card stage chip opens a radio bottom sheet for stage moves, "Stale Xd" amber badge on cards past per-stage thresholds (suspect/prospect=30d, approach/negotiation=14d, closing=7d, order=null).
- **One-tap action buttons** on Quotation/SO/DN/SI detail screens — "Submit & convert to SO", "Submit only", "Make delivery", "Make invoice", etc., all using ERPNext mappers (`make_sales_order`, `make_delivery_note`, `make_sales_invoice`, `get_payment_entry`).
- **Lost-reasons dashboard** at `#/lost-reasons` (`8779c4d` + `9f748fe`) — `get_lost_reasons(period, owner)` aggregates `status=Lost` + `docstatus=1` Quotations by `lost_reason_category`, returns summary + by_owner + recent. Period chips 30d/90d/365d/all. "Why we lose →" pill on the SPANCO hero is the discovery surface.
- **Discount-approval guard** in `vaishali/quotation_guard.py` — `before_submit` hook on Quotation. ≤5% silent, 5-15% comment, 15-30% requires Sales Manager, >30% requires Director. Tier overrides via `site_config.json::quotation_discount_tiers`.
- **Stale-deal Telegram nudge** in `notifications.check_stale_opportunities` — daily 9am cron, owners + manager aggregate.

**Why:** Audit (2026-04-29) found the entire forward funnel was manual desk work despite all server APIs existing. SPANCO middle-of-funnel was empty (nobody marks Opp.status=Replied; 39 draft quotations, 0 submitted+lost). The kanban + submit endpoints close the gap; the lost-reasons dashboard surfaces *why* deals die so reps codify the loss.

**How to apply:** When the user mentions "pipeline", "kanban", "lost deals", or "discount approval", these are the live surfaces — point them there before suggesting new work. The natural next gaps are: (1) Sales Interaction Phase 2 (auto-create on outbound email/call), (2) customer detail screen showing current SPANCO stage of active deals, (3) lost-reason capture flow polish (currently only the kanban Lost swipe asks for category+remark — Lost-via-desk doesn't).

## Verification

- Kanban: 6 chips render, stale badges appear on cards beyond thresholds, move sheet opens with radio options. (pwa-tester crm_smoke suite, all green.)
- Lost-reasons: end-to-end seeded one Expired quote (22/2025-2026/0273-1, NTT Global, ₹20.65L) as Lost+Price, endpoint returned `count=1, amount=2065000, category=Price, recent=[NTT Global · ANJOR GANVIR]`, rolled back.
- Full PWA: 85/86 Playwright tests pass against live deploy. The 1 failure was a stale assertion ("Convert" → "Make Opp" label change), fixed in `1061a86`.

## SW

`dspl-field-v79` (2026-05-04). Bumped from v77 → v78 (lost-reasons add) → v79 (envelope-unwrap fix).
