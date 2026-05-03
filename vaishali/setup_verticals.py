"""Map ERPNext employees → Dynamic Group division (`Employee.vertical`).

Source of truth: DCEPL Tally cost centres. Each employee in Tally is a
cost centre under a parent group that names the division:

    EPS STAFF                      → EPS  (Equipment Protection Systems)
    ER STAFF                       → ERS  (Equipment Rental Services — staff)
    MAIN GROUP OPERATORS ER        → ERS  (rental operators)
    Operators-ER HRC               → ERS  (HRC operators)
    Operator ER NON HRC            → ERS  (non-HRC operators)
    DCEPL Directors                → GEN  (general/directors)
    OFFICE STAFF                   → ""   (admin — no division)

(ESS is a DSPL-side division — Tally DCEPL doesn't have an ESS cost
centre group, so DSPL employees are classified by hand from the desk
when needed; e.g. Zinge → ESS.)

The mapping below is baked in from
~/ers/data/tally/dcepl_costcentres.xml (parsed 2026-05-03). Re-generate
when the team roster shifts: parse the XML the same way and replace
EMPLOYEE_VERTICAL with the new dict.

Usage:
    bench --site dgoc.logstop.com execute vaishali.setup_verticals.run

Idempotent. Reports unmatched mapping rows and DCEPL employees with
no Tally cost centre at all.
"""
import re
import frappe


# Generated from DCEPL Tally cost centres. Names are the human-readable
# part with staff IDs stripped. ERS = Equipment Rental Services (DCEPL
# division), EPS = Equipment Protection Systems, GEN = directors.
EMPLOYEE_VERTICAL = {
    "Abhay Mohire": "EPS",
    "Adey Dineshkumar": "ERS",
    "Ajay Kumar Tiwari": "ERS",
    "Akhileshkumar Yadav": "ERS",
    "Akshay Bhute": "EPS",
    "Amit Ramgopal Singh": "ERS",
    "Amol Satpute": "ERS",
    "Anil Darekar": "ERS",
    "Anil Kumar": "ERS",
    "Ansari Illyas": "ERS",
    "Arshad Ali": "ERS",
    "Avhad Ramdas": "ERS",
    "Bhupal Singh": "ERS",
    "Chhandacharan Mallik": "EPS",
    "Dayashankar Rameshwak": "ERS",
    "Deepak Balekundri": "EPS",
    "Deepak Tangade": "EPS",
    "Dhanjay Kumar": "ERS",
    "Dharmu Kumar Paswan": "ERS",
    "Dinesh Kumar Rajbhar": "ERS",
    "Dipali Patil": "EPS",
    "Dolesh Kumar": "ERS",
    "Ganesh Rahangdle": "ERS",
    "Gokhale Bharti Nitin": "GEN",
    "Gokhale Nitin Jayant": "GEN",
    "Govind Prajapati": "ERS",
    "Gupta Dharmendra": "ERS",
    "Hemant Joshi": "ERS",
    "Hukum Chand": "ERS",
    "Irshad Ali": "ERS",
    "Jitendra Kumar": "ERS",
    "Kalidas S. Vanshiv": "ERS",
    "Karmu Kumar Paswan": "ERS",
    "Kudale Rajendra": "ERS",
    "Kulkarni Vivek": "EPS",
    "Kunal Mohta": "EPS",
    "Mahesh Dubey": "ERS",
    "Mangala Mishra": "ERS",
    "Manish Kumar Sharma": "ERS",
    "Mannan Ansari": "ERS",
    "Manoj Kumar Yadhav": "ERS",
    "Md.Kamran Alam": "ERS",
    "Md.Shamim Ansari": "ERS",
    "Mithlesh": "ERS",
    "Mohammad Khalid": "ERS",
    "Naik Vaishali K": "EPS",
    "Narendra Kumar": "ERS",
    "Navnit Prajapati": "ERS",
    "Nayak Gopal Ram": "ERS",
    "Pankaj Kumar": "ERS",
    "Pankaj Kumar Yogendra": "ERS",
    "Pappu": "ERS",
    "Prafull Kumar": "ERS",
    "Prathmesh Pawar": "EPS",
    "Rahul Kolar": "EPS",
    "Rahul Raut": "EPS",
    "Ramesh Kulkarni": "ERS",
    "Ranjit Kumar": "ERS",
    "Raushan Kumar": "EPS",
    "Raushan Kumar Mishraa": "ERS",
    "Raviprakash Unikey": "ERS",
    "Rode Nilesh": "ERS",
    "Sagar Salunke": "ERS",
    "Sandeep Upadhya": "ERS",
    "Selvakumar Arumugam Konar": "ERS",
    "Sharad Dabhade": "ERS",
    "Sharwan Prajapati": "ERS",
    "Shiv Kant": "ERS",
    "Shiv Kumar": "ERS",
    "Shivangiraje Nimbalakar": "EPS",
    "Shubham Pawar": "EPS",
    "Singh Pintu": "ERS",
    "Sonawale Sambhaji": "EPS",
    "Sonu Singh": "ERS",
    "Sumit Nishad": "ERS",
    "Sunil Kumar Prasad": "ERS",
    "Suraj Kumar Jaysawal": "ERS",
    "Sushant Shinde": "EPS",
    "Tabrej Alam": "ERS",
    "Varun Tiwari": "EPS",
    "Vikas Babu": "ERS",
    "Vikash Kumar": "ERS",
    "Vinay Prakesh": "ERS",
    "Virendra Kumar": "ERS",
    "Vishwajeet Gupta": "ERS",
    "Vishwas Aher": "ERS",
    "Waseem Ahmad": "ERS",
    "Yogendra Yadav": "ERS",
}


# ── Name normalisation ────────────────────────────────────────────

def _normalise(s):
    s = (s or "").lower()
    s = re.sub(r'\b(mr|mrs|ms|md|dr|sri|smt)\.?\s+', '', s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _match(tally_name_norm, emp_index):
    """Return ERPNext Employee.name or None.

    Strategy (strict — avoid false positives):
    1. Exact normalised match
    2. Token-set match where ALL tokens of the shorter name are present in
       the longer name, AND the first token (typically the personal name)
       is shared. Common surnames like 'kumar' / 'singh' / 'prajapati' on
       their own are not enough — we require at least one rarer token.
    """
    if tally_name_norm in emp_index:
        return emp_index[tally_name_norm]

    cc_tokens = [t for t in tally_name_norm.split() if t]
    if len(cc_tokens) < 2:
        return None
    cc_set = set(cc_tokens)

    # Reject matches solely on common Indian-name particles
    common = {"kumar", "singh", "ali", "prasad", "prajapati", "yadav",
              "kishor", "kishore", "ram", "lal", "raj", "shah", "sharma",
              "paswan", "khan", "bhai", "shri"}

    for full, emp in emp_index.items():
        emp_tokens = [t for t in full.split() if t]
        if len(emp_tokens) < 2:
            continue
        emp_set = set(emp_tokens)
        shared = cc_set & emp_set
        rare_shared = shared - common
        if not rare_shared:
            continue
        shorter = min(len(cc_set), len(emp_set))
        # All tokens of the shorter name must appear in the longer name
        if len(shared) >= shorter and len(rare_shared) >= 1:
            return emp
    return None


# ── Apply ─────────────────────────────────────────────────────────

def run(dry_run=0):
    """Apply the Tally vertical mapping to DCEPL employees.

    Pass dry_run=1 to preview the changes without writing."""
    dry_run = bool(int(dry_run))
    print(f"\n=== Vertical setup — {'DRY RUN' if dry_run else 'APPLY'} ===\n")

    dcepl_emps = frappe.get_all("Employee",
        filters={"company": "Dynamic Crane Engineers Private Limited",
                 "status": "Active"},
        fields=["name", "employee_name", "vertical", "department"])
    emp_index = {_normalise(e.employee_name): e.name for e in dcepl_emps}
    print(f"  DCEPL active employees: {len(dcepl_emps)}")
    print(f"  Tally mappings: {len(EMPLOYEE_VERTICAL)}")

    updated = 0
    by_vertical = {"EPS": 0, "ERS": 0, "GEN": 0}
    seen_emps = set()
    unmatched_tally = []

    for tally_name, target in EMPLOYEE_VERTICAL.items():
        emp = _match(_normalise(tally_name), emp_index)
        if not emp:
            unmatched_tally.append(tally_name)
            continue
        seen_emps.add(emp)
        current = frappe.db.get_value("Employee", emp, "vertical")
        if current == target:
            continue
        if dry_run:
            print(f"  WOULD set {emp}.vertical: {current!r} → {target}")
        else:
            frappe.db.set_value("Employee", emp, "vertical", target)
        updated += 1
        by_vertical[target] += 1

    if not dry_run:
        frappe.db.commit()

    print(f"\n  Updated: {updated} ({by_vertical})")
    if unmatched_tally:
        print(f"  Unmatched Tally names ({len(unmatched_tally)}, first 10):")
        for n in unmatched_tally[:10]:
            print(f"    {n}")

    untouched = [e for e in dcepl_emps if e.name not in seen_emps and not e.vertical]
    if untouched:
        print(f"\n  DCEPL employees with no vertical and no Tally match "
              f"({len(untouched)}, first 10):")
        for e in untouched[:10]:
            print(f"    {e.name} ({e.employee_name}) dept={e.department}")
