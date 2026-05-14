---
name: quotation-per-user-discount-cap
description: "Per-user override for the Quotation discount-approval guard via site_config — lets named sales leads submit above the 30% director threshold up to their personal cap, without granting Director role."
metadata: 
  node_type: memory
  type: project
  originSessionId: 39ec2b20-ce8a-496d-956d-f0e35d747766
---

`vaishali/quotation_guard.py` (since commit `92b84f2`, 2026-05-14) reads
`site_config.json::quotation_discount_user_caps` — a `{user: pct}` dict —
and treats it as a personal ceiling that overrides the manager/director
role gates.

**Why:** Raghuvir Joshi (`sales3@dgoc.in`) needed to push a 37.5%
discount on quotation `22/2026-2027/0088` for D.N.D. Constructions but
isn't a Director and shouldn't get the Director role (it grants the
Management workspace + ₹25K advance alerts + everything else). The cap
is a least-privilege carve-out for pricing discretion only.

**Current caps (live in prod 2026-05-14):**
- `sales3@dgoc.in` (Raghuvir Joshi) → 50%

**How to apply:**
- To add a cap for another sales lead: edit `site_config.json` via
  `bench --site dgoc.logstop.com set-config -p quotation_discount_user_caps '{"user@dgoc.in": 50, ...}'`
  then `clear-cache + restart`. No code change needed.
- The cap covers both the manager (>15%) and director (>30%) bands —
  user gets through without their corresponding role.
- Above the personal cap, the throw message reads "exceeds your N%
  approval limit" (was "30% director-approval threshold").
- Submission writes a Comment "within personal cap N% for {user}" on
  the Quotation for audit.

**Watch-outs:**
- `quotation_discount_tiers` (warn/manager/director thresholds) is a
  separate config and still applies as the *default* ceiling for users
  without a personal cap.
- Site_config is plaintext in `bench backup`. Don't put anything
  sensitive in the cap dict (it's just emails + numbers, fine here).
- Cap is by `frappe.session.user` — if a Director impersonates / acts
  on behalf of someone, the Director role path still wins.

Related: [[crm_forward_funnel]] (the discount-approval guard is part of
that wedge), [[encryption_key_lock]] (don't confuse site_config edits
with key rotation — caps are safe to change anytime).
