# PWA Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Frappe template inheritance, implement three-zone flexbox layout (fixed header + scrollable content + fixed nav), redesign home screen with action cards + tabbed navigation.

**Architecture:** Standalone HTML (HRMS pattern) → body is flex column with 3 zones → router owns the header → screens only render content into `#app`. Bottom nav reduced from 5 to 3 tabs.

**Tech Stack:** Vanilla JS, CSS, Frappe www page (Jinja), no build tools.

**Spec:** `docs/superpowers/specs/2026-03-20-pwa-layout-redesign.md`

---

### Task 1: Rewrite field.html as standalone HTML

**Files:**
- Rewrite: `vaishali/www/field.html`

This is the foundation. Everything else depends on this.

- [ ] **Step 1: Rewrite field.html**

Replace the entire file. Remove `{%- extends "templates/web.html" -%}`. Write a complete `<!DOCTYPE html>` document with three structural elements: `<header id="app-header">`, `<main id="app">`, `<nav id="bottom-nav">`. Include CSRF injection, all script tags with `?v=` cache busting, and viewport meta.

- [ ] **Step 2: Verify field.py still works**

`www/field.py` provides `get_context()` with `csrf_token` and `boot`. It doesn't need changes — Frappe will still call it for `www/field.html`. Confirm `no_cache = 1` is set.

- [ ] **Step 3: Commit**

```bash
git add vaishali/www/field.html
git commit -m "refactor: standalone HTML shell (HRMS pattern) — no Frappe template inheritance"
```

---

### Task 2: Rewrite CSS — three-zone layout + clean design system

**Files:**
- Rewrite: `vaishali/public/field/style.css`

Complete CSS rewrite. The new CSS has these sections:
1. Design tokens (`:root` variables)
2. Three-zone body layout
3. Header styles
4. Bottom nav styles
5. Content area defaults
6. Component styles (cards, lists, buttons, forms, pills, etc.)
7. Screen-specific styles (chat, pipeline, etc.)

- [ ] **Step 1: Write the new style.css**

Key structural rules:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { height: 100dvh; overflow: hidden; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; background: #F7F7F8; color: #1C1C1E; -webkit-font-smoothing: antialiased; }
#app-header { height: 56px; flex-shrink: 0; background: #fff; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; padding: 0 20px; gap: 12px; z-index: 50; }
#app { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; }
#bottom-nav { flex-shrink: 0; background: #fff; border-top: 1px solid rgba(0,0,0,0.06); display: flex; justify-content: space-around; align-items: center; padding: 8px 0; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
```

All component styles should:
- Use borders not shadows (except action cards)
- Use 20px horizontal rhythm (matches `#app` padding)
- 16px font for inputs (prevents iOS zoom)
- 44px minimum touch targets
- No staggered animations
- No Frappe chrome hiding rules (not needed anymore)

Preserve all existing class names so existing screen JS doesn't break.

- [ ] **Step 2: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "refactor: three-zone flexbox CSS — fixed header, scrollable content, fixed nav"
```

---

### Task 3: Router renders header — update app.js

**Files:**
- Modify: `vaishali/public/field/app.js`

The route table needs `title` and `back` properties. The `_renderRoute` function renders the header. Remove `ensureShell()`, `buildBottomNav()` from the old approach. The bottom nav is now static HTML built once on startup.

- [ ] **Step 1: Add title/back to route table**

Every route gets `title` and optionally `back`:
```js
{ pattern: '#/home', handler: ..., tab: 'home', title: 'DSPL Field', back: null },
{ pattern: '#/attendance', handler: ..., tab: 'home', title: 'Attendance', back: '#/home' },
{ pattern: '#/dcr', handler: ..., tab: 'home', title: 'Visits', back: null },
{ pattern: '#/dcr/new', handler: ..., tab: 'home', title: 'New Visit', back: '#/dcr' },
// ... all 47 routes
```

- [ ] **Step 2: Rewrite _renderRoute to manage header**

```js
function _renderRoute(matched, hash) {
  // Render header
  var headerEl = document.getElementById('app-header');
  headerEl.textContent = '';
  if (matched.back) {
    var backBtn = el('button', { className: 'header-back', onClick: function() { location.hash = matched.back; } });
    backBtn.appendChild(icon('back'));
    headerEl.appendChild(backBtn);
  }
  headerEl.appendChild(el('span', { className: 'header-title', textContent: matched.title || '' }));

  // Render content
  var appEl = document.getElementById('app');
  appEl.textContent = '';
  appEl.scrollTop = 0;  // scroll to top on navigation
  matched.handler(matched.params);

  // Update nav
  updateNavActive(matched.tab);
}
```

- [ ] **Step 3: Build bottom nav once on startup (3 tabs)**

```js
function buildBottomNav() {
  var tabs = [
    { tab: 'home', ic: 'home', label: 'Home', hash: '#/home' },
    { tab: 'chat', ic: 'bot', label: 'AI', hash: '#/chat' },
    { tab: 'profile', ic: 'user', label: 'Me', hash: '#/profile' }
  ];
  var navEl = document.getElementById('bottom-nav');
  navEl.textContent = '';
  // ... render tabs
}
```

- [ ] **Step 4: Remove ensureShell(), old buildBottomNav(), skeleton bars from _renderRoute**

Delete the `ensureShell()` function entirely. Delete the route-loading skeleton code from `_renderRoute`. The `#app`, `#app-header`, and `#bottom-nav` elements are now in the HTML.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/app.js
git commit -m "refactor: router renders header, 3-tab nav, remove Frappe shell hacks"
```

---

### Task 4: Remove UI.page() from all 29 screen files

**Files:**
- Modify: All 29 files in `vaishali/public/field/screens/*.js`

Every screen currently starts with `appEl.appendChild(UI.page('Title', '#/back'))`. This must be removed because the router now handles the header.

- [ ] **Step 1: Remove all UI.page() calls**

In each screen file, delete the line `appEl.appendChild(UI.page(...))`. This is a mechanical find-and-delete across 29 files (45 calls total).

Some screens have multiple entry points (e.g., `advance.js` has `advanceList`, `advanceNew`, `advanceDetail`). Each one has its own `UI.page()` call that needs removal.

- [ ] **Step 2: Remove UI.page() from ui.js**

Delete the `page()` function from `ui.js` and remove it from the `window.UI` export.

- [ ] **Step 3: Quick smoke test — verify no JS errors**

Open the app, navigate to 3-4 screens, check browser console for errors.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/screens/*.js vaishali/public/field/ui.js
git commit -m "refactor: remove UI.page() from all screens — router owns the header"
```

---

### Task 5: Rewrite home screen — action cards + tabbed nav

**Files:**
- Rewrite: `vaishali/public/field/screens/home.js`
- Modify: `vaishali/public/field/ui.js` (add `actionCard()` component)

- [ ] **Step 1: Add actionCard() to ui.js**

```js
function actionCard(opts) {
  // opts: { icon, label, value, sub, onClick, accent }
  // Returns a tappable card with icon + label + live value
  // These are the ONLY elements with shadow (affordance signal)
}
```

- [ ] **Step 2: Rewrite renderManagerHome**

Layout: greeting → KPI chips → 2x2 action cards → approvals list → tabbed department nav (Sales | Ops | Finance).

Action cards:
- Check In / Check Out (green/red accent based on status)
- New Visit (with visit count badge)
- Leave (shows PL balance)
- Expense (shows pending amount)

Tabbed section:
- Sales: Pipeline, Targets, Follow Ups, Customers, Leads, Quotations
- Operations: Service, Production, Dispatch, Breakdowns, Stock
- Finance: Revenue, Receivables, Projects, Team, Approvals

- [ ] **Step 3: Rewrite renderFieldHome**

Similar but simpler: greeting → 2x2 action cards → today's visits → department shortcuts (only their department).

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/ui.js vaishali/public/field/screens/home.js
git commit -m "feat: home screen with action cards + tabbed department nav"
```

---

### Task 6: Deploy and verify

**Files:** None (deployment task)

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Pull on EC2**

```bash
ssh -i ~/.ssh/heft-erp-key.pem ubuntu@35.154.17.172 \
  "sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main' \
  && redis-cli FLUSHALL > /dev/null \
  && sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web"
```

- [ ] **Step 3: Playwright smoke test**

Navigate to: login, home (manager), home (field), attendance, visits, new visit, leave, chat, profile. Screenshot each. Verify:
- No dead space at top
- Content has 20px padding (not edge-to-edge)
- Can scroll to bottom of all content
- Header shows on every screen with correct title + back button
- Bottom nav shows 3 tabs, active state works
- Home screen shows action cards + tabbed nav

- [ ] **Step 4: Commit test report**

```bash
# Save report to /Users/harsh/mik/shared/research/dspl-pwa-redesign-test.md
```
