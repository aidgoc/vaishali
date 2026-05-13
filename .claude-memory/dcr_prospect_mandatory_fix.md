---
name: DCR new-prospect visits unblocked across all visit purposes
description: Daily Call Report customer + lead mandatory_depends_on now respect prospect_name. Reps logging brand-new prospects on follow-up purposes (Quotation Follow-up, Lead Follow-up, Recovery, Relationship Building) no longer hit a server-side "Customer is required" / "Lead is required" throw.
type: project
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. **Commit:** `62b85e8`.

**Symptom:** Field rep tried to log a new-prospect visit via the PWA, hit a server fail. The visit purpose was something other than "Cold Call / New Enquiry". Server returned a Frappe `ValidationError` like "Customer is required" or "Lead is required".

**Root cause:** The DCR DocField `mandatory_depends_on` expressions on `tabDocField` were:
- `customer`: `eval:in_list(['Quotation Follow-up','Order Follow-up','Recovery','Relationship Building'], doc.visit_purpose) || doc.department == 'Service'`
- `lead`: `eval:doc.visit_purpose == 'Lead Follow-up'`

Neither considered `prospect_name` as a substitute when the rep is visiting a brand-new prospect (no Customer / Lead doc exists yet).

**Fix (Property Setters in fixtures, applied via `make_property_setter`):**
- `customer.mandatory_depends_on = "eval:!doc.prospect_name && (in_list(['Quotation Follow-up','Order Follow-up','Recovery','Relationship Building'], doc.visit_purpose) || doc.department == 'Service')"`
- `lead.mandatory_depends_on = "eval:!doc.prospect_name && doc.visit_purpose == 'Lead Follow-up'"`

**Why this approach:** DCR is a `custom=1` DocType created via the desk DocType builder, so direct DocField edits via SQL bypass the fixture workflow and don't survive `bench update`. Property Setters are the correct overlay mechanism — they're exported via `bench export-fixtures --app vaishali` and committed in `vaishali/fixtures/property_setter.json`.

**How to apply:** Same pattern any time you need to relax a `mandatory_depends_on` on a custom DocType:
```python
from frappe.custom.doctype.property_setter.property_setter import make_property_setter
make_property_setter(doctype, fieldname, "mandatory_depends_on", new_eval, "Code", for_doctype=False)
# Then: bench --site <site> clear-cache && bench --site <site> export-fixtures --app vaishali
# Commit fixtures/property_setter.json.
```

**Don't:** Use raw `UPDATE tabDocField SET mandatory_depends_on = ...` SQL on production. The harness blocks it (correctly), and changes don't end up in fixtures. Always go through `make_property_setter`.

**Historical context:** Looking at `tabDaily Call Report` rows with non-null `prospect_name`, there were already 4 "Lead Follow-up" + 1 "Opportunity Follow-up" visits with prospect data — likely created before the mandatory_depends_on was tightened. The fix restores the original behaviour but keeps the desk-level mandatory rule for cases where neither prospect nor customer is set.
