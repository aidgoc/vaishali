---
name: Frappe autoname — drop "format:" prefix for dotted series
description: Frappe autoname patterns that use dot-separated series (.YYYY., .#####) must NOT have the "format:" prefix; that prefix is only for curly-brace templates
type: feedback
originSessionId: 9a0bc273-c7f6-4a93-9981-549cccdb969e
---
**Rule:** in a Frappe DocType JSON, autoname patterns using dot-separated series like `.YYYY.` or `.#####` must be written without the `format:` prefix.

**Why:** the `format:` prefix tells Frappe's autoname engine to treat the value as a curly-brace template (e.g. `format:LM-{employee}-{date}`). For dotted series patterns, Frappe parses the dots natively — adding `format:` makes Frappe treat the dots as literal characters, producing literal docnames like `GP-.YYYY.-.#####`.

**How to apply:**
- Use `"autoname": "GP-.YYYY.-.#####"` for dotted series with date + counter
- Use `"autoname": "format:LM-{employee}-{date}"` for templates with field interpolation
- Don't mix: `"format:GP-.YYYY.-.#####"` is broken (hit 2026-05-08 on Outward Gate Pass; produced `GP-.YYYY.-.#####` literally as the docname). Fixed in commit `41043c7`.

**Detection:** if a newly-created submittable doc shows the autoname pattern verbatim as its name (`GP-.YYYY.-.#####`), check the `format:` prefix. The E2E test (`vaishali.test_store_sop_e2e`) catches this.
