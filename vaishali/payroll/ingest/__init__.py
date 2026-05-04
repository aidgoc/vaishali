"""Read-only parsers for the Mar 2026 Excel salary registers."""
import os

# Override per environment. On the dev Mac it points at ~/vaishali/data;
# on EC2 the operator scp's the files to /home/frappe/vaishali_data/2026-03/.
EXCEL_DIR = os.environ.get(
    "VAISHALI_PAYROLL_EXCEL_DIR",
    "/Users/harshwardhangokhale/vaishali/data",
)

EXCEL_FILES = {
    "dcepl_staff":    "1. DCEPL Employee Salary Register & Attendance -Mar 2026.xlsx",
    "dspl_staff":     "2. DSPL Employee Salary Register & Attendance-Mar 2026.xlsx",
    "dcepl_operator": "3. DCEPL Operator Salary Register-Mar 2026.xlsx",
    "overhead":       "4. Overhead Salary Register & Attendance-Mar 2026.xlsx",
    "leave_tracker":  "7. Dynamic_Emp Leave Data_Apr 2025-Mar 2026.xlsx",
}

def excel_path(key):
    return os.path.join(EXCEL_DIR, EXCEL_FILES[key])
