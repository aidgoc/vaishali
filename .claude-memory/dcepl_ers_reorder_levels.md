---
name: DCEPL ERS reorder levels + auto MR
description: Wedge 3 of ERS Store SOP — 405 Item Reorder rows on Stores - DCEPL feeding ERPNext's auto Material Request cron
type: project
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
Wedge 3 of the DCEPL CWS Store SOP (signed off 25/03/2026). Live since 2026-05-08, commit `5ed026c`.

**What it does:** ERPNext's built-in `erpnext.stock.reorder.reorder_item` scheduler now auto-creates Purchase Material Requests when actual qty in `Stores - DCEPL` falls below the workshop sheet's Min threshold. No custom hook — just data + a Stock Settings flag.

**State on prod:**
- 405 Item Reorder child rows on Items (warehouse=`Stores - DCEPL`, type=Purchase)
- `Stock Settings.auto_indent = 1`
- Source: `min_stock` → `warehouse_reorder_level`, `reorder_qty` → `warehouse_reorder_qty`
- 468 of 873 matched parts skipped — they're `AsPerRequirement` segment with no Min/Reorder data
- 287 still missing-from-Item-master (same CSV as wedge 2)

**Why:** Codifies "Green / Yellow / Red" stock-band reordering from the SOP without custom code. ERPNext does the heavy lifting once the reorder rows + auto_indent flag are set.

**How to apply:**
- New parts added to ERPNext Item master + back-filled in `vaishali/data/ers_abc_classification.json` will pick up reorder rows on next `import_reorder(dry_run=False)` — fully idempotent (verified: 405 unchanged on re-run dry).
- `_target_warehouse()` reads `site_config.dcepl_ers_warehouses[0]` if present, else defaults to `Stores - DCEPL`. Same warehouse as wedge 1's QA/QC scope.
- ERPNext has no max-stock cap concept — `max_stock` from sheet is informational only and not pushed into Item Reorder. If a max is needed later, would require a custom guard on Stock Entry / Purchase Receipt.
- Code at `vaishali/setup_ers_reorder.py`. Reuses suffix-match index from wedge 2 (`setup_ers_abc.py`).
