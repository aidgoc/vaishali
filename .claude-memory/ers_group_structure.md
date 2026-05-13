---
name: Dynamic Group Entity Structure
description: How DCEPL / DSPL / Gear Up relate, and what each division means. Reference for classification in any Tally / ERP analysis.
type: reference
originSessionId: 951bc42a-17f8-4fe5-8222-2d8cb5d2b989
---
# Dynamic Group — entity & division structure

## Entities

- **DCEPL** — Dynamic Crane Engineers Pvt Ltd. Historic parent, primary operator. All divisions originally lived here.
- **DSPL** — Dynamic Servitech Pvt Ltd. Created later to take EPS + ESS product operations. Manufactures/imports; ~56% of DSPL FY26 sales flow to DCEPL for onward sale.
- **Gear Up Rental** — Created purely as an asset-holding / loan vehicle. Owns ~30 JLG boom lifts (₹1.72 Cr NBV, ₹21.3L secured loan). Operationally identical to DCEPL ERS — rents via DCEPL. Only 11 sales vouchers in FY26.

## Divisions (DCEPL)

| Code | Meaning | Voucher type(s) |
|---|---|---|
| **EPS** | Electronic Products (DJ-1005, ACD, load sensors, wind-speed) | `Sales EPS` |
| **ESS** | JCB + Bosch Dealership (sub-div of EPS) — Electric Scissor JCB models, Bosch grinders/saws | `Sales ESS`, `Sales Bosch` |
| **ERS** | Equipment Rental + 2nd hand equipment trade | `Sales MLR` (rental / Fixed Hiring Charges), `Sales SRS` (service/spares/trade items) |
| **GEN** | Miscellaneous | `Sales GEN`, `Sales` |

## Divisions (DSPL)

DSPL has EPS and ESS. No ERS (doesn't do rental). Same voucher-type naming as DCEPL.

## Inter-company parties (detect via substring match)

- `DYNAMIC CRANE` → DCEPL
- `DYNAMIC SERVITECH` or `DSPL` → DSPL
- `GEAR UP` or `GEARUP` → Gear Up

Both DCEPL and DSPL keep TWIN LEDGERS per counterparty ("X Dr" and "X Cr") — this is a hygiene issue; should consolidate via netting JVs before ERP migration.

## How to apply

When analyzing Tally data for any company:
- AR classification for DCEPL uses `division` field in debtor master
- Revenue by division always goes by voucher type (authoritative), NOT party
- DSPL debtor master isn't division-tagged — only split REVENUE by voucher type, keep AR at company level
- Gear Up has tiny volumes — treat its entire AR/Sales as ERS-equivalent
- When reconciling inter-company, always check BOTH sides (mirror expectation)
