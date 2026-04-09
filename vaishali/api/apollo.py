"""
apollo.py — Apollo.io CRM integration for lead enrichment and import.

Config (site_config.json):
    apollo_api_key:      API key (required)
    apollo_list_id:      Saved list ID for auto-sync (optional)
    apollo_sync_enabled: Toggle scheduled sync (default: false)

Setup:
    bench --site dgoc.logstop.com set-config apollo_api_key "YOUR_KEY"
    bench --site dgoc.logstop.com execute vaishali.api.linking.setup_apollo_fields
"""
import frappe
import requests
from frappe.utils import now_datetime

APOLLO_BASE = "https://api.apollo.io/api/v1"


def _get_api_key():
    key = frappe.conf.get("apollo_api_key")
    if not key:
        frappe.throw("Apollo API key not configured. Set apollo_api_key in site_config.json")
    return key


def _apollo_post(endpoint, payload=None):
    """POST to Apollo API. Returns parsed JSON or raises."""
    resp = requests.post(
        f"{APOLLO_BASE}/{endpoint}",
        headers={"x-api-key": _get_api_key(), "Content-Type": "application/json"},
        json=payload or {},
        timeout=15,
    )
    if resp.status_code == 429:
        frappe.throw("Apollo API rate limit exceeded. Try again later.")
    resp.raise_for_status()
    return resp.json()


def _map_person_to_lead(person, org=None):
    """Map Apollo person/org data to ERPNext Lead field dict."""
    if not person:
        return None

    org = org or person.get("organization") or {}

    phone = None
    phones = person.get("phone_numbers") or []
    if phones:
        phone = phones[0].get("sanitized_number") or phones[0].get("number")

    data = {
        "lead_name": f"{person.get('first_name', '')} {person.get('last_name', '')}".strip(),
        "company_name": org.get("name") or person.get("organization_name") or "",
        "email_id": person.get("email") or "",
        "mobile_no": phone or "",
        "designation": person.get("title") or "",
        "website": org.get("website_url") or person.get("website_url") or "",
        "industry": org.get("industry") or "",
        "linkedin_url": person.get("linkedin_url") or "",
        "apollo_id": person.get("id") or "",
        "apollo_enriched": 1,
    }

    # Build enrichment note
    notes = []
    if org.get("estimated_num_employees"):
        notes.append(f"Employees: ~{org['estimated_num_employees']}")
    if org.get("annual_revenue_printed"):
        notes.append(f"Revenue: {org['annual_revenue_printed']}")
    if person.get("city") or person.get("country"):
        loc = ", ".join(filter(None, [person.get("city"), person.get("state"), person.get("country")]))
        notes.append(f"Location: {loc}")
    if person.get("seniority"):
        notes.append(f"Seniority: {person['seniority']}")
    data["_enrichment_note"] = " | ".join(notes) if notes else None

    return data


# ── Whitelist endpoints ───────────────────────────────────────────────

@frappe.whitelist()
def enrich_lead(lead_name):
    """Enrich an existing Lead with Apollo.io data. Called from desk button."""
    lead = frappe.get_doc("Lead", lead_name)

    # Build search params — prefer email, fall back to name+company
    payload = {}
    if lead.email_id:
        payload["email"] = lead.email_id
    else:
        name_parts = (lead.lead_name or "").split(" ", 1)
        payload["first_name"] = name_parts[0] if name_parts else ""
        payload["last_name"] = name_parts[1] if len(name_parts) > 1 else ""
        if lead.company_name:
            payload["organization_name"] = lead.company_name

    if not payload.get("email") and not payload.get("first_name"):
        frappe.throw("Lead must have an email or name to enrich from Apollo.")

    result = _apollo_post("people/enrich", payload)
    person = result.get("person")

    if not person:
        frappe.msgprint("No match found on Apollo.io for this lead.", indicator="orange")
        return {"status": "not_found"}

    data = _map_person_to_lead(person)

    # Update lead fields (only fill blanks, don't overwrite existing data)
    updated = []
    for field in ("company_name", "email_id", "mobile_no", "designation",
                  "website", "industry", "linkedin_url", "apollo_id"):
        if data.get(field) and not lead.get(field):
            lead.set(field, data[field])
            updated.append(field)

    lead.apollo_enriched = 1

    # Append enrichment note
    note_text = data.get("_enrichment_note")
    if note_text:
        lead.append("notes", {"note": f"Apollo enrichment ({now_datetime().strftime('%Y-%m-%d')}): {note_text}"})

    lead.save(ignore_permissions=True)
    frappe.db.commit()

    frappe.msgprint(
        f"Lead enriched from Apollo. Updated: {', '.join(updated) if updated else 'no new fields'}.",
        indicator="green",
    )
    return {"status": "enriched", "updated_fields": updated}


@frappe.whitelist()
def import_from_apollo(email=None, first_name=None, last_name=None, domain=None):
    """Search Apollo for a person and create a Lead in ERPNext."""
    payload = {}
    if email:
        payload["email"] = email
    if first_name:
        payload["first_name"] = first_name
    if last_name:
        payload["last_name"] = last_name
    if domain:
        payload["organization_name"] = domain

    if not payload:
        frappe.throw("Provide at least an email, name, or domain to search Apollo.")

    result = _apollo_post("people/enrich", payload)
    person = result.get("person")

    if not person:
        frappe.throw("No match found on Apollo.io.")

    data = _map_person_to_lead(person)

    # Dedup: check if lead with this email or apollo_id already exists
    if data.get("email_id"):
        existing = frappe.db.get_value("Lead", {"email_id": data["email_id"]}, "name")
        if existing:
            frappe.throw(f"Lead already exists: {existing} ({data['email_id']})")
    if data.get("apollo_id"):
        existing = frappe.db.get_value("Lead", {"apollo_id": data["apollo_id"]}, "name")
        if existing:
            frappe.throw(f"Lead already exists with this Apollo ID: {existing}")

    lead = frappe.new_doc("Lead")
    for field in ("lead_name", "company_name", "email_id", "mobile_no",
                  "designation", "website", "industry", "linkedin_url",
                  "apollo_id", "apollo_enriched"):
        if data.get(field):
            lead.set(field, data[field])

    # Set source to Apollo
    if frappe.db.exists("Lead Source", "Apollo"):
        lead.source = "Apollo"

    lead.lead_owner = frappe.session.user

    note_text = data.get("_enrichment_note")
    if note_text:
        lead.append("notes", {"note": f"Imported from Apollo: {note_text}"})

    lead.insert(ignore_permissions=True)
    frappe.db.commit()

    return {"status": "created", "lead": lead.name, "lead_name": lead.lead_name}


# ── Scheduled jobs ────────────────────────────────────────────────────

def bulk_enrich_leads():
    """Enrich unenriched leads that have an email. Runs every 30min via scheduler.
    Processes 10 leads per run (1 bulk API call)."""
    key = frappe.conf.get("apollo_api_key")
    if not key:
        return

    leads = frappe.get_all("Lead",
        filters={
            "apollo_enriched": 0,
            "email_id": ["is", "set"],
            "status": ["not in", ["Converted", "Do Not Contact"]],
        },
        fields=["name", "lead_name", "email_id", "company_name"],
        order_by="modified desc",
        limit=10)

    if not leads:
        return

    # Build bulk match payload
    details = []
    for lead in leads:
        entry = {"email": lead.email_id}
        name_parts = (lead.lead_name or "").split(" ", 1)
        if name_parts:
            entry["first_name"] = name_parts[0]
            if len(name_parts) > 1:
                entry["last_name"] = name_parts[1]
        if lead.company_name:
            entry["domain"] = lead.company_name
        details.append(entry)

    try:
        result = _apollo_post("people/bulk_match", {
            "details": details,
            "reveal_personal_emails": True,
            "reveal_phone_number": True,
        })
    except Exception as e:
        frappe.log_error(f"Apollo bulk enrich failed: {e}", "Apollo Integration")
        return

    matches = result.get("matches") or []
    enriched_count = 0

    for i, match in enumerate(matches):
        if i >= len(leads):
            break
        person = match if isinstance(match, dict) and match.get("id") else None
        if not person:
            # Mark as attempted so we don't retry endlessly
            frappe.db.set_value("Lead", leads[i].name, "apollo_enriched", 1, update_modified=False)
            continue

        data = _map_person_to_lead(person)
        lead = frappe.get_doc("Lead", leads[i].name)

        for field in ("company_name", "email_id", "mobile_no", "designation",
                      "website", "industry", "linkedin_url", "apollo_id"):
            if data.get(field) and not lead.get(field):
                lead.set(field, data[field])

        lead.apollo_enriched = 1
        note_text = data.get("_enrichment_note")
        if note_text:
            lead.append("notes", {"note": f"Apollo enrichment: {note_text}"})

        lead.save(ignore_permissions=True)
        enriched_count += 1

    frappe.db.commit()
    if enriched_count:
        frappe.logger().info(f"Apollo: enriched {enriched_count}/{len(leads)} leads")


def sync_apollo_list():
    """Pull new contacts from a saved Apollo list into ERPNext as Leads.
    Runs every 30min via scheduler. Requires apollo_list_id in site_config."""
    key = frappe.conf.get("apollo_api_key")
    if not key:
        return
    if not frappe.conf.get("apollo_sync_enabled"):
        return

    list_id = frappe.conf.get("apollo_list_id")
    if not list_id:
        return

    try:
        result = _apollo_post("mixed_people/api_search", {
            "contact_label_ids": [list_id],
            "page": 1,
            "per_page": 25,
        })
    except Exception as e:
        frappe.log_error(f"Apollo list sync failed: {e}", "Apollo Integration")
        return

    people = result.get("people") or []
    created_count = 0

    for person in people:
        apollo_id = person.get("id")
        email = person.get("email")

        # Dedup
        if apollo_id and frappe.db.exists("Lead", {"apollo_id": apollo_id}):
            continue
        if email and frappe.db.exists("Lead", {"email_id": email}):
            continue

        data = _map_person_to_lead(person)
        if not data.get("lead_name"):
            continue

        lead = frappe.new_doc("Lead")
        for field in ("lead_name", "company_name", "email_id", "mobile_no",
                      "designation", "website", "industry", "linkedin_url",
                      "apollo_id", "apollo_enriched"):
            if data.get(field):
                lead.set(field, data[field])

        if frappe.db.exists("Lead Source", "Apollo"):
            lead.source = "Apollo"

        note_text = data.get("_enrichment_note")
        if note_text:
            lead.append("notes", {"note": f"Imported from Apollo list: {note_text}"})

        try:
            lead.insert(ignore_permissions=True)
            created_count += 1
        except Exception as e:
            frappe.log_error(f"Apollo lead creation failed for {data.get('email_id')}: {e}", "Apollo Integration")

    frappe.db.commit()
    if created_count:
        frappe.logger().info(f"Apollo: imported {created_count} new leads from list {list_id}")
