---
name: DSPL role detection — don't trust department alone
description: Guidance for any PWA/desk logic that branches on "is this user sales or service" — department strings are inconsistent, always also check designation and provide a UI override
type: feedback
originSessionId: c5d63914-3824-4e93-b8d9-5ed94943b4b2
---
When PWA/desk logic needs to decide "is this user sales or service" (e.g. the DCR/visit purpose dropdown, role-specific tools), **do not branch on department substring alone**.

**Why:** DSPL Employee records have inconsistent shape. Observed real values (2026-04-23):
- `SERVICE - DSPL` — uppercase, most service engineers
- `Customer Service - DSPL` — different prefix
- `Operations - DCEPL` — used for some service technicians (SHARWAN, UMASHANKAR)
- `Maintenance - DSPL`, `Maintenance - DCEPL` — service-adjacent
- `null` — several engineers including managers have no department set (AKSHAY BABAN POKALE, RAMESH HARIBHAU KULKARNI, etc.)
- `SALES AND MARKETING - DSPL` vs `Sales - DSPL` vs `Marketing - DSPL` — inconsistent sales naming

A single `indexOf('service')` on `dept.toLowerCase()` misses Operations/Maintenance technicians and anyone with null dept.

**How to apply:**
1. Check **both** `emp.department` and `emp.designation`, lowercase, against keyword lists.
2. Sales hints: `sales`, `marketing`. Service hints: `service`, `support`, `maintenance`, `technician`, `installation`, `commissioning`, `field engineer`.
3. If both match (e.g. "Sales & Service"), let sales win.
4. **Always render a visible UI override** (e.g. Sales/Service buttons) pre-selected from detection — never trust the heuristic silently. Users with ambiguous roles (R&D, Admin) need a way to pick.
5. After changing PWA JS, bump `CACHE_NAME` in `sw.js` — `ignoreSearch: true` means `?v=` params are ignored.

Reference implementation: `vaishali/public/field/screens/visits.js` `visitNew` handler (commit ffc285f).
