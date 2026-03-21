# Notion-Informed UI Overhaul — Design Spec

**Date:** 2026-03-21
**Scope:** Visual hierarchy redesign (A), visual refresh of 3 screens (B), UX improvements (C)
**Reference:** Notion — flat surfaces, typography-driven hierarchy, monochrome restraint

---

## Problem

The PWA looks "childish" — too many competing visual styles, no clear hierarchy, icon-heavy decorative tiles, scattered color, and shadows that add noise rather than clarity. Field staff need a serious business tool, not a colorful dashboard.

## Design Principles

1. **Typography does the hierarchy** — size and weight differences, not color or decoration
2. **Flat surfaces** — zero shadows, 1px borders for separation
3. **Monochrome by default** — color only for status indicators and the brand CTA
4. **Restraint** — fewer visual signals per component, more whitespace
5. **Information density over decoration** — text-first, icons are subtle prefixes

---

## 1. Typography Scale

| Level | Size | Weight | Color | Tracking | Use |
|-------|------|--------|-------|----------|-----|
| Page title | 24px | 700 | `--ink-primary` | -0.03em | Greeting, screen context |
| Data callout | 20px | 700 | `--ink-primary` | -0.02em, tabular-nums | KPI numbers where they need to pop |
| Card primary | 15px | 600 | `--ink-primary` | -0.01em | Names, titles, row labels |
| Body | 14px | 500 | `--ink-secondary` | normal | Form labels, general text |
| Card secondary | 13px | 400 | `--ink-tertiary` | normal | Subtitles, timestamps, descriptions |
| Section heading | 11px | 600 | `--ink-tertiary` | 0.06em, uppercase | Section dividers (keep current) |

### Changes from current
- Greeting: 26px 800 → 24px 700, remove red underline on name
- Stat card value: 28px 800 → 20px 700
- Action card value: 22px 700 → 20px 700
- Action card label: 13px 600 → 14px 600
- List card title: 15px 600 → 15px 600 (keep)
- Greeting meta: 13px 500 → 13px 400
- Button text: keep 14px 600

---

## 2. Surface Hierarchy (3 levels)

| Level | Background | Border | Shadow | Use |
|-------|-----------|--------|--------|-----|
| Page | `#F7F7F8` | none | none | Scrollable `#app` area |
| Surface | `#FFFFFF` | 1px `rgba(0,0,0,0.06)` | **none** | Cards, containers |
| Inline | transparent | none | none | Rows within a surface |

### Shadow kill list
- `--shadow-elevated` → `none`
- `--shadow-float` → `none` (keep ONLY for `.bottom-sheet-overlay`)
- `.action-card box-shadow` → `none`, add `border: 1px solid var(--border-subtle)`
- `.btn-primary-styled box-shadow` → `none`
- `.btn-success-custom box-shadow` → `none`
- `.btn-danger-custom box-shadow` → `none`
- `.checkin-btn box-shadow` → `none`

### Cascade note
Global shadow removal will also affect screen-specific CSS classes (`.pipeline-card`, `.debtor-stat-value`, `.target-gauge`, etc.). After the global changes, audit these classes in style.css and remove any remaining `box-shadow` declarations.

---

## 3. Component Redesigns

### 3a. Action Cards (home screen)

**Current:** Shadow + accent-colored left border + icon + label + value + sub. Too many signals.

**New:**
- Flat white, `border: 1px solid var(--border-subtle)`, `border-radius: 10px`
- Icon: 20px, `--ink-tertiary` color, left-aligned (no colored circle)
- Label: 14px weight 600
- Value: 20px weight 700 (if present)
- Sub: 13px weight 400, `--ink-tertiary`
- Remove `accent-green` / `accent-red` left border classes
- Active state: `background: var(--surface-1)`, no scale transform

### 3b. HR Grid Tiles → Notion-Style Sidebar List

**Current:** 4-column rounded tile boxes with centered icon + label (`.hr-grid` uses `repeat(4, 1fr)`). This is the most "childish" element.

**New:** Flat list rows, like Notion's sidebar:
- Container: surface card with 1px border, `border-radius: 10px`, `padding: 4px`
- Each item: 40px height, `padding: 8px 12px`, `border-radius: 6px`
- 18px muted icon (`--ink-tertiary`) inline left + 14px weight 500 text
- No background on individual items at rest
- Layout: 2-column CSS grid (keeps information density without the toyish 4-column icon-heavy look)
- Active state: `background: var(--surface-1)`, `border-radius: 6px`

**Affects:** Manager home department tabs (sales/operations/finance) and field staff department shortcuts.

### 3c. Stat Cards (KPI row on manager home)

**Current:** Three separate bordered cards with 28px bold numbers via `UI.grid([statCard(...), ...], 3)`.

**New:** Single flat surface card containing a horizontal flex row:
- Each KPI: value (20px 700) + label (11px 600 uppercase tertiary) stacked vertically
- Separated by 1px vertical dividers (`border-right: 1px solid var(--border-subtle)`)
- Equal width via `flex: 1`
- Container: `border: 1px solid var(--border-subtle)`, `border-radius: 10px`, `padding: 12px 0`
- New CSS class: `.kpi-row` (container), `.kpi-item` (each stat)

**Implementation:** Add `UI.kpiRow(items)` component to `ui.js`. Items: `[{value: '3/5', label: 'Team Present'}, ...]`

### 3d. Greeting Hero

**Current:** 26px 800 weight, red `background-image` underline on `.greeting-name`.

**New:**
- `h2`: 24px weight 700, `letter-spacing: -0.03em`
- Remove `.greeting-name` red underline (`background-image: none`)
- `.greeting-meta`: 13px `--ink-tertiary`, weight 400
- Bottom margin: 20px

### 3e. List Cards

**Current:** Close to right. 14px padding, 600 weight title.

**Refinements:**
- Padding: `12px 0` (from `14px 0`)
- Title: keep 15px 600
- Sub: 13px 400 (ensure `--ink-tertiary`)
- Active: `background: var(--surface-1)` (keep)
- Avatar: reduce default from 40px to 36px

### 3f. Buttons

- Primary (red): keep color, remove `box-shadow`, active = `opacity: 0.9` instead of `scale(0.98)`
- Success (green): remove `box-shadow`, active = `opacity: 0.9`
- Danger (red): remove `box-shadow`, active = `opacity: 0.9`
- Check-in button: remove `box-shadow`, active = `opacity: 0.9`
- Outline: keep as-is
- All buttons: remove `transform: scale(0.98)` on `:active` globally

### 3g. Indicator Pills

Keep current design — already Notion-like (small, colored background, dot prefix). No changes.

### 3h. Tab Bar

**Current:** Pill-shaped tabs with `border-radius: 9999px`, active state uses `background: var(--ink-primary)` with white text.

**New (global change — affects all screens using `UI.tabs()`):**
- Default: 13px weight 500, `--ink-tertiary`, no background, no border-radius
- Active: `--ink-primary` text, weight 600, `border-bottom: 2px solid var(--ink-primary)`
- Padding: `8px 16px`
- Tab bar: `border-bottom: 1px solid var(--border-subtle)` to anchor the underlines
- Affected screens: home (dept tabs), pipeline, installations, quotations, leave, and any screen using `UI.tabs()`

### 3i. Section Headings

Keep current: 11px uppercase, weight 600, `--ink-tertiary`. Tighten margin: `20px 0 8px` (from `24px 0 10px`).

---

## 4. Color Discipline

### Allowed color usage
- **`--ink-primary` (#1C1C1E):** titles, values, active tab text
- **`--ink-secondary` (#636366):** body text, form labels, icons
- **`--ink-tertiary` (#8E8E93):** subtitles, metadata, section headings, inactive tabs
- **`--dspl-red` (#E60005):** primary CTA buttons, active nav indicator only
- **Status pills only:** green, yellow, red, blue backgrounds — nowhere else

### Remove
- `.accent-green` / `.accent-red` classes on action cards
- `.greeting-name` red underline
- Colored icon backgrounds anywhere
- Any card background tinting

---

## 5. Spacing Tightening

| Element | Current | New |
|---------|---------|-----|
| `#app` padding | 20px | 16px 20px |
| Card padding | 16px | 12px 16px |
| Card margin-bottom | 12px | 10px |
| Section heading margin | 24px 0 10px | 20px 0 8px |
| Action grid gap | 12px | 10px |
| List card padding | 14px 0 | 12px 0 |
| Greeting bottom margin | 16px | 20px |

---

## 6. Visual Refresh — 3 Existing Screens

These screens are already functional with working API calls. The work here is applying the new visual hierarchy to their existing layouts.

### 6a. follow-ups.js (173 lines, uses View Engine `follow_ups`)

**Current implementation:** Calls `/api/field/view/follow_ups`, renders collapsible sections (Expiring Soon, Open Quotations, Lost) with count badges and custom card styling (`.followup-card-urgent`, etc.).

**Redesign:** Apply Notion hierarchy:
- Replace custom card classes with standard `listCard` pattern
- Flatten section headers to use `UI.sectionHeading()` with count in parentheses
- Remove collapsible toggle — show all sections flat (Notion doesn't hide content behind toggles by default)
- Kill any card shadows or colored backgrounds on follow-up cards
- Use standard `UI.pill()` for status instead of custom styling

### 6b. my-targets.js (181 lines, uses View Engine `my_targets`)

**Current implementation:** Calls `/api/field/view/my_targets`, renders stat cards, a target gauge (`.target-gauge`), and quotation/order lists.

**Redesign:** Apply Notion hierarchy:
- Replace target gauge with a simple progress bar (4px height, `border-radius: 2px`, green fill)
- Replace stat cards with `UI.kpiRow()` (new component from 3c)
- Product/quotation lists: use standard `listCard` rows
- Kill gauge shadows and decorative elements
- Use the new typography scale for all values

### 6c. installation.js (220 lines, uses View Engine `installation_tracker`)

**Current implementation:** Calls `/api/field/view/installation_tracker`, renders tabbed list (Pending/Scheduled/Completed) with detail views.

**Redesign:** Apply Notion hierarchy:
- Tabs: will automatically get new underline style from 3h
- List cards: ensure they use standard `listCard` pattern
- Detail view: use standard `detailCard` rows
- Kill any custom shadows or colored borders

---

## 7. UX Improvements

### 7a. Skeleton Shimmer Animation

**Current:** `UI.skeleton(count)` creates generic gray rectangles. No animation.

**Add:** CSS shimmer animation on `.skeleton` class:
```css
@keyframes shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-1) 50%, var(--surface-2) 75%);
  background-size: 400px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

Keep the existing `UI.skeleton(count)` API. No shape-matching needed — the shimmer alone is a significant UX improvement.

### 7b. Pull-to-Refresh

**Current:** Already implemented in `app.js` (lines 466-509) with `.ptr-indicator` and `.ptr-spinner`.

**Refinement:** Audit the existing implementation and ensure:
- Spinner is visually consistent with the Notion-flat style (simple gray spinner, no color)
- Text "Pull to refresh" / "Release to refresh" uses 12px weight 500 `--ink-tertiary`
- No shadows on the indicator

### 7c. Offline Indicator

**Current:** Already implemented — `app.js` calls `api.updateOfflineBanner(true)` and style.css has `.offline-banner` (line ~1463).

**Refinement:** Audit existing implementation and ensure:
- Background: `#FEF3C7` (warm yellow)
- Text: 12px weight 600, `--ink-primary`, centered
- Position: below `#app-header`, full width, 32px height
- Smooth slide-in/out transition

### 7d. Form Validation (scoped)

**Current:** Forms rely on HTML `required` + server errors.

**Scope to 3 most-used forms only:**
1. `visits.js` — new visit form (customer, purpose required)
2. `lead.js` — new lead form (name, company required)
3. `quotation.js` — new quotation form (customer, items required)

**Implementation:**
- Add `UI.fieldError(inputEl, message)` helper that adds `.field-error` class to input + appends 12px red helper text
- On blur: validate required fields, show inline error
- On submit: validate all, scroll to first invalid field
- CSS: `.field-error` gets `border-color: var(--dspl-red)`, helper text `color: var(--dspl-red)`, `font-size: 12px`

### 7e. Empty State Refinement

**Current:** `UI.empty()` exists with icon + text + optional CTA. Most screens use it.

**Change:** Reduce empty icon size to 32px max (from current size), color `--ink-tertiary`. Audit all screens to fill any gaps where empty state is missing.

### 7f. Toast Redesign

**Current:** `.toast-fallback` positioned at `top: 16px`, auto-dismisses after 3s.

**New position and style:**
- Position: `bottom: 80px` (above 64px bottom nav + 16px buffer), centered horizontally
- `max-width: 90%`, `border-radius: 8px`
- White surface, `border: 1px solid var(--border-subtle)`
- Success variant: `border-left: 3px solid var(--green-500)`
- Error variant: `border-left: 3px solid var(--dspl-red)`
- Slide-up animation: `transform: translateY(20px)` → `translateY(0)`
- 13px weight 500 text

---

## 8. Files to Modify

| File | Changes |
|------|---------|
| `style.css` | Typography scale, kill all shadows, flatten action cards, redesign tab bar, redesign HR grid, toast redesign, skeleton shimmer, spacing tightening, audit screen-specific classes for shadow/color removal |
| `ui.js` | Update `actionCard()` (remove accent), add `UI.kpiRow()`, update `statCard()`, add `UI.fieldError()`, reduce empty icon size, update `toast()` position/style |
| `home.js` | Replace HR grid tiles with sidebar-style list, replace `UI.grid([statCard...])` with `UI.kpiRow()`, simplify greeting |
| `follow-ups.js` | Visual refresh — flatten cards, standard list pattern, remove collapsible sections |
| `my-targets.js` | Visual refresh — replace gauge with progress bar, use kpiRow, flatten lists |
| `installation.js` | Visual refresh — ensure standard list/detail patterns, tab style will update automatically |
| `app.js` | Audit pull-to-refresh styling, audit offline banner styling |

**No Python changes needed** — all 3 screens already have working API integrations.

---

## 9. What Stays

- Three-zone flexbox layout (header / content / nav)
- Router-owns-header pattern
- Bottom nav 3 tabs
- `el()` DOM builder pattern
- Screen module IIFE pattern
- API path translation layer
- Cookie auth model
- Brand red (`#E60005`) for primary CTAs
- Indicator pills (already clean)
- Pull-to-refresh (exists, just restyle)
- Offline banner (exists, just restyle)
- All 37 working screen implementations
