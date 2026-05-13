---
name: ERS Group Tally Integration
description: State of the Tally HTTP-XML integration, fetched datasets, and group financial findings as of 2026-04-17. Points at scripts and reports under ~/ers.
type: project
originSessionId: 951bc42a-17f8-4fe5-8222-2d8cb5d2b989
---
# ERS Group — Tally integration (2026-04-17)

## What exists

- **Live Tally connection**: `http://100.114.221.87:9000` (Lenovo PC via Tailscale) — 4 companies loaded (DCEPL 25-26, DCEPL 23-25 historical, DSPL, Gear Up Rental)
- **Scripts in `~/ers/scripts/`**: `tally_fetch.py`, `fetch_dspl_all.py`, `fetch_gearup_all.py`, `fetch_extra.py`, `tally_audit.py`, `tally_eps_ess.py`, `tally_divisions.py`, `tally_writeoff.py`, `build_html_reports.py`
- **Data in `~/ers/data/tally/{dcepl,dspl,gearup}/`**: bills_receivable.json, bills_payable.json, debtors_live.json, ledgers_all.json, groups.json, voucher_summary.json, all_vouchers.json, raw XMLs (gitignored)
- **Reports in `~/ers/reports/`**: `GROUP_FINANCIAL_SNAPSHOT.md`, `{dcepl,dspl,gearup,group}_report.html` (source-baked, sent via Jarvis Telegram bot)

## Group totals (FY25-26, as of 17-Apr-2026)

| | DCEPL | DSPL | Gear Up | Group |
|---|---:|---:|---:|---:|
| Gross AR | ₹14.49 Cr | ₹12.96 Cr | ₹4.74 Cr | ₹32.19 Cr |
| Inter-company AR | ₹7.14 Cr | ₹10.30 Cr | ₹3.49 Cr | ₹20.93 Cr |
| External AR | ₹7.35 Cr | ₹2.66 Cr | ₹1.25 Cr | ₹11.26 Cr |
| Gross Sales FY26 | ₹29.28 Cr | ₹18.63 Cr | ₹3.10 Cr | ₹51.01 Cr |
| External Sales | ₹25.04 Cr | ₹8.13 Cr | ₹2.66 Cr | ₹35.83 Cr |

Real group external DSO ≈ 115 days (gross 209 days is inflated by unreconciled IC).

## Top open actions (ERP migration prep)

1. **Tri-party IC reconciliation** — DCEPL↔DSPL ₹6.23 Cr gap; DCEPL↔Gear Up ₹6.56 Cr mirror failure (both claim receivable)
2. **Reclassify ₹5.43 Cr non-debtor** entries out of Sundry Debtors (HDFC loans, deposits, creditors with Dr balance)
3. **Write off ₹88 L legacy** (OP_BAL entries + >1000-day bills, including Cochin Shipyard ₹94L since 2021)
4. **Knock ₹1.11 Cr customer advances** against oldest outstanding (SHREE SAI HIRING ₹52.67L largest)
5. **JCB India bulk reconcile** 395 bills across 4 state ledgers

## 12 clarifying questions sent to user

Embedded in each HTML report under `#questions` section. Key ones:
- Which side of DCEPL↔DSPL ₹6.23 Cr mismatch is authoritative?
- Cochin Shipyard ₹94L stuck since 2021 — write off or legal pursuit?
- Gear Up as separate ERPNext Company or sub-unit of DCEPL?
- ERP cutover date? (recommended 1-Apr-2026, post-cleanup)

## Awaiting user response on the 12 questions before proceeding to ERPNext migration plan.
