---
name: ERP buildout status and roadmap
description: Complete status of DSPL ERPNext + Vaishali PWA — what's built, what's missing, data inventory across all 3 systems
type: project
---

## Built in Session (2026-03-23 to 2026-03-25)

### Budget System
- Expense Budget DocType (per-employee caps, per-vertical budgets, alert/escalate thresholds)
- Budget Dashboard PWA screen (#/budget) with 3 role-based views (field/manager/admin)
- Cap enforcement hook (before_submit on Expense Claim) with Telegram escalation
- Setup script: 36 EPS employees tagged, 37 budget records seeded

### Sales Targets
- Sales Target DocType (per product/employee/FY)
- Replaced ALL hardcoded targets in 4 screens (sales-target.js, my-targets.js, monthly-report.js, revenue.js)
- 6 targets seeded: ACD ₹2.23Cr, DRM-3400 ₹2.10Cr, E-DASH EOT ₹1.54Cr, MRT ₹66L, DC-1005 ₹47.5L, All Products ₹7Cr

### Device Tracking
- 9 custom fields on Serial No (krisp_asset_id, asset_type_1/2/3, dc_number, customer_site, warranty_expiry, next_calibration, next_maintenance)
- 122 items enabled for serial number tracking
- Devices PWA screen (#/devices) with list + detail views, search, status filters
- Equipment tile on home screen Operations tab

### Other Fixes
- Dynamic company support (DSPL + DCEP employees can submit expenses)
- HR Services on home screen for all users (Leave, Salary, Expenses, Advances, Budget)
- EPS-only vertical cleanup (removed ERS/ESS/OTHER)
- SW cache bumped to v24

## Data Inventory Across 3 Systems

### ERPNext (dgoc.logstop.com) — Production
| DocType | Count | Notes |
|---------|-------|-------|
| Customers | 1,879 | 96% have "Unknown" customer group — NEEDS TAGGING |
| Suppliers | 1,807 | |
| Items | 6,456 | ~454 EPS (BK/BL/DM), ~6,000 ESS-BOSCH |
| Employees | 189 | 36 tagged EPS, 145 unassigned |
| Sales Invoices | 1,017 | ALL in Draft (docstatus=0) — NEVER SUBMITTED |
| Sales Orders | 70 (36 submitted) | |
| Quotations | 157 | 17 Open, 82 Expired, 36 Draft |
| BOMs | 223 | All active, EPS products |
| Payment Entries | 267 | ₹7.57Cr received but NOT linked to invoices |
| Serial Numbers | 0 | 122 items enabled but no serial nos created yet |
| Assets | 0 | |
| Purchase Orders | 0 | |
| Work Orders | 0 | |
| Warranty Claims | 0 | |
| Projects | 4 | Departmental buckets, not real projects |
| Expense Claims | 1 | Test only — field staff still using Krisp |
| Expense Budgets | 37 | 1 vertical + 36 per-employee (EPS only) |
| Sales Targets | 6 | 5 products + All Products |

### Frappe Cloud (dcepl.logstop.com) — Source
- 95% in sync with EC2. Minor drift: Cloud +2 customers, +4 quotes; EC2 +24 items
- Has extra apps: Helpdesk, Drive, Insights, CRM (not on EC2)
- App versions slightly behind EC2

### Krisp ERP (dgoc.krisperp.com) — Legacy (DCEP)
| Data | EPS | All Divisions |
|------|-----|--------------|
| Sales Orders | 163 (659 all statuses) | 822 |
| Invoiced Revenue | ₹4.57Cr | ₹18.41Cr |
| Leads | 566 | Unknown |
| Inquiries | 369 | Unknown |
| Quotations | 302 | Unknown |
| Projects | 788 (556 completed) | 2,835 |
| Purchase Orders | 233 | Unknown |
| Assets | N/A | 484 (office assets, NOT products) |
| Employees | ~36 EPS | 173 |
| Customers | ~100 EPS | 881 |
| Contacts | Unknown | 3,119 |
| Material Requests | 9 EPS | 72+ |

## EPS Revenue (Corrected, Krisp Data)
- **Total EPS invoiced: ₹4.57Cr** (FY 2025-26)
- Inter-company (DSPL): ₹2.54Cr (56%)
- **External EPS revenue: ₹2.03Cr**
- Top customer: L&T Construction ₹59.7L (66 invoice lines)
- Segments: Contractors 94%, Rental 1.8%, PNF 1.5%

## DSPL Business Lines
- **EPS** (Electronic Products & Safety) — crane safety electronics, SLIs, load monitors. This is what we build for. 36 employees, 454 items, 223 BOMs.
- **ESS-BOSCH** — Bosch power tools distribution. ~3,500 items. Leave alone for now (user decision 2026-03-24).

## Still Missing (Priority Order)
1. **Submit the 1,017 draft invoices** — accounting is broken without this
2. **Tag 1,809 customers by segment** (Contractor/PNF/Rental/Port/Aviation)
3. **Link payments to invoices** — outstanding shows incorrectly
4. **Project Profitability** — 788 Krisp projects with P&L, ERPNext has 4 dept buckets
5. **Purchase Requests in PWA** — 233 POs in Krisp, 0 in ERPNext
6. **Multi-level Approvals** — expenses >25K need director approval
7. **Warranty + Serial Number Tracking** — infrastructure built, needs data flow
8. **Migrate Krisp active data** — open quotes, WIP projects, open POs
