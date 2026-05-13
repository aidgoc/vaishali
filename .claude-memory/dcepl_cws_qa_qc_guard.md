---
name: DCEPL CWS QA/QC guard
description: First implementation of the DCEPL ERS Central Workshop Store SOP — Purchase Receipt before_submit guard requiring Accepted Quality Inspection on items landing in CWS warehouse.
type: project
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
DCEPL CWS Store QA/QC guard live since 2026-05-08, commit `51e382a`.

**Why:** Implements §1 (Material Inward) of the Store Material Management Process SOP signed off 25/03/2026 by Anirudha Bhide (prepared) / Ramdas Avhad (reviewed) / Nitin Sir (approved). SOP is the first wedge of a 5-wedge DCEPL ERS programme: (1) QA/QC at GRN ✅, (2) ABC classification import, (3) auto re-order, (4) MRN approval workflow, (5) Outward Gate Pass.

**How to apply:**
- Code lives at `vaishali/qa_qc_guard.py` (guard) and `vaishali/setup_qa_qc.py` (idempotent template seeding). Wired in `hooks.py` as `Purchase Receipt.before_submit`.
- Quality Inspection Template `"DCEPL ERS Store QA/QC"` has 5 formula-based parameters: Inv OK, PO Match, Qty Match, Physical OK, Technical OK — each requires `reading_1 == "Yes"`.
- Active warehouse: `Stores - DCEPL`. The SOP says "CWS" but we did NOT rename the warehouse — FK cascade across Bin / Stock Ledger Entry / every stock-touching child table is too risky for a label change. CWS is a label inside Vaishali; the warehouse stays `Stores - DCEPL`. Mapping is via `site_config.dcepl_ers_warehouses = ["Stores - DCEPL"]`.
- Default warehouse-match rule (when `dcepl_ers_warehouses` is unset) is substring `"CWS"` in the warehouse name. If a true CWS warehouse is ever created, just clear the site_config override and it auto-activates.
- Kill switches: `site_config.dcepl_ers_qa_qc_enabled=false` (full disable) or `site_config.dcepl_ers_warehouses=[]` (match nothing).
- Other companies (DSPL, Gear Up) and other DCEPL warehouses (EPS HO, Finished Goods, WIP, Goods In Transit) are not touched by the guard.
- Source documents: `~/vaishali/docs/Store.xlsx` (5-flow SOP) and `~/vaishali/docs/QA QC Checklist ABC.xlsx` (Summary, QA_QC_Checklist sheet, Stock_Monitor ABC Analysis with 1212 rows, ESS/ERS part masters).
- DCEPL warehouse list (as of 2026-05-08): All Warehouses - DCEPL (group), EPS HO, Finished Goods, Goods In Transit, **Stores - DCEPL ← QA/QC active**, Work In Progress.
