# Known Risks & Open Issues

Source of truth: `docs/audit/2026-04-29-{infra,code,data,knowledge}.md`. Re-audit when meaningful state changes.

This is a chronological status log. For long-lived coding rules see the other files in `.claude/rules/`.

## Resolved

- **Custom Fields / Property Setters / Custom DocPerms now in fixtures** (commit `611f2a2`, 2026-04-30). 697 + 282 + 472 + 1 + 1 entries under `vaishali/fixtures/`. **Going forward:** any desk customization requires `bench --site dgoc.logstop.com export-fixtures --app vaishali` followed by a commit.

- **S3 backup is twice-weekly, versioned, no `--delete` (2026-05-04).** `/home/frappe/backup-to-s3.sh` runs Tue + Fri 22:00 UTC. Lands DB + public + private + site_config + `_BACKUP_OK` sentinel under `s3://dspl-erp-backups/runs/<DATE>/`. Versioning ON, 90-day lifecycle. RPO ≈ 3-4 days. Verify: `aws s3 ls s3://dspl-erp-backups/runs/ --recursive --region ap-south-1 | grep _BACKUP_OK | tail -5`.

- **Employee Checkin UTC→IST migration (2026-05-06, commit `a0de241`).** 796 rows shifted +330 min, code switched to write naive IST, all 6 helper call sites updated. Pre-migration backup at `dgoc.logstop.com/private/backups/20260506_152026-...`.

- **GST autofill enabled (2026-05-06).** India Compliance Account via `/app/india-compliance-account` with harsh@dgoc.in / DSPL GSTIN. 500 free credits till 2026-08-06.

- **DCR new-prospect visits unblocked across all visit purposes (2026-05-06, commit `62b85e8`).**

- **`mark_present_attendance` cron added (2026-05-06, commit `ce7f9c0`).**

- **PWA visit detail no longer flashes home after checkout (2026-05-06, commit `446117e`).** Same commit added "Recent visits" continuity sections.

- **Camera-only photo attach on Expense Claim + DCR (2026-05-06, commit `ce7f9c0`).** `UI.attachPhotos` + `fieldAPI.uploadFile`.

- **DCEPL ERS ABC classification (2026-05-08).** Wedge 2. 4 custom fields on Item (`ers_abc_class`, `ers_abc_status`, `ers_abc_segment`, `ers_department`). 873/1160 (75%) of workshop parts matched via Part No → item_code 1-letter prefix suffix index. 287 unmatched dumped to `<site>/private/files/ers_abc_missing_parts.csv`. Importer at `vaishali/setup_ers_abc.py` is idempotent.

- **DCEPL CWS Store QA/QC guard on Purchase Receipt (2026-05-08, commit `51e382a`).** Wedge 1. `vaishali/qa_qc_guard.py` blocks PR submit when `company == DCEPL` and any item lands in `Stores - DCEPL` unless every row has a submitted Quality Inspection with `status == "Accepted"`. QI Template "DCEPL ERS Store QA/QC" (5 formula-based params) seeded by `vaishali/setup_qa_qc.py`. Warehouse NOT renamed to CWS (FK cascade risk). Kill switches: `dcepl_ers_qa_qc_enabled=false` or `dcepl_ers_warehouses=[]`.

- **DCEPL ERS reorder + auto MR (2026-05-08, commit `5ed026c`).** Wedge 3. 405 Item Reorder rows on Stores - DCEPL (min→warehouse_reorder_level, reorder_qty→warehouse_reorder_qty). `Stock Settings.auto_indent=1` flips ERPNext's stock-side cron to auto-create Material Requests. Idempotent.

- **DCEPL ERS MRN HOD-approval gate (2026-05-08, commits `682fcb2` + `8a933cc`).** Wedge 4. Material Request `validate` requires `DCEPL ERS HOD` role to tick `mrn_hod_approved`; Stock Entry `before_submit` blocks Material Issue out of `dcepl_ers_warehouses` unless every source MR is HOD-approved. Kill switch: `site_config.dcepl_mrn_approval_enabled=false`.

- **DCEPL Outward Gate Pass (2026-05-08, commits `27ab18a` + `41043c7`).** Wedge 5 — SOP programme complete. Submittable DocType `Outward Gate Pass` (`GP-.YYYY.-.#####`) + child `Outward Gate Pass Item`. Captures vehicle/driver/destination/carrier/returnable flag/items/source-doc reference. Role `DCEPL Gate Guard` seeded. Future JSON edits require `bench --site dgoc.logstop.com migrate`.

- **Bench-update portability for Store SOP (2026-05-08, commits `dadee05` + `7c05333` + `ae19b25`).** `after_migrate = ["vaishali.setup_store_sop.run"]` re-applies QI Template + 2 Roles + Workspace shortcut on every migrate.

- **Wedge regression tests (2026-05-08):**
  - `vaishali.test_store_sop.run` — 32 wiring assertions (no docs created). Run after every deploy.
  - `vaishali.test_store_sop_e2e.run` — 9 functional assertions exercising real Frappe documents. All drafts/cancelled deleted in `finally`. Idempotent.

- **Approvals queue actually works in the PWA (2026-05-10/11, commits `14c5356` + `1c798e8`).** Server returns short-form `type` ("Leave"/"Expense"/"Advance"); `process_approval` normalises via `_DT_ALIASES`. Partial-approval flow on Employee Advance: optional `approved_amount` + `reason` → writes the new amount, adds Info Comment. History view at `#/approvals/history` via `get_my_approvals(days=30)`.

- **Directors' Management dashboard live on desk + PWA (2026-05-11, commits `d4eece6` + `a91da43` + `e7fc490` + `cf60523`).** Public Workspace "Management" with 27 Number Cards across 6 sections + 4 Dashboard Charts. New `DSPL Director` Role. Directors auto-granted Accounts / Sales / Purchase / HR / Stock / Manufacturing / Maintenance / Quality / Item / Projects / Fleet Manager. PWA mirror at `#/management` with company switcher pills. Setup re-applies via `vaishali.setup_management_dashboard.run` in `after_migrate`.

- **Director Telegram alerts (2026-05-11, commit `a743ee0`).** `vaishali/director_alerts.py` broadcasts on: Employee Advance ≥ ₹25K, Sales Order ≥ ₹5L, every Issue. Daily 9 AM `daily_overdue_sweep` summarises top 5 invoices ≥ ₹50K ≥90d overdue.

- **PWA logout actually logs out + receipt code workflow (2026-05-12, commits `5fb5981` + `6bb150b` + `d87240b` + `806646d`).** `Auth.clearSession()` POSTs `/api/method/logout`, nukes cookies, reloads. Expense receipts: per-line camera capture, server `tag_receipt` generates 5-char Crockford-base32 code (`R-XXXXX`), prefixes `file_name` with `[R-XXXXX] original.jpg`. Advance linkage: PWA picks claimable advance, defaults allocation to `min(claim total, claimable)`.

- **dspl_erp FastAPI sidecar git-tracked (2026-05-12).** `https://github.com/aidgoc/DSPL_ERP` (private). Server checkout at `/home/frappe/dspl_erp/` with SSH deploy key. Future updates: edit local → push → `sudo -u frappe git -C /home/frappe/dspl_erp pull origin main && sudo supervisorctl restart dspl-fastapi`.

- **DCEPL employees onboarded to the PWA + force-reset gate (2026-05-13, commits `a10fd71` + `085eede`).** 134 new Frappe Users, email `firstname@dgoc.in`, password `test123` via `update_password()`, role `Employee` only. 16 designated employees received module roles. 120 operators stay on `Employee` only. Pre-existing 10 untouched. First-login force-reset via Custom Field `User.force_password_reset` + PWA `#/set-password` + endpoint `vaishali.api.field.set_new_password`. SW v95→v96. **Pending:** 120 operators need designations; `DCEPL ERS HOD` + `DCEPL Gate Guard` roles still need hand-assignment.

## Open — production reliability

- **HNG email account is failing 790× / month.** Likely OAuth token rot. Service-dashboard views (`open_breakdowns`, `todays_visits`, `pending_installations`) also crashing. **Fix:** re-authorize OAuth at `https://dgoc.logstop.com/app/email-account/HNG`; investigate dashboard view exceptions in `vaishali/api/views/registry.py`.

- **Plaintext secrets in `site_config.json`** — AWS access key + secret, Apollo API key, Frappe encryption key, MariaDB password. These land in every `bench backup`. **Fix:** rotate AWS + Apollo keys (treat as compromised), move secrets to AWS Secrets Manager or `~/.bashrc` env vars. Bucket-side risk mitigated since 2026-05-04 (versioning ON, no `--delete`, 90-day lifecycle).

- **Outstanding AR = ₹0 despite 1,017 draft Sales Invoices.** Every submitted SI has `outstanding_amount = 0` and there are 1,017 SIs sitting in Draft. **Fix:** with Accounts, do a submit-or-cancel sweep on the 1,017 drafts, then verify Cash/Bank accounts have `account_type` set. Canonical symptom: Aniket's ₹13K advance is Unpaid — Accounts needs to book a Payment Entry to flip it Paid.

- **NJG + BNG haven't connected Telegram.** Only Harsh is in `_director_employee_ids()`. Director alerts fan out to Harsh only. Have NJG and BNG open `/field/#/profile` → Connect Telegram → tap t.me link → write back to `@HNGcode_bot`.

## Open — knowledge / codification holes

Workflows that exist in the business but aren't yet encoded as DocType + guard + AI tool.

- **DCEPL CWS Store SOP — 5-wedge programme complete** (2026-05-08). **Action required:** assign `DCEPL ERS HOD` (wedge 4) and `DCEPL Gate Guard` (wedge 5) to actual users — created blank. **Side-quest:** 287 workshop part numbers exist in SOP sheet but not in Item master — `/private/files/ers_abc_missing_partsfe8a8f.csv`. Once those land + AsPerRequirement parts get min/qty filled, re-run `vaishali.setup_ers_abc.import_abc` and `vaishali.setup_ers_reorder.import_reorder`. Source: `docs/Store.xlsx` (signed off 25/03/2026).
- **Discount / pricing approval on Quotation** — no `before_submit` guard, no audit trail. **Highest-ROI next addition** (mirror `vaishali/budget.check_budget_cap`).
- **Service-engineer dispatch routing** — lives in service-manager WhatsApp threads.
- **Lost-reason → pricing review loop** — `quotation_temperature` / `lost_reason_category` / `lost_remark` fields exist on Quotation but nothing reads them.
- **Cash-flow payment prioritisation** — daily cron nags; doesn't rank by collection priority.
- **Inter-company DCEPL / DSPL / Gear Up reconciliation** — entirely uncodified; AI agent prompt explicitly says "DO NOT TOUCH".
