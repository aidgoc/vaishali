---
name: PWA in-place re-render pattern (replaces hash round-trip)
description: After a server action that changes screen state (DCR checkout flips status to Completed), re-render the screen in place by clearing appEl and re-calling the screen handler. Don't round-trip through location.hash to force a refresh — it flashes home and can strand users there.
type: feedback
originSessionId: 01007c65-cab4-4925-b4e8-166fe811929a
---
**Date:** 2026-05-06. **Commit:** `446117e`.

**Old pattern (anti-pattern, removed):**
```js
var currentHash = location.hash;
location.hash = '#/';                              // flash home
setTimeout(function () { location.hash = currentHash; }, 0);  // bounce back
```
This was used in the DCR checkout flow to force the visit detail screen to re-render with the new "Completed" state. It caused a visible home-screen flash for one tick, and if anything intercepted the first transition (back-stack, ghost transition timing, transition-end race), the user was stranded on home — exactly matching the user's "automatically disappears" report.

**New pattern (use this):**
```js
appEl.textContent = '';
window.Screens.visitDetail(appEl, { id: dcrName });
```
Clear the screen container, re-invoke the screen handler with the same params. The handler does its own GET and rebuilds the DOM. No hash change, no transition, no flash. Works because router clears `#app` before calling the handler — by emulating that here, we get a clean re-render without involving the router.

**Why:** Router-managed `location.hash = X` triggers iOS-style ghost transitions, scroll-position snapshots, and history pushState. None of that is wanted when staying on the same screen — we're just refreshing data. Direct re-call is faster, transition-free, and immune to back-stack interference.

**How to apply:** Use this pattern anywhere you need to "refresh the current screen after a successful server action":
- DCR checkout → re-render visit detail.
- Expense Claim submit → re-render expense detail.
- Any field edit on a non-form screen (PWA list/detail/dashboard) where state should reload.

**Don't:** dispatch synthetic `HashChangeEvent`, set `location.hash = location.hash` (browser ignores no-op), or push/pop history.

**Caveat:** If the screen handler relies on the page header set by the router, the header won't be re-rendered. For the visit detail this is fine because the title doesn't change post-checkout. If you need the header to update too, dispatch `hashchange` instead — but check the router's dedup logic first.
