# Service Call — Design Spec

**Date:** 2026-04-29
**Author:** Harsh + Claude (brainstorming session)
**Status:** Design approved, awaiting implementation plan
**Target users:** 7 service-department engineers (Sambhaji and team)

---

## 1. Problem

Service engineers handle a significant portion of customer interactions over phone, WhatsApp, and remote troubleshooting — *not* on-site visits. Today these are unrecorded:

- **Daily Call Report (DCR)** is the only existing primitive, but it's modelled around physical visits with check-in/check-out and required GPS (locked down by the recent PWA-only guard).
- A call lasting 4 minutes that resolves a complaint without dispatch is invisible to the system. The engineer's day looks empty in reports; the resolution itself isn't linked to the warranty claim or device; the customer's call history is lost.
- The pattern parallels Sales (where `Sales Interaction` already tracks non-DCR sales contacts).

Without this, the service team's actual work is invisible and we can't measure call-resolution rate, mean time to resolve, or whether engineers are proactively checking in on equipment.

---

## 2. Decisions

| Decision | Chosen | Considered & rejected |
|---|---|---|
| When/who logs the call | **Engineer logs in-call (option A) or right after (option B)**, not back-office batch entry | End-of-day batch (data quality drift); back-office entry (recreates the GPS-less DCR pattern we just blocked) |
| Required minimum form | **Customer + Channel + Outcome + Summary** (3 taps + ~1 line typed, ~10 sec save) | Adding Equipment as required (slows the form; it's optional/auto-suggested instead) |
| DocType strategy | **New `Service Call` DocType**, parallel to `Sales Interaction` | Overload DCR with a `visit_type` field (contradicts the just-shipped DCR PWA-only/GPS-required guard); Child-of-DCR (most calls don't become visits — wrong shape) |
| Visit-needed handoff | **Auto-prompt: redirect to pre-filled DCR form on save** | Pure save with no follow-up (decouples the data); silent-create draft DCR (orphan drafts) |
| Submittable | **No** — atomic, no draft/submit lifecycle | Submittable like Sales Interaction (friction without value for fast field entry) |

---

## 3. Data Model

### `Service Call` DocType

- **Naming:** `SVC-.YYYY.-.#####` (parallel to `SI-` and `DCR-`)
- **Submittable:** No
- **Module:** Vaishali
- **Custom:** No (proper DocType)

### Fields

```
── Identity ─────────────────────────────────────────
call_datetime          Datetime    Auto = now() at insert; editable only via desk
                                   to a value within 24h before the original
                                   call_datetime (validated server-side in
                                   service_call.py.validate)
employee               Link        Auto = _get_employee(frappe.session.user) at
                                   insert; not editable post-create
employee_name          Data        fetch_from = employee.employee_name

── Required (PWA form) ──────────────────────────────
customer               Link        required
channel                Select      required: Phone / WhatsApp / Other
outcome                Select      required: Resolved on call / Visit needed / Pending / Customer unreachable
summary                Small Text  required, ~80-char hint

── Optional (desk-only or skip-for-later) ───────────
direction              Select      Inbound (default) / Outbound
duration_minutes       Int
device                 Link        Auto-suggest from customer's installed base
warranty_claim         Link        Auto-suggest from customer's open ones
contact                Link        Contact
contact_phone          Data        fetch_from = contact.mobile_no

── Conversion ───────────────────────────────────────
follow_up_dcr          Link        Daily Call Report; set when "Visit needed" outcome leads to a created DCR

── Notes ────────────────────────────────────────────
remarks                Small Text  Free-form add-ons; the only field a desk coordinator typically edits later

── Telemetry (PWA-set, hidden) ──────────────────────
form_opened_at         Datetime    set by PWA when the form is rendered
form_saved_at          Datetime    set by PWA on Save tap
                                   (used for the "median save time" success metric)
```

**Notably absent:** GPS, check-in/check-out, status flow. Each call is atomic.

### Permissions (Custom DocPerm)

| Role | read | write | create | delete |
|---|---|---|---|---|
| System Manager | ✓ | ✓ | ✓ | ✓ |
| Service User / Manager | ✓ | ✓ | ✓ | — |
| Sales User / Manager | ✓ (own) | — | — | — |
| Manufacturing / Production / Field | — | — | — | — |

### Field-level lock (server-side, not Frappe perms)

Service Calls created from the desk are **blocked** entirely. Existing Service Calls can be edited from the desk only for the *non-truth* fields:

**Editable from desk:** `summary`, `remarks`, `direction`, `duration_minutes`, `device`, `warranty_claim`, `contact`

**Locked from desk** (silently reverted with alert msgprint): `customer`, `channel`, `outcome`, `call_datetime`, `employee`

This mirrors the DCR `visit_guard.py` pattern.

---

## 4. PWA UX

### Entry points

1. **Service tab** on Home → primary CTA "Log call"
2. **Customer detail** screen → action chip "Log call" (auto-fills customer)
3. **Warranty Claim detail** → action chip "Log call" (auto-fills customer + warranty_claim + device)

### Form: `#/service-call/new`

Single-screen, M3 floating-label fields. Layout:

```
[Customer]            ← required, auto-suggest from recent customers + search
[Channel]             ← 3-pill segmented: Phone | WhatsApp | Other
[Outcome]             ← 4-pill segmented: Resolved | Visit needed | Pending | Unreachable
[Summary]             ← textarea, 80-char placeholder, auto-grow
[More details ▾]      ← collapsible (closed by default):
                          Direction toggle (Inbound/Outbound)
                          Duration (min)
                          Device (auto-suggest from customer)
                          Warranty Claim (auto-suggest from customer)
                          Contact (auto-suggest)
[Save]                ← block button at bottom, sticky
```

**Typical save = 3 segmented taps + ~1 line typed = ~10 sec.**

**Customer auto-suggest scope:** the engineer's last 30 days of Service Calls
and DCRs, ordered by most-recent. Falls back to a debounced search across all
Customers when no recent match.

**`remarks` is desk-only.** The PWA form does not show remarks on create or
edit — coordinators add free-form notes from the desk Service Call form.

### On Save

1. POST `/api/field/service-calls` → returns the new `SVC-.....` doc
2. Snackbar: "Call logged"
3. **Branch on outcome:**
   - **Resolved / Pending / Unreachable** → return to entry-point screen (Service tab / Customer detail / Warranty Claim)
   - **Visit needed** → redirect to `#/dcr/new?from_service_call=SVC-...&customer=X&device=Y` with form pre-filled. The engineer can finish or skip the DCR; if they finish, the SVC's `follow_up_dcr` is set atomically server-side.

### List: `#/service-calls`

- **Default filter:** my calls, last 7 days
- **Each row:** time · customer · outcome pill · 1-line summary truncated
- **Outcome pill colours:** green=Resolved, red=Visit needed, orange=Pending, gray=Unreachable
- **FAB "+":** opens new call form
- **Filters:** outcome, date range, channel
- **Tappable** → detail screen with full metadata + remarks edit

### Service dashboard surfacing (`#/service`)

- New KPI tile: **"Calls today: N"** alongside existing visit/breakdown tiles
- New section "Recent calls" → 5 most-recent calls today, tappable to detail
- "Visit needed" outcomes get a red dot indicator until a `follow_up_dcr` is set

---

## 5. Server-side

### API endpoints (in `vaishali/api/field.py`)

| PWA Path | Method | Frappe method |
|---|---|---|
| `/api/field/service-calls` | GET | `vaishali.api.field.get_service_calls` |
| `/api/field/service-calls` | POST | `vaishali.api.field.create_service_call` |
| `/api/field/service-call/<id>` | GET | `vaishali.api.field.get_service_call` |
| `/api/field/service-call/<id>` | PUT/POST | `vaishali.api.field.update_service_call` |
| `/api/field/customer/<id>/recent-context` | GET | `vaishali.api.field.get_customer_context` |

`get_customer_context` is a single helper that returns `{recent_devices, open_warranty_claims, recent_calls, recent_dcrs}` for form auto-suggests. Loaded once when the Customer is selected.

All endpoints set `frappe.local.flags["from_pwa"] = True` (mirroring the DCR pattern).

### Guard hook: `vaishali/service_call_guard.py`

```python
def enforce(doc, method=None):
    if doc.is_new() and not _from_pwa():
        frappe.throw(_("Service Calls must be logged from the field app..."), title=_("Logging blocked"))
        return
    if _from_pwa():
        return
    # Existing doc, desk-edit path: revert truth-fields
    original = doc.get_doc_before_save()
    if not original:
        return
    for field in ("customer", "channel", "outcome", "call_datetime", "employee"):
        if (doc.get(field) or "") != (original.get(field) or ""):
            doc.set(field, original.get(field))
            frappe.msgprint(_("Truth fields cannot be edited from the desk."), indicator="orange", alert=True)
```

### DCR linkage

`vaishali.api.field.create_dcr` accepts a new optional kwarg `from_service_call`. When set, after `doc.insert()`:

```python
if kwargs.get("from_service_call"):
    frappe.db.set_value("Service Call", kwargs["from_service_call"], "follow_up_dcr", doc.name)
```

This is the **only** modification to existing endpoint code.

### Notifications (v1, lean)

- **Single rule:** `outcome = "Visit needed"` AND `follow_up_dcr is None` AND `creation < now() - 24h` → daily 9 AM scheduler sends a single Telegram DM to the engineer who logged it.
- No manager broadcasts. We can add rollups once we see real call volume.

### Hooks wiring (`vaishali/hooks.py`)

```python
doc_events = {
    ...,
    "Service Call": {
        "before_save": "vaishali.service_call_guard.enforce",
    },
}

scheduler_events = {
    "daily": [
        ...,
        "vaishali.notifications.remind_pending_visit_needed_calls",
    ],
}
```

---

## 6. Out of scope (v1)

- Recording inbound calls automatically (would need PBX/telephony integration — not on the table)
- Manager dashboards / call-volume rollups (revisit once we have ≥2 weeks of real data)
- WhatsApp Business API integration (engineers log manually for now; webhook-based ingestion is a v2 conversation)
- Call-quality scoring or sentiment
- Editing `outcome` after save (forces engineers to think before saving; if wrong, edit `summary` to clarify or create a follow-up call)

---

## 7. Migration

None. Service Call is green-field; no historical data to backfill. Existing DCRs and Sales Interactions are unaffected.

---

## 8. Success criteria

After 2 weeks in production:

1. **≥3 of the 7 service engineers** log at least one Service Call.
2. **≥80%** of "Visit needed" outcomes have a `follow_up_dcr` set within 48 hours.
3. **Median save time** (form open → save tapped) is **under 20 seconds**. Measured by capturing two timestamps in the PWA and posting both with the create payload — adds two `Datetime` fields (`form_opened_at`, `form_saved_at`) on the doc. Soft signal, not a hard SLA — if the median creeps to 25-30 sec we add UX, not alarms.
4. **Zero** Service Calls created from the desk (the guard works in production). Verified by `SELECT COUNT(*) FROM \`tabService Call\` WHERE owner != employee.user_id`.

If any of these miss, revisit the form / nudges before adding scope.

---

## 9. File checklist (preview for the implementation plan)

```
NEW
  vaishali/vaishali/doctype/service_call/service_call.json     # DocType definition
  vaishali/vaishali/doctype/service_call/service_call.py       # Server class (mostly empty)
  vaishali/vaishali/doctype/service_call/__init__.py
  vaishali/service_call_guard.py                                # before_save hook
  vaishali/public/field/screens/service-call.js                 # List + detail + form

MODIFY
  vaishali/api/field.py                                         # +5 endpoints, +get_customer_context
  vaishali/hooks.py                                             # doc_events + scheduler_events
  vaishali/notifications.py                                     # +remind_pending_visit_needed_calls
  vaishali/public/field/api.js                                  # +5 path translations
  vaishali/public/field/app.js                                  # +3 routes
  vaishali/public/field/screens/service-dashboard.js            # +Calls today tile, +Recent calls
  vaishali/public/field/screens/customer-detail.js              # +Log call action chip
  vaishali/public/field/screens/breakdown.js                    # +Log call action chip on warranty claim view
  vaishali/public/field/sw.js                                   # bump CACHE_NAME
```

Approximately 11 files (5 new, 6 modified).
