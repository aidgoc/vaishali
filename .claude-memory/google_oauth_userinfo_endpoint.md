---
name: Google Social Login api_endpoint must be /oauth2/v2/userinfo, not openidconnect
description: Frappe hardcodes data["id"] for Google login; the OIDC userinfo endpoint returns "sub" and crashes first-time logins with KeyError 'id'
type: project
originSessionId: 5907710a-5b9b-4a0a-a5ad-9440967f0ea2
---
`tabSocial Login Key` row `google.api_endpoint` must be `https://www.googleapis.com/oauth2/v2/userinfo` — NOT `https://openidconnect.googleapis.com/v1/userinfo`.

**Why:** Frappe's `apps/frappe/frappe/utils/oauth.py::update_oauth_user` has a hardcoded `match` block:
```python
case "google":
    user.set_social_login_userid(provider, userid=data["id"])
```
The OpenID Connect userinfo endpoint returns the user ID under key `sub` (per OIDC spec). The OAuth2 v2 userinfo endpoint returns `id`. So if `api_endpoint` is the OIDC one, every **first-time** Google login crashes with `KeyError: 'id'` (Status 500). Existing linked accounts skip this line via `user.get_social_login_userid(provider)` truthy check, so returning users don't notice — that's why harsh@dgoc.in worked but new logins failed.

**How to apply:**
- If users report `Status: 500` on `/api/method/frappe.integrations.oauth2_logins.login_via_google`, check this row first.
- Fix is one SQL UPDATE + cache clear + supervisor restart all. ~30 seconds.
- DO NOT patch `frappe/utils/oauth.py` — framework code, will re-break on `bench update`. The endpoint flip is the right layer.
- Hit on 2026-05-04. Site recovered immediately after the flip.
