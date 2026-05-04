"""Payroll setup orchestrator.

Two entry points:
  - setup.wipe_existing(confirm="YES_WIPE_PAYROLL")   destructive, gated
  - setup.run()                                         build everything
The setup script DOES NOT call wipe automatically. Run wipe first, manually,
then run setup.run().
"""
from __future__ import annotations
import frappe


WIPE_TARGETS = [
    ("Salary Slip", "submitted slips"),
    ("Payroll Entry", "payroll entries"),
    ("Salary Structure Assignment", "structure assignments"),
    ("Salary Structure", "structures"),
    ("Salary Component", "components"),
    ("Additional Salary", "additional salaries"),
]


def wipe_existing(confirm: str = ""):
    """Cancel + delete every existing payroll record.

    Pass confirm='YES_WIPE_PAYROLL' to actually run. Anything else prints
    the dry-run count of what would be deleted.

    Preserves: Employee, Leave Allocation, Holiday List, Department.
    """
    counts = {dt: frappe.db.count(dt) for dt, _ in WIPE_TARGETS}

    if confirm != "YES_WIPE_PAYROLL":
        print("\n=== DRY RUN — pass confirm='YES_WIPE_PAYROLL' to delete ===")
        for dt, label in WIPE_TARGETS:
            print(f"  Would delete {counts[dt]:>4} {label} ({dt})")
        return counts

    print("\n=== WIPING PAYROLL DATA ===")
    for dt, label in WIPE_TARGETS:
        # Cancel submitted ones first
        submitted = frappe.get_all(dt, filters={"docstatus": 1}, pluck="name")
        for n in submitted:
            try:
                doc = frappe.get_doc(dt, n)
                doc.cancel()
            except Exception as e:
                frappe.log_error(f"Wipe cancel {dt}/{n}: {e}", "PayrollWipe")
        frappe.db.commit()

        # Delete every row
        all_rows = frappe.get_all(dt, pluck="name")
        for n in all_rows:
            try:
                frappe.delete_doc(dt, n, ignore_permissions=True, force=True)
            except Exception as e:
                frappe.log_error(f"Wipe delete {dt}/{n}: {e}", "PayrollWipe")
        frappe.db.commit()
        print(f"  Wiped {len(all_rows):>4} {label} ({dt})")

    print("=== WIPE COMPLETE ===\n")
    return counts


def run():
    """Build everything — components → structures → SSAs → additional → attendance.
    Does NOT submit Payroll Entries (that's an explicit later step).
    """
    raise NotImplementedError("Filled in Task 24 (final orchestrator)")
