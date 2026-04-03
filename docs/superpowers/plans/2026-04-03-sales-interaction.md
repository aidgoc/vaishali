# Sales Interaction — Implementation Plan

**Date:** 2026-04-03
**Spec:** `docs/superpowers/specs/2026-04-03-sales-interaction-design.md`
**Status:** Pending approval

---

## Phase 1: DocType + API + PWA (1 day)

- [ ] Create `Sales Interaction` DocType JSON (`vaishali/vaishali/doctype/sales_interaction/`)
- [ ] Setup script for custom fields (idempotent, like `setup_dcr_fields`)
- [ ] API endpoints in `vaishali/api/field.py`:
  - `GET /api/field/interactions` — list (with employee/customer filters)
  - `POST /api/field/interactions` — create
  - `GET /api/field/interaction/:id` — detail
- [ ] PWA screens:
  - `screens/interactions.js` — list + detail
  - `screens/log-interaction.js` — creation form
- [ ] Router: add `#/interactions`, `#/interactions/new`, `#/interactions/:id`

## Phase 2: DCR Integration + Timeline (0.5 day)

- [ ] Hook: `on_dcr_update` → auto-create Sales Interaction with `channel="In Person"`
- [ ] Update `customer-timeline.js` to include Sales Interactions
- [ ] Update `get_customer_timeline` API to fetch interactions

## Phase 3: Forecasting (0.5 day)

- [ ] API: `get_sales_forecast(period, employee, department)`
- [ ] Update `pipeline.js` with forecast bar
- [ ] Update home screen KPI: "Follow-ups Due Today"

## Phase 4: Notifications (0.5 day)

- [ ] Cron: daily check for overdue `next_action_date`
- [ ] Cron: 14-day stalled detection
- [ ] Telegram notifications for follow-up reminders
- [ ] Manager escalation for 2-day overdue

## Phase 5: AI Agent (0.5 day)

- [ ] Tool: `log_interaction` in `agent/tools/sales_crm.py`
- [ ] Tool: `get_interactions` in `agent/tools/sales_crm.py`
- [ ] Tool: `get_forecast` in `agent/tools/sales_crm.py`
- [ ] Slash command: `/forecast`
