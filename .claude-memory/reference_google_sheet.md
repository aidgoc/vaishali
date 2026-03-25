---
name: Price List Google Sheet
description: Google Sheet with DSPL product costing, pricing tiers, targets, service assumptions, salary budgets — used as planning reference
type: reference
---

- **URL:** https://docs.google.com/spreadsheets/d/1-2gJK9zEGSQY1rvBTdT14uRFijTd7Hbo/edit
- **Owner:** Bharti Gokhale
- **Access:** Anyone with the link (view)

**7 Sheets:**
1. **Sheet1** — Product price list: BOM Cost, Min Price, Margin, Factory Margin %, List Price, Sales Budget, Qty, Total Budget, Salary, Incentive, TA/DA
2. **Costing** — Detailed BOM costing with Buy Price, Factory Margin %
3. **Costing 1** — Floor/Target/List pricing tiers. **Pricing formula: Floor=40% margin, Target=45%, List=50%**
4. **Target-Incentive** — Annual targets by variant (₹7Cr total). Incentive slabs: <80%=0, 80-100%=1%, ≥100%=1.2%. Value multiplier: Target=1.1×, Floor=1.0×, Below Floor=0.7×
5. **Sales** — Department salary structure (₹7.59L/mo). P&L rollup: Sales ₹6.5Cr, Material ₹3.9Cr, Salary ₹91L, Travel ₹22.77L
6. **Service** — Per-product installation cost: days, men, man-days, travel days, boarding, lodging. Rates: salary ₹285/day, travel ₹1,200, boarding ₹350, lodging ₹1,800
7. **Production** — Manufacturing process flow per product

**Key figures:**
- Annual target: ₹7Cr (5 variants: Tower Crane Products ₹2.23Cr, Tower Crane Project ₹2.10Cr, EOT ₹1.54Cr, MRT ₹66L, Mobile ₹47.5L)
- Budgeted travel: ₹22.77L/year (actual EPS expenses from Krisp: ₹28.71L)
- Service estimates: ₹17.9L total (covers only 3 products, 25 products have no estimate)
- Revenue at target quantities × target prices: ₹12.73Cr (182% of ₹7Cr target — assumes ~55% of volumes sell)

**Now seeded in ERPNext** as Sales Target records (6 records for FY 2025-2026).
