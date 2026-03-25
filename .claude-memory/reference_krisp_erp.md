---
name: Krisp ERP access and data structure
description: Krisp ERP (Arrowsoft) credentials, navigation, division filters, and data for DCEP — the legacy ERP being replaced by ERPNext
type: reference
---

- **URL:** https://dgoc.krisperp.com
- **Username:** harsh
- **Password:** <ASK_USER_FOR_PASSWORD>
- **Company:** Dynamic Crane Engineers Pvt. Ltd. (DCEP)
- **Built by:** Arrowsoft Consultancy Pvt. Ltd. (v1.07.17)

**Division filters (top-right buttons):** EPS, ERS, ESS, ESS-BOSCH, OTHER
- These are TOGGLE buttons — clicking deselects that division
- To filter EPS only: deselect ERS, ESS, ESS-BOSCH, OTHER
- Filters don't work consistently across all modules (Inventory shows all items regardless)
- **DSPL only uses EPS** — ERS/ESS were DCEP-specific (user confirmed 2026-03-24)

**Division → Location mapping in Krisp:**
- EPS → single location
- ERS → ERS CWS, ERS HO
- ESS → ESS-BOSCH HO, ESS-JCB CWS, ESS-JCB HO
- HEAD OFFICE

**Key EPS data (FY 2025-26):**
- **EPS Revenue: ₹4.57Cr** (826 invoice lines, Vertical=EPS)
  - Inter-company (DSPL): ₹2.54Cr (56%)
  - External: ₹2.03Cr (~100 customers)
- 163 EPS Sales Orders (659 across all statuses including cancelled)
- 566 Leads, 369 Inquiries, 302 Quotations
- 788 EPS Projects (556 completed, 107 WIP)
- 233 EPS Purchase Orders
- 14 sales reps (Ramdas Avhad is top biller)

**Navigation:**
- Reports > Sales: Sales Register, Customer Rep Sale, Product Sale, Segment Wise Sale, Target vs Actual, Sale Items Register (has Vertical column per line item)
- Reports > Operations: Project P&L, Budget, Progress, Production Status
- Reports > HRMS: Employee Expenses, Employee Register
- Sales: Leads, Inquiries, Quotations, Sales Orders (all with EPS filter)
- Operations/Projects: Projects with BOMs, Production, Progress
- Materials: Requests, Issue/Dispatches, Returns
- Purchase: Purchase Orders
- Inventory/Stores: Store Items, Products, Finished Goods, Available Stock
- Assets: 484 assets (office equipment — NOT EPS products)
- CRM: 881 customers, 3,119 contacts
- Business Plan: P&L by vertical/rep/segment/product

**IMPORTANT:** Sale Register (customer-wise monthly) does NOT filter by EPS reliably — shows all divisions. Use Sale Items Register instead — it has a Vertical column per line item for accurate EPS filtering.

**Download limit:** 500 records per xlsx. Split by date range or use EPS filter for larger sets.
