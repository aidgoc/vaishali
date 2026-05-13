---
name: Tally → ERPNext sync deferred
description: Direct Tally→ERPNext voucher sync was scoped on 2026-05-02 and explicitly deferred — wait until other ERPNext modules stabilise before revisiting
type: project
originSessionId: 22db65ed-7a1e-46c8-ac14-5dd5e5886675
---
On 2026-05-02 the user pulled 14-day-fresh Tally data (4 companies, 69,656 voucher entries, 25 MB JSON) and we built a recovery report for ERS-Rental. The natural next step was an AI tool that lets the Vaishali agent answer "what's outstanding" / "what's our cash position" from Tally cache. Mid-design the user pivoted to a bigger ask — "direct Tally → ERPNext link so all entries get filled in ERPNext properly" — then immediately deferred it: *"this will get messy, lets wait for all other modules to get implemented."*

**Why:** ERPNext is currently 7/10 with weak finance data quality (1,017 draft SIs, 0 POs, 24/6,471 item prices, 267 draft PEs). Voucher-level Tally→ERPNext sync needs Customer/Supplier identity matching (1,896 ↔ 506), CoA mapping, item-line reconstruction, tax-template translation, idempotency via `tally_voucher_id`, inter-company double-count handling, and a one-time vs ongoing decision. That's 3-4 weeks of careful work and *only* makes sense once the operational modules (sales pipeline, manufacturing, service, HR) are stable enough that finance is the actual bottleneck.

**How to apply:** Don't propose Tally→ERPNext sync, voucher import, or "make ERPNext mirror Tally" until the user explicitly raises it again. When they do, the right starting point is a read-only diff (every Tally voucher → matching ERPNext doc or "missing") — that report is 1 day of work and tells us if this is a 1-week or 4-week project. Don't start with code, start with the diff.

**What's still useful and lives on the Mac:**
- `~/ers/scripts/tally_fetch_all_companies.py` — pulls ledger closing balances per company
- `~/ers/scripts/tally_fetch_all_entries.py` — pulls every voucher's full ledger entries (re-runnable)
- `~/ers/scripts/tally_for_vaishali.py` — builds 4 lean JSON feeds for the deferred AI agent tool
- `~/ers/data/tally/` — fresh snapshot (2026-05-02), with `tally_2026-04-18_backup/` preserved
- `~/ers/reports/recovery_ers_rental.{html,xlsx,pdf}` — ERS rental recovery report sent via Jarvis Telegram
