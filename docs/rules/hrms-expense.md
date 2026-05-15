# HRMS — Expense Claim & Advance

## Advance Gate

- **`validate_advances` requires `paid_amount > claimed + return` to claim against an advance.** An approved-but-unpaid advance (`paid_amount=0`) blocks all expense claims with the cryptic "Allocated amount cannot be greater than unclaimed amount 0.0".
- **Workflow:** Accounts must book a Payment Entry (Reference Type = Employee Advance) before the employee can file a claim.
- `get_outstanding_advances` mirrors this — exposes `pending_unpaid: true` for unpaid advances so the PWA dropdown shows them as "awaiting payment by Accounts" instead of letting submit fail.

## Sanctioned Amount

- **Expense Claim also requires `sanctioned_amount` populated on each line at insert time when any advance row is present.** Otherwise validate_advances throws "Total advance amount cannot be greater than total sanctioned amount".
- `submit_expense_claim` defaults `sanctioned_amount = amount` per line so Draft insert succeeds; approvers can still reduce on approval (partial sanction).
