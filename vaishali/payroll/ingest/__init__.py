"""Read-only parsers for the Mar 2026 Excel salary registers."""
import os

# Resolution order:
#   1. VAISHALI_PAYROLL_EXCEL_DIR env var (explicit override)
#   2. /home/frappe/vaishali_data/2026-03/ — exists on EC2 prod
#   3. /Users/harshwardhangokhale/vaishali/data — Mac dev fallback
EC2_DIR = "/home/frappe/vaishali_data/2026-03"
DEV_DIR = "/Users/harshwardhangokhale/vaishali/data"

def _resolve_excel_dir() -> str:
    env = os.environ.get("VAISHALI_PAYROLL_EXCEL_DIR")
    if env:
        return env
    if os.path.isdir(EC2_DIR):
        return EC2_DIR
    return DEV_DIR

EXCEL_DIR = _resolve_excel_dir()

EXCEL_FILES = {
    "dcepl_staff":    "1. DCEPL Employee Salary Register & Attendance -Mar 2026.xlsx",
    "dspl_staff":     "2. DSPL Employee Salary Register & Attendance-Mar 2026.xlsx",
    "dcepl_operator": "3. DCEPL Operator Salary Register-Mar 2026.xlsx",
    "overhead":       "4. Overhead Salary Register & Attendance-Mar 2026.xlsx",
    "leave_tracker":  "7. Dynamic_Emp Leave Data_Apr 2025-Mar 2026.xlsx",
}

def excel_path(key):
    return os.path.join(EXCEL_DIR, EXCEL_FILES[key])
