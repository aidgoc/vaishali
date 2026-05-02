"""Per-company HR account + holiday list defaults.

Idempotent. Run via:
    bench --site dgoc.logstop.com execute vaishali.setup_hr_company.run
    bench --site dgoc.logstop.com execute vaishali.setup_hr_company.run --kwargs "{'company': 'Dynamic Crane Engineers Private Limited'}"

For each company:
- Ensures an "Employee Advances - <ABBR>" leaf ledger exists under
  "Loans and Advances (Assets) - <ABBR>" (or any group containing "Advance"
  in the chart of accounts).
- Sets `default_employee_advance_account` on the Company.
- Sets `default_holiday_list` on the Company (when explicitly provided, or
  when blank uses the latest Holiday List that overlaps the current period).
- Migrates Employees pointing at expired Holiday Lists to the company default.
"""
import frappe
from datetime import date

# Per-company holiday list defaults. Pre-existing lists in this DB:
#   "Holiday List 2026"    — calendar year 2026 (in use by some DCEPL emps)
#   "Trial"                — 2026-03-31 → 2027-03-30 (FY 2026-27 coverage)
COMPANY_HOLIDAY_LIST = {
    "Dynamic Servitech Private Limited": "Holiday List 2026",
    "Dynamic Crane Engineers Private Limited": "Holiday List 2026",
}


def run(company=None):
    if company is None:
        for c in COMPANY_HOLIDAY_LIST:
            run(c)
        return
    print(f"\n=== HR Company Setup — {company} ===\n")
    abbr = frappe.db.get_value("Company", company, "abbr")
    if not abbr:
        frappe.throw(f"Company {company} has no abbr — set one on the Company master")
    _ensure_employee_advance_account(company, abbr)
    _set_default_holiday_list(company)
    _migrate_employees_to_default_holiday_list(company)
    frappe.db.commit()
    print(f"\n✓ {company} done.\n")


# ── Employee Advance ledger account ───────────────────────────────

def _ensure_employee_advance_account(company, abbr):
    leaf_name_target = f"Employee Advances - {abbr}"
    if frappe.db.exists("Account", leaf_name_target):
        # Confirm it's set as company default
        if frappe.db.get_value("Company", company, "default_employee_advance_account") != leaf_name_target:
            frappe.db.set_value("Company", company, "default_employee_advance_account", leaf_name_target)
            print(f"  Account: re-linked default_employee_advance_account → {leaf_name_target}")
        else:
            print(f"  Account: {leaf_name_target} already wired up")
        return leaf_name_target

    # Find a parent group account
    parent = _find_parent_advance_group(company, abbr)
    if not parent:
        frappe.throw(
            f"No parent group account found for Employee Advances under {company}. "
            f"Expected something like 'Loans and Advances (Assets) - {abbr}'."
        )

    doc = frappe.new_doc("Account")
    doc.account_name = "Employee Advances"
    doc.parent_account = parent
    doc.company = company
    doc.account_type = "Receivable"
    doc.account_currency = "INR"
    doc.is_group = 0
    doc.insert(ignore_permissions=True)
    print(f"  Account: created {doc.name} under {parent}")

    frappe.db.set_value("Company", company, "default_employee_advance_account", doc.name)
    print(f"  Company: set default_employee_advance_account = {doc.name}")
    return doc.name


def _find_parent_advance_group(company, abbr):
    # Prefer the canonical "Loans and Advances (Assets)" group
    candidates = [
        f"Loans and Advances (Assets) - {abbr}",
        f"Current Assets - {abbr}",
    ]
    for c in candidates:
        if frappe.db.exists("Account", c) and frappe.db.get_value("Account", c, "is_group"):
            return c
    # Fallback: any group account with "Advance" in name for this company
    rows = frappe.get_all("Account",
        filters={"company": company, "is_group": 1,
                 "account_name": ["like", "%Advance%"]},
        fields=["name"], limit_page_length=1)
    return rows[0].name if rows else None


# ── Holiday list defaults ─────────────────────────────────────────

def _set_default_holiday_list(company):
    desired = COMPANY_HOLIDAY_LIST.get(company)
    if not desired:
        print(f"  Holiday List: no default mapped for {company}, skipping")
        return
    if not frappe.db.exists("Holiday List", desired):
        print(f"  Holiday List: {desired} does not exist, skipping default")
        return
    current = frappe.db.get_value("Company", company, "default_holiday_list")
    if current == desired:
        print(f"  Holiday List: company default already {desired}")
        return
    frappe.db.set_value("Company", company, "default_holiday_list", desired)
    print(f"  Holiday List: set company default → {desired}")


def _migrate_employees_to_default_holiday_list(company):
    """Move Employees on an expired Holiday List to the company default."""
    desired = frappe.db.get_value("Company", company, "default_holiday_list")
    if not desired:
        print("  Holiday List: company default missing, skipping migration")
        return
    today_iso = date.today().isoformat()
    employees = frappe.get_all("Employee",
        filters={"status": "Active", "company": company},
        fields=["name", "holiday_list"])
    moved = 0
    for emp in employees:
        if not emp.holiday_list:
            frappe.db.set_value("Employee", emp.name, "holiday_list", desired)
            moved += 1
            continue
        if emp.holiday_list == desired:
            continue
        to_date = frappe.db.get_value("Holiday List", emp.holiday_list, "to_date")
        if to_date and str(to_date) < today_iso:
            frappe.db.set_value("Employee", emp.name, "holiday_list", desired)
            moved += 1
    print(f"  Holiday List: migrated {moved} Employees onto {desired}")
