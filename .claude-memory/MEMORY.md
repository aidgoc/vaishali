# Vaishali Project Memory

## ⛔ Locks (do not violate)
- [encryption_key is locked](encryption_key_lock.md) — never rotate `site_config.json::encryption_key`. Rotation breaks every encrypted password (Email Accounts, Connected Apps, GST api_secret) permanently. Hit twice (2026-04-30 HNG, 2026-05-07 Kalpataru email send). Note: locking the key does NOT make OAuth tokens "auto-refresh forever" — Frappe's Connected App doesn't request offline access, so Google never returns a refresh_token (see `email_account_harsh_alias.md`). For harsh@dgoc.in we now use Basic auth + App Password, login_id=hng@dgoc.in.
- [Email Account "Harsh" → alias of hng@dgoc.in](email_account_harsh_alias.md) — login_id must be hng@dgoc.in (primary), not harsh@dgoc.in (alias). Basic auth + App Password. OAuth abandoned 2026-05-08.
- [Private-inbox lock on Communication](private_inbox_lock.md) — `vaishali.permissions` hooks hide harsh@dgoc.in's mails from non-owner System Managers. PRIVATE_INBOXES dict is the single mapping point. Live since commit `0dc5ef4`.

## Patterns
- [frappe.get_all bypasses permissions](frappe_get_all_ignore_permissions.md) — when testing ACL hooks, ALWAYS use `frappe.get_list(..., ignore_permissions=False)` or `DatabaseQuery.execute(user=...)`. `get_all` defaults to `ignore_permissions=True` and made me think the private-inbox lock was broken when it wasn't.
- [Frappe autoname — drop format: prefix for dotted series](frappe_autoname_dotted_no_format_prefix.md) — `format:` is for curly-brace templates only. Dotted series like `GP-.YYYY.-.#####` must be written WITHOUT the prefix. Mixing produces literal docnames. Hit on Outward Gate Pass 2026-05-08, fixed in `41043c7`.
- [allocate_earned_leaves does NOT dedupe](allocate_earned_leaves_no_dedupe.md) — re-running `hrms.hr.utils.allocate_earned_leaves` adds another month's accrual every call; no idempotency check. Before manually firing, STOP the Scheduled Job Type or you'll double-up when the natural cron fires. Burned 2026-05-12 (720 extra LLE rows).
- [Stale item_group on Quotation Item child rows](stale_item_group_on_quotation_items.md) — amending an old quote fails with `Could not find Row #1: Item Group: X` when the Item Group has been renamed/deleted. `fetch_from` caches the value on the child row and never refreshes. Same risk on SO/DN/SI Item. Before any Item Group rename/delete, scan historical child tables. Hit 2026-05-12 on `22/2026-2027/0009-6` (BLF01* electric scissor lifts).
- [Server Script Scheduler Event pattern](server_script_scheduler_event_pattern.md) — one-shot future actions in Frappe: daily Scheduler Event Server Script that date-gates the body and self-deletes when done. No hooks.py edit, no deploy. Live example: `vaishali_reenable_earned_leaves_2026_06_01`.
- [PWA logout — idbDelete not idbPut](pwa_logout_idb_shell_bug.md) — `Auth.clearSession()` MUST `idbDelete('session','current')`. `idbPut({id:'current'})` writes a truthy shell that fools `getSession()` on next boot → user trapped on home. Plus POST `/api/method/logout` + nuke 6 cookies + `location.replace` + reload. All four steps needed. Hit 2026-05-13, fixed in `8013709`.
- [PWA duplicate getGPS footgun](pwa_duplicate_getgps_footgun.md) — attendance.js and visits.js had their own dumb getGPS shims (no low-accuracy retry, maximumAge=0). Users in garages/indoors timed out. Always call `window.fieldAPI.getGPS()` — it's the smart one. Don't reinvent. Hit 2026-05-13, fixed in `7423ed4`.
- [Bulk User creation gates: password strength + creation throttle](bulk_user_creation_password_throttle_bypass.md) — Frappe v15 blocks bulk Users two ways. Bypass strength by setting password via `frappe.utils.password.update_password()` AFTER insert (don't put `new_password` on the doc). Bypass throttle with `frappe.flags.in_import = True`. Hit during 134-user DCEPL onboarding 2026-05-13.
- [Frappe v15 User has NO force_password_reset field](frappe_v15_no_force_password_reset.md) — must add Custom Field. Discovered 2026-05-13. Field added + exported to fixtures in commit `085eede`.

## References
- [PWA first-login password reset flow](pwa_first_login_password_reset_flow.md) — full wiring of the gate live since commit `a10fd71` (2026-05-13). Reusable template for any "must finish onboarding" gate.

## Session 2026-05-14
- [Per-user Quotation discount cap](quotation_per_user_discount_cap.md) — `site_config.quotation_discount_user_caps` overrides the 30% director threshold for named users. Raghuvir Joshi (`sales3@dgoc.in`) capped at 50% on 2026-05-14 to unblock D.N.D. Constructions quote `22/2026-2027/0088` (37.5%). Commit `92b84f2`. Adding more caps = `bench set-config -p` + restart, no code change.

## Session 2026-05-13 ⭐⭐
- **DCEPL PWA users baseline.** 134 new Users created (firstname@dgoc.in / test123), 27 module roles granted across 16 designated employees, 120 operators on Employee role only. PDF delivered via Jarvis. Detail in [dcepl_users_baseline_2026_05_13.md](dcepl_users_baseline_2026_05_13.md). Open: 120 operators can't get module roles until designations are filled (still blocked on ERS Tally integration).
- **First-login force-reset shipped.** Custom field `User.force_password_reset` + PWA gate live for all 134 new accounts. Commits `a10fd71` + `085eede`. SW v95 → v96. Detail in [pwa_first_login_password_reset_flow.md](pwa_first_login_password_reset_flow.md).
- **PWA logout fixed + GPS reliability fixed.** See pattern entries above. Two commits (`8013709`, `7423ed4`), SW v93 → v95.
- **Server Script `vaishali_reenable_earned_leaves_2026_06_01` confirmed active** (daily, enabled). Scheduled Job Type `utils.allocate_earned_leaves` confirmed `stopped=1`. Both verified live on 2026-05-13.

## Session 2026-05-12 ⭐
- [FY 2026-27 leave allocation final state](leave_allocation_fy_2026_27.md) — 32 carry-fwd employees at PL=2.0/SL=6.0 (capped); 148 others at PL=2.0/SL=1.0. Sick Leave `is_carry_forward=1`. **Scheduled Job Type `utils.allocate_earned_leaves` is STOPPED** through 31 May; Server Script `vaishali_reenable_earned_leaves_2026_06_01` re-enables it on 1 June. Anirudha Bhide now has DCEPL leave policy assigned. Carry-fwd LLE doc names: HR-LAL-2026-00455 to HR-LAL-2026-00486.

## Session 2026-05-08 ⭐
- [DCEPL CWS QA/QC guard](dcepl_cws_qa_qc_guard.md) — Purchase Receipt before_submit blocks DCEPL+`Stores - DCEPL` PRs without Accepted Quality Inspection. QI Template `"DCEPL ERS Store QA/QC"` with 5 formula-based parameters seeded. First wedge of 5-wedge ERS Store SOP. Commit `51e382a`. Warehouse NOT renamed to CWS (FK cascade risk) — CWS is a Vaishali-internal label.
- [DCEPL ERS ABC classification](dcepl_ers_abc_classification.md) — wedge 2 live. 4 Item Select fields (class A/B/C, status R/Y/G, segment, dept) populated for 873/1160 (75%) of workshop parts via Part No → item_code suffix-match (1-letter prefix). 287 missing parts dumped to CSV at `/private/files/ers_abc_missing_partsfe8a8f.csv` for store-team review. Commits `9a241f2`→`647c53e`. **Gotcha:** `bench execute --kwargs` uses Python literals, not JSON (`'True'` not `'true'`).
- [DCEPL ERS reorder + auto MR](dcepl_ers_reorder_levels.md) — wedge 3 live. 405 Item Reorder rows on Stores - DCEPL (min→warehouse_reorder_level, reorder_qty→warehouse_reorder_qty); Stock Settings.auto_indent=1. ERPNext's reorder_item cron now auto-creates Purchase Material Requests when actual qty < min. 468 of 873 matched parts skipped (no min/qty data — AsPerRequirement segment). Commit `5ed026c`. Idempotent — 405 unchanged on re-run.
- [DCEPL ERS MRN HOD-approval](dcepl_mrn_approval_guard.md) — wedge 4 live. 3 custom fields on Material Request (mrn_hod_approved + approved_by + approved_at), new Role `DCEPL ERS HOD`, validate hook gates the tick on role, before_submit on Stock Entry blocks Material Issue out of Stores - DCEPL unless every source MR is HOD-approved. Commits `682fcb2` + `8a933cc`. **Action required:** assign `DCEPL ERS HOD` role to actual HOD users — currently unassigned.
- [DCEPL Outward Gate Pass](dcepl_outward_gate_pass.md) — wedge 5 live, 5-wedge SOP programme complete. Submittable DocType `Outward Gate Pass` (GP-.YYYY.-.#####) + child `Outward Gate Pass Item`, app-managed under vaishali module. Captures vehicle/driver/destination/carrier/items/source-doc reference for every gate exit. Returnable-tool workflow: tick→date→submit→`mark_returned()` button on form. Role `DCEPL Gate Guard` created. Commit `27ab18a`, autoname fix `41043c7`. **Action required:** assign `DCEPL Gate Guard` role to gate-guard User accounts.
- **Wedge regression tests live (2026-05-08):** smoke `vaishali.test_store_sop.run` (32/32 wiring assertions, no docs created), E2E `vaishali.test_store_sop_e2e.run` (9/9 functional assertions — creates real PR/MR/Stock-Entry-in-memory/Gate-Pass, never submits stock-moving docs, cleans up). Both passing on prod. Run after every store-SOP-touching deploy.
- **Bench-update portability complete:** `after_migrate = ["vaishali.setup_store_sop.run"]` re-applies QI Template + 2 Roles + Workspace shortcut on every migrate. Custom fields, DocTypes, and hooks already survive via fixtures + app code. Captured in commits `dadee05`, `7c05333`, `ae19b25`.

## Session 2026-05-06 ⭐⭐
- [Employee Checkin UTC→IST migration](checkin_utc_to_ist_migration_2026-05-06.md) — every datetime in the app is now naive IST. 796 rows shifted +330 minutes. `_to_ist` helper rewritten as no-op formatter. `_ist_day_window_in_utc` deleted. Commit `a0de241`. **Going forward never reintroduce UTC shifts on Employee Checkin.time.**
- [GST autofill enabled](india_compliance_account_2026-05-06.md) — India Compliance Account signed up via `/app/india-compliance-account` with harsh@dgoc.in + DSPL GSTIN. 500 free credits till 2026-08-06. API key encrypted in `GST Settings.api_secret`. **Critical UX detail:** autofill only fires in Quick Entry dialog (+Add Customer from list), NOT on the full DocType form.
- [mark_present_attendance cron](mark_present_attendance_cron.md) — daily 23:35 IST writes Present Attendance rows for everyone with an IN and no existing row. Idempotent. Field-mode included (no late_entry, no shift). Backfill helper at `vaishali.api.attendance.backfill_present_attendance(from_date, to_date)`.
- [DCR new-prospect unblock](dcr_prospect_mandatory_fix.md) — Property Setters relax `customer.mandatory_depends_on` and `lead.mandatory_depends_on` when `prospect_name` is set. Reps can log brand-new prospects on any visit purpose. Fixtures committed in `62b85e8`.
- [PWA visit detail re-render pattern](pwa_inplace_rerender_pattern.md) — checkout no longer hash-bounces through `#/`. Pattern: `appEl.textContent = ''; window.Screens.X(appEl, params);`. Use this for any post-server-action refresh.
- [Camera-only photo attach](camera_only_attach_pattern.md) — `UI.attachPhotos({doctype, docname})` + `fieldAPI.uploadFile()`. `capture=environment` hint for back camera. Auto-downscales 1600px / 0.85 JPEG. Default `is_private=1`. Reusable on any DocType. Wired on Expense Claim and DCR detail.

## PWA timestamps now naive IST (2026-05-04, fully completed 2026-05-06) ⭐
- [PWA timestamp convention](pwa_timestamp_ist_convention.md) — DCR / Service Call datetimes from PWA stored as naive IST. `nowIST()` replaces `new Date().toISOString()`. `parseUTC` no longer appends Z. Server `_normalise_dt_to_ist()` defends stale PWA installs. **Employee Checkin migrated to IST on 2026-05-06 (commit `a0de241`)** — see `checkin_utc_to_ist_migration_2026-05-06.md`. Original commit `14681ea`, SW v80→v81→v84.

## Payroll module live (2026-05-04) ⭐
- [Payroll setup](payroll_setup.md) — 23 Salary Components, 4 Structures (Staff DCEPL/DSPL, Operator DCEPL, Overhead DSPL), 103 SSAs, 147 Additional Salary docs, 2487 Attendance, 2 Payroll Entries, 103 Salary Slips submitted for Mar 2026. Code at `vaishali/payroll/`. Reconcile: 17 matched / 85 off-by-rupees / 18 missing-slip. Directors excluded from payroll by design.
- **Pattern:** [Frappe salary formula sandbox](frappe_salary_formula_sandbox.md) — no `min`/`max`/`month`, `start_date` is a string. Use ternaries. Hit ~6 times during initial payroll setup before slips would generate.
- **Pattern:** [tabSeries counter not bumped by sync](series_counter_sync_gap.md) — DCEPL→DGOC sync imported docs with explicit names but didn't UPSERT tabSeries. User hit collision on first new SO of FY 26-27. Fixed 4 series; sync code itself still needs the UPSERT patch.

## S3 backup — twice-weekly, versioned (2026-05-04) ⭐
- [S3 backup](s3_backup.md) — `/home/frappe/backup-to-sw3.sh` Tue + Fri 22:00 UTC. Lands DB + files + site_config + _BACKUP_OK under s3://dspl-erp-backups/runs/<DATE>/. Old weekly+`--delete` cron was silently failing for months; bucket was empty. RPO now ≈ 3-4 days.

## DCEPL Cloud → DGOC EC2 sync — 2026-05-04 ⭐
- [DCEPL→DGOC sync](dcepl_dgoc_sync.md) — full playbook + scripts at `~/vaishali/data/dcepl_sync_2026-05-04/`. Set-diff inserter on EC2 at `/tmp/ec2_insert.py`. Last run: 129 Quotes + 31 SOs + 4 DNs + masters. Idempotent on re-run.

## CRM forward funnel — 2026-05-04 ⭐
- [CRM forward funnel](crm_forward_funnel.md) — SPANCO kanban + one-tap convert + lost-reasons dashboard + discount-approval guard. Lead→Opp→Quote→SO→DN→SI→PE all reachable from the PWA. ERPNext-native throughout. Live on SW v79.
- **Pattern:** [apiCall envelope unwrap](apicall_envelope_unwrap.md) — every PWA screen must do `raw.message || raw.data || raw` after `apiCall` resolves, or it silently always shows the empty state. Code review caught this on `8779c4d`; fixed in `9f748fe`.

## Tally session — 2026-05-02 ⭐
- [Tally → ERPNext sync deferred](tally_erpnext_sync_deferred.md) — user pivoted from "AI agent reads Tally cache" → "direct Tally→ERPNext voucher sync" → "wait for other modules first". DO NOT pitch sync until user re-raises it. When they do, start with read-only diff (1 day) before any voucher import.
- Fresh Tally pull (4 companies, 69,656 voucher entries, all FY 25-26). DSPL recovery report for ERS Rental sent via Jarvis Telegram (₹4.19 Cr total / ₹1.95 Cr external after stripping inter-co Gear Up).

## Reliability week — day 1 (2026-04-30) ⭐
- **HNG email account disabled** — 915 errors/week stopped. Cause: `encryption_key` rotation broke `get_decrypted_password`. Account had no users (no defaults, no Notifications). Re-enable + re-enter password if HNG ever needed.
- **View Engine auto-company-filter fix** (`9cd7943`) — was injecting `["company", "=", X]` on DocTypes without that column → SQL 1054 → silent empty sections in service-dashboard. Now `get_meta(dt).has_field("company")` gated. Service team's dashboard sections (open_breakdowns / todays_visits / pending_installations / recent_completed) actually populate.
- **Designation typos fixed** — 5 employees consolidated under canonical names via `frappe.rename_doc(merge=True)`. Note: this Frappe version's `rename_doc` doesn't accept `ignore_permissions` kwarg.
- **Plaintext secrets in `site_config.json` still open** — deferred to a separate session (needs key rotation coordination).

## Leave + Attendance system shipped (2026-04-30) ⭐
- [Leave + Attendance](leave_attendance_system.md) — DSPL leave policy + late marks + auto-LWP + Office/Field split now live. **Critical rule:** Field-mode (Sales + Service) is exempt from ALL attendance enforcement — no late marks, no LWP, no geofence. Never flag Field staff for "late" or "early out."
- 22/179 checked in today (50% of DSPL ex-DCEPL base). Service 9/13 (69%) is the best adopting cohort.

## Designation hygiene snapshot (2026-04-30 post-fix)
- DSPL: 37/37 employees have a designation. Three typo designations renamed and merged.
- DCEPL: 22/142 — 120 Operations workforce missing both `designation` and `reports_to`. Defer until ERS Tally integration brings them in cleanly; hand-typing 120 is the wrong move.

## YC pitch — what we're actually building (2026-04-29) ⭐
- [Company brain thesis](yc_company_brain_thesis.md) — Vaishali isn't an ERP, it's a codification engine. Pivoted from "AI-native ERP" → "operating layer / connective tissue" framing. Wedge: discount-approval workflow standalone. DON'T use "virus" externally.
- [Audit findings (2026-04-29)](../../../../vaishali/docs/audit/) — 4 reports: infra, code (47K LOC, 102 AI tools), data (order-to-cash off-system, 1,017 draft SIs / 0 submitted), knowledge map (~30% brain / ~70% recorder)
- **DR risk closed (2026-04-30):** 697 custom fields + 282 property setters + 472 custom DocPerms now in `vaishali/fixtures/` (commit `611f2a2`). `bench update` is safe. Re-run `bench export-fixtures --app vaishali` after any new desk customization.
- [Sambhaji email draft](https://dgoc.logstop.com/app/communication/67ac4ielpl) awaiting Send (after harsh@dgoc.in OAuth re-auth)

## ERS Group work (cross-project, active)
- [ERS Group Tally Integration](ers_group_tally.md) — live Tally data for DCEPL/DSPL/Gear Up, HTML dashboards, 12 clarifying questions pending
- [Dynamic Group Entity Structure](ers_group_structure.md) — how DCEPL/DSPL/Gear Up + EPS/ESS/ERS/GEN divisions fit together

## Email Integration (2026-04-27) ✅
- [Email Integration](email_integration.md) — Google OAuth Connected App, 3 shared aliases (sales/accounts/service@dgoc.in), send_email agent tool, SSO login, self-service email for Desk Users. harsh@dgoc.in authorized and tested.
- **Global skill:** `vaishali-email` at `~/.claude/skills/vaishali-email/SKILL.md` — any agent on this Mac can send email via ERPNext using this skill

## Patterns
- [doctype_js / doctype_list_js silently skipped for db-only DocTypes](doctype_js_hook_skipped_for_custom.md) — `FormMeta.add_code()` exits on `if self.custom: return`. For our DocTypes (DCR, Service Call, etc.), `import` the JS from `vaishali.bundle.js` instead. Hit 2026-05-05 building the DCR map view.
- [Google Social Login api_endpoint must be /oauth2/v2/userinfo](google_oauth_userinfo_endpoint.md) — Frappe hardcodes `data["id"]` for Google; the OIDC `openidconnect.googleapis.com/v1/userinfo` returns `sub` → `KeyError` on first-time logins. Use the v2 endpoint.
- [Role detection — don't trust department alone](role_detection_pattern.md) — check department AND designation, always render UI override
- [Frappe 403 on expired session — not 401](frappe_403_session.md) — Frappe returns 403 (not 401) when session dies on whitelisted POST; client must detect "not whitelisted"/"Login to access" body
- [api.js path translators must be method-aware](api_js_method_aware.md) — regex path rewrites match all HTTP methods; PUT/POST/GET sharing the same path silently misroutes; always gate on method and override to match server whitelist
- [Guest API hits → 401 via auth_guard hook](auth_guard_401_pattern.md) — vaishali/auth_guard.py before_request converts Guest hits on /api/method/vaishali.* to 401 SessionExpired so stale PWAs auto-recover

## Corrections
- [Scheduler was disabled until 2026-04-24](scheduler_was_disabled.md) — all "scheduled alerts" in ERP Polish entry were not actually firing before this date

## Open decisions
- [Service visit + phone call tracking](service_tracking_gap.md) — user wants service DCR view + phone-call logging; pending choice between new Service Call DocType vs DCR overload

## System Rating (2026-04-27): 7/10 (10=SAP) — up from 6.5
- **Strong:** AI agent (9/10), PWA/UX (8/10), Sales cycle (8/10), Field ops (8/10), Service (7/10), Email (7/10)
- **Improved:** Purchase (5/10), Manufacturing (5/10), Finance (4/10), Inventory (4/10), Quality (4/10)
- **Remaining gap:** Data quality — 1,017 draft SIs, 0 POs, 24/6,471 item prices
- **New this session (Apr 25-27):** Email integration (Google OAuth), send_email agent tool, Email Outbox, Google SSO login, self-service email for all users

## Vaishali AI v2.2 (2026-04-16) ✅
- **Architecture:** Persistent DB storage, context compaction, cross-session memory, 10 slash commands, token budget tracking
- **Tools:** 106 total (31 core + 75 extended via discover_tools), 13 categories
- **New core tools (16 Apr):** get_leave_balance, list_pending_approvals, approve_document, daily_action_items, check_stock
- **New extended tools (16 Apr):** create_warranty_claim, create_capa (service_quality category)
- **New slash commands (16 Apr):** /today, /approvals, /stock, /leave
- **Bug fixed (16 Apr):** query_view only exposed 8/17 views — now all 17 accessible
- **Prompt updated (16 Apr):** CAPA/complaint rules, notification docs, BOM rules, 8 guide references
- **Code structure:** `tools/` package (14 files); executor uses dispatch dict; prompt.py is single source of truth
- **Role gates:** user=core tools (no cancel/delete/amend/approve), manager=+cancel+approve, admin=+delete+amend_bom
- **Cost:** Sonnet pricing tracked per message, 2M tokens/month default budget

## Sales Interaction (2026-04-03) — Phase 1 deployed
- **New DocType:** `Sales Interaction` — submittable, 35 fields, naming SI-.YYYY.-.#####
- Tracks phone/email/WhatsApp follow-ups alongside physical DCR visits
- Conversion stages: Open→Lead Created→Opportunity→Proposal Sent→Negotiation→Verbal Commitment→Won/Lost/Stalled
- Win probability auto-set from stage (5%→100%)
- PWA: list + new form + detail screens at `#/interactions`
- Phases 2-5 pending: DCR auto-create hook, customer timeline, forecasting, notifications, AI tools

## Apollo.io Integration (2026-04-09) ✅
- **API key:** Configured in site_config (`K1ZF9oKg...`)
- **Enrich lead:** Desk button "Enrich from Apollo" on Lead form — fills designation, website, industry, LinkedIn, Apollo ID
- **Import from Apollo:** Dialog on Lead list — search by email/name, creates Lead with enriched data
- **Bulk enrich:** Scheduler every 30min, 10 leads/run via `/people/bulk_match`
- **List sync:** "Push to CRM" list (`69d777a506e4d10015818c58`) syncs every 30min
- **Bug found & fixed:** Apollo `mixed_people/api_search` returns ALL contacts when `contact_label_ids` matches empty list — now checks `cached_count` via `/labels` API first
- **Custom fields on Lead:** apollo_id, designation, apollo_website, apollo_industry, linkedin_url, apollo_enriched
- **Lead Source:** "Apollo" created for attribution
- **Tested:** Enriched Sameer Palkar → got DGM, rovemaindia.in, machinery industry, LinkedIn

## Production Team SO Access (2026-04-09) ✅
- Manufacturing User/Manager get read-only Sales Order access (Custom DocPerm, permlevel=0)
- 54 financial fields set to permlevel=1 (rate, amount, total, taxes, payment terms, etc.)
- Sales/Accounts roles get permlevel=1 read+write (see everything)
- Notification: `on_sales_order_submit_production()` — items list only, no prices
- PWA API: `get_sales_orders()` strips grand_total for manufacturing roles
- Vivek Kulkarni (production.dgoc@gmail.com) confirmed set up with correct roles

## Codebase Stats (2026-04-16)
- ~36K LOC (Python + JS + CSS + HTML guides)
- 60+ API endpoints, 40+ screens, 66+ routes, 17 views, 34 UI components
- ~40 doc_events + notification handlers, 5 DCR-to-Sales linking hooks, 8 scheduled alerts
- 10 slash commands in AI agent: /quotation, /follow-up, /report, /dcr, /pipeline, /customer, /today, /approvals, /stock, /leave
- 8 user guides at /sales-guide, /hr-guide, /complaint-guide, /purchase-guide, /manufacturing-guide, /finance-guide, /inventory-guide, /quality-guide

## ERP Polish (2026-04-16) ✅
- **CAPA DocType:** Corrective and Preventive Action — submittable, 5-Why RCA, corrective/preventive actions, effectiveness review
- **13 custom fields on Warranty Claim:** priority (P1-P4), SLA dates, RCA category/details, CAPA link, site contact, first response date
- **Notifications:** ~40 Telegram handlers across Sales, Purchase, Manufacturing, Service, Finance, HR, Quality
- **Scheduled alerts (daily 9 AM):** complaint SLA, CAPA overdue, quotation expiry, overdue POs, unpaid PIs, overdue WOs, overdue SIs
- **Weekly (Monday 9 AM):** draft document reminder (1,017 SIs + 267 PEs)
- **Views added:** procurement_dashboard, creditor_dashboard; production_dashboard improved (active+overdue WOs)
- **AI agent:** 10 new tools, 4 new commands, 9 views exposed, service_quality category, prompt updated
- **Telegram pipeline fixed:** get_me() returns telegram_chat_id, bot URL corrected to @HNGcode_bot, Host header fix in FastAPI sidecar
- **Telegram status:** 1/179 employees linked (harsh@dgoc.in = 5705861942). Self-service flow works end-to-end.

## Telegram Bot
- **Bot:** @HNGcode_bot (display name "Vaishali"), token in FastAPI .env on EC2
- **Linking:** PWA Profile → Connect Telegram → token → t.me/HNGcode_bot?start={token} → bot writes chat_id to Employee
- **FastAPI sidecar:** ~/dspl_erp/ on EC2, supervisor process dspl-fastapi on :8443
- **Critical fix (16 Apr):** frappe_service_headers() must include Host: dgoc.logstop.com for multi-site bench
- **Status:** 1/179 employees linked (harsh@dgoc.in = 5705861942). Pipeline verified end-to-end: {"sent": true}

## AI Agent Bridge (2026-04-16) ✅
- **Problem:** FastAPI sidecar had its own 5-tool CRUD executor. Frappe-native executor had 106+ tools. Production chat used the 5-tool path.
- **Fix:** Replaced FastAPI `ai/runner.py` with a bridge that HTTP POSTs to `vaishali.api.chat.send_message`. Production now uses all 106 tools.
- **Backup:** Original runner at `~/dspl_erp/ai/runner.py.bak`
- **Verified:** get_leave_balance, check_stock, daily_action_items, list_pending_approvals, approve_document (role gate) all tested on live server

## Desk Sidebar (2026-04-16) ✅
- **ERP Guides** workspace in sidebar — 8 guide shortcuts + Full Documentation + Field App
- Old DSPL Sales/Operations/Finance/Guide workspaces removed
- Created via server script, not in repo (workspace = DB record)

## Key Patterns & Gotchas
- **Frappe DocType class name:** Remove spaces from DocType name ("Vaishali Chat Log" → `VaishaliChatLog`)
- **Frappe `unique_together`:** NOT a valid DocType JSON attribute — handle uniqueness in code
- **`doc.submit()` on non-submittable:** Silently sets docstatus=1 — ALWAYS check `meta.is_submittable` first
- **Employee Link field:** Pass `None` not `""` for empty — empty string fails Link validation
- **`frappe.db.delete`:** Works in v15 with `filters` kwarg
- **Number Card `filters_json`:** Does NOT evaluate `"today"` — use `dynamic_filters_json`
- **Static assets:** nginx caches 1 year — need `bench build` + restart after changes
- **`UI.bottomSheet()`:** Returns element, caller must `document.body.appendChild()`
- **ERPNext submit permissions:** Role-specific (Sales User→Quotation/SO, Accounts User→SI/PE)
- **Non-developer-mode DocPerm:** Can't save DocType directly; use `frappe.permissions.add_permission` + `update_permission_property`
- **Custom DocPerm vs DocPerm:** Production servers use `Custom DocPerm` table, not `DocPerm`
- **Apollo API `mixed_people/api_search`:** Returns ALL contacts when `contact_label_ids` matches empty list — check `cached_count` via `/labels` first
- **Lead `website` field:** Already exists as standard field — don't create custom field with same name; prefix custom fields (e.g., `apollo_website`)
- **Service worker `ignoreSearch: true`:** SW caches CSS/JS and ignores `?v=` cache-busting params — must bump SW version (CACHE_NAME) to clear stale assets
- **CSS cache chain:** nginx `max-age=31536000` + SW `ignoreSearch` = triple-layer caching. To update desk CSS: (1) bump `app_include_css` query param in hooks.py, (2) bump SW version in sw.js, (3) `bench build`, (4) restart nginx
- **Frappe list view column order:** Cannot change via DocField/Property Setter — use CSS `order` property. Columns are inside `.level-left.ellipsis` wrapper, NOT direct children of `.list-row`
- **BOM `title_field`:** Set to `item_name` via Property Setter. `show_title_field_in_link=1` also set.
- **Frappe Email Account validate:** Immediately tries to connect IMAP — use `flags.ignore_validate = True` when creating programmatically before OAuth token exists
- **Connected App OAuth callback:** Different from Social Login callback — both must be in Google Cloud Console authorized redirect URIs
- **Frappe sendmail + OAuth:** Token must exist in Token Cache for the sender user — `frappe.get_all("Token Cache", ...)` to verify
- **Email Queue force-send:** Use `frappe.get_doc("Email Queue", name).send()` to force immediate delivery
- **DB datetime convention is split (post 2026-05-04, commit `14681ea`):** Employee Checkin.time = naive UTC (server `datetime.now()` on UTC OS); DCR / Service Call / Late Mark / Attendance fields = naive IST. PWA `parseUTC()` no longer appends `'Z'` — bare ISO is parsed as local time, which is IST on user devices. New PWA writes use `nowIST()` helper. See `pwa_timestamp_ist_convention.md`.
- **`bench build` for static assets:** Files at `/assets/vaishali/field/` need `bench build --app vaishali && nginx -s reload` — supervisor restart alone doesn't rebuild.
- **Frappe navbar CSS hide:** Only `header.navbar, .navbar.navbar-expand, body > nav.navbar` — never `body > .page-container` (hides everything).
- **Chat session_id vs conversation_id:** FastAPI chat expects `session_id` param. chat.js was sending `conversation_id` → 422 for every user. Fixed 2026-04-28. Skip history call entirely when no session exists (new user).
- **CSRF 417 auto-retry:** api.js now catches 417, fetches fresh token from `frappe.auth.get_csrf_token`, retries once. Fixes check-in failures for long-lived PWA sessions.
- **attendance_today returns IST:** `_to_ist()` in field.py converts UTC datetimes to `+05:30` ISO strings server-side. All clients get correct times regardless of cached JS version.

## Adoption (2026-04-28)
- **23/179 employees** checked in on first real adoption day (up from 7→12→18→23 over 3 hours)
- **Telegram connected:** 1/179 (only harsh@dgoc.in) — nobody else has done the PWA Profile → Connect Telegram flow
- **AI chat:** #1 used feature (168 hits/week), but was broken (session_id mismatch) — fixed 2026-04-28
- **DCR filing:** Very low (3 users, 9 DCRs in 30 days)
- **Most active depts:** Service (7), Sales (5), R&D (4)
- **Field staff locations:** Mumbai (Ankush, Harsh), Delhi (Vishal, Pratik), Hinjewadi/Pimpri (Inzamamul, Suraj, Sagar), Pune office (14 people)

## Infrastructure
- EC2: `i-08deae9f14e3cc99e`, IP `35.154.17.172`, SSH via Instance Connect
- Deploy: git push → pull on server → migrate → build → flush → restart
- AI: AWS Bedrock (`us.anthropic.claude-sonnet-4-6`), explicit keys (no IAM role)

## Data Snapshot (8 Apr 2026)
- 1,896 customers, 1,807 suppliers, 6,502 items, 179 employees, 10,697 contacts
- 2,076 open leads, 39 draft quotations, 37 submitted SOs, 246 submitted BOMs (227 active)
- Gaps: 1,017 draft SIs, 267 draft PEs, 0 Purchase, 0 Service, 24 item prices

## Service Worker
- Currently **v81** (2026-05-04 evening). v78=lost-reasons + SPANCO badges; v79=envelope-unwrap fix; v80=interim; v81=PWA timestamp IST fix. Bump CACHE_NAME in `sw.js` on every cached-asset change (project rule).

## BOM history (resolved, 2026-04 batch)
- Krisp→ERPNext migration done — 227 submitted BOMs, qty fix from frontend Playwright scrape (BSON had qty=1 for all). Vivek's 56-file batch reconciled (19 updated, 36 identical, 1 excluded).
- BOM gotchas (still apply): never cancel submitted BOMs (cascades to WOs); use BOM Update Tool for structural fixes; "Update Cost" button for rate fixes; `UOM.must_be_whole_number` blocks fractional qty.
