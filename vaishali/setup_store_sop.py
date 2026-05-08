"""DCEPL ERS Store SOP — single bootstrap that runs after every migrate.

Wired into `after_migrate` in hooks.py so every `bench update` and
fresh-bench install re-applies everything that isn't reliably
captured by the regular fixture export.

Each underlying setup function is idempotent, so re-running is safe.
"""
import json

import frappe


WORKSPACE = "ERP Guides"
STORE_SHORTCUT = {
    "label": "Store Guide",
    "type": "URL",
    "url": "/store-guide",
    "color": "#bf8f00",
}


def _ensure_store_guide_shortcut():
    """Add Store Guide shortcut to ERP Guides workspace if missing."""
    if not frappe.db.exists("Workspace", WORKSPACE):
        return
    ws = frappe.get_doc("Workspace", WORKSPACE)
    have = next((s for s in (ws.shortcuts or []) if s.label == STORE_SHORTCUT["label"]), None)
    changed = False
    if not have:
        inv_idx = next(
            (s.idx for s in (ws.shortcuts or []) if s.label == "Inventory Guide"),
            len(ws.shortcuts or []),
        )
        ws.append("shortcuts", {**STORE_SHORTCUT, "idx": inv_idx + 1})
        changed = True
    else:
        for k, v in STORE_SHORTCUT.items():
            if getattr(have, k, None) != v:
                setattr(have, k, v)
                changed = True

    content = json.loads(ws.content or "[]")
    if not any(b.get("type") == "shortcut"
               and b.get("data", {}).get("shortcut_name") == STORE_SHORTCUT["label"]
               for b in content):
        new_block = {
            "id": frappe.generate_hash(length=10),
            "type": "shortcut",
            "data": {"shortcut_name": STORE_SHORTCUT["label"], "col": 4},
        }
        out, inserted = [], False
        for b in content:
            out.append(b)
            if (not inserted
                    and b.get("type") == "shortcut"
                    and b.get("data", {}).get("shortcut_name") == "Inventory Guide"):
                out.append(new_block)
                inserted = True
        if not inserted:
            out.append(new_block)
        ws.content = json.dumps(out)
        changed = True

    if changed:
        ws.flags.ignore_permissions = True
        ws.save()


def run():
    """Re-apply all wedge seeders. Idempotent."""
    try:
        from vaishali import setup_qa_qc, setup_gate_pass, mrn_approval_guard

        # Wedge 1 — QI Template + 5 parameters (Quality module records)
        setup_qa_qc.run()

        # Wedge 4 — DCEPL ERS HOD role + Material Request custom fields
        mrn_approval_guard.setup()

        # Wedge 5 — DCEPL Gate Guard role
        setup_gate_pass.ensure_role()

        # Workspace shortcut to /store-guide (defends against fixture
        # exports that pre-date this shortcut)
        _ensure_store_guide_shortcut()

        frappe.db.commit()
    except Exception:
        frappe.log_error(
            title="DCEPL ERS Store SOP bootstrap failed",
            message=frappe.get_traceback(),
        )
