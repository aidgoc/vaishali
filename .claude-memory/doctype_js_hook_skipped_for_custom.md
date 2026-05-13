---
name: doctype_js / doctype_list_js silently ignored for custom DocTypes
description: Frappe hooks for desk JS skip db-only DocTypes; workaround is bundling via vaishali.bundle.js
type: feedback
originSessionId: 856d0354-573a-40e3-af56-2e2124e70ae4
---
`doctype_js` and `doctype_list_js` in `hooks.py` are SILENTLY IGNORED for any DocType flagged `custom=1` (i.e. created via the Desk DocType builder rather than as files in an app). `FormMeta.add_code()` exits on `if self.custom: return` BEFORE reaching `add_code_via_hook`. The hook is registered, the file is read correctly by `get_code_files_via_hooks`, but `__list_js` / `__js` come back empty in the meta sent to the client. No error, no warning.

**Why:** Confirmed by reading `/home/frappe/frappe-bench/apps/frappe/frappe/desk/form/meta.py::FormMeta.add_code()` and verifying via `bench --site dgoc.logstop.com console` that `frappe.get_meta('Daily Call Report').get('__list_js')` is empty even after `frappe.clear_cache()` and a fresh `bench build` + supervisor restart. Hit this 2026-05-05 while wiring the DCR list-view "Map view" button.

**How to apply:** When adding desk-side JS for one of OUR custom DocTypes (Daily Call Report, Service Call, Sales Interaction, CAPA, Operator Logsheet, Vaishali Chat Log, Maintenance Visit overrides, etc.):

1. Put the JS in a file under `vaishali/public/js/<doctype_snake>_form.js` or `<doctype_snake>_list.js`.
2. Top-level register `frappe.ui.form.on('DocType Name', {...})` for forms, or `frappe.listview_settings['DocType Name'] = {...}` for lists. Both keys are read at form/list boot time.
3. `import './<doctype_snake>_form.js';` from `vaishali/public/js/vaishali.bundle.js` so esbuild includes it in the bundle that `app_include_js` loads on every desk page.
4. `bench build --app vaishali` after editing.

For STOCK ERPNext doctypes (Quotation, Lead, Customer, Sales Invoice, etc.) the `doctype_js` hook works fine — those are file-defined, `custom=0`. The current `vaishali/hooks.py::doctype_js` entries for those are correct.

Counter-check before assuming a doctype is custom: `frappe.db.get_value('DocType', 'XYZ', 'custom')` — `1` means our broken case, `0` means hooks work.
