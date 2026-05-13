---
name: tabSeries counter not bumped by data sync
description: Any sync that imports docs with explicit names (DCEPL→DGOC sync did this) must INSERT/UPDATE the tabSeries counter row, otherwise next user-created doc collides at sequence 0001.
type: feedback
originSessionId: dd85063d-0fe1-462d-90fc-7cbeba430cfe
---
**Trap:** When a script imports documents (Sales Order, Quotation, Delivery Note, etc.) with EXPLICIT names like `SO/2026-2027/0001`, Frappe's auto-name on subsequent user-created docs starts from `0001` again because the `tabSeries.current` counter wasn't updated.

**Symptom:** User creates a new Sales Order from the desk — gets `Duplicate Name: SO/2026-2027/0001 already exists`. Same for Quotation `22/2026-2027/`, Delivery Note `DN-26-`, etc.

**Why:** A user-typed/auto-generated name and a counter-derived name come from the same series prefix but the counter only auto-increments when Frappe's `make_autoname()` runs — which doesn't happen on imports with `doc.name = "..."` set explicitly.

**How to apply:** After any sync that inserts named documents, run an UPSERT on `tabSeries` for every prefix the sync touched:

```python
INSERT INTO tabSeries (name, current) VALUES (%s, %s)
ON DUPLICATE KEY UPDATE current = VALUES(current);
```

Where `current = MAX(sequence_number)` of imported docs for that prefix.

**Audit script pattern:** for each doctype, scan distinct name prefixes (collapsing trailing digit-runs to ####), filter out amendment artefacts (regex `.*/\d+-$`), find max sequence per prefix, compare to `tabSeries.current`. Fix script lived locally only (`/tmp/series_fix.py` during 2026-05-04 session); recreate as needed.

**Hit dates:**
- 2026-05-04: DCEPL→DGOC sync imported 31 SOs + 129 Quotes + 4 DNs. `SO/2026-2027/` counter was MISSING entirely (never created); `22/2026-2027/` was at 2 vs max 77; `22/2025-2026/` was at 280 vs max 299; `DN-26-` was at 3 vs max 7. User hit it ~1 week later when first new SO of FY 26-27 was created. Fixed all 4 series in one bench-execute pass.

**Action items already in memory:**
- The DCEPL→DGOC sync code at `~/vaishali/data/dcepl_sync_2026-05-04/` should be patched to do the UPSERT itself. Until then, every future sync run risks the same issue.
