---
name: DCEPL ERS ABC classification
description: 4 custom fields on Item populated from the workshop ABC analysis sheet — wedge 2 of the DCEPL CWS Store SOP. Match rate 75% (873/1160), 287-row gap surfaced as CSV.
type: project
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
DCEPL ERS ABC classification on Item live since 2026-05-08, commits `9a241f2` → `647c53e`.

**Why:** Wedge 2 of the 5-wedge DCEPL CWS Store SOP. Source: `docs/QA QC Checklist ABC.xlsx` Stock_Monitor tab (1212 rows) and the four bucket sheets (Regular Parts, As per Requirements, No future Requirement, No future Requirement - Trading). Encodes Pareto class + stock health + segment + department directly on the Item master so reports / View Engine sections / dashboards can filter on them without a join.

**How to apply:**
- 4 Select fields on Item: `ers_abc_class` (A/B/C), `ers_abc_status` (RED/YELLOW/GREEN), `ers_abc_segment` (Regular/AsPerRequirement/NoFuture/NoFutureTrading), `ers_department` (ERS/ESS), plus a section + column break. All in `vaishali/fixtures/custom_field.json`.
- Source JSON: `vaishali/data/ers_abc_classification.json` (1160 rows). Force-tracked despite `vaishali/data/` gitignore — same pattern as `tutorial_content.json`. Built locally from xlsx via `/tmp/build_abc_json.py` (one-shot preprocessing — re-run on master sheet refresh).
- Importer: `vaishali/setup_ers_abc.py`.
  - `ensure_fields()` — idempotent custom field create.
  - `import_abc(dry_run=True|False)` — matches Part No → Item.item_code with **1-letter prefix suffix index**. Workshop sheet is bare ("FI02008"); ERPNext codes carry prefix ("EFI02008"). Suffix matches with exactly one prefix-letter candidate; ambiguous matches (>1 letter prefix found) are skipped and reported. Idempotent — only writes diffs.
  - `dump_missing()` — writes 287 unmatched part numbers to `<site>/private/files/ers_abc_missing_parts.csv` with all available metadata (part name, dept, equipment, model, unit, ABC class, status, segment, min/reorder/max stock).
- **bench-execute kwargs gotcha:** the `--kwargs` value is parsed as a Python literal, not JSON. Pass `"{'dry_run': True}"` (capital True) — not `'{"dry_run": true}'`. Lowercase `true` raises `NameError`.
- After live run: 873/1160 matched (75%), 102 A / 236 B / 121 C populated. 287-row CSV produced for store-team to import as new Items via Data Import.
- Re-running `import_abc(dry_run=False)` after the store team adds the missing Items is safe — diff-based update.
- Process learning: `bench export-fixtures --app vaishali` after each desk customization is the law. The May 8 export caught 27 fields beyond mine (21 Project AMC/warranty fields someone added on the desk and didn't commit).
