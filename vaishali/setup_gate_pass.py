"""DCEPL ERS Store — Outward Gate Pass setup (wedge 5).

Idempotent role creation. The DocType itself is shipped as files
under `vaishali/vaishali/doctype/outward_gate_pass/` and gets created
by `bench migrate`.

Usage:
    bench --site dgoc.logstop.com migrate
    bench --site dgoc.logstop.com execute vaishali.setup_gate_pass.ensure_role
"""
import frappe


GUARD_ROLE = "DCEPL Gate Guard"


def ensure_role():
    if frappe.db.exists("Role", GUARD_ROLE):
        return
    role = frappe.new_doc("Role")
    role.role_name = GUARD_ROLE
    role.desk_access = 1
    role.insert(ignore_permissions=True)
    frappe.db.commit()
    print(f"OK: created Role '{GUARD_ROLE}'")
