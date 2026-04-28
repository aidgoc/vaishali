# DSPL Field PWA — Navigation Mental Map

**Last reviewed**: 2026-04-28
**Live**: `https://dgoc.logstop.com/field`

## Three-tab bottom navigation (M3 Navigation Bar)

The bottom nav defines the **roots** of the navigation tree. Reaching any root clears the navigation stack — the back button has nothing to pop, so it disappears.

```
[Home]   [AI]   [Me]
```

| Tab     | Hash        | Role                                                 |
|---------|-------------|------------------------------------------------------|
| Home    | `#/home`    | Today's actions + manager KPIs + department launcher |
| AI      | `#/chat`    | Conversational ERP via Vaishali agent                |
| Me      | `#/profile` | Account, role, telegram, sign out                    |

These three are the only **destinations** — everything else is reached *through* them and gets a back button.

---

## Navigation tree from Home

```
Home (#/home)
├── KPI cards (manager)
│   ├── Team Present       → #/team
│   ├── Approvals          → #/approvals
│   └── Visits Today       → #/dcr
│
├── Action cards (4-tile grid)
│   ├── Check In/Out       → #/attendance
│   ├── New Visit          → #/dcr/new
│   ├── Leave              → #/leave
│   └── Expenses / Targets → #/expense | #/my-targets
│
├── HR services (5-tile grid)
│   ├── Leave              → #/leave
│   ├── Salary             → #/salary
│   ├── Expenses           → #/expense
│   ├── Advances           → #/advance
│   └── Budget             → #/budget
│
├── Pending approvals (manager) → #/approvals
│
└── Department tabs (Sales | Operations | Finance)
    ├── Sales: Pipeline, Targets, Follow-ups, Customers, Leads, Quotations
    ├── Ops:   Service, Devices, Production, Dispatch, Breakdowns, Stock
    └── Fin:   Revenue, Receivables, Projects, Team, Approvals, Report Card
```

---

## Navigation tree by department

### Sales hierarchy

```
Home → Pipeline (#/pipeline)
Home → Customers (#/customers) → Customer detail (#/customer/:id)
                                        ↓
                                 Customer timeline (#/customer-timeline/:id)

Home → Leads (#/leads) → Lead detail (#/lead/:id)
                       → New lead (#/lead/new)

Home → Opportunities (#/opportunities) → Opportunity detail (#/opportunity/:id)

Home → Quotations (#/quotations) → New quotation (#/quotations/new)
Home → Sales Orders (#/sales-orders) → New SO (#/sales-orders/new)
Home → Delivery Notes (#/delivery-notes) → New DN (#/delivery-notes/new)
Home → Invoices (#/sales-invoices) → New invoice (#/sales-invoices/new)
Home → Receivables (#/debtors) → Record payment (#/payments/new)
Home → Targets (#/targets | #/my-targets | #/sales-targets)
Home → Follow-ups (#/follow-ups)
Home → Interactions (#/interactions) → Detail (#/interaction/:id)
                                     → New (#/interactions/new)

Home → Visits / DCR (#/dcr) → New visit (#/dcr/new)
                            → Visit detail (#/dcr/:id)
```

### Service hierarchy

```
Home → Service (#/service)
       ├── Installations (#/installations) → Detail (#/installation/:id)
       ├── Breakdowns (#/breakdowns) → New (#/breakdown/new)
       │                             → Detail (#/breakdown/:id)
       └── Devices (#/devices) → Detail (#/devices/:id)

Home → AMC (#/amc)
```

### Operations hierarchy

```
Home → Production (#/production)
Home → Dispatch (#/dispatch)
Home → Stock (#/stock) → Add stock (#/stock/update)
```

### Finance hierarchy

```
Home → Revenue (#/revenue)
Home → Debtors (#/debtors) → Record payment (#/payments/new)
Home → Projects (#/projects) → Project detail (#/project/:id)
Home → Budget (#/budget)
Home → Monthly Report (#/monthly-report)
```

### HR hierarchy

```
Profile  ─── (this is a tab, no parent)
   ↑
Home → HR Services (#/hr)         OR    Home → Leave/Expense/Advance/Salary directly
       ├── Leave (#/leave)            (action cards bypass /hr)
       │      ├── Apply (#/leave/apply)
       │      └── Detail (#/leave/:id)
       ├── Expenses (#/expense)
       │      ├── New (#/expense/new)
       │      └── Detail (#/expense/:id)
       ├── Advances (#/advance)
       │      ├── New (#/advance/new)
       │      └── Detail (#/advance/:id)
       ├── Salary (#/salary) → Slip detail (#/salary/:id)
       └── Budget (#/budget)
```

### Manager hierarchy

```
Home → Team (#/team)
Home → Approvals (#/approvals) → Approval detail (#/approvals/:type/:id)
```

---

## Back-button behavior — fixed in v40

**Old behavior (broken):** every route had a hardcoded `back` field, so pressing Back from `/leave` always went to `/hr`, even if the user came from Home. This violated Heuristic 3 (user control).

**New behavior:** a navigation stack tracks the user's real journey:

1. Forward navigation pushes the previous hash onto the stack.
2. Back-button click pops the stack and goes there.
3. Reaching a tab root (`#/home`, `#/chat`, `#/profile`) clears the stack.
4. If the stack is empty (direct/deep-link entry), back falls back to the route's canonical `back` field.

This means:
- Home → Leave → Back goes to Home (where they came from)
- HR → Leave → Back goes to HR
- Direct deep-link `/leave` → Back goes to `#/hr` (canonical parent fallback)

The stack survives page refreshes via `sessionStorage` (cleared on tab close).

---

## Heuristic-by-heuristic check (Nielsen 10 + Norman)

| # | Heuristic | Implementation |
|---|-----------|----------------|
| 1 | Visibility of system status | Top app bar shows current page title; supporting text below explains what the page does; nav stack respects context |
| 2 | Match between system and real world | Sentence-case copy ("Apply for leave" not "+ APPLY"), Indian rupee formatting, IST times, plain English |
| 3 | User control & freedom | Back button uses real journey via nav stack; M3 dialog cancel option in destructive flows; edge-swipe back; tab roots always one tap away |
| 4 | Consistency & standards | Single design system (M3 tokens), uniform stat shape across screens, sentence-case throughout, primary action filled button + leading icon |
| 5 | Error prevention | Disabled state on buttons during async; M3 dialog before destructive ops; required field validation with `UI.fieldError` |
| 6 | Recognition rather than recall | Visible labels on every action; segmented buttons show selection state; chips show selected state; bottom nav always visible |
| 7 | Flexibility & efficiency | Action cards on Home for fast access; HR Hub for grouped browse; Departments tabs for managers; AI chat as command-line shortcut |
| 8 | Aesthetic & minimalist design | M3 surface containers, no decorative borders, whitespace separation, single primary CTA per screen |
| 9 | Help users recognize/recover from errors | M3 snackbar with action button (e.g., "Undo"); contextual error messages; offline banner |
| 10 | Help & documentation | Page-level supporting text; AI chat answers ERP questions; web guides for sales, HR, complaint, etc. |
| 11 | (Norman) Affordances & signifiers | Tap targets ≥48px; filled buttons signal primary action; outlined for secondary; chips look pressable; icon-buttons have aria-label |

---

## Common UX traps fixed

1. **Blank /leave** — root cause: SW served stale `ui.js` post-deploy because of stale-while-revalidate. Fixed by switching `/assets/` to network-first; cache only on offline.
2. **Back surprises** — root cause: hardcoded `back` per route ignored journey. Fixed with sessionStorage nav stack.
3. **CSS triple-cache** — nginx 1y + SW + browser. Fixed by adding `?v={{ now }}` Jinja timestamp to all script/css URLs (already in field.html).
4. **Frappe navbar bleeding** — fixed in CSS via `header.navbar { display: none !important }`.

---

## Known weaknesses (next iterations)

- Auto-injected supporting text only covers ~30 routes; more should be added.
- Detail screens (`/lead/:id`, `/customer/:id`) have inconsistent layouts.
- Some screens still bottom-load custom logic (chat overrides `#app` styles); covered by router cleanup but fragile.
- Profile screen has Telegram-link UX that doesn't fit M3 patterns yet.
