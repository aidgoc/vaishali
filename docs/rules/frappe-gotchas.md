# Frappe Framework Gotchas

## Environment & Tooling

- Server git remote is `upstream` (not `origin`)
- EC2 Instance Connect keys expire ~60s — chain SCP+SSH in one command
- `frappe.throw()` returns HTTP 400 but does NOT create Error Log entry — check nginx access logs
- `_server_messages`: `JSON.parse(JSON.parse(msgs)[0]).message`
- `frappe.init()` scripts must `os.chdir('/home/frappe/frappe-bench/sites')` first
- Workspace scripts: `frappe.db.commit()` between card creation and workspace save
- `Desk User` not `System User` — valid Frappe role; `System User` is not a real role name
- **`bench execute --kwargs '{"key":"val"}'` is flaky** — sometimes fails with `NameError: name '<your_module>' is not defined`. Mitigation: don't pass kwargs at all — expose a no-arg `run_real()` wrapper.

## Aggregates & Queries

- **`frappe.db.get_value` with `SUM()` returns the FIRST matching row, not the aggregate.** `frappe.get_all(..., fields=["SUM(x) as v"])` also lies — Frappe adds an implicit `GROUP BY name`. Use `frappe.db.sql("SELECT COALESCE(SUM(...),0) FROM tab... WHERE ...", values)` for any real aggregate.
- **View Engine: don't auto-inject `company` filter on DocTypes that lack a `company` column.** `vaishali/views/engine.py` checks `frappe.get_meta(dt).has_field("company")` first. Preserve the guard (commit `9cd7943`).

## Rename / Docnames

- **`frappe.rename_doc(doctype, old, new, merge=False)`** does NOT accept `ignore_permissions`. Just don't pass it. Uses current user's perms; under `bench execute` that's Administrator. Renaming cascades to all FK references. Set `merge=True` if target name exists.
- **Frappe disallows `<` and `>` in docnames** (`NameError: Name cannot contain special characters`). Use word forms ("90d+"). Always guard workspace layout JSON references against missing cards/charts.
- **Frappe autoname:** dotted series like `GP-.YYYY.-.#####` must NOT have the `format:` prefix — that prefix is for curly-brace templates only.

## Permissions & Roles

- **`User.append("roles", ...)` + `User.save()` silently drops new role rows in this env, even with `ignore_permissions=True`.** Bypass with direct `Has Role` insert + `frappe.clear_cache(user=...)`:
  ```python
  frappe.get_doc({"doctype":"Has Role","parent":user,"parenttype":"User","parentfield":"roles","role":role_name}).insert(ignore_permissions=True)
  frappe.clear_cache(user=user)
  ```
- **Bulk Frappe User creation has TWO gates.** (1) `User.validate()` runs `password_strength_test()` whenever `new_password` is on the doc — bypass by inserting User WITHOUT `new_password`, then `frappe.utils.password.update_password(email, pwd)`. (2) `User.before_insert` calls `throttle_user_creation()` (60/min) — bypass with `frappe.flags.in_import = True`.
- **Frappe v15 User has NO `force_password_reset` field.** Custom Field added in `085eede`, exported to `vaishali/fixtures/custom_field.json`.
- **Guest hits on `/api/method/vaishali.*` return 401, not 403:** `vaishali/auth_guard.py` converts Guest hits to `frappe.SessionExpired` (HTTP 401). Don't remove the hook unless every installed PWA has been refreshed. New `allow_guest=True` endpoints must be prefix-allowlisted in `_GUEST_ALLOWED_PREFIXES`.

## File DocType

- **Frappe `File` doctype has NO `description` field.** Tag with metadata by prefixing `file_name` with `[CODE] original-name.ext`. Searchable via `LIKE '[CODE]%'`.
- **`frappe.utils.file_manager.save_file(dt=None, dn=None, ...)` creates an unattached File.** No parent doctype, no perm check on parent — perfect for "stage now, re-parent on submit". PWA's `fieldAPI.uploadFile(file, '', '')` routes through the same path.
- **Content-hash dedup: same bytes → same File doc returned.** In tests, randomise content or accept the dedup.

## Custom DocType JS Hooks

- **`doctype_js` and `doctype_list_js` hooks are SILENTLY IGNORED for db-only (custom) DocTypes.** `FormMeta.add_code()` exits on `if self.custom: return`. DCR / Service Call / Sales Interaction / CAPA / Operator Logsheet — anything created via Desk DocType builder — are `custom=1` and hit this. **Workaround:** put JS in `vaishali/public/js/` and `import` from `vaishali.bundle.js` (loaded on every desk page via `app_include_js`). Register `frappe.ui.form.on(...)` / `frappe.listview_settings[...] = {...}` at module top-level.

## Stale `fetch_from` on Child Tables

- **`Quotation Item.item_group` (and SO/DN/SI Item) is `fetch_from` — cached at row insert, never refreshed.** Renaming or deleting an Item Group silently breaks amend/save on every historical document (`Could not find Row #1: Item Group: X`). Before any Item Group rename/delete, scan `tabQuotation Item / tabSales Order Item / tabDelivery Note Item / tabSales Invoice Item` for the old name.

## Number Cards / Dashboard Charts / Workspaces

- **Filter format = 5-element list:** `[doctype, field, operator, value, is_dynamic_bool]`. 3-element form is accepted on save but explodes at render with `"Operator must be one of <=, <, >, ... Invalid filter: ="` — blocks all sibling cards on the same workspace.
- Time windows: use native `Timespan` operator (`"this month"`, `"today"`, `"this year"`).
- `dynamic_filters_json` is 4-element: `[doctype, field, op, "<JS_expression>"]` — expression runs in the **browser**, so use `frappe.datetime.add_days(frappe.datetime.nowdate(), -30)` not `frappe.utils.*`.
- **Number Card autoname = `label`; Dashboard Chart autoname = `chart_name`.** Setting `.name` is ignored — collisions get `-2`, `-3` suffixes.
- **Workspace Shortcut URL type uses `url` field, not `link_to`.** `link_to` is a Dynamic Link (DocType / Report / Page / Dashboard).
- Workspace `content` JSON must filter out None references before `json.dumps` — orphans trigger "Invalid filter: =" popups blocking the whole page.
