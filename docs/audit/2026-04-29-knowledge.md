# Knowledge map audit — 2026-04-29

## Thesis

A "company brain" is not RAG over comms. It is processes that are **codified-and-enforced**: a typed schema that captures the decision, a server-side guard that refuses bad input, an AI tool that the LLM can call with confidence, and a permission boundary so the wrong user cannot route around it. By that bar, only a thin slice of Vaishali is brain. Most of it is high-fidelity mirror-of-paper with a layer of nudges (notifications, scheduled reminders) glued on top.

Codified-and-enforced = **DocType + guard + tool + permission**. Anything missing one of those four legs is something else: searchable, recordable, decorative.

## Inventory of codified processes

Survey based on `vaishali/hooks.py` (40 doc_event handlers, 8 cron entries), `api/field.py` (63 whitelisted endpoints), `agent/tools/*` (~101 tool schemas across 14 files), `views/registry.py` (17 views), 5 custom DocTypes, and 47 PWA screens.

| Process | Level | Where it lives | Notes |
|---|---|---|---|
| Visit logging (DCR check-in/out) | **A — fully executable** | `Daily Call Report` + `visit_guard.enforce` (PWA-only insert, GPS reverts on desk edit) + `field.create_dcr/checkout_dcr` + `visits.js`/`dcr` PWA + `log_visit` tool | The strongest leg in the system. Insert refused unless `flags.from_pwa=True`. GPS fields are immutable post-capture. |
| Service Call logging | **A** | `Service Call` DocType + `service_call_guard.enforce` (truth fields locked: customer, channel, outcome, datetime, employee) + `field.create_service_call` + `service-call.js` | Just shipped (apr 27-ish). Same pattern as DCR. Replaces the "phone call as DCR with fake GPS" workaround. |
| DCR → Lead → Opportunity → Quotation → SO chain | **A** | `linking.py` doc_events on DCR `on_update`, Quotation `on_submit` (link to DCR), SO `on_submit` (link via prevdoc), Customer `after_insert` (retro-link), Quotation status change to Lost (cascades to DCR) | This is the genuine company-brain piece: outcome checkboxes on a DCR auto-create Lead/Opportunity, and downstream documents back-link without human glue. `conversion_status` is a single derived field that the system owns end to end. |
| Quotation creation | **B** | `field.create_quotation` (role gate: sales/marketing dept or manager+) + `create_quotation` tool + Quotation desk form | Mechanically codified, pricing decisions are not. Item rate is whatever the rep types. No pricing rule is enforced server-side beyond the standard ERPNext price list lookup. |
| Quotation lost-reason capture | **C — recorded only** | `quotation_temperature` Select + `lost_reason_category` Select (Price / Technical / Budget / Other) + `lost_remark` Small Text | Captured. Nothing in `notifications.py` or `linking.py` reads `lost_reason_category` to drive a downstream action. No "Price-lost quotations this month → trigger pricing review" loop. Pure analytics fodder. |
| Sales lead qualification | **B** | Apollo enrichment cron (`apollo.bulk_enrich_leads`, `sync_apollo_list`) auto-fills designation/industry/website. Lead Source attribution exists. | Enrichment is structured. The actual qualification decision (does this lead matter?) lives in rep heads and `Lead.notes` child rows. No score, no auto-routing rule. |
| Pricing exceptions / discount approval | **D — not codified** | None. | `Quotation` has `discount_amount` and item-level `discount_percentage`, but no approval workflow, no permlevel, no notification on >X% discount. A rep can quote 40% off without a single second pair of eyes. |
| Warranty Claim → SLA → CAPA | **A for capture, B for action** | Warranty Claim has 13 custom fields (priority P1-P4, SLA dates, RCA category/details, CAPA link, first response date), `complaint.on_warranty_claim_save/update`, scheduler `check_sla_breaches` + `check_capa_overdue` daily 9 AM, CAPA DocType with 5-Why + corrective + preventive sections | Schema is complete. Breach check sends Telegram. But "engineer dispatch" (who goes, when, with what part) is not codified — it lives in the service manager's WhatsApp threads. |
| Service-visit dispatch decision | **D** | None. | Closest is `Service Call.outcome="Visit needed"` → `follow_up_dcr` Link. The rule "P1 in Mumbai → Ankush, P2 in Delhi → Vishal" is not in code. |
| Equipment AMC tracking | **C** | `amc.js` PWA screen, equipment device DocType (custom) | Read-only listing. No alert when an AMC is 30 days from expiry. |
| Sales Interaction (phone/email/WhatsApp follow-up) | **C** | `Sales Interaction` DocType (35 fields), `field.create_interaction`, `interactions.js` PWA, `summary` and `next_action` are Small Text | Captures, links to opp/quote/SO, has `win_probability` auto-set from stage. But Phase 2-5 (DCR auto-create hook, customer timeline weave-in, forecasting, AI tools) explicitly noted as pending in MEMORY.md. So today: structured capture, no system action on it. |
| Expense claim cap | **A** | `Expense Claim.before_submit = budget.check_budget_cap` + `Expense Budget` DocType + `set_budget`/`get_budget_summary` endpoints + `budget-dashboard.js` | Genuine enforcement: claim refused at submit if employee monthly cap exceeded. One of the cleanest brain primitives in the codebase. |
| Leave application | **A** | Standard ERPNext + `notifications.on_leave_application_submit/update` + PWA `leave.js` + `apply_leave_for_employee` tool + `get_leave_balance` tool | End-to-end: balance check, approver notification, status update broadcast. |
| Approval routing (leave / expense / advance) | **A** | `field.process_approval` verifies `doc.leave_approver` / `expense_approver` / reporting hierarchy | Approval is gated on hierarchy field. Not a free-for-all. |
| Cash-flow-driven payment prioritisation | **D** | None. | `check_pending_purchase_invoices` and `check_overdue_sales_invoices` exist but they are **fire** (Telegram nag), not **logic** (rank suppliers by who-gets-paid-first based on cash position). The decision still happens in the accountant's head. |
| Refund handling | **D** | None visible. | No DocType, no tool, no PWA screen. Refunds presumably handled via raw ERPNext Sales Invoice cancellation + Journal Entry, with the rationale living in `remarks`. |
| Customer escalation routing | **D** | None. | "Customer X is angry, route to senior" is not in code. |
| Hiring / onboarding | **D** | Standard ERPNext HR. No custom guard, no PWA flow. | |
| Supplier evaluation | **D** | 0 POs in the system per MEMORY.md, so the whole module is unused. | |
| Pricing strategy (region/product/customer) | **D** | 24/6,471 item prices populated. The strategy is offline. | |
| Inter-company transactions (DSPL ↔ DCEPL ↔ Gear Up) | **D** | Prompt explicitly says "DCEPL — DO NOT TOUCH". Cross-company JEs not codified at all. The ERS group memory file calls this out as a 12-question-pending area. | |
| Telegram self-link | **A** | `field.generate_telegram_token` + `verify_telegram_token` + FastAPI sidecar webhook + `Employee.telegram_chat_id` field | Mechanically codified, but adoption is 1/179 — the codified primitive is sound, the human follow-through is not. |
| AI agent tool dispatch | **A** | `executor.py` dispatch dict + `_ROLE_GATES` (user/manager/admin) + `is_submittable` defense-in-depth on submit/cancel/delete | Role gates are explicit, not vibes. |
| Daily nags (overdue PO, expiring quote, draft SI reminder) | Hybrid A/C | 8 cron jobs at 9 AM + 1 weekly Mon | Detection codified. Response is a Telegram ping to a human. The system surfaces the breach but does not act on it. |

## Top 5 codified-and-enforced processes (the wins)

1. **DCR with PWA-only-insert + GPS revert.** This removes the question "is this rep actually at the customer site?" from human discretion. The data is trusted-by-construction. This is the template every other workflow should follow.
2. **DCR → Sales chain auto-linking.** `linking.py` is the only place where the system constructs cross-document narrative without anyone typing the link. A rep ticks `opportunity_generated` on checkout and three weeks later a Sales Order back-references the original visit. That's actual brain.
3. **Expense budget cap as `before_submit` hook.** The claim physically cannot submit if it breaches the cap. No nag, no override, no Slack message — pure enforcement. Compare to the cash-flow scheduler jobs which only nag.
4. **Service Call truth-field lock.** Customer, channel, outcome, datetime, employee can only be set via PWA. Desk users can only edit ancillary fields. This makes service-call data analyzable without the usual "is this a backfill?" caveat.
5. **AI tool role gates with submit/cancel/delete asymmetry.** `_ROLE_GATES` says: user can create, manager can cancel, admin can delete + amend BOM. Plus ERPNext's own role permissions as defense-in-depth. The agent does not need to be told "be careful" because the floor refuses dangerous calls.

## Top 5 NOT-codified-but-should-be processes (the gaps)

1. **Discount/pricing approval.** A rep can quote any discount, no second eyes, no audit trail. The implicit knowledge ("anything over 15% needs Vishal's nod") lives in WhatsApp. **Fix shape:** Quotation `before_submit` guard reading discount %, plus a Pricing Approval DocType with one-click approve from manager's PWA.
2. **Service engineer dispatch routing.** Who goes to which breakdown is decided in the service manager's head. **Fix shape:** A `Service Dispatch` rule table (territory + priority + skill → engineer), evaluated by `on_warranty_claim_save` to set `assigned_engineer` and notify; today it's 100% manual.
3. **Lost-reason → pricing review loop.** `lost_reason_category=Price` is captured but never read. A monthly cron that pulls all Price-lost quotes, groups by item, flags items with persistent loss rate >X% — that would be a brain action. Today it's data death.
4. **Cash-flow payment prioritisation.** With cash position + open AP + customer-AR-aging available in the same DB, the system could rank "who do we pay this Friday." Today the accountant exports to Excel and decides. **Fix shape:** A `Payment Plan` view that pre-ranks; accountant approves rather than authors.
5. **Cross-company (DCEPL/DSPL/Gear Up) inter-company transactions.** Prompt forbids touching DCEPL. The ERS memory file shows 12 unresolved questions about how the group's books reconcile. None of it is codified anywhere in Vaishali. This is the single largest blind spot for a "company brain" claim — the company is a group and the brain only knows one entity.

## Shadow surfaces (where knowledge still hides)

**Free-text fields that absorb judgement.** Without a live DB query (declined this run for safety) the structural footprint is enough to identify the leak points:

- `Daily Call Report.discussion_remarks` (Text) and `next_action` (Small Text) — every visit since DCR went live ends here. The actual story of the visit lives in this field, not in the structured outcome checkboxes.
- `Service Call.summary` (Small Text, required) and `remarks` (Small Text) — the resolution narrative.
- `Sales Interaction.summary` and `next_action` — same shape, same role.
- `CAPA.rca_why1..rca_why5` + `root_cause_summary` + `corrective_action` + `preventive_action` — six free-text fields per CAPA. The structured RCA is theatre; the actual reasoning is prose.
- `Quotation.lost_remark` — the *real* reason a deal died (`lost_reason_category` is a 4-bucket simplification).
- `Lead`'s `CRM Note` child rows — ad-hoc thread per lead.
- `tabCommunication.content` — every email body, every internal Communication note. By volume this is the single largest free-text store on the system.

**Vaishali Chat Log content patterns.** This DocType captures every user message + AI reply with token cost. Per MEMORY.md, AI chat is the #1 used PWA feature (168 hits/week). What people ask the AI but the system doesn't act on is a goldmine: the questions reveal the workflows users don't have buttons for. A weekly digest grouping chat-log queries by intent ("show me X", "create Y", "why is Z late") would expose the next 10 workflows that need codifying.

**`/Users/harshwardhangokhale/.claude/projects/-Users-harshwardhangokhale-vaishali/memory/` — 10 files capturing what the AI assistant has learned but the running system does not encode.** Specifically:

- `ers_group_structure.md`, `ers_group_tally.md` — the group's entity/division shape (DCEPL/DSPL/Gear Up × EPS/ESS/ERS/GEN). 12 clarifying questions still pending. Not in any DocType.
- `service_tracking_gap.md` — the design decision that produced the Service Call DocType. Now resolved, but its sibling decisions (dispatch routing, on-call rotation) remain memory-only.
- `role_detection_pattern.md`, `frappe_403_session.md`, `api_js_method_aware.md`, `auth_guard_401_pattern.md` — engineering knowledge about Frappe quirks, learned by debugging incidents. Not in code as comments or runbooks; only here.
- `scheduler_was_disabled.md` — the AI knows the scheduler was off until 24-Apr-2026; the system itself does not warn anyone reading old "scheduled alerts went out" reports that they didn't actually go out.
- `email_integration.md` — the OAuth + Connected App + alias setup is documented; recreating it lives in this file, not in `setup_email.py`'s docstring or comments.

These memory files are the user's externalised brain on top of the system. If the user changes Macs, this dies. None of it round-trips into Vaishali.

## Verdict on the company-brain thesis

Vaishali is **about 30% company-brain, 70% high-fidelity recorder.** The 30% is real and valuable: DCR-with-GPS, the DCR→Lead→Opp→Quote→SO chain, expense budget caps, role-gated AI tools, and the SLA/CAPA scaffolding. These are processes the system *enforces* and *acts on* without human glue. That is more than most ERPs in any company under 200 people.

The 70% is captured-but-not-acted-on. Lost reasons, RCAs, sales-interaction summaries, communication bodies, AI chat logs — high-volume free-text where the actual reasoning lives. Plus the entire group-of-companies layer (DCEPL/Gear Up reconciliation), pricing/discount approvals, dispatch routing, and cash-flow prioritisation, none of which are codified at all.

The single addition that would push the most weight toward "executable company brain" is **a discount/pricing approval guard on Quotation `before_submit`** — modelled exactly like `budget.check_budget_cap` already is on Expense Claim. It is a small file, it is conceptually identical to a thing that already works, and it converts the highest-stakes per-day decision in the business (what number does the rep send the customer) from "trust the rep" to "system enforces the rule." Everything else is variations on this theme.

The inherent ceiling: relationship judgement (who do we cut a one-off deal for because they bought us out of a bad spot in 2018), engineer-customer rapport, supplier negotiation, and the soft handling of escalations will never sit in a DocType. The brain can codify the *envelope* of these decisions (who must approve, by when, with what data), not the decisions themselves. Anyone selling "AI eats this too" is selling vapour.
