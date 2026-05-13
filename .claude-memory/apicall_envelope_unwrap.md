---
name: apiCall envelope unwrap pattern
description: PWA screens reading fieldAPI.apiCall response must unwrap the {data:{message:payload}} envelope or they will silently always show the empty state
type: feedback
originSessionId: b43a019a-5fa1-4e00-bf0a-86fe14771c97
---
# apiCall envelope unwrap

**Rule:** Every PWA screen calling `api.apiCall(method, path)` must unwrap the response with the canonical:

```js
.then(function (res) {
  if (!res || res.error || !res.data) { /* error path */ return; }
  var raw = res.data || {};
  var data = raw.message || raw.data || raw;
  // use data.foo
})
```

**Why:** `apiCall` (in `vaishali/public/field/api.js`) returns `{ data: <FrappeResponse>, status }`. Frappe responses themselves wrap the return value as `{message: payload}`, and `apiCall` then normalizes by also setting `data.data = data.message` (line 699-700). So the screen's `.then` callback receives `{data: {message: payload, data: payload}, status: 200}`.

If a screen does `.then(function (data) { data.foo })`, it's reading the envelope, not the payload — every property comes back `undefined`, every truthy check fails, every fallback fires. **The screen will silently always look like it's in the empty state, even with real data.** The empty state hides the bug.

**How to apply:**
- Always destructure with the three-level fallback (`raw.message || raw.data || raw`) — `raw.data` covers the normalized envelope, `raw.message` covers raw Frappe responses, and bare `raw` covers fixtures.
- Default-empty-state fixtures in tests must double-encode the same shape (set both `message` and top-level keys) so the test catches both forms.
- When a screen reports "always empty" but the endpoint verifies fine via `bench shell`, this is the first thing to check.

**Reference implementation:** `vaishali/public/field/screens/monthly-report.js:62-81` and `lost-reasons.js:166-180` (the latter was the bug-then-fix on 2026-05-04).

**Caught how:** `pwa-tester` agent flagged it in code review of `8779c4d`. Fixed in `9f748fe`. The verification missed it because DSPL had zero `status=Lost` quotations, so the empty-state path was correct by accident.
