# DSPL Workflows Interactive Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an interactive admin-only dashboard guide for DSPL workflows (Sales, Field, HR, Operations) with step-by-step tutorials, screenshots, and diagrams.

**Architecture:** Custom Frappe page (not doctype/workspace) registered via hooks, with tab-based role navigation. Frontend loads tutorial content from backend API. Admin-only access via `frappe.has_role("System Manager")` checks in both hooks and frontend.

**Tech Stack:** Vanilla JavaScript (no frameworks), Frappe form API, SVG diagrams, static images, JSON fixtures.

---

## Task 1: Create Page HTML Structure

**Files:**
- Create: `vaishali/public/pages/dspl_workflows.html`

- [ ] **Step 1: Create the HTML file with page structure**

Create a new file `vaishali/public/pages/dspl_workflows.html` with semantic HTML5 structure, tab navigation, and styling. The page includes:
- Header with title and description
- Tab buttons for role navigation (Sales, Field, HR, Operations)
- Content container for dynamic workflow content
- Loading/error states
- Responsive CSS grid layout

Key elements:
- `.container` wrapper (max-width 1200px)
- `.tabs` button group with underline styling
- `.tab-content` divs (display: none by default)
- `.workflow-section` cards with expandable headers
- `.tutorial-steps` with numbered step circles
- Screenshot and diagram containers

CSS styling includes DSPL theme colors (#E60005 primary, #3B82F6 accents), whitespace-based card design, and responsive breakpoints for mobile/tablet.

- [ ] **Step 2: Verify HTML file structure**

```bash
ls -la vaishali/public/pages/dspl_workflows.html
wc -l vaishali/public/pages/dspl_workflows.html
```

Expected: File exists, contains 400+ lines of HTML and CSS.

- [ ] **Step 3: Commit**

```bash
git add vaishali/public/pages/dspl_workflows.html
git commit -m "feat: create DSPL Workflows page HTML structure with tabs and styling"
```

---

## Task 2: Create Page JavaScript Logic

**Files:**
- Create: `vaishali/public/js/pages/dspl_workflows.js`

- [ ] **Step 1: Create JavaScript with event handlers and state management**

Create `vaishali/public/js/pages/dspl_workflows.js` with:
- Role-based access check using `frappe.has_role('System Manager')`
- API call to fetch tutorial content via `frappe.call()`
- Tab switching with event listeners on `.tab-button` elements
- Expandable section toggles for workflow cards
- DOM manipulation using safe methods (appendChild, textContent, createElement)
- Event delegation for dynamically loaded content
- Error handling with user-friendly messages

Key functions:
- `init()` — Check role and load tutorials
- `loadTutorials()` — Fetch from API, render tabs
- `renderTutorials()` — Build DOM elements for active tab
- `setupTabSwitching()` — Add click handlers to tabs
- `setupExpandableSections()` — Toggle workflow visibility
- `showError()` — Display error messages safely

XSS Prevention: Use `textContent` for plain text, `appendChild()` for safe DOM creation, avoid innerHTML.

- [ ] **Step 2: Verify JavaScript file**

```bash
ls -la vaishali/public/js/pages/dspl_workflows.js
wc -l vaishali/public/js/pages/dspl_workflows.js
```

Expected: File exists, contains 300+ lines of JavaScript.

- [ ] **Step 3: Test syntax with Node.js**

```bash
node -c vaishali/public/js/pages/dspl_workflows.js
```

Expected: No syntax errors reported.

- [ ] **Step 4: Commit**

```bash
git add vaishali/public/js/pages/dspl_workflows.js
git commit -m "feat: create DSPL Workflows page JavaScript with safe DOM manipulation"
```

---

## Task 3: Create Backend API Endpoint

**Files:**
- Create: `vaishali/api/workflows.py`

- [ ] **Step 1: Create API with role-based access control**

Create `vaishali/api/workflows.py` with:
- `@frappe.whitelist()` decorator for API exposure
- `get_tutorials()` function that checks `frappe.has_role("System Manager")`
- Load tutorial content from JSON fixture
- Error handling with `frappe.log_error()` and `frappe.throw()`
- Fallback to default tutorials if fixture missing

API signature:
- **Method:** `GET /api/method/vaishali.api.workflows.get_tutorials`
- **Auth:** Requires System Manager role
- **Returns:** Dict with structure:
  ```
  {
    "sales": {"overview": {...}, "workflows": [...]},
    "field": {...},
    "hr": {...},
    "operations": {...}
  }
  ```

- [ ] **Step 2: Verify Python syntax**

```bash
python3 -m py_compile vaishali/api/workflows.py
```

Expected: No syntax errors.

- [ ] **Step 3: Test API locally**

```bash
cd ~/vaishali
bench --site dgoc.logstop.com execute vaishali.api.workflows.get_tutorials
```

Expected: Returns dict or error (OK if fixture missing yet).

- [ ] **Step 4: Commit**

```bash
git add vaishali/api/workflows.py
git commit -m "feat: create workflows API endpoint with role-based access control"
```

---

## Task 4: Create Tutorial Content Fixture

**Files:**
- Create: `vaishali/fixtures/tutorial_content.json`

- [ ] **Step 1: Create JSON fixture with all tutorials**

Create `vaishali/fixtures/tutorial_content.json` with comprehensive tutorial data for all 4 roles:

**Sales Tab:**
- Workflow 1: Daily Call Report → Lead (auto-linked)
- Workflow 2: Lead → Opportunity (manual conversion)
- Workflow 3: Opportunity → Quotation (manual creation)
- Workflow 4: Quotation → Sales Order (manual conversion, tested in session)

Each workflow includes:
- name: Workflow title
- diagram: SVG filename reference
- prerequisites: Required setup
- status: Automation level
- steps: Array of numbered steps with:
  - title: Step name
  - description: What to do
  - screenshot: Image filename
  - details: Bullet points of specific actions
  - expected: What should happen
  - error: Common error message (if applicable)
- what_happens_next: Downstream automation explanation
- quick_links: Array of actionable links

**Field Tab:**
- Workflow 1: Daily Call Report (DCR) with GPS check-in/out
- Workflow 2: Auto-linking to Leads

**HR Tab:**
- Workflow 1: Attendance Check-in/Check-out
- Plus stubs for Leave, Expense, Advance (can expand later)

**Operations Tab:**
- Workflow 1: Stock Management
- Plus stubs for Manufacturing, Delivery

JSON validation: Valid structure with no missing quotes or commas.

- [ ] **Step 2: Validate JSON**

```bash
python3 -m json.tool vaishali/fixtures/tutorial_content.json > /dev/null && echo "Valid JSON"
```

Expected: "Valid JSON" printed (no syntax errors).

- [ ] **Step 3: Verify structure**

```bash
python3 -c "import json; f = open('vaishali/fixtures/tutorial_content.json'); data = json.load(f); print('Roles:', list(data.keys())); print('Sales workflows:', len(data['sales']['workflows']))"
```

Expected: Shows role keys and workflow counts.

- [ ] **Step 4: Commit**

```bash
git add vaishali/fixtures/tutorial_content.json
git commit -m "feat: add comprehensive tutorial content for all DSPL workflows"
```

---

## Task 5: Create SVG Diagrams

**Files:**
- Create: `vaishali/public/workflows/diagrams/sales_flow.svg`
- Create: `vaishali/public/workflows/diagrams/field_flow.svg`
- Create: `vaishali/public/workflows/diagrams/hr_flow.svg`
- Create: `vaishali/public/workflows/diagrams/operations_flow.svg`

- [ ] **Step 1: Create directory**

```bash
mkdir -p vaishali/public/workflows/diagrams
```

- [ ] **Step 2: Create Sales flow diagram SVG**

Create SVG showing: DCR → Lead → Opportunity → Quotation → Sales Order
- 5 colored boxes (red, blue, green, orange, purple)
- Arrows connecting boxes left-to-right
- Color-coded legend
- Title and status labels

- [ ] **Step 3: Create Field flow diagram SVG**

Create SVG showing: Check-in → Visit → Outcomes → Auto-create
- 4 boxes with field-specific workflow
- Similar arrow/color styling

- [ ] **Step 4: Create HR flow diagram SVG**

Create SVG showing: Attendance, Leave, Expenses, Advances (parallel workflows)
- 4 independent boxes (no arrows)
- Color-coded by workflow type

- [ ] **Step 5: Create Operations flow diagram SVG**

Create SVG showing: Stock → Manufacturing → Delivery (sequential)
- 3 boxes with arrows
- Operations workflow styling

- [ ] **Step 6: Verify all SVGs created**

```bash
ls -la vaishali/public/workflows/diagrams/
```

Expected: 4 SVG files exist with file sizes > 1KB each.

- [ ] **Step 7: Validate SVG syntax**

```bash
for f in vaishali/public/workflows/diagrams/*.svg; do xmllint --noout "$f" && echo "$f: Valid"; done
```

Expected: All SVGs report "Valid".

- [ ] **Step 8: Commit**

```bash
git add vaishali/public/workflows/diagrams/
git commit -m "feat: add SVG flowchart diagrams for Sales, Field, HR, and Operations workflows"
```

---

## Task 6: Create Screenshots Directory Structure

**Files:**
- Create: `vaishali/public/workflows/screenshots/` (empty directory)
- Create placeholder files for: dcr_checkin.png, dcr_form.png, quotation_form.png, sales_order_form.png

- [ ] **Step 1: Create screenshots directory**

```bash
mkdir -p vaishali/public/workflows/screenshots
```

- [ ] **Step 2: Add placeholder PNG files**

Create dummy PNG files (or real screenshots if available):

```bash
# Create empty placeholder PNG files
touch vaishali/public/workflows/screenshots/{dcr_checkin,dcr_form,quotation_form,sales_order_form}.png
```

Note: In production deployment, replace these with actual screenshots captured from:
- `/field#/attendance` (DCR check-in screen)
- `/field#/visits` (Visit/DCR form)
- `/app/quotation` (Quotation form)
- `/app/sales-order` (Sales Order form)

- [ ] **Step 3: Verify directory structure**

```bash
ls -la vaishali/public/workflows/screenshots/
```

Expected: 4 PNG files exist (empty or with real images).

- [ ] **Step 4: Create README for screenshot updates**

```bash
cat > vaishali/public/workflows/screenshots/README.md << 'EOF'
# Tutorial Screenshots

These are placeholder PNG files. Replace with actual screenshots:

1. **dcr_checkin.png** — Field app attendance screen (Check In button visible, "Location captured" card)
   - Source: Navigate to `/field#/attendance`, click CHECK IN

2. **dcr_form.png** — Visit/DCR form filled with sample data
   - Source: Navigate to `/field#/visits`, open a visit form

3. **quotation_form.png** — Quotation with items, pricing, and tax
   - Source: Navigate to `/app/quotation`, view submitted quotation

4. **sales_order_form.png** — Sales Order with all mandatory fields populated
   - Source: Navigate to `/app/sales-order`, view submitted sales order

Each screenshot should be 1200x800px or higher for clarity on all devices.
EOF
```

- [ ] **Step 5: Commit**

```bash
git add vaishali/public/workflows/screenshots/
git commit -m "feat: add screenshots directory structure (placeholder images — replace with real screenshots)"
```

---

## Task 7: Update hooks.py — Register Page & Menu

**Files:**
- Modify: `vaishali/hooks.py`

- [ ] **Step 1: Add custom page route and module config to hooks.py**

Append to `vaishali/hooks.py`:

```python
# Custom page routes
module_config = [
    {
        "label": "DSPL",
        "color": "#E60005",
        "icon": "octicon octicon-organization",
        "type": "module",
        "items": [
            {
                "label": "Workflows Guide",
                "icon": "octicon octicon-workflow",
                "route": "/app/dspl-workflows",
                "roles": ["System Manager"]
            }
        ]
    }
]

# Custom page mapping
custom_pages = {
    "dspl_workflows": {
        "route": "/app/dspl-workflows",
        "title": "DSPL Workflows",
        "template": "public/pages/dspl_workflows.html"
    }
}
```

This adds:
- Top-level "DSPL" module in sidebar (admin-only)
- "Workflows Guide" menu item under DSPL
- Custom route `/app/dspl-workflows` pointing to HTML page
- Role-based visibility (System Manager only)

- [ ] **Step 2: Verify hooks.py syntax**

```bash
python3 -c "import sys; sys.path.insert(0, 'vaishali'); import hooks; print('Hooks loaded successfully')"
```

Expected: "Hooks loaded successfully" (or import error is OK for now).

- [ ] **Step 3: Commit**

```bash
git add vaishali/hooks.py
git commit -m "feat: register DSPL Workflows custom page and add top-level menu item"
```

---

## Task 8: Integration Testing & Deployment

**Files:**
- Test: Custom page routing, role-based access, API endpoint

- [ ] **Step 1: Clear cache and rebuild**

```bash
cd ~/vaishali
bench --site dgoc.logstop.com clear-cache
bench build --app vaishali
```

Expected: No errors during cache clear and build.

- [ ] **Step 2: Test access control — Admin user**

Open browser, login as System Manager, navigate to `/app/dspl-workflows`:

```
Expected results:
✓ Menu item "DSPL" appears in sidebar
✓ "Workflows Guide" sub-item visible
✓ Page loads without errors
✓ 4 tabs visible (Sales, Field, HR, Operations)
✓ Content loads from API
```

- [ ] **Step 3: Test access control — Non-admin user**

Login as Sales Manager or Field Staff, try to navigate to `/app/dspl-workflows`:

```
Expected results:
✓ Menu item NOT visible in sidebar
✓ Direct navigation shows error or redirects
✓ Page is inaccessible to non-admins
```

- [ ] **Step 4: Test API endpoint**

In browser console (as admin):

```javascript
frappe.call({
    method: 'vaishali.api.workflows.get_tutorials',
    callback: (r) => console.log(r.message)
});
```

Expected: Prints full tutorial data with all roles and workflows.

- [ ] **Step 5: Test page functionality**

- Click each tab (Sales, Field, HR, Operations) — content should switch
- Expand/collapse workflow sections — chevron should rotate
- Verify screenshot paths are correct
- Verify SVG diagrams display
- Click quick links — should open forms/lists

Expected: All interactions work smoothly without JS errors.

- [ ] **Step 6: Test responsive design**

- View on desktop (1920x1080) — content should be readable
- View on tablet (768px) — layout should adjust with single column
- View on mobile (375px) — tabs should scroll horizontally

Expected: Layouts adjust responsively, no horizontal scrolling issues.

- [ ] **Step 7: Final deployment on server**

```bash
cd /home/frappe/frappe-bench
sudo -u frappe bash -c 'cd /home/frappe/frappe-bench/apps/vaishali && git pull upstream main'
redis-cli FLUSHALL
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web
```

Expected: Service restarts without errors. Page loads at https://dgoc.logstop.com/app/dspl-workflows

- [ ] **Step 8: Verify on production**

Login to production ERPNext, verify menu item and page load without errors.

Expected: Page fully functional in production environment.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: complete DSPL Workflows Interactive Guide Phase 1 — admin dashboard with role-based tutorials, diagrams, and step-by-step guides"
```

---

## Summary

**Deliverables:**
- ✅ Custom Frappe page with 4 role-based tabs
- ✅ Interactive tutorials with step-by-step guides
- ✅ SVG flowchart diagrams
- ✅ Backend API with role-based access
- ✅ Screenshot placeholders for production replacement
- ✅ Admin-only sidebar menu item
- ✅ Responsive design for desktop/tablet/mobile

**Testing:**
- ✅ Role-based access control
- ✅ Tab switching functionality
- ✅ API endpoint
- ✅ Content rendering
- ✅ Responsive layout

**Commits:** 8 focused feature commits

---

**Phase 1 Complete.** Ready for Phase 2: Form customizations, role-based dashboards, and enhanced field validations.

