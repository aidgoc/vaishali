---
name: Working style feedback
description: How Harsh wants Claude to work — fast, parallel, no speculation, data-verified
type: feedback
---

**Always verify data before presenting:**
- Don't assume Krisp ERP division filters work correctly — the Sale Register showed all divisions despite EPS filter being clicked. Use the Vertical column in Sale Items Register instead.
- Don't confuse DCEP (Dynamic Crane Engineers) assets with DSPL products. The 484 Krisp assets are office equipment (laptops, ACs), NOT crane safety devices.
- Don't include ERS/ESS/ESS-BOSCH data in EPS analysis. DSPL only has EPS. User corrected this multiple times.
**Why:** User caught revenue being ₹18Cr when real EPS is ₹4.57Cr. Also caught non-EPS items tagged as EPS.

**Dispatch parallel agents aggressively:**
- User explicitly asks for parallel execution ("start parallel", "/dispatching-parallel-agents")
- Independent streams should always run concurrently — don't serialize what can parallelize
**Why:** User values speed. Two agents completing in 2 minutes beats one agent in 4 minutes.

**Send reports to Telegram:**
- Always send HTML reports + summary message to Telegram (chat ID 5705861942)
- Use Mik bot token: <ASK_USER_FOR_TELEGRAM_BOT_TOKEN>
- User prefers visual HTML reports over text-only summaries
**Why:** User reviews reports on phone via Telegram.

**Don't over-brainstorm for clear tasks:**
- When user says "start" or "proceed" or "you decide" — take action, don't ask more questions
- Use brainstorming skill for genuinely unclear scope, skip it for well-defined tasks
**Why:** User got impatient when asked too many clarifying questions for obvious decisions.

**Bump SW version on every PWA deploy:**
- The service worker caches aggressively — must bump CACHE_NAME version (dspl-field-vXX) on every frontend change
- Without this, users see stale JS and the new features don't work until manual hard refresh
**Why:** Budget dashboard was invisible on first deploy because old SW served cached api.js.
