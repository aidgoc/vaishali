---
name: India Compliance Account & GSTIN autofill (2026-05-06)
description: India Compliance Account signed up via the in-desk wizard at /app/india-compliance-account, GSTIN autofill on Customer/Supplier/Lead Quick Entry now live. API key encrypted in GST Settings.api_secret. 500 free credits valid till 2026-08-06. Top-up tiers documented.
type: project
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. Done via Playwright on dgoc.logstop.com.

**Account:**
- Signup page: `/app/india-compliance-account` (in-desk Vue wizard, no external website).
- Registered email: `harsh@dgoc.in`.
- Bound GSTIN: `27AALCD2298K1Z3` (DSPL).
- Email verification was a magic-link click (not a numeric OTP) — link opens the desk, validates session, writes api_secret.
- `GST Settings.api_secret` is encrypted in `__Auth`, masked as `***...` in `tabSingles`. The masked value is what `india_compliance.is_api_enabled()` checks against — it's truthy, so the gate opens.

**Free trial:** 500 credits, valid till **2026-08-06** (3 months). Unused credits forfeit at expiry — top up before then to roll the validity over.

**Pricing (live from `/app/india-compliance-account/purchase-credits`):**
| Tier | Per credit (excl GST) |
|---|---|
| First 10,000 credits | ₹0.50 |
| Next 40,000 (10,001–50,000) | ₹0.40 |
| Beyond 50,000 | ₹0.30 |

- Min purchase: 1,000 credits (₹500 + 18% GST = **₹590**).
- Default-display 10,000 credits = ₹5,000 + ₹900 GST = **₹5,900**.
- Validity: 12 months from purchase, **extends/resets on each new purchase**. Resilient Tech advertises this as "Lifetime Validity*".
- Payments via Razorpay/Stripe. Tax invoice goes to harsh@dgoc.in.

**1 credit = 1 API call.** Credit consumers:
- GSTIN autofill on Customer/Supplier/Lead create.
- e-Waybill generate / cancel / fetch (DSPL has `enable_e_waybill=1` — main consumer).
- e-Invoice generate / cancel (currently `enable_e_invoice=0`).
- GSTR recon, GSTIN status checks.

**Estimated DSPL burn rate:** ~65–130 credits/month (50–100 e-waybills + 10–20 customer onboardings + occasional recon). 500 free credits ≈ 4–7 months at typical use, but 3-month expiry hits first. Recommended top-up before Aug 6: 10,000 credits (₹5,900) buys ~year of cover at the cheapest ₹0.50 tier.

**Critical UX: GSTIN autofill ONLY fires in Quick Entry**, not the full DocType form. The trigger is in `india_compliance/public/js/quick_entry.js` (`get_gstin_field` → `onchange` → `autofill_fields`). Customer / Supplier / Lead full form has a `gstin` field with no autofill handler. Tell users to click **"+ Add Customer"** from the list view to get the dialog with `_gstin` field at the top — typing a GSTIN and tabbing out auto-fills name + GST category + pincode + address line 1 + city + state.

**Server-side autofill endpoint:** `india_compliance.gst_india.utils.gstin_info.get_gstin_info` (whitelisted). Args: `{gstin, throw_error: bool, doc: {doctype}}`. Returns `{business_name, gst_category, status, all_addresses[], permanent_address}`. Verified against DCEPL GSTIN `27AACCD1991N1Z8` returning correct Warje + Pirangut addresses.

**Known issue:** The Vue dashboard at `/app/india-compliance-account/` errors with "Failed to fetch" sometimes (CORS quirk on a secondary call) but the api_secret is already saved by then — the error is harmless. Customer/Supplier autofill works regardless.

**How to apply:** Don't waste time signing up again — the key is in place. If user reports autofill not firing, first verify they're using Quick Entry (not direct deep-link to `/app/customer/new`). If still not firing, check `GST Settings.api_secret` is set and `is_api_enabled()` returns truthy.
