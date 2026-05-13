---
name: Stale item_group on Quotation Item child rows
description: Amending an old Quotation fails when its cached item_group no longer exists as an Item Group record. Item Group renames/deletes silently break amend on every historical quote.
type: project
originSessionId: 8442dfe0-4de8-498a-846d-e1c7bdf3a9b9
---
**Symptom.** Amending a Quotation throws `Could not find Row #1: Item Group: <NAME>`. The child rows on `tabQuotation Item` carry an `item_group` value (denormalised from the Item at the time the original quote was created). When ERPNext re-validates the Link field on amend/save, the lookup fails because the named Item Group has since been deleted or renamed.

**Why this happens.** `Quotation Item.item_group` is a `fetch_from = item.item_group` field — it's *cached* on the child row at insert time and never refreshed. Same pattern lives on Sales Order Item, Delivery Note Item, Sales Invoice Item, etc. If anyone reorganises the Item Group tree, every old quote pointing at the removed group becomes un-amendable.

**First seen 2026-05-12.** Arti tried to amend `22/2026-2027/0009-6`. The 14 BLF01* electric scissor lift items had been moved from `ELECTRIC SCISSOR (BLF01)` → `BATTERY (01)` (genuinely wrong — they're scissor lifts not batteries), and the source group deleted. Fix:
1. Re-created Item Group `ELECTRIC SCISSOR (BLF01)` under `03. Finished Products EPS (BL)` (sibling pattern: `SCISSOR JCB (F)`).
2. Reassigned BLF01001–BLF01014 back to it.
3. `bench clear-cache`.

**Why:** denormalised fetch_from values + Item Group rename = silent landmines on every historical document. There is no automatic backfill.

**How to apply:** before deleting/renaming any Item Group, run `SELECT DISTINCT item_group, COUNT(*) FROM \`tab<DocType> Item\` WHERE item_group=<old name>` across Quotation/Sales Order/Delivery Note/Sales Invoice Item — if old documents reference it, either keep the group, or batch-update the cached values on the child rows before deletion. Same lesson applies to any `fetch_from` Link field on a submitted/historical doc.
