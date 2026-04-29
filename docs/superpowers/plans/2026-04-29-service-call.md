# Service Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `Service Call` DocType, a PWA logging flow targeting a 10-second save, and a PWA-only-create + truth-field-lock guard mirroring `vaishali/visit_guard.py`. Wire it through service-dashboard, customer-detail, and warranty-claim entry points, plus a "Visit needed → pre-filled DCR" handoff.

**Architecture:** New DocType in `vaishali/vaishali/doctype/service_call/` (parallel to Sales Interaction). One Python guard hook on `before_save`. Five PWA-side whitelisted endpoints in `vaishali/api/field.py` set `frappe.local.flags["from_pwa"] = True` to satisfy the guard. PWA screen at `vaishali/public/field/screens/service-call.js` (list + form + detail). The `create_dcr` endpoint accepts a new `from_service_call` kwarg that writes back into `Service Call.follow_up_dcr` after the DCR insert.

**Tech Stack:** Frappe v15 (Python), vanilla JS PWA with `el()` DOM builder, M3 components from `vaishali/public/field/ui.js`, MariaDB.

**Spec:** `docs/superpowers/specs/2026-04-29-service-call-design.md` (commit `20fc5c2`).

---

## File map

```
NEW
  vaishali/vaishali/doctype/service_call/__init__.py
  vaishali/vaishali/doctype/service_call/service_call.json     ← DocType definition
  vaishali/vaishali/doctype/service_call/service_call.py       ← Server class (validate hook for call_datetime guard)
  vaishali/service_call_guard.py                               ← before_save hook
  vaishali/public/field/screens/service-call.js                ← PWA list + form + detail

MODIFY
  vaishali/api/field.py                                        ← +5 endpoints, +get_customer_context, modify create_dcr
  vaishali/hooks.py                                            ← doc_events + scheduler_events
  vaishali/notifications.py                                    ← +remind_pending_visit_needed_calls
  vaishali/public/field/api.js                                 ← +5 path translations
  vaishali/public/field/app.js                                 ← +3 routes
  vaishali/public/field/screens/service-dashboard.js           ← +Calls today tile + Recent calls section
  vaishali/public/field/screens/customer-detail.js             ← +Log call action chip
  vaishali/public/field/screens/breakdown.js                   ← +Log call action chip
  vaishali/public/field/sw.js                                  ← bump CACHE_NAME
```

---

## Task 1: Create Service Call DocType definition

**Files:**
- Create: `vaishali/vaishali/doctype/service_call/__init__.py`
- Create: `vaishali/vaishali/doctype/service_call/service_call.json`
- Create: `vaishali/vaishali/doctype/service_call/service_call.py`

- [ ] **Step 1: Create the package init**

```bash
mkdir -p vaishali/vaishali/doctype/service_call
touch vaishali/vaishali/doctype/service_call/__init__.py
```

- [ ] **Step 2: Write the DocType JSON**

Create `vaishali/vaishali/doctype/service_call/service_call.json`:

```json
{
  "actions": [],
  "allow_rename": 0,
  "autoname": "SVC-.YYYY.-.#####",
  "creation": "2026-04-29 12:00:00",
  "doctype": "DocType",
  "engine": "InnoDB",
  "field_order": [
    "call_datetime",
    "column_break_id",
    "employee",
    "employee_name",
    "section_break_required",
    "customer",
    "customer_name",
    "channel",
    "column_break_required",
    "outcome",
    "summary",
    "section_break_optional",
    "direction",
    "duration_minutes",
    "column_break_optional",
    "device",
    "warranty_claim",
    "section_break_contact",
    "contact",
    "contact_phone",
    "section_break_conversion",
    "follow_up_dcr",
    "section_break_notes",
    "remarks",
    "section_break_telemetry",
    "form_opened_at",
    "form_saved_at"
  ],
  "fields": [
    {"fieldname": "call_datetime", "fieldtype": "Datetime", "label": "Call Date/Time", "reqd": 1, "default": "Now", "in_list_view": 1},
    {"fieldname": "column_break_id", "fieldtype": "Column Break"},
    {"fieldname": "employee", "fieldtype": "Link", "label": "Employee", "options": "Employee", "reqd": 1, "in_list_view": 1},
    {"fieldname": "employee_name", "fieldtype": "Data", "label": "Employee Name", "fetch_from": "employee.employee_name", "read_only": 1},
    {"fieldname": "section_break_required", "fieldtype": "Section Break", "label": "Call Details"},
    {"fieldname": "customer", "fieldtype": "Link", "label": "Customer", "options": "Customer", "reqd": 1, "in_list_view": 1},
    {"fieldname": "customer_name", "fieldtype": "Data", "label": "Customer Name", "fetch_from": "customer.customer_name", "read_only": 1},
    {"fieldname": "channel", "fieldtype": "Select", "label": "Channel", "options": "Phone\nWhatsApp\nOther", "reqd": 1, "default": "Phone", "in_list_view": 1},
    {"fieldname": "column_break_required", "fieldtype": "Column Break"},
    {"fieldname": "outcome", "fieldtype": "Select", "label": "Outcome", "options": "Resolved on call\nVisit needed\nPending\nCustomer unreachable", "reqd": 1, "in_list_view": 1},
    {"fieldname": "summary", "fieldtype": "Small Text", "label": "Summary", "reqd": 1},
    {"fieldname": "section_break_optional", "fieldtype": "Section Break", "label": "More Details", "collapsible": 1},
    {"fieldname": "direction", "fieldtype": "Select", "label": "Direction", "options": "Inbound\nOutbound", "default": "Inbound"},
    {"fieldname": "duration_minutes", "fieldtype": "Int", "label": "Duration (min)"},
    {"fieldname": "column_break_optional", "fieldtype": "Column Break"},
    {"fieldname": "device", "fieldtype": "Link", "label": "Device", "options": "Device"},
    {"fieldname": "warranty_claim", "fieldtype": "Link", "label": "Warranty Claim", "options": "Warranty Claim"},
    {"fieldname": "section_break_contact", "fieldtype": "Section Break", "label": "Contact", "collapsible": 1},
    {"fieldname": "contact", "fieldtype": "Link", "label": "Contact", "options": "Contact"},
    {"fieldname": "contact_phone", "fieldtype": "Data", "label": "Contact Phone", "fetch_from": "contact.mobile_no", "read_only": 1},
    {"fieldname": "section_break_conversion", "fieldtype": "Section Break", "label": "Follow-up"},
    {"fieldname": "follow_up_dcr", "fieldtype": "Link", "label": "Follow-up Visit", "options": "Daily Call Report", "read_only": 1},
    {"fieldname": "section_break_notes", "fieldtype": "Section Break", "label": "Notes (desk)"},
    {"fieldname": "remarks", "fieldtype": "Small Text", "label": "Remarks"},
    {"fieldname": "section_break_telemetry", "fieldtype": "Section Break", "label": "Telemetry", "collapsible": 1, "hidden": 1},
    {"fieldname": "form_opened_at", "fieldtype": "Datetime", "label": "Form Opened At", "read_only": 1},
    {"fieldname": "form_saved_at", "fieldtype": "Datetime", "label": "Form Saved At", "read_only": 1}
  ],
  "is_submittable": 0,
  "links": [],
  "modified": "2026-04-29 12:00:00",
  "modified_by": "Administrator",
  "module": "Vaishali",
  "name": "Service Call",
  "owner": "Administrator",
  "permissions": [
    {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1, "print": 1, "share": 1, "email": 1},
    {"role": "Service Manager", "read": 1, "write": 1, "create": 1, "report": 1, "export": 1, "print": 1, "email": 1},
    {"role": "Service User", "read": 1, "write": 1, "create": 1, "report": 1, "print": 1},
    {"role": "Sales Manager", "read": 1, "report": 1, "export": 1, "print": 1},
    {"role": "Sales User", "read": 1, "print": 1}
  ],
  "sort_field": "call_datetime",
  "sort_order": "DESC",
  "title_field": "customer_name",
  "track_changes": 1
}
```

- [ ] **Step 3: Write the server class with the call_datetime guard**

Create `vaishali/vaishali/doctype/service_call/service_call.py`:

```python
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime


class ServiceCall(Document):
	def validate(self):
		self._guard_call_datetime()

	def _guard_call_datetime(self):
		# Cannot move call_datetime more than 24h from its original value
		# (prevents desk users from backdating beyond legitimate "I forgot
		# to log this earlier today" range).
		if self.is_new():
			return
		previous = self.get_doc_before_save()
		if not previous or not previous.call_datetime:
			return
		new_dt = get_datetime(self.call_datetime)
		old_dt = get_datetime(previous.call_datetime)
		delta = abs((new_dt - old_dt).total_seconds())
		if delta > 24 * 3600:
			frappe.throw(
				_("Call Date/Time cannot be moved more than 24 hours from its original value."),
				title=_("Edit blocked"),
			)
```

- [ ] **Step 4: Validate the JSON parses**

```bash
python3 -c "import json; json.load(open('vaishali/vaishali/doctype/service_call/service_call.json')); print('OK')"
```

Expected: `OK`.

- [ ] **Step 5: Validate the Python parses**

```bash
python3 -m py_compile vaishali/vaishali/doctype/service_call/service_call.py && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add vaishali/vaishali/doctype/service_call/
git commit -m "feat(service-call): add DocType definition with truth-field schema"
```

---

## Task 2: service_call_guard.py with TDD

**Files:**
- Create: `vaishali/service_call_guard.py`

This task mirrors `vaishali/visit_guard.py`. The truth-fields are different (`customer`, `channel`, `outcome`, `call_datetime`, `employee`) and the no-from-PWA error message references the field app.

- [ ] **Step 1: Write the guard module**

Create `vaishali/service_call_guard.py`:

```python
"""PWA-only Service Call creation guard.

Policy: service calls must be logged via the field app so the engineer
captures the call as it happens (or right after). The desk can edit
existing calls — adding remarks, updating direction/duration/device/
warranty_claim/contact — but cannot create new ones, and cannot edit
the truth-fields once captured.

The PWA endpoints in `vaishali.api.field` set `frappe.local.flags.from_pwa
= True` before saving. This hook rejects any insert without that flag
and reverts truth-field edits made from a non-PWA path.
"""

import frappe
from frappe import _

_TRUTH_FIELDS = ("customer", "channel", "outcome", "call_datetime", "employee")


def _from_pwa() -> bool:
	return bool(getattr(frappe.local, "flags", None) and frappe.local.flags.get("from_pwa"))


def enforce(doc, method=None):
	if doc.is_new():
		if not _from_pwa():
			frappe.throw(
				_(
					"Service Calls must be logged from the field app. "
					"Use https://dgoc.logstop.com/field on your phone."
				),
				title=_("Logging blocked"),
			)
		return

	if _from_pwa():
		return

	original = doc.get_doc_before_save()
	if not original:
		return

	reverted = False
	for field in _TRUTH_FIELDS:
		old_val = original.get(field) or ""
		new_val = doc.get(field) or ""
		if str(new_val) != str(old_val):
			doc.set(field, original.get(field))
			reverted = True

	if reverted:
		frappe.msgprint(
			_("Truth fields (Customer, Channel, Outcome, Call Date/Time, Employee) can only be set by the field app and were not changed."),
			indicator="orange",
			alert=True,
		)
```

- [ ] **Step 2: Validate Python parses**

```bash
python3 -m py_compile vaishali/service_call_guard.py && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Stage a server-side test script (will be run after deploy in Task 12)**

Save locally at `/tmp/_test_service_call_guard.py` for later SCP. Content:

```python
import frappe


@frappe.whitelist(allow_guest=True)
def run_tests():
	"""Server-side tests for service_call_guard.

	Run via: bench --site dgoc.logstop.com execute vaishali._test_service_call_guard.run_tests
	"""
	out = []
	test_doc_name = None

	# Test 1: desk-create blocked
	frappe.set_user("Administrator")
	try:
		doc = frappe.new_doc("Service Call")
		doc.employee = "SAMBHAJI SADASHIV SONAWALE"
		doc.customer = "CS1558"
		doc.channel = "Phone"
		doc.outcome = "Resolved on call"
		doc.summary = "Test desk-create"
		doc.call_datetime = frappe.utils.now()
		doc.insert(ignore_permissions=True)
		out.append("Test 1 FAIL: desk insert succeeded")
	except Exception as e:
		msg = str(e)[:200]
		if "field app" in msg or "blocked" in msg.lower():
			out.append("Test 1 PASS: desk-create blocked")
		else:
			out.append(f"Test 1 UNEXPECTED: {type(e).__name__}: {msg}")
	finally:
		frappe.db.rollback()

	# Test 2: PWA-flagged insert works
	frappe.local.flags["from_pwa"] = True
	try:
		doc = frappe.new_doc("Service Call")
		doc.employee = "SAMBHAJI SADASHIV SONAWALE"
		doc.customer = "CS1558"
		doc.channel = "Phone"
		doc.outcome = "Resolved on call"
		doc.summary = "Test pwa-create"
		doc.call_datetime = frappe.utils.now()
		doc.insert(ignore_permissions=True)
		out.append(f"Test 2 PASS: pwa insert -> {doc.name}")
		test_doc_name = doc.name
		frappe.db.commit()
	except Exception as e:
		out.append(f"Test 2 FAIL: {type(e).__name__}: {str(e)[:200]}")
	finally:
		frappe.local.flags["from_pwa"] = False

	# Test 3: desk-edit reverts truth-fields, keeps remarks
	if test_doc_name:
		try:
			doc = frappe.get_doc("Service Call", test_doc_name)
			doc.outcome = "Visit needed"
			doc.remarks = "Test desk-edit note"
			doc.save(ignore_permissions=True)
			fresh = frappe.get_doc("Service Call", test_doc_name)
			if fresh.outcome == "Resolved on call" and fresh.remarks == "Test desk-edit note":
				out.append("Test 3 PASS: outcome reverted, remarks kept")
			else:
				out.append(f"Test 3 FAIL: outcome={fresh.outcome!r} remarks={fresh.remarks!r}")
		except Exception as e:
			out.append(f"Test 3 EXCEPTION: {type(e).__name__}: {str(e)[:200]}")
		finally:
			# Clean up the test record
			try:
				frappe.delete_doc("Service Call", test_doc_name, force=True, ignore_permissions=True)
				frappe.db.commit()
			except Exception:
				pass

	return out
```

- [ ] **Step 4: Commit the guard module**

```bash
git add vaishali/service_call_guard.py
git commit -m "feat(service-call): before_save guard mirrors visit_guard pattern"
```

---

## Task 3: Wire DocType + guard into hooks.py

**Files:**
- Modify: `vaishali/hooks.py`

- [ ] **Step 1: Read current state of doc_events**

```bash
grep -n '"Daily Call Report"\|doc_events' vaishali/hooks.py | head -5
```

Expected: shows the `doc_events` block including the existing `"Daily Call Report"` entry.

- [ ] **Step 2: Add the Service Call entry**

Edit `vaishali/hooks.py`. Find the line:

```python
    "Daily Call Report": {
        "before_save": "vaishali.visit_guard.enforce",
        "on_update": "vaishali.api.linking.on_dcr_update",
    },
```

Insert immediately AFTER it (still inside the `doc_events` dict):

```python
    "Service Call": {
        "before_save": "vaishali.service_call_guard.enforce",
    },
```

- [ ] **Step 3: Validate**

```bash
python3 -m py_compile vaishali/hooks.py && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vaishali/hooks.py
git commit -m "feat(service-call): wire before_save guard into hooks"
```

---

## Task 4: Add the five PWA endpoints in field.py

**Files:**
- Modify: `vaishali/api/field.py`

- [ ] **Step 1: Find the right insertion point**

```bash
grep -n "checkout_dcr\|@frappe.whitelist" vaishali/api/field.py | head -20
```

Locate where the DCR block ends (after `checkout_dcr`). Service Call endpoints go right after.

- [ ] **Step 2: Append the new section to `vaishali/api/field.py`**

Add this code BEFORE the next `# ──` section header in the file. If unsure, place at the end of the file (Frappe doesn't care about ordering).

```python
# ── Service Calls ────────────────────────────────────────────────


@frappe.whitelist()
def get_service_calls(date_from=None, date_to=None, outcome=None, channel=None,
                     scope="my", limit=50):
	"""List service calls. scope = my | team | all (manager+ only for team/all)."""
	emp = _get_employee()
	filters = []
	if scope == "my":
		filters.append(["employee", "=", emp.name])
	elif scope == "team":
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			filters.append(["employee", "=", emp.name])
		else:
			reports = frappe.get_all("Employee", filters={"reports_to": emp.name},
				pluck="name") or []
			reports.append(emp.name)
			filters.append(["employee", "in", reports])
	elif scope == "all":
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier != "admin":
			frappe.throw(_("Not allowed"), frappe.PermissionError)
	if date_from:
		filters.append(["call_datetime", ">=", date_from])
	if date_to:
		filters.append(["call_datetime", "<=", date_to])
	if outcome:
		filters.append(["outcome", "=", outcome])
	if channel:
		filters.append(["channel", "=", channel])

	return frappe.get_all("Service Call",
		filters=filters,
		fields=["name", "call_datetime", "employee", "employee_name",
		        "customer", "customer_name", "channel", "outcome",
		        "summary", "direction", "duration_minutes",
		        "device", "warranty_claim", "follow_up_dcr"],
		order_by="call_datetime desc",
		limit_page_length=int(limit) if limit else 50)


@frappe.whitelist(methods=["POST"])
def create_service_call(**kwargs):
	"""Create a Service Call from the PWA."""
	frappe.local.flags["from_pwa"] = True
	emp = _get_employee()
	doc = frappe.new_doc("Service Call")
	doc.employee = emp.name
	for field in ["call_datetime", "customer", "channel", "outcome", "summary",
	              "direction", "duration_minutes", "device", "warranty_claim",
	              "contact", "form_opened_at", "form_saved_at"]:
		if field in kwargs and kwargs[field] not in (None, ""):
			doc.set(field, kwargs[field])
	# Convert ISO datetimes (YYYY-MM-DDTHH:MM:SS.sssZ) → MySQL format
	for dt_field in ("call_datetime", "form_opened_at", "form_saved_at"):
		val = doc.get(dt_field)
		if val and isinstance(val, str) and "T" in val:
			doc.set(dt_field, val.replace("T", " ").replace("Z", "").split(".")[0])
	if not doc.call_datetime:
		doc.call_datetime = frappe.utils.now()
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def get_service_call(svc_id):
	"""Read a single Service Call. Owner must match unless manager+."""
	emp = _get_employee()
	doc = frappe.get_doc("Service Call", svc_id)
	if doc.employee != emp.name:
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			frappe.throw(_("You do not have access to this call"), frappe.PermissionError)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def update_service_call(svc_id, remarks=None, **kwargs):
	"""Partial update. Truth-fields are guarded by service_call_guard."""
	frappe.local.flags["from_pwa"] = True
	emp = _get_employee()
	doc = frappe.get_doc("Service Call", svc_id)
	if doc.employee != emp.name:
		nav_tier = _get_nav_tier(frappe.session.user)
		if nav_tier not in ("manager", "admin"):
			frappe.throw(_("You do not have access to this call"), frappe.PermissionError)
	if remarks is not None:
		doc.remarks = remarks
	for field in ("direction", "duration_minutes", "device", "warranty_claim", "contact"):
		if field in kwargs and kwargs[field] not in (None, ""):
			doc.set(field, kwargs[field])
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	return doc.as_dict()


@frappe.whitelist()
def get_customer_context(customer_id):
	"""Form auto-suggests: recent devices, open warranty claims, recent calls, contacts."""
	if not customer_id:
		frappe.throw(_("customer_id required"))

	devices = frappe.get_all("Device",
		filters={"customer": customer_id},
		fields=["name", "device_name", "serial_no", "warranty_expiry_date"],
		order_by="modified desc",
		limit_page_length=20) or []

	open_claims = frappe.get_all("Warranty Claim",
		filters={"customer": customer_id, "status": ["in", ["Open", "Work In Progress"]]},
		fields=["name", "complaint", "status", "complaint_date"],
		order_by="complaint_date desc",
		limit_page_length=20) or []

	recent_calls = frappe.get_all("Service Call",
		filters={"customer": customer_id},
		fields=["name", "call_datetime", "employee_name", "channel", "outcome", "summary"],
		order_by="call_datetime desc",
		limit_page_length=10) or []

	contacts = frappe.db.sql("""
		SELECT c.name, c.first_name, c.last_name, c.mobile_no
		FROM `tabContact` c
		INNER JOIN `tabDynamic Link` dl ON dl.parent = c.name
		WHERE dl.link_doctype = 'Customer' AND dl.link_name = %s
		ORDER BY c.is_primary_contact DESC, c.modified DESC
		LIMIT 5
	""", (customer_id,), as_dict=True) or []

	return {
		"devices": devices,
		"open_warranty_claims": open_claims,
		"recent_calls": recent_calls,
		"contacts": contacts,
	}
```

**Note about `Device` filtering:** the filter currently has no status condition. Add `"status": ["!=", "Decommissioned"]` if (and only if) the Device DocType has such a field — discover with `bench --site dgoc.logstop.com mariadb -e 'SHOW COLUMNS FROM \`tabDevice\` LIKE "status"'`. Skip the filter if the column doesn't exist.

- [ ] **Step 3: Validate**

```bash
python3 -m py_compile vaishali/api/field.py && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vaishali/api/field.py
git commit -m "feat(service-call): add 5 PWA endpoints + customer-context helper"
```

---

## Task 5: Add `from_service_call` linkage to create_dcr

**Files:**
- Modify: `vaishali/api/field.py` (in the existing `create_dcr` function)

- [ ] **Step 1: Locate the existing create_dcr**

```bash
grep -n "def create_dcr" vaishali/api/field.py
```

Expected: a single line, e.g. `129:def create_dcr(**kwargs):`.

- [ ] **Step 2: Replace the doc.insert / commit / return block**

In `create_dcr`, find:

```python
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_dict()
```

Replace with:

```python
    doc.insert(ignore_permissions=True)
    # Service Call → DCR backlink (when DCR was created from a "Visit needed" call)
    from_svc = kwargs.get("from_service_call")
    if from_svc:
        try:
            frappe.db.set_value("Service Call", from_svc, "follow_up_dcr", doc.name)
        except Exception:
            frappe.log_error(
                title="Service Call backlink failed",
                message=f"DCR {doc.name} could not link back to Service Call {from_svc}",
            )
    frappe.db.commit()
    return doc.as_dict()
```

- [ ] **Step 3: Validate**

```bash
python3 -m py_compile vaishali/api/field.py && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vaishali/api/field.py
git commit -m "feat(service-call): link DCR back to Service Call on Visit-needed handoff"
```

---

## Task 6: Notification scheduler — pending visit-needed reminder

**Files:**
- Modify: `vaishali/notifications.py`
- Modify: `vaishali/hooks.py`

- [ ] **Step 1: Discover the existing Telegram-send helper name**

```bash
grep -nE "def.*telegram|chat_id" vaishali/notifications.py | head -10
```

Note the exact function name that takes `(chat_id, message)`. Replace `_telegram_send` in Step 2 with whatever it actually is.

- [ ] **Step 2: Append the new function**

Add at the end of `vaishali/notifications.py`:

```python
def remind_pending_visit_needed_calls():
	"""Daily 9 AM: nudge engineers about Service Calls with 'Visit needed' outcome
	that have no follow-up DCR after 24h. Single Telegram DM per engineer.
	"""
	import frappe
	from frappe.utils import add_days, now_datetime

	cutoff = add_days(now_datetime(), -1)
	pending = frappe.get_all("Service Call",
		filters={
			"outcome": "Visit needed",
			"follow_up_dcr": ["in", ["", None]],
			"creation": ["<=", cutoff],
		},
		fields=["name", "customer", "customer_name", "summary", "employee"],
		limit_page_length=200,
	)

	if not pending:
		return

	by_emp = {}
	for c in pending:
		by_emp.setdefault(c.employee, []).append(c)

	for emp_name, calls in by_emp.items():
		emp = frappe.get_doc("Employee", emp_name)
		chat_id = (emp.get("telegram_chat_id") or "").strip()
		if not chat_id:
			continue
		lines = [
			f"🔔 *{len(calls)} pending follow-up{'s' if len(calls) > 1 else ''}*",
			"",
			"You logged these calls as 'Visit needed' but haven't filed a follow-up visit yet:",
			"",
		]
		for c in calls[:10]:
			lines.append(f"• {c.customer_name} — {(c.summary or '')[:60]}")
		try:
			# Replace _telegram_send with the actual helper found in Step 1
			_telegram_send(chat_id, "\n".join(lines))
		except Exception as exc:
			frappe.log_error(
				title="remind_pending_visit_needed_calls send failed",
				message=f"emp={emp_name} chat_id={chat_id} error={exc}",
			)
```

- [ ] **Step 3: Wire the scheduler in hooks.py**

Edit `vaishali/hooks.py`. Find the `scheduler_events` dict, locate the `"daily"` list, and append:

```python
        "vaishali.notifications.remind_pending_visit_needed_calls",
```

- [ ] **Step 4: Validate**

```bash
python3 -m py_compile vaishali/notifications.py vaishali/hooks.py && echo OK
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add vaishali/notifications.py vaishali/hooks.py
git commit -m "feat(service-call): daily reminder for pending Visit-needed follow-ups"
```

---

## Task 7: PWA api.js path translations

**Files:**
- Modify: `vaishali/public/field/api.js`

- [ ] **Step 1: Find the right insertion point**

```bash
grep -n "/api/field/interaction\|/api/field/interactions" vaishali/public/field/api.js | head -5
```

The Service Call translations go right after the Interactions block.

- [ ] **Step 2: Add the translations**

Find the line:

```js
      else if (path.match(/^\/api\/field\/interaction\/[^/]+$/)) {
```

Insert ABOVE it (use the natural pattern from the surrounding code):

```js
      // Service Calls
      else if (path === '/api/field/service-calls' || path.indexOf('/api/field/service-calls?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_service_call';
        } else {
          var svcQS = ''; var svcQI = path.indexOf('?'); if (svcQI !== -1) svcQS = path.substring(svcQI);
          path = '/api/method/vaishali.api.field.get_service_calls' + svcQS;
        }
      }
      else if (path.match(/^\/api\/field\/service-call\/[^/]+$/)) {
        var svcId = path.replace('/api/field/service-call/', '');
        if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
          body = body || {};
          body.svc_id = decodeURIComponent(svcId);
          path = '/api/method/vaishali.api.field.update_service_call';
          method = 'POST';
        } else {
          path = '/api/method/vaishali.api.field.get_service_call?svc_id=' + encodeURIComponent(svcId);
        }
      }
      else if (path.match(/^\/api\/field\/customer\/[^/]+\/recent-context$/)) {
        var ccId = path.replace('/api/field/customer/', '').replace('/recent-context', '');
        path = '/api/method/vaishali.api.field.get_customer_context?customer_id=' + encodeURIComponent(ccId);
      }
```

- [ ] **Step 3: Validate**

```bash
node --check vaishali/public/field/api.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/api.js
git commit -m "feat(service-call): wire PWA path translations to Frappe endpoints"
```

---

## Task 8: PWA app.js routes

**Files:**
- Modify: `vaishali/public/field/app.js`

- [ ] **Step 1: Find the routes table and pattern**

```bash
grep -n "pattern: '#/dcr/\|pattern: '#/interactions'" vaishali/public/field/app.js | head -5
```

Note the exact `:id` syntax used by other detail routes (e.g. `#/dcr/:id` or `#/lead/:id`).

- [ ] **Step 2: Add three routes**

Insert near the other detail routes, matching the surrounding pattern:

```js
    { pattern: '#/service-calls', title: 'Service calls', back: '#/service', handler: function (el) { window.Screens.serviceCallList(el); } },
    { pattern: '#/service-call/new', title: 'Log call', back: '#/service-calls', handler: function (el) { window.Screens.serviceCallNew(el); } },
    { pattern: '#/service-call/:id', title: 'Service call', back: '#/service-calls', handler: function (el, ctx) { window.Screens.serviceCallDetail(el, ctx); } },
```

- [ ] **Step 3: Validate**

```bash
node --check vaishali/public/field/app.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/app.js
git commit -m "feat(service-call): add 3 routes to PWA router"
```

---

## Task 9: PWA service-call.js — list + form + detail

**Files:**
- Create: `vaishali/public/field/screens/service-call.js`
- Modify: `vaishali/www/field.html` (script tag)

- [ ] **Step 1: Create the screen file**

Create `vaishali/public/field/screens/service-call.js` with the following content:

```javascript
/* service-call.js — Service Call list, new, detail screens */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ─────────────────────────────────────────────────────

  function formatDateTime(iso) {
    if (!iso) return '';
    var t = String(iso).replace(' ', 'T');
    if (!/[Z+\-]\d/.test(t)) t += 'Z';
    var d = new Date(t);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ' · ' + h + ':' + (m<10?'0':'') + m + ' ' + ampm;
  }

  function outcomeColor(outcome) {
    switch ((outcome || '').toLowerCase()) {
      case 'resolved on call': return 'green';
      case 'visit needed': return 'red';
      case 'pending': return 'orange';
      case 'customer unreachable': return 'gray';
      default: return 'gray';
    }
  }

  function inputValue(wrapper) {
    var inp = wrapper && (wrapper.querySelector('input') || wrapper.querySelector('textarea'));
    return inp ? (inp.value || '') : '';
  }

  // ─── List screen ─────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.serviceCallList = function (appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/service-calls').then(function (res) {
      appEl.textContent = '';
      var raw = (res.data && (res.data.data || res.data.message)) || res.data || [];
      var calls = Array.isArray(raw) ? raw : (raw.data || []);

      if (!calls.length) {
        appEl.appendChild(UI.empty('phone', 'No service calls yet', {
          text: '+ Log call',
          onClick: function () { location.hash = '#/service-call/new'; }
        }));
        return;
      }

      for (var i = 0; i < calls.length; i++) {
        (function (c) {
          appEl.appendChild(UI.listCard({
            title: c.customer_name || c.customer || 'Unknown',
            sub: (formatDateTime(c.call_datetime) + ' · ' + (c.channel || '') + ' · ' + (c.summary || '')).substring(0, 90),
            right: UI.pill(c.outcome || '', outcomeColor(c.outcome)),
            onClick: function () { location.hash = '#/service-call/' + encodeURIComponent(c.name); }
          }));
        })(calls[i]);
      }

      appEl.appendChild(UI.fab(function () { location.hash = '#/service-call/new'; }));
    });
  };

  // ─── New / form screen ───────────────────────────────────────────

  window.Screens.serviceCallNew = function (appEl) {
    var openedAt = new Date().toISOString();
    var qs = (location.hash.split('?')[1] || '');
    var params = new URLSearchParams(qs);
    var prefilledCustomer = params.get('customer') || '';
    var prefilledWarranty = params.get('warranty_claim') || '';
    var prefilledDevice = params.get('device') || '';

    appEl.textContent = '';

    var customerInput = UI.m3TextField('Customer', { value: prefilledCustomer });
    appEl.appendChild(customerInput);

    var channel = 'Phone';
    var channelSeg = UI.segmented(['Phone', 'WhatsApp', 'Other'], channel, function (v) { channel = v; });
    appEl.appendChild(UI.field('Channel', channelSeg));

    var outcome = '';
    var outcomeSeg = UI.segmented(
      ['Resolved on call', 'Visit needed', 'Pending', 'Customer unreachable'],
      null, function (v) { outcome = v; });
    appEl.appendChild(UI.field('Outcome', outcomeSeg));

    var summaryInput = UI.m3TextField('Summary (one line)', { multiline: true, rows: 2 });
    appEl.appendChild(summaryInput);

    var moreOpen = false;
    var moreToggle = el('button', {
      className: 'btn m3-btn-text',
      textContent: 'More details ▾',
      style: { marginTop: '8px' },
      onClick: function () {
        moreOpen = !moreOpen;
        moreBox.style.display = moreOpen ? 'block' : 'none';
        moreToggle.textContent = moreOpen ? 'More details ▴' : 'More details ▾';
      }
    });
    appEl.appendChild(moreToggle);

    var direction = 'Inbound';
    var moreBox = el('div', { style: { display: 'none', marginTop: '12px' } });
    moreBox.appendChild(UI.field('Direction', UI.segmented(['Inbound', 'Outbound'], direction, function (v) { direction = v; })));
    var durationInput = UI.m3TextField('Duration (min)', { type: 'number' });
    moreBox.appendChild(durationInput);
    var deviceInput = UI.m3TextField('Device (optional)', { value: prefilledDevice });
    moreBox.appendChild(deviceInput);
    var warrantyInput = UI.m3TextField('Warranty Claim (optional)', { value: prefilledWarranty });
    moreBox.appendChild(warrantyInput);
    var contactInput = UI.m3TextField('Contact (optional)', {});
    moreBox.appendChild(contactInput);
    appEl.appendChild(moreBox);

    var saveBtn = UI.btn('Save', {
      type: 'primary',
      block: true,
      onClick: function () {
        var customer = inputValue(customerInput);
        var summary = inputValue(summaryInput);
        if (!customer) { UI.fieldError(customerInput, 'Customer is required'); return; }
        if (!outcome) { UI.toast('Pick an outcome', 'danger'); return; }
        if (!summary.trim()) { UI.fieldError(summaryInput, 'Summary is required'); return; }

        saveBtn._setLoading(true, 'Saving…');
        var body = {
          customer: customer,
          channel: channel,
          outcome: outcome,
          summary: summary.trim(),
          direction: direction,
          duration_minutes: parseInt(inputValue(durationInput) || '0', 10) || null,
          device: inputValue(deviceInput) || null,
          warranty_claim: inputValue(warrantyInput) || null,
          contact: inputValue(contactInput) || null,
          form_opened_at: openedAt,
          form_saved_at: new Date().toISOString(),
        };
        api.apiCall('POST', '/api/field/service-calls', body).then(function (res) {
          saveBtn._setLoading(false);
          if (res.error || (res.status && res.status >= 400)) {
            UI.toast('Save failed: ' + api.extractError(res), 'danger');
            return;
          }
          UI.toast('Call logged', 'success');
          var saved = (res.data && (res.data.data || res.data.message)) || res.data || {};
          if (outcome === 'Visit needed') {
            var dcrParams = ['from_service_call=' + encodeURIComponent(saved.name || ''),
                             'customer=' + encodeURIComponent(customer)];
            if (body.device) dcrParams.push('device=' + encodeURIComponent(body.device));
            location.hash = '#/dcr/new?' + dcrParams.join('&');
          } else {
            history.back();
          }
        });
      }
    });
    appEl.appendChild(el('div', { style: { marginTop: '24px', position: 'sticky', bottom: '16px' } }, [saveBtn]));
  };

  // ─── Detail screen ───────────────────────────────────────────────

  window.Screens.serviceCallDetail = function (appEl, ctx) {
    var svcId = (ctx && ctx.params && ctx.params.id);
    if (!svcId) {
      var hash = location.hash.split('?')[0];
      svcId = decodeURIComponent(hash.replace(/^#\/service-call\//, ''));
    }
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/service-call/' + encodeURIComponent(svcId)).then(function (res) {
      appEl.textContent = '';
      if (res.error || (res.status && res.status >= 400)) {
        appEl.appendChild(UI.error(api.extractError(res)));
        return;
      }
      var c = (res.data && (res.data.data || res.data.message)) || res.data || {};

      appEl.appendChild(el('div', { className: 'm3-detail-hero' }, [
        el('h2', { textContent: c.customer_name || c.customer || '—' }),
        el('div', { className: 'ink-tertiary', textContent: formatDateTime(c.call_datetime) + ' · ' + (c.channel || '') }),
        UI.pill(c.outcome || '', outcomeColor(c.outcome))
      ]));

      appEl.appendChild(UI.detailCard([
        { label: 'Direction', value: c.direction || '—' },
        { label: 'Duration', value: c.duration_minutes ? c.duration_minutes + ' min' : '—' },
        { label: 'Engineer', value: c.employee_name || '—' },
        { label: 'Device', value: c.device || '—' },
        { label: 'Warranty Claim', value: c.warranty_claim || '—' },
        { label: 'Follow-up Visit', value: c.follow_up_dcr || '—' },
      ]));

      appEl.appendChild(UI.sectionHeading('Summary'));
      appEl.appendChild(UI.card([el('p', { textContent: c.summary || '—' })]));

      if (c.remarks) {
        appEl.appendChild(UI.sectionHeading('Remarks (desk)'));
        appEl.appendChild(UI.card([el('p', { textContent: c.remarks })]));
      }
    });
  };

})();
```

- [ ] **Step 2: Validate the JS**

```bash
node --check vaishali/public/field/screens/service-call.js && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Add the script tag to www/field.html**

```bash
grep -n "interactions.js" vaishali/www/field.html
```

Find the `<script defer src="/assets/vaishali/field/screens/interactions.js?v={{ _v }}"></script>` line. Add immediately after:

```html
<script defer src="/assets/vaishali/field/screens/service-call.js?v={{ _v }}"></script>
```

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/screens/service-call.js vaishali/www/field.html
git commit -m "feat(service-call): PWA list + new + detail screens"
```

---

## Task 10: Service dashboard updates — Calls today tile + Recent calls section

**Files:**
- Modify: `vaishali/public/field/screens/service-dashboard.js`

- [ ] **Step 1: Read the existing dashboard render flow**

```bash
grep -n "Promise.all\|window.Screens.serviceDashboard\|UI.statGrid\|kpiRow" vaishali/public/field/screens/service-dashboard.js | head -10
```

Identify the `Promise.all([...])` array and the index of each fetch.

- [ ] **Step 2: Add a new fetch entry**

In the `Promise.all([...])` array, append:

```js
      api.apiCall('GET', '/api/field/service-calls?date_from=' + encodeURIComponent(today)),
```

(If `today` is not in scope, define `var today = new Date().toISOString().slice(0,10);` at the top of the function.)

- [ ] **Step 3: Capture the result and add a Log call CTA + KPI tile + Recent calls**

In the `.then(function (results) { ... })`:

a) Add at the start of the callback (after the existing result destructuring):

```js
      var callsRes = results[results.length - 1];
      var callsRaw = (callsRes && callsRes.data) || {};
      var calls = callsRaw.data || callsRaw.message || [];
      if (!Array.isArray(calls)) calls = [];
      var todayCalls = calls.filter(function (c) {
        return (c.call_datetime || '').indexOf(today) === 0;
      });
```

b) Insert the Log call CTA near the top of the rendered output (between greeting and KPI block):

```js
      appEl.appendChild(UI.btn('Log call', {
        type: 'primary',
        block: true,
        icon: 'phone',
        onClick: function () { location.hash = '#/service-call/new'; }
      }));
```

c) Add a Calls KPI to the existing stat grid (insert into the `UI.statGrid([...])` call, or append a new grid):

```js
      // existing grid:
      // appEl.appendChild(UI.statGrid([
      //   { value: openClaims, label: 'Open claims', support: 'today' },
      //   ...
      // ], 3));
      //
      // add this entry to the array passed to statGrid:
      // { value: todayCalls.length, label: 'Calls', support: 'today' }
```

d) Append a "Recent calls" section after the existing dashboard sections:

```js
      if (todayCalls.length > 0) {
        appEl.appendChild(UI.sectionHeading('Recent calls'));
        var visibleCalls = todayCalls.slice(0, 5);
        for (var ci = 0; ci < visibleCalls.length; ci++) {
          (function (c) {
            var visitNeeded = c.outcome === 'Visit needed' && !c.follow_up_dcr;
            appEl.appendChild(UI.listCard({
              title: c.customer_name || c.customer || 'Unknown',
              sub: c.summary || '',
              right: UI.pill(c.outcome || '', visitNeeded ? 'red' : 'green'),
              onClick: function () { location.hash = '#/service-call/' + encodeURIComponent(c.name); }
            }));
          })(visibleCalls[ci]);
        }
        if (todayCalls.length > 5) {
          appEl.appendChild(UI.btn('View all (' + todayCalls.length + ')', {
            type: 'outline',
            block: true,
            onClick: function () { location.hash = '#/service-calls'; }
          }));
        }
      }
```

- [ ] **Step 4: Validate**

```bash
node --check vaishali/public/field/screens/service-dashboard.js && echo OK
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/service-dashboard.js
git commit -m "feat(service-call): surface on service dashboard — KPI tile + Recent calls"
```

---

## Task 11: Action chips on customer-detail and breakdown

**Files:**
- Modify: `vaishali/public/field/screens/customer-detail.js`
- Modify: `vaishali/public/field/screens/breakdown.js`

- [ ] **Step 1: Read the existing action chip block**

```bash
grep -n "Call\|Email\|UI.btn.*tonal" vaishali/public/field/screens/customer-detail.js | head -10
```

Identify the variable holding the chip container (`actionChips` or similar) and the customer reference.

- [ ] **Step 2: Append a Log call chip in customer-detail.js**

Right after the existing Email chip definition, add:

```js
    actionChips.appendChild(UI.btn('Log call', {
      type: 'tonal',
      icon: 'phone',
      onClick: function () {
        location.hash = '#/service-call/new?customer=' + encodeURIComponent(customer.name);
      }
    }));
```

(`customer.name` and `actionChips` must match the actual variable names in the file — verify before pasting.)

- [ ] **Step 3: Same pattern in breakdown.js**

```bash
grep -n "Call\|Email\|UI.btn.*tonal\|actionChips" vaishali/public/field/screens/breakdown.js | head -10
```

After the existing chips, append:

```js
    actionChips.appendChild(UI.btn('Log call', {
      type: 'tonal',
      icon: 'phone',
      onClick: function () {
        var qs = ['customer=' + encodeURIComponent(claim.customer || '')];
        if (claim.name) qs.push('warranty_claim=' + encodeURIComponent(claim.name));
        if (claim.serial_no) qs.push('device=' + encodeURIComponent(claim.serial_no));
        location.hash = '#/service-call/new?' + qs.join('&');
      }
    }));
```

(Adjust `claim.customer` / `claim.serial_no` field names to match the breakdown screen's actual variables.)

- [ ] **Step 4: Validate**

```bash
node --check vaishali/public/field/screens/customer-detail.js && \
  node --check vaishali/public/field/screens/breakdown.js && echo OK
```

Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/customer-detail.js vaishali/public/field/screens/breakdown.js
git commit -m "feat(service-call): Log call chip on customer + warranty claim screens"
```

---

## Task 12: SW bump, deploy, smoke verify

**Files:**
- Modify: `vaishali/public/field/sw.js`

- [ ] **Step 1: Bump CACHE_NAME**

```bash
grep -n "CACHE_NAME" vaishali/public/field/sw.js | head -1
```

Find `var CACHE_NAME = 'dspl-field-vNN';` and increment by 1 (e.g. `v64` → `v65`).

- [ ] **Step 2: Add the new screen to PRECACHE_URLS**

In `vaishali/public/field/sw.js`, find the `PRECACHE_URLS` array and add:

```js
  '/assets/vaishali/field/screens/service-call.js',
```

at any sensible position.

- [ ] **Step 3: Validate**

```bash
node --check vaishali/public/field/sw.js && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit and push**

```bash
git add vaishali/public/field/sw.js
git commit -m "feat(service-call): bump SW cache for new screen"
git push origin main
```

- [ ] **Step 5: Deploy to EC2**

```bash
rm -f /tmp/dspl-temp-key /tmp/dspl-temp-key.pub && ssh-keygen -t rsa -f /tmp/dspl-temp-key -N "" -q \
  && aws ec2-instance-connect send-ssh-public-key --instance-id i-08deae9f14e3cc99e --instance-os-user ubuntu --ssh-public-key file:///tmp/dspl-temp-key.pub --region ap-south-1 \
  && ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
    "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main' \
     && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com migrate' \
     && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com clear-cache && bench build --app vaishali' \
     && redis-cli FLUSHALL \
     && sudo supervisorctl restart all"
```

Expected: migrate creates the `tabService Call` table, build succeeds, supervisor restarts.

- [ ] **Step 6: SCP the test script and run the guard tests**

```bash
scp -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no \
  /tmp/_test_service_call_guard.py ubuntu@35.154.17.172:/tmp/_test_service_call_guard.py
ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
  "sudo cp /tmp/_test_service_call_guard.py /home/frappe/frappe-bench/apps/vaishali/vaishali/_test_service_call_guard.py \
   && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com execute vaishali._test_service_call_guard.run_tests'"
```

Expected output:

```
['Test 1 PASS: desk-create blocked', 'Test 2 PASS: pwa insert -> SVC-...', 'Test 3 PASS: outcome reverted, remarks kept']
```

If any test fails, stop and fix before continuing.

- [ ] **Step 7: Clean up the test file**

```bash
ssh -i /tmp/dspl-temp-key -o StrictHostKeyChecking=no ubuntu@35.154.17.172 \
  "sudo rm -f /home/frappe/frappe-bench/apps/vaishali/vaishali/_test_service_call_guard.py \
   && sudo -u frappe bash -c 'cd /home/frappe/frappe-bench && bench --site dgoc.logstop.com clear-cache'"
```

- [ ] **Step 8: Smoke verify the live PWA**

```bash
curl -s -o /dev/null -w "list endpoint HTTP=%{http_code}\n" 'https://dgoc.logstop.com/api/method/vaishali.api.field.get_service_calls'
curl -s 'https://dgoc.logstop.com/assets/vaishali/field/screens/service-call.js' | head -3
curl -s 'https://dgoc.logstop.com/assets/vaishali/field/sw.js' | grep -m1 CACHE_NAME
```

Expected:
- list endpoint → `HTTP=401` (auth_guard intercepts unauthenticated request, as designed)
- service-call.js content visible
- SW bumped to the new version

- [ ] **Step 9: Final commit if needed**

```bash
git status
# Should be clean if all previous commits succeeded.
```

---

## Self-review checklist

**Spec coverage:**
- [x] DocType schema (Task 1)
- [x] Truth-field guard (Task 2)
- [x] Hook wiring (Task 3)
- [x] PWA endpoints — get/create/update/get_one/customer-context (Task 4)
- [x] DCR backlink (Task 5)
- [x] Pending-visit-needed scheduler (Task 6)
- [x] PWA path translations (Task 7)
- [x] PWA routes (Task 8)
- [x] PWA screen — list/new/detail (Task 9)
- [x] Service dashboard surface (Task 10)
- [x] Customer + warranty claim entry chips (Task 11)
- [x] SW bump + deploy + verify (Task 12)
- [x] form_opened_at / form_saved_at telemetry (Task 1 schema, Task 4 endpoint, Task 9 PWA form)

**Risks the implementer should know:**

1. **Service Manager / Service User roles must exist.** They typically do (HRMS / ERPNext default). If migrate complains, run `bench --site dgoc.logstop.com execute frappe.permissions.add_permission` to seed them or remove those rows from the JSON.
2. **Telegram DM helper name** in `vaishali/notifications.py` may not be `_telegram_send` — Task 6 Step 1 calls out the discovery grep. Use whatever exists.
3. **Route handler signature** in `app.js` (Task 8) — the codebase may or may not pass `ctx.params.id`. The detail-screen handler has a fallback parsing the hash directly.
4. **The "More details" collapsible toggle** uses `m3-btn-text` styling — confirmed live as of commit `cb80d9a` (today).
5. **Auth guard** blocks Guest hits — task verifications expect 401 on unauthenticated curl, not 403.
6. **Device DocType** may not have a `status` field — Task 4 Step 2 has a discovery line; skip the filter if absent.

---

## Handoff

Implement task-by-task. Each task ends with a commit. Total: ~12 commits. Estimated effort: 4-6 hours of focused work for an engineer who has the codebase loaded.
