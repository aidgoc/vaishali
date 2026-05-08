"""DCEPL ERS Store SOP — single bootstrap that runs after every migrate.

Wired into `after_migrate` in hooks.py so every `bench update` and
fresh-bench install re-applies everything that isn't already in
fixtures: the Quality Inspection Template + Parameters (Quality
module, not exportable via Vaishali fixtures), and the two new
Roles (DCEPL ERS HOD, DCEPL Gate Guard).

Each underlying setup function is idempotent, so re-running is safe.
Custom Fields, Property Setters, Workspaces, the Outward Gate Pass
DocTypes, and hook registrations all survive `bench update` on
their own (fixtures + app code) — this bootstrap covers the gaps.
"""
import frappe


def run():
    """Re-apply all wedge seeders. Idempotent."""
    try:
        from vaishali import setup_qa_qc, setup_gate_pass, mrn_approval_guard

        # Wedge 1 — QI Template + 5 parameters (Quality module records)
        setup_qa_qc.run()

        # Wedge 4 — DCEPL ERS HOD role + custom fields on Material Request
        # (custom fields also live in fixtures; this re-creates idempotently
        # if a fresh bench somehow misses them)
        mrn_approval_guard.setup()

        # Wedge 5 — DCEPL Gate Guard role
        setup_gate_pass.ensure_role()

        frappe.db.commit()
    except Exception:
        # Don't break `bench migrate` if a single seeder hiccups —
        # log it and let the operator re-run manually.
        frappe.log_error(
            title="DCEPL ERS Store SOP bootstrap failed",
            message=frappe.get_traceback(),
        )
