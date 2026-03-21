# Notion UI Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DSPL Field PWA from a childish, shadow-heavy UI into a Notion-inspired professional tool with strong typographic hierarchy, flat surfaces, and monochrome restraint.

**Architecture:** Pure CSS + vanilla JS changes. No new dependencies. Modify `style.css` for global visual tokens, `ui.js` for component logic, and individual screen files for layout changes. No Python/backend changes needed.

**Tech Stack:** Vanilla JS, CSS custom properties, `el()` DOM builder, Frappe PWA

**Spec:** `docs/superpowers/specs/2026-03-21-notion-ui-overhaul-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `vaishali/public/field/style.css` | Modify | Design tokens, shadow removal, typography, component styles, toast, skeleton, tab bar, HR grid, spacing |
| `vaishali/public/field/ui.js` | Modify | Add `kpiRow()`, add `fieldError()`, update `actionCard()`, update `toast()`, update `empty()` icon size |
| `vaishali/public/field/screens/home.js` | Modify | Replace stat cards with kpiRow, replace HR grid tiles with sidebar list, simplify greeting |
| `vaishali/public/field/screens/follow-ups.js` | Modify | Visual refresh — flatten cards, remove collapsible sections |
| `vaishali/public/field/screens/my-targets.js` | Modify | Visual refresh — replace gauge with progress bar, use kpiRow |
| `vaishali/public/field/screens/installation.js` | Modify | Visual refresh — ensure standard patterns |
| `vaishali/public/field/screens/visits.js` | Modify | Add inline form validation |
| `vaishali/public/field/screens/lead.js` | Modify | Add inline form validation |
| `vaishali/public/field/screens/quotation.js` | Modify | Add inline form validation |
| `vaishali/public/field/app.js` | Modify | Audit pull-to-refresh and offline banner styling |

---

## Task 1: CSS Foundation — Typography & Tokens

**Files:**
- Modify: `vaishali/public/field/style.css:1-44` (design tokens)
- Modify: `vaishali/public/field/style.css:800-842` (greeting hero)
- Modify: `vaishali/public/field/style.css:786-794` (section heading)
- Modify: `vaishali/public/field/style.css:79-85` (`#app` padding)

- [ ] **Step 1: Update design tokens — kill shadow variables**

In `style.css`, change the shadow tokens (lines 28-30):
```css
--shadow-card: none;
--shadow-elevated: none;
--shadow-float: none;
```

Note: `--shadow-float` is kept as `none` globally. The bottom-sheet overlay will get an inline shadow instead (handled in Task 3).

- [ ] **Step 2: Update `#app` padding**

Change `#app` padding (line 84) from `padding: 20px` to:
```css
padding: 16px 20px;
```

- [ ] **Step 3: Update greeting hero typography and margin**

Change `.greeting-hero` margin (line 801) from `margin-bottom: 16px` to:
```css
.greeting-hero {
  margin-bottom: 20px;
}
```

Change `.greeting-hero h2` (lines 804-811):
```css
.greeting-hero h2 {
  margin: 0 0 3px;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink-primary);
  letter-spacing: -0.03em;
  line-height: 1.1;
}
```

Remove the red underline on `.greeting-name` (lines 813-819):
```css
.greeting-hero .greeting-name {
  background-image: none;
  background-size: 0;
  padding-bottom: 0;
}
```

Update `.greeting-meta` weight (lines 821-826):
```css
.greeting-hero .greeting-meta,
.greeting-meta {
  font-size: 13px;
  color: var(--ink-tertiary);
  font-weight: 400;
}
```

- [ ] **Step 4: Tighten section heading margin**

Change `.section-heading` margin (line 792) from `margin: 24px 0 10px` to:
```css
margin: 20px 0 8px;
```

- [ ] **Step 5: Verify in browser**

Open `https://dgoc.logstop.com/field` (or local bench site) and confirm:
- Greeting is 24px, no red underline on name
- Section headings have tighter spacing
- Content area has slightly tighter top/bottom padding

- [ ] **Step 6: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: typography foundation — flatten tokens, simplify greeting, tighten spacing"
```

---

## Task 2: CSS — Kill Shadows & Scale Transforms

**Files:**
- Modify: `vaishali/public/field/style.css` (multiple locations)

This task removes all decorative `box-shadow` and `transform: scale()` on `:active` states across the entire stylesheet. Keep only functional shadows: `input:focus` ring (line 875) and `.bottom-sheet-overlay`.

- [ ] **Step 1: Flatten action cards**

Replace `.action-card` block (lines 358-412):
```css
.action-card {
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s var(--ease-smooth);
  -webkit-tap-highlight-color: transparent;
}

.action-card:active {
  background: var(--surface-1);
}

.action-card .action-icon {
  font-size: 20px;
  color: var(--ink-tertiary);
  display: flex;
  align-items: center;
}

.action-card .action-icon svg {
  width: 20px;
  height: 20px;
}

.action-card .action-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-primary);
  margin-top: 8px;
}

.action-card .action-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink-primary);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.action-card .action-sub {
  font-size: 13px;
  color: var(--ink-tertiary);
  font-weight: 400;
}

.action-card.accent-green,
.action-card.accent-red {
  border-left-width: 1px;
  border-left-color: var(--border-subtle);
}
```

- [ ] **Step 2: Flatten buttons — remove shadows and scale**

For `.btn-primary-styled` (lines 581-595), remove `box-shadow` and change `:active`:
```css
.btn-primary-styled {
  color: var(--ink-inverse);
  background: var(--dspl-red);
  border-radius: var(--radius-md);
}

.btn-primary-styled:hover {
  background: var(--dspl-red-dark);
}

.btn-primary-styled:active {
  opacity: 0.9;
}
```

For `.btn-success-custom` (lines 598-625), remove `box-shadow`, remove `transform`:
```css
.btn-success-custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--green-500);
  color: var(--ink-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  min-height: 48px;
  padding: 12px 24px;
  cursor: pointer;
  transition: opacity 0.15s var(--ease-smooth), background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.btn-success-custom:active {
  background: #059669;
  opacity: 0.9;
}
```

For `.btn-danger-custom` (lines 628-655), same treatment:
```css
.btn-danger-custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--dspl-red);
  color: var(--ink-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 700;
  min-height: 48px;
  padding: 12px 24px;
  cursor: pointer;
  transition: opacity 0.15s var(--ease-smooth), background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.btn-danger-custom:active {
  background: var(--dspl-red-dark);
  opacity: 0.9;
}
```

For `.btn-outline:active` (line 666-668), remove scale:
```css
.btn-outline:active {
  background: var(--surface-2);
}
```

For `.btn-outline-danger:active` (lines 686-689), remove scale:
```css
.btn-outline-danger:active {
  background: var(--dspl-red-glow);
}
```

For `.checkin-btn` (lines 692-727), remove `box-shadow` and scale:
```css
.checkin-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink-inverse);
  background: var(--dspl-red);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: opacity 0.15s var(--ease-smooth), background 0.15s;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  overflow: hidden;
}

.checkin-btn:hover {
  background: var(--dspl-red-dark);
}

.checkin-btn:active {
  opacity: 0.9;
}

.checkin-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Flatten `.card-surface.tappable` — remove scale**

Change `.card-surface.tappable:active` (lines 220-223):
```css
.card-surface.tappable:active {
  background: var(--surface-1);
}
```

- [ ] **Step 4: Flatten stat card value typography**

Change `.stat-card .stat-value` (lines 252-258):
```css
.stat-card .stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink-primary);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
```

- [ ] **Step 5: Audit remaining box-shadows in style.css**

Search for all remaining `box-shadow` that aren't `none` or the input focus ring. Lines to check and flatten:
- Line 945 (`.search-results` dropdown) — uses `var(--shadow-elevated)` which is now `none` — no code change needed but verify
- Line 1001 (`.toggle-thumb`) — change to `0 1px 2px rgba(0,0,0,0.08)` (keep minimal, it's functional for the toggle switch)
- Line 1316 (`.fab`) — remove `box-shadow`
- Line 1445 (`.toast-fallback`) — change to `none` (will redesign in Task 5)
- Line 1728 (`.pipeline-card` or similar card variant) — uses `var(--shadow-elevated)` which is now `none` — verify no code change needed
- Line 1740 (card variant `:active`) — remove shadow line
- Line 1803 (card variant) — remove `box-shadow: 0 1px 4px rgba(0,0,0,.06)`
- Lines 1690, 1952, 2423, 2459 — already `none`, safe to ignore

- [ ] **Step 6: Audit remaining `transform: scale` on `:active`**

Remove `transform: scale(...)` from all `:active` pseudo-classes except:
- Keep scale on `.bottom-sheet` animations (if any)
- Lines to change: 221, 369, 593, 619, 649, 667, 687, 720, 1325, 1630, 1648, 1739, 2333, 2763, 2769, 2775, 2781, 2787

Replace each `transform: scale(0.9x)` with either nothing (remove the line) or just keep the `:active` block for background changes.

- [ ] **Step 7: Verify in browser**

Confirm:
- Action cards are flat with 1px border, no shadow
- Buttons have no shadow, no scale on tap
- Stat card numbers are 20px, not 28px
- All cards feel flat and clean

- [ ] **Step 8: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: kill all decorative shadows and scale transforms — flat Notion surfaces"
```

---

## Task 3: CSS — Tab Bar & Spacing Refinements

**Files:**
- Modify: `vaishali/public/field/style.css:1012-1052` (tab bar)
- Modify: `vaishali/public/field/style.css:205-212` (card surface)
- Modify: `vaishali/public/field/style.css:283-296` (list card)

- [ ] **Step 1: Redesign tab bar to underline style**

Replace `.tab-bar` and `.tab-item` (lines 1012-1052):
```css
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--border-subtle);
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab-item {
  padding: 8px 16px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ink-tertiary);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  font-family: inherit;
  flex-shrink: 0;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
}

.tab-item:hover {
  color: var(--ink-secondary);
}

.tab-item.active {
  color: var(--ink-primary);
  font-weight: 600;
  border-bottom-color: var(--ink-primary);
  background: transparent;
}
```

- [ ] **Step 2: Tighten card surface padding and margin**

Change `.card-surface` (lines 205-212):
```css
.card-surface {
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: none;
  margin-bottom: 10px;
}
```

- [ ] **Step 3: Tighten list card padding**

Change `.list-card` padding (line 286) from `padding: 14px 0` to:
```css
padding: 12px 0;
```

- [ ] **Step 4: Tighten action grid gap**

Change `.action-grid` gap (line 355) from `gap: 12px` to:
```css
gap: 10px;
```

- [ ] **Step 5: Reduce list avatar default size**

Change `.list-avatar` (lines 306-318) width/height from 40px to 36px:
```css
.list-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #EBEBF0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-secondary);
  flex-shrink: 0;
}
```

- [ ] **Step 6: Verify in browser**

Confirm:
- Tabs now show underline-style active indicator (black text + bottom border), not pill-shaped
- Cards have tighter padding
- List items are slightly more compact
- Avatars are 36px

- [ ] **Step 7: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: underline tabs, tighten card/list spacing — Notion refinement"
```

---

## Task 4: CSS — HR Grid Redesign

**Files:**
- Modify: `vaishali/public/field/style.css:1063-1121` (HR grid)

- [ ] **Step 1: Redesign HR grid from tiles to Notion sidebar list**

Replace `.hr-grid` and `.hr-tile` (lines 1063-1121):
```css
/* ── HR Grid (Notion sidebar-style list) ─────────────────────── */
.hr-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin: 8px 0 16px;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 4px;
}

.hr-tile {
  background: transparent;
  border-radius: 6px;
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
  box-shadow: none;
  border: none;
  transition: background 0.12s var(--ease-smooth);
  -webkit-tap-highlight-color: transparent;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 40px;
}

.hr-tile:active {
  background: var(--surface-1);
}

.hr-tile > span:first-child,
.hr-tile > svg,
.hr-tile > span:first-child svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--ink-tertiary);
}

.hr-tile > span:last-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-primary);
  letter-spacing: normal;
  line-height: 1.3;
}

.hr-tile .tile-emoji {
  font-size: 18px;
  margin-bottom: 0;
  line-height: 1;
}

.hr-tile .tile-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-primary);
  letter-spacing: normal;
}
```

- [ ] **Step 2: Verify in browser**

Confirm:
- HR grid tiles are now horizontal rows (icon left + text right)
- Grid is 2 columns, wrapped in a bordered card
- Icons are muted (tertiary color), text is primary
- No more centered icon-above-text tile look

- [ ] **Step 3: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: redesign HR grid tiles to Notion sidebar-style list rows"
```

---

## Task 5: CSS — Toast & Skeleton Refinements

**Files:**
- Modify: `vaishali/public/field/style.css:1434-1458` (toast)
- Modify: `vaishali/public/field/style.css:1515-1535` (skeleton)
- Modify: `vaishali/public/field/style.css:1422-1429` (empty state icon)

- [ ] **Step 1: Redesign toast notifications**

Replace `.toast-fallback` block (lines 1434-1458):
```css
.toast-fallback {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  padding: 12px 20px;
  border-radius: 8px;
  z-index: 200;
  animation: toastSlideUp 0.3s var(--ease-out-expo) forwards;
  font-size: 13px;
  font-weight: 500;
  max-width: calc(100vw - 32px);
  text-align: center;
  background: var(--surface-0);
  color: var(--ink-primary);
  border: 1px solid var(--border-subtle);
}

.toast-fallback.success {
  border-left: 3px solid var(--green-500);
  background: var(--surface-0);
  color: var(--ink-primary);
}

.toast-fallback.danger {
  border-left: 3px solid var(--dspl-red);
  background: var(--surface-0);
  color: var(--ink-primary);
}

@keyframes toastSlideUp {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
```

Also find and remove the existing `@keyframes toastIn` rule (likely near line 2709) — it is replaced by `toastSlideUp` above.

- [ ] **Step 2: Improve skeleton shimmer**

Update `.skeleton` (lines 1515-1520) to use higher-contrast gradient and faster timing:
```css
.skeleton {
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-1) 50%, var(--surface-2) 75%);
  background-size: 400px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}
```

Note: The existing `@keyframes shimmer` at line ~2700 uses `background-position` percentages which are compatible with the new `background-size: 400px`. The timing change (1.8s→1.5s) and easing change (ease→ease-in-out) are applied in the `.skeleton` rule, no keyframes update needed.

- [ ] **Step 3: Tone down empty state icon**

Update `.empty-state .empty-icon` (lines 1422-1429):
```css
.empty-state .empty-icon {
  font-size: 32px;
  margin-bottom: 10px;
  opacity: 0.2;
  color: var(--ink-tertiary);
  display: flex;
  justify-content: center;
}

.empty-state .empty-icon svg {
  width: 32px;
  height: 32px;
}
```

- [ ] **Step 4: Verify in browser**

Trigger a toast (e.g., submit a form) — confirm it appears at bottom, white with colored left border. Check skeletons have visible shimmer. Check empty states have smaller, muted icons.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: redesign toasts, improve skeleton shimmer, tone down empty state icons"
```

---

## Task 6: ui.js — New Components & Updates

**Files:**
- Modify: `vaishali/public/field/ui.js`

- [ ] **Step 1: Add `kpiRow()` component**

Add before the Export block (before line 621):
```js
/* ──────────────────────────────────────────────────────────────
   KPI Row — single card with horizontal stats separated by dividers
   ────────────────────────────────────────────────────────────── */
function kpiRow(items) {
  // items: [{value: '3/5', label: 'Team Present'}, ...]
  var children = [];
  for (var i = 0; i < items.length; i++) {
    if (i > 0) {
      children.push(el('div', { className: 'kpi-divider' }));
    }
    children.push(el('div', { className: 'kpi-item' }, [
      el('div', { className: 'kpi-value', textContent: String(items[i].value) }),
      el('div', { className: 'kpi-label', textContent: items[i].label })
    ]));
  }
  return el('div', { className: 'kpi-row' }, children);
}
```

- [ ] **Step 2: Add `fieldError()` helper**

Add before the Export block:
```js
/* ──────────────────────────────────────────────────────────────
   fieldError — inline validation feedback
   ────────────────────────────────────────────────────────────── */
function fieldError(inputEl, message) {
  // Remove existing error
  var parent = inputEl.parentNode;
  var existing = parent.querySelector('.field-error-text');
  if (existing) parent.removeChild(existing);

  if (message) {
    inputEl.classList.add('field-error');
    var errEl = el('div', { className: 'field-error-text', textContent: message });
    parent.appendChild(errEl);
  } else {
    inputEl.classList.remove('field-error');
  }
}
```

- [ ] **Step 3: Update `actionCard()` — remove accent class handling**

In `actionCard()` (line 583), change the accent class logic:
```js
function actionCard(opts) {
  var cls = 'action-card';
  // Removed: accent-green/accent-red class — all cards are flat now

  var children = [];
  // ... rest stays the same
```

Remove lines that add `accent-` class:
```js
// OLD: if (opts.accent) cls += ' accent-' + opts.accent;
// Remove this line entirely
```

- [ ] **Step 4: Update avatar default size**

In `avatar()` (line 164), change default from 42 to 36:
```js
function avatar(name, size) {
  size = size || 36;
```

- [ ] **Step 5: Add kpiRow and fieldError to exports**

Add these two new entries to the existing `window.UI` export object (line 621-653). Do NOT replace the entire block — just add these two lines before the closing `};`:
```js
  kpiRow: kpiRow,
  fieldError: fieldError
```

Note: `actionCard` is already exported — no change needed for it.

- [ ] **Step 6: Add CSS for new components**

Add to end of `style.css`:
```css
/* ── KPI Row ────────────────────────────────────────────────── */
.kpi-row {
  display: flex;
  align-items: stretch;
  background: var(--surface-0);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px 0;
  margin-bottom: 10px;
}

.kpi-item {
  flex: 1;
  text-align: center;
  padding: 0 12px;
}

.kpi-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink-primary);
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.kpi-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 4px;
}

.kpi-divider {
  width: 1px;
  background: var(--border-subtle);
  align-self: stretch;
}

/* ── Field Validation Error ─────────────────────────────────── */
.field-error {
  border-color: var(--dspl-red) !important;
}

.field-error-text {
  font-size: 12px;
  color: var(--dspl-red);
  margin-top: 4px;
  font-weight: 500;
}
```

- [ ] **Step 7: Commit**

```bash
git add vaishali/public/field/ui.js vaishali/public/field/style.css
git commit -m "feat: add kpiRow and fieldError components, update actionCard and avatar"
```

---

## Task 7: Home Screen — Manager View Redesign

**Files:**
- Modify: `vaishali/public/field/screens/home.js:306-471` (manager home)

- [ ] **Step 1: Replace stat cards with kpiRow in manager home**

In `renderManagerHome()`, find the KPI chips section (around line 376-380):
```js
// OLD:
// appEl.appendChild(UI.grid([
//   UI.statCard(presentCount + '/' + totalCount, 'Team Present'),
//   UI.statCard(pendingCount, 'Approvals'),
//   UI.statCard(teamFieldCount, 'In Field')
// ], 3));

// NEW:
appEl.appendChild(UI.kpiRow([
  { value: presentCount + '/' + totalCount, label: 'Team Present' },
  { value: pendingCount, label: 'Approvals' },
  { value: teamFieldCount, label: 'In Field' }
]));
```

- [ ] **Step 2: Remove accent from action cards in manager home**

In the action cards section (around line 383-412), remove `accent:` properties:
```js
UI.actionCard({
  icon: 'mapPin',
  label: checkedIn ? 'Check Out' : 'Check In',
  sub: checkedIn && att.check_in_time ? 'Since ' + formatTime(att.check_in_time) : 'Not checked in',
  // REMOVE: accent: checkedIn ? 'green' : 'red',
  onClick: function () { location.hash = '#/attendance'; }
}),
```

Do the same for all 4 action cards in manager home and field home.

- [ ] **Step 3: Remove accent from field home action cards**

In `renderFieldHome()` (around line 253-281), remove `accent:` properties from both Check In/Out cards.

- [ ] **Step 4: Verify in browser**

As a manager user, confirm:
- KPI row shows "Team Present | Approvals | In Field" in a single flat card with dividers
- Action cards have no colored left border
- HR grid tiles are now Notion sidebar-style (2 columns, icon + text rows)

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/home.js
git commit -m "feat: home screen — kpiRow, flat action cards, Notion hierarchy"
```

---

## Task 8: Visual Refresh — follow-ups.js

**Files:**
- Modify: `vaishali/public/field/screens/follow-ups.js`

- [ ] **Step 1: Read the full current implementation**

Read `vaishali/public/field/screens/follow-ups.js` completely to understand its structure, API calls, and custom CSS classes used.

- [ ] **Step 2: Simplify card rendering**

Read the full file first. Identify any custom card rendering that uses inline `el('div', ...)` instead of `UI.listCard()`. Replace with the standard pattern. The goal is every quotation row uses:
```js
UI.listCard({
  title: item.party_name || item.customer_name || '',
  sub: expiryLabel(item.valid_till),
  right: UI.pill(item.status || 'Open', statusColor(item.status)),
  onClick: function () { /* navigate to detail */ }
})
```

Adapt variable names to match what the existing code uses — the field names come from the View Engine response.

- [ ] **Step 3: Replace collapsible sections with flat sections**

If sections use toggle/collapsible patterns (look for click handlers that show/hide content), replace with flat `UI.sectionHeading()` + immediate list rendering:
```js
appEl.appendChild(UI.sectionHeading('EXPIRING SOON (' + expiringCount + ')'));
// render each item directly below, no toggle
```

Keep the existing section grouping logic (how items are categorized) — only change the rendering from collapsible to flat.

- [ ] **Step 4: Remove custom CSS**

Grep `style.css` for any `.followup-` prefixed classes. Remove them — they are replaced by standard `listCard`/`pill`/`sectionHeading` styling.

- [ ] **Step 5: Verify in browser**

Navigate to `#/follow-ups` and confirm flat list layout with standard cards.

- [ ] **Step 6: Commit**

```bash
git add vaishali/public/field/screens/follow-ups.js vaishali/public/field/style.css
git commit -m "style: follow-ups — flatten to standard list cards, remove custom styling"
```

---

## Task 9: Visual Refresh — my-targets.js

**Files:**
- Modify: `vaishali/public/field/screens/my-targets.js`

- [ ] **Step 1: Read the full current implementation**

Read `vaishali/public/field/screens/my-targets.js` completely.

- [ ] **Step 2: Replace target gauge with progress bar**

Find the target gauge (`.target-gauge`) and replace with a simple progress bar:
```js
function progressBar(percent) {
  var pct = Math.min(100, Math.max(0, percent));
  return el('div', { className: 'progress-bar-track' }, [
    el('div', { className: 'progress-bar-fill', style: { width: pct + '%' } })
  ]);
}
```

- [ ] **Step 3: Replace stat cards with kpiRow**

If the screen uses `UI.statCard()` or `UI.grid([statCard...])`, replace with `UI.kpiRow()`.

- [ ] **Step 4: Add progress bar CSS**

Add to `style.css`:
```css
/* ── Progress Bar ───────────────────────────────────────────── */
.progress-bar-track {
  height: 4px;
  background: var(--surface-2);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--green-500);
  border-radius: 2px;
  transition: width 0.3s var(--ease-out-expo);
}
```

- [ ] **Step 5: Remove gauge CSS**

In `style.css`, find and remove `.target-gauge` related classes.

- [ ] **Step 6: Verify in browser**

Navigate to `#/targets` and confirm progress bars, kpiRow, standard list layout.

- [ ] **Step 7: Commit**

```bash
git add vaishali/public/field/screens/my-targets.js vaishali/public/field/style.css
git commit -m "style: my-targets — replace gauge with progress bar, use kpiRow"
```

---

## Task 10: Visual Refresh — installation.js

**Files:**
- Modify: `vaishali/public/field/screens/installation.js`

- [ ] **Step 1: Read the full current implementation**

Read `vaishali/public/field/screens/installation.js` completely.

- [ ] **Step 2: Ensure standard patterns**

Verify the screen uses:
- `UI.listCard()` for list items (not custom card HTML)
- `UI.detailCard()` for detail views
- `UI.pill()` for status indicators
- `UI.skeleton()` for loading state

If any custom card markup is used, replace with standard UI kit components.

- [ ] **Step 3: Remove any custom CSS**

In `style.css`, find and remove any installation-specific custom classes that duplicate standard component styling.

- [ ] **Step 4: Verify in browser**

Navigate to `#/installations` and `#/installation/:id` — confirm flat cards, underline tabs, standard layout.

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/field/screens/installation.js vaishali/public/field/style.css
git commit -m "style: installation — ensure standard UI kit patterns"
```

---

## Task 11: Form Validation — 3 Key Forms

**Files:**
- Modify: `vaishali/public/field/screens/visits.js`
- Modify: `vaishali/public/field/screens/lead.js`
- Modify: `vaishali/public/field/screens/quotation.js`

- [ ] **Step 1: Read the 3 form screens**

Read the "new" form portions of `visits.js`, `lead.js`, and `quotation.js` to identify required fields and submit handlers.

- [ ] **Step 2: Add validation to visit form**

Read `visits.js` fully first. Find the submit handler in the "new visit" screen (likely `Screens.visitNew`). Identify the actual variable names for the customer input and purpose select elements. Then add validation before the API call using this pattern (adapt variable names to match):

```js
// Before the API call in the submit handler:
var valid = true;

// Use the ACTUAL variable names from the file — these are examples:
if (!customerInput.value.trim()) {
  UI.fieldError(customerInput, 'Customer is required');
  valid = false;
} else {
  UI.fieldError(customerInput, null);
}

if (!purposeSelect.value) {
  UI.fieldError(purposeSelect, 'Purpose is required');
  valid = false;
} else {
  UI.fieldError(purposeSelect, null);
}

if (!valid) {
  var firstError = appEl.querySelector('.field-error');
  if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return;
}
```

Also add blur handlers on required inputs right after they are created:
```js
someInput.addEventListener('blur', function () {
  if (!someInput.value.trim()) {
    UI.fieldError(someInput, 'Required');
  } else {
    UI.fieldError(someInput, null);
  }
});
```

- [ ] **Step 3: Add validation to lead form**

Read `lead.js` fully. Same validation pattern — find the required fields (typically lead name, company) and their variable names. Add blur + submit validation.

- [ ] **Step 4: Add validation to quotation form**

Read `quotation.js` fully. Same pattern — find required fields (customer, at least one item) and add validation.

- [ ] **Step 5: Verify in browser**

Test each form:
- Leave required fields empty, blur out → red border + "Required" text
- Submit empty → scrolls to first error
- Fill in fields → error clears

- [ ] **Step 6: Commit**

```bash
git add vaishali/public/field/screens/visits.js vaishali/public/field/screens/lead.js vaishali/public/field/screens/quotation.js
git commit -m "feat: inline form validation on visit, lead, and quotation forms"
```

---

## Task 12: UX — Pull-to-Refresh & Offline Banner Styling

**Files:**
- Modify: `vaishali/public/field/style.css` (PTR and offline styles)

- [ ] **Step 1: Audit pull-to-refresh CSS**

Find `.ptr-indicator` and `.ptr-spinner` in `style.css`. Ensure:
- No shadows
- Spinner color uses `--ink-tertiary` border, not `--dspl-red`
- Text uses 12px weight 500 `--ink-tertiary`

- [ ] **Step 2: Update offline banner**

Update `.offline-banner` (lines 1463-1478):
```css
.offline-banner {
  position: sticky;
  top: 0;
  background: #FEF3C7;
  color: var(--ink-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  z-index: 100;
  border-bottom: 1px solid #FDE68A;
  min-height: 32px;
}
```

- [ ] **Step 3: Verify**

Test offline mode (disable network in DevTools) — confirm clean yellow banner.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/field/style.css
git commit -m "style: refine pull-to-refresh and offline banner to match Notion aesthetic"
```

---

## Task 13: Final Audit & Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Full visual audit in browser**

Walk through every major screen:
1. Home (field + manager views)
2. Attendance
3. Visits list + new visit
4. Leads + new lead
5. Quotations + new quotation
6. Follow-ups
7. My Targets
8. Sales Targets
9. Pipeline
10. Installations
11. Profile
12. Chat

Check for: inconsistent shadows, wrong typography sizes, broken layouts, missing hover states.

- [ ] **Step 2: Fix any inconsistencies found**

Address issues found in audit.

- [ ] **Step 3: Test on mobile viewport**

Use Chrome DevTools mobile simulation (375px width) to verify:
- 2-column action grid doesn't break
- HR grid 2-column layout works
- KPI row doesn't overflow
- Toast doesn't overlap nav
- Tab bar scrolls horizontally

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style: final audit and cleanup — Notion UI overhaul complete"
```
