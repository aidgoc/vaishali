# DSPL Field PWA — Layout Redesign Spec

**Date:** 2026-03-20
**Status:** Approved
**Approach:** Don Norman usability principles — affordances, feedback, mapping, constraints

## Problem

The current PWA has critical usability issues:
1. ~150px dead space at top of every screen (Frappe www template chrome)
2. Content flush to screen edges (padding wars with Frappe CSS)
3. Bottom nav hides content (padding-bottom guessing)
4. No fixed header — back button scrolls away
5. 5-tab bottom nav is crowded, includes low-frequency actions
6. Home screen is a single scroll wall with 12+ navigation tiles
7. Visual hierarchy is flat — everything has equal weight

## Solution

### 1. Standalone HTML (HRMS Pattern)

Replace `{%- extends "templates/web.html" -%}` with a complete standalone HTML document. No Frappe template inheritance. Zero inherited CSS to fight.

**`www/field.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no">
  <title>DSPL Field</title>
  <meta name="theme-color" content="#ffffff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="stylesheet" href="/assets/vaishali/field/style.css">
</head>
<body>
  <header id="app-header"></header>
  <main id="app"></main>
  <nav id="bottom-nav"></nav>
  <script>
    window.csrf_token = "{{ csrf_token }}";
    window.dspl_boot = {{ boot }};
    if (!window.frappe) window.frappe = {};
    window.frappe.csrf_token = "{{ csrf_token }}";
  </script>
  <!-- JS scripts -->
</body>
</html>
```

**`www/field.py`:** unchanged (provides csrf_token + boot context).

### 2. Three-Zone Flexbox Layout

```
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
#app-header { height: 56px; flex-shrink: 0; position: sticky; top: 0; }
#app { flex: 1; overflow-y: auto; padding: 20px; }
#bottom-nav { height: 64px; flex-shrink: 0; position: sticky; bottom: 0; }
```

- Body doesn't scroll — only `<main id="app">` scrolls
- Content never hides behind nav (flexbox math, not padding guessing)
- 20px padding on `#app` — consistent everywhere, set once
- Header always visible with back button

### 3. Router Owns the Header

Screens no longer render their own `UI.page()` headers. The router renders the header into `#app-header` based on route config:

```js
{ pattern: '#/attendance', title: 'Attendance', back: '#/home', handler: ... }
```

The `_renderRoute` function:
1. Sets `#app-header` content (back button + title)
2. Clears `#app` content
3. Calls the screen handler

Screens only render content into `#app`. No `UI.page()` calls.

Home screen has no back button — header shows "DSPL Field" or the company logo.

### 4. Bottom Nav — 3 Tabs

Reduce from 5 to 3: **Home, AI, Me**

- Home: dashboard with everything
- AI: Vaishali chat
- Me: profile, settings, sign out

Approvals and Team are accessible from the home screen (manager-only sections). They don't need permanent nav tabs — they're not daily-frequency actions for most users.

### 5. Home Screen — CNB Layout

**Manager view:**

```
[Greeting + KPI row]           — always visible at top
[2x2 Action Cards]            — Check In, New Visit, Leave, Expense
[Pending Approvals list]       — manager only, max 3 shown
[Tabbed Department Nav]        — Sales | Operations | Finance
  └─ 2x2 tile grid per tab
```

**Field staff view:**

```
[Greeting]
[2x2 Action Cards]            — Check In, New Visit, Leave, Salary
[Today's Visits list]
[Department shortcuts]         — only their own department
```

### 6. Action Cards

2x2 grid of tappable cards with:
- Icon (top-left, small)
- Label (bold, below icon)
- Live value (large number or status text)
- Tap → navigates to full screen

These are the ONLY elements that get a subtle shadow — to signal tappability per Don Norman's affordance principle. Everything else uses borders or background color.

### 7. Component Simplification

| Component | Change |
|-----------|--------|
| Stat card | Compact chip style, not full card. Value + label inline. |
| List item | Full-width row with dividers, no individual cards/shadows |
| Section heading | Simple uppercase text with 24px top margin. No accent bars. |
| Form fields | 16px font, label above, generous spacing |
| Primary button | Full-width, 52px, DSPL red. ONE per screen max. |
| Secondary actions | Text buttons (no border, no background) |

### 8. Files Changed

| File | Change |
|------|--------|
| `www/field.html` | Complete rewrite — standalone HTML |
| `public/field/style.css` | Complete rewrite — three-zone layout + simplified components |
| `public/field/app.js` | Router renders header; remove `ensureShell()`, `buildBottomNav()` from screens |
| `public/field/screens/home.js` | Rewrite — action cards + tabbed nav |
| `public/field/ui.js` | Simplify — remove `page()`, add `actionCard()` |
| All `screens/*.js` | Remove `appEl.appendChild(UI.page(...))` from every screen |

### 9. Migration Notes

- The `ensureShell()` function in app.js that creates `#app` and `#bottom-nav` dynamically is no longer needed — they're in the HTML
- The staggered child reveal animations (`.app-container > *:nth-child(n)`) should be removed — they add visual delay without value
- The route-loading skeleton bars inserted by `_renderRoute` should be replaced with a single subtle spinner or removed entirely (screens load fast enough)
- All Frappe chrome hiding rules (`display: none !important` on `.navbar`, `.web-footer`, etc.) can be deleted — there's no Frappe chrome to hide
