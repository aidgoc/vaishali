# PWA — Field App

Installable standalone PWA at `/field`. Vanilla JS SPA, hash router, 40 screens, 66 routes.

## Standalone HTML Document

`www/field.html` is a **standalone document** (NOT `{%- extends "templates/web.html" -%}`). Frappe renders it via `www/field.py` which injects CSRF token and boot context via Jinja. All scripts use `defer`.

### Installability
- **Manifest:** `manifest.json` — `display: standalone`, `scope: /`, `start_url: /field`
- **Service Worker:** `sw.js` v26, registered with `{ scope: '/' }` — nginx sends `Service-Worker-Allowed: /` header
- Precaches core + 5 critical screens, stale-while-revalidate with `ignoreSearch: true`
- **CRITICAL:** `ignoreSearch: true` means `?v=` cache-busting params are ignored — must bump `CACHE_NAME` version in sw.js to clear stale assets
- **Apple PWA:** `apple-mobile-web-app-capable`, `apple-touch-icon`, safe-area insets on header/nav
- **Splash screen:** Branded loading with animated progress bar, dismisses on boot

## Layout

Three-zone flexbox filling `100dvh`:
```
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; }
#app-header  — fixed 56px + safe-area-inset-top, router renders back button + title
#app         — flex: 1, overflow-y: auto, 20px 16px padding, scrollable content
#bottom-nav  — fixed 64px + safe-area-inset-bottom, 3 tabs: Home, AI, Me
```

### Home Screen Layout (Manager)
```
[Greeting (28px/700) with time + date + department]
[KPI Row: Team Present | Approvals | Visits Today]
[2x2 Action Cards: Check In/Out, New Visit, Leave, Expenses]
[HR services (sentence-case heading): Leave, Salary, Expenses, Advances grid]
[Pending approvals: list cards with tinted avatars]
[Departments: Sales | Operations | Finance (underline tabs)]
```

### Chat Screen
Chat overrides `#app` to `display: flex; flex-direction: column; padding: 0` — pins header to top, messages scroll, input pins to bottom. `_renderRoute` resets these inline styles on navigation away.

## Design System — "Notion-Inspired Clean"

- **White page background** (`#FFFFFF`), cards use `--surface-1` (`#F8F8F8`) for contrast
- **No card borders** — whitespace separation; when borders exist: `rgba(0,0,0,0.04)`
- **No decorative shadows** — only input focus ring and toggle thumb
- **No scale transforms on `:active`** — use `background: rgba(0,0,0,0.04)` or `filter: brightness()`
- **Typography:** `-0.04em` letter-spacing on headings, `15px` body text, `12px/500` sentence-case section labels (NOT uppercase)
- **Button radius:** `8px` (not 12px — less bubbly)
- **Tab bar:** underline-style (2px bottom border), not pill-shaped
- **Toasts:** dark floating pill (no colored left border)
- **Avatars:** Notion-style tinted color palette (8 pastels), rounded-square shape, deterministic from name
- **Skeletons:** thin horizontal bars at varying widths (80%, 60%, 40%), not card-shaped blocks
- **Focus indicators:** `:focus-visible` red outline (2px, 2px offset) for keyboard users
- **Contrast:** `--ink-tertiary: #6B6B70` (WCAG AA 4.5:1 on white)

## Transitions & Gestures

- **iOS-style navigation:** two-layer ghost transition (old screen parallax-slides left 30% while new slides in from right), Apple ease-out curve
- **Edge-swipe back:** swipe from left 24px edge, circular chevron indicator, 80px threshold
- **Pull-to-refresh:** SVG circular arc progress, rubber-band resistance (0.45x), spinning/done states, spring-back
- **Header crossfade** on route changes
- **Staggered content reveal:** each child cascades in with 40ms delay (excluded for `.ptr-container`)
- **Nav dot:** spring-animated active indicator
- **`prefers-reduced-motion`** disables all animations

## Router Owns the Header

Screens do NOT render their own headers. Each route has `title` and `back`:
```js
{ pattern: '#/attendance', title: 'Attendance', back: '#/home', handler: ... }
```
`_renderRoute()` renders the header with crossfade, creates ghost snapshot for transitions, clears `#app`, resets inline styles, and calls the screen handler.

## Screen Pattern

```js
(function () {
  'use strict';
  var api = window.fieldAPI;
  var el = UI.el;
  window.Screens = window.Screens || {};
  window.Screens.myScreen = function (appEl) {
    appEl.appendChild(UI.skeleton(3));
    api.apiCall('GET', '/api/field/my-endpoint').then(function (res) {
      appEl.textContent = '';
      // render content
    });
  };
})();
```

**DO NOT use `UI.page()` — it was removed. The router handles all headers.**

## UI Component Kit (`ui.js`)

34 components with ARIA accessibility:

```
UI.el(tag, attrs, children)       // Core DOM builder
UI.card(children, opts)           // Surface card (borderless on white page)
UI.statCard(value, label)         // KPI stat (22px/700 value, 12px sentence-case label)
UI.kpiRow(items)                  // Horizontal stats card with vertical dividers
UI.actionCard(opts)               // Card with 32px icon container + label + value
UI.listCard(opts)                 // Full-width row with dividers
UI.detailRow(label, value)        // Label-value pair
UI.detailCard(rows)               // Card of label-value rows
UI.pill(text, color)              // Status badge (green/yellow/red/blue/gray)
UI.avatar(name, size)             // Tinted rounded-square initials (8-color palette)
UI.amount(value)                  // ₹ formatted currency
UI.btn(text, opts)                // Button (8px radius, primary/success/danger/outline)
UI.actionBar(buttons)             // Button row
UI.field(label, inputEl)          // Form field wrapper with <label>
UI.textInput(placeholder, opts)   // Text input
UI.dateInput(label, value)        // Date input
UI.textarea(placeholder, opts)    // Textarea
UI.select(label, options, value)  // Dropdown select
UI.searchInput(placeholder, fn)   // Debounced search
UI.toggle(label, checked, fn)     // Toggle switch (role=switch, aria-checked, keyboard)
UI.grid(children, cols)           // CSS grid
UI.divider()                      // Horizontal line
UI.sectionHeading(text)           // 12px sentence-case section label (NOT uppercase)
UI.tabs(items, active, onChange)   // Underline-style tab bar
UI.skeleton(count)                // Thin shimmer bars at varying widths
UI.empty(icon, text, ctaOpts)     // Empty state (minimal text, optional CTA)
UI.error(text)                    // Error box
UI.toast(text, type)              // Dark floating pill (role=alert)
UI.nav(tabs, active)              // Bottom navigation
UI.updateNavActive(tab)           // Update nav highlight
UI.fab(onClick)                   // Floating action button (aria-label)
UI.bottomSheet(title, content)    // Modal sheet (role=dialog, Escape key, focus trap)
UI.fieldError(inputEl, message)   // Inline form validation (red border + error text)
```

## Auth & Navigation (`auth.js`)

- **Nav tiers:** `field` (basic staff), `manager` (HR/Sales/Stock managers), `admin` (System Manager)
- **Bottom nav:** 3 tabs for everyone: Home, AI, Me
- Session/roles loaded on boot, cached in memory

## API Path Translation (`api.js`)

PWA uses clean paths like `/api/field/customers` translated to Frappe methods like `vaishali.api.field.get_customers`. Full path table in `vaishali/api/CLAUDE.md`. IDB caching for offline support.

## Gotchas

- **`UI.bottomSheet()` returns but doesn't append** — caller must `document.body.appendChild(sheet)`
- **`new Date().toISOString()` in PWA** → MySQL rejects `T`/`Z` chars; server must convert to `YYYY-MM-DD HH:MM:SS`
- **Router query params** — `matchRoute()` must strip `?params` before comparing to route patterns: `hash.split('?')[0]`
- **DCR department validation** — only accepts Sales/Service/Office; admin users with other departments need fallback
- **Lead Source** — it's a DocType (not a Select), dropdown must fetch from `get_lead_sources` API, not hardcode
- **Timer cleanup** — all `setInterval` must track timers and clear on `hashchange` navigation
- **Chat layout** — overrides `#app` inline styles; must reset on navigation away
- **Static assets** under `/assets/` cached 1 year by nginx — need `bench build --app vaishali` + restart after changes
