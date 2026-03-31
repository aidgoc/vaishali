# DSPL Workflows Interactive Guide — Design Spec

**Date:** 2026-03-31
**Status:** Design Approved
**Phase:** 1 (Dashboard + Role-based Navigation)

---

## Executive Summary

Create an interactive admin-only dashboard that guides DSPL users through complete workflows for Sales, Field, HR, and Operations roles. This guide explains "what we've done" — the full process from Daily Call Reports → Leads → Quotations → Sales Orders, plus workflows for other departments.

---

## Goals & Success Criteria

✅ **Admin Visibility:** System Managers can access a comprehensive guide explaining all DSPL workflows
✅ **Role-Based Learning:** Separate tabs for Sales, Field, HR, Operations — each with step-by-step tutorials
✅ **Interactive Tutorials:** Screenshots, field annotations, common errors, "what happens next" explanations
✅ **Quick Access:** Action buttons to create/view documents directly from the guide
✅ **Sidebar Integration:** "DSPL Workflows" appears as top-level menu item (admin-only)

---

## Architecture

### Navigation & Access

**Menu Item:** "DSPL Workflows" (top-level sidebar, System Manager role only)
- **Icon:** Workflow/process diagram icon
- **Route:** `/app/dspl-workflows`
- **Visibility:** `frappe.has_role("System Manager")` check in hooks.py

**Page Type:** Custom Frappe page (not a workspace, not a doctype)
- **Files:**
  - `vaishali/public/pages/dspl_workflows.html` — HTML structure
  - `vaishali/public/js/pages/dspl_workflows.js` — Page logic & tab switching
  - `vaishali/api/workflows.py` — Backend API for tutorial content
  - `vaishali/hooks.py` — Menu registration & page route

---

## Page Structure

### Layout
```
┌─────────────────────────────────────────────────┐
│ DSPL Workflows — Interactive Guide              │
│ "Complete workflows for every DSPL role"        │
├─────────────────────────────────────────────────┤
│ [Sales] [Field] [HR] [Operations]               │  ← Role Tabs
├─────────────────────────────────────────────────┤
│ [Tab Content: Diagrams + Tutorials]             │
└─────────────────────────────────────────────────┘
```

### Each Tab Contains

1. **Role Overview Card**
   - Who: List of roles/departments
   - What: Key responsibilities
   - When: When this role gets involved

2. **Process Flow Diagrams (SVG)**
   - Visual flowcharts for each workflow
   - Color-coded by stage
   - Clickable to expand tutorials

3. **Expandable Workflow Sections**
   - **Workflow name** (e.g., "Daily Call Report → Lead")
   - **Visual diagram** (SVG flowchart)
   - **Prerequisites:** What must be done first
   - **Step-by-step tutorial:**
     - Numbered steps (1, 2, 3...)
     - Screenshots (actual form/screen captures)
     - Field highlights (red boxes on mandatory/key fields)
     - Inline explanations
   - **"What happens next?"** (automation + downstream workflows)
   - **Common Errors** (with solutions)
   - **Quick Links** (Create document, View list)

---

## Role-Specific Workflows

### Sales Tab
1. **Daily Call Report → Lead Workflow**
   - DCR created by field staff → Sales converts to Lead
   - Auto-linking via `api/linking.py`

2. **Lead → Opportunity Workflow**
   - Qualify lead, create opportunity
   - Assigned to sales team

3. **Opportunity → Quotation Workflow**
   - Create quotation with items + pricing
   - Fields: Customer, Items, Rates, Tax

4. **Quotation → Sales Order Workflow** (TESTED)
   - Convert quotation after customer approval
   - Fields: Series, Delivery Dates, Warehouse
   - Validation: All items need delivery date + warehouse

### Field Tab
1. **Daily Call Report (DCR) Workflow**
   - GPS check-in → Visit details → Checkout with outcomes
   - Mobile-first (PWA app)

2. **Visit to Lead Auto-Linking**
   - How system automatically creates Leads from DCRs
   - Prerequisites: "Lead Generated" checkbox checked

### HR Tab
1. **Attendance Workflow** (Check-in/Check-out with GPS)
2. **Leave Application Workflow**
3. **Expense Claim Workflow**
4. **Employee Advance Workflow**

### Operations Tab
1. **Stock Management Workflow**
2. **Manufacturing/Work Order Workflow**
3. **Delivery Workflow**

---

## Tutorial Content Format

### Screenshots & Annotations
- Real production screenshots (captured from `/field` PWA or ERPNext desk)
- Highlighted fields: Red boxes around mandatory/key fields
- Clear step numbers: 1, 2, 3...
- Callout boxes explaining what happens at each step

### Step-by-Step Structure
```
Step N: [Action Title]
[Screenshot]
• Explain what user should do
• Highlight key fields: [Field Name]
• Expected result: [What should happen]
```

### System Responses
- Show toast notifications
- Show redirects and page changes
- Explain auto-filled fields

### Common Errors Section
```
❌ Error Message
→ Cause: Why this happens
→ Solution: How to fix it
```

### "What Happens Next?" Section
Explain downstream automation:
- If field staff checks "Lead Generated" → system auto-creates Lead
- If quotation is submitted → system links to DCR
- If sales order is submitted → system links to quotation

---

## Visual Design

**Theme:** Inherit from existing Frappe light theme + DSPL colors
- **Primary:** DSPL Red (#E60005)
- **Accent:** Blue (#3B82F6)
- **Backgrounds:** White (#FFFFFF), Light Gray (#F8F8F8)

**Components:**
- Tab switcher (underline style, not pill-shaped)
- Cards for each workflow (borderless, whitespace separation)
- Expandable sections (with chevron icons)
- Code/monospace font for field names
- Consistent spacing and padding

**Responsive:** Desktop & tablet (PWA also supported)

---

## Data Flow

### Frontend (Page Load)
1. User navigates to `/app/dspl-workflows`
2. `dspl_workflows.js` loads and checks role: `frappe.has_role("System Manager")`
3. If not admin: redirect to home with warning
4. If admin: fetch tutorial content from backend API
5. Render tabs and tutorial sections with screenshots

### Backend (API)
- `GET /api/method/vaishali.api.workflows.get_role_tutorials`
- Returns JSON with all tutorials for all roles
- Caches content (low-change data)

### Content Storage
- **Diagrams:** Embedded SVGs in HTML or separate `.svg` files
- **Screenshots:** Stored in `/assets/vaishali/workflows/` directory
- **Text content:** In `workflows.py` as JSON or separate JSON files
- **Tutorial metadata:** In `vaishali/fixtures/` as JSON (versioned)

---

## Implementation Breakdown

### File Structure (New Files)
```
vaishali/
├── public/
│   ├── pages/
│   │   └── dspl_workflows.html           # Custom page HTML
│   ├── js/pages/
│   │   └── dspl_workflows.js             # Page logic (450 lines)
│   ├── workflows/
│   │   ├── screenshots/                  # Tutorial screenshots
│   │   │   ├── dcr_checkin.png
│   │   │   ├── dcr_form.png
│   │   │   ├── quotation_form.png
│   │   │   └── sales_order_form.png
│   │   └── diagrams/                     # SVG flowcharts
│   │       ├── sales_flow.svg
│   │       ├── field_flow.svg
│   │       ├── hr_flow.svg
│   │       └── operations_flow.svg
├── api/
│   └── workflows.py                      # Backend API (200 lines)
├── fixtures/
│   └── tutorial_content.json             # Tutorial text + structure
└── hooks.py                              # Updated (register page + menu)
```

### Key Tasks
1. ✅ Design approved (this doc)
2. Create `dspl_workflows.html` (page structure, tab markup)
3. Create `dspl_workflows.js` (tab switching, expandable sections, interactivity)
4. Create `workflows.py` (API endpoint to fetch tutorials)
5. Create `tutorial_content.json` (all tutorial text, workflows, steps)
6. Capture screenshots (DCR, quotation, sales order forms)
7. Create SVG diagrams (sales flow, field flow, HR flow, operations flow)
8. Update `hooks.py` (register page route + add menu item)
9. Add role-based access checks (admin-only)

---

## Access Control & Permissions

**Role:** System Manager only
- Check in `hooks.py`: Only render menu item if `frappe.has_role("System Manager")`
- Check in `dspl_workflows.js`: Redirect non-admins to home
- Check in `workflows.py` API: Verify user is System Manager before returning content

**Error Handling:**
- If non-admin accesses `/app/dspl-workflows`: Show "Access Denied" page with redirect
- If API called by non-admin: Return 403 Forbidden

---

## Testing Plan

1. **Access Control:**
   - ✓ System Manager: Can see menu item + access page
   - ✓ Sales Manager: Cannot see menu item
   - ✓ Field Staff: Cannot see menu item
   - ✓ Non-admin accessing `/app/dspl-workflows` directly: Redirected to home

2. **Tab Switching:**
   - ✓ Click each tab (Sales, Field, HR, Operations)
   - ✓ Content loads correctly for each role
   - ✓ Tab state persists (stays on selected tab on page reload)

3. **Expandable Sections:**
   - ✓ Click workflow card → expands to show tutorial
   - ✓ Click again → collapses
   - ✓ Multiple workflows can be open simultaneously

4. **Screenshots & Annotations:**
   - ✓ Screenshots load without broken images
   - ✓ Highlights/boxes render correctly
   - ✓ Text callouts are readable

5. **Quick Links:**
   - ✓ "Create Lead" button → opens Lead form
   - ✓ "View All Quotations" button → opens Quotation list
   - ✓ Links work for all role tabs

6. **Responsive Design:**
   - ✓ Page works on desktop (1920x1080)
   - ✓ Page works on tablet (768px)
   - ✓ Text is readable, images scale correctly

---

## Deployment

1. **Local development:** Create files, test locally with `bench build`
2. **Staging:** Push to `upstream` branch, test on EC2
3. **Production:** Merge to `main`, deploy to EC2 via git pull + restart

**Restart commands on server:**
```bash
cd /home/frappe/frappe-bench
bench --site dgoc.logstop.com clear-cache
sudo supervisorctl restart frappe-bench-web:frappe-bench-frappe-web
```

---

## Future Enhancements (Phase 2+)

- Video tutorials instead of screenshots
- Embedded live demo environment
- Role-specific dashboards (separate from this guide)
- Interactive quiz/validation
- Feedback collection from users
- Multi-language support

---

## Questions/Open Items

None — design is complete and ready for implementation.

---

**Approval:** Ready for implementation plan.
