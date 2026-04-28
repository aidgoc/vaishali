// smoke.js — every screen renders without JS errors
'use strict';

const ROUTES = [
  { hash: '#/home', label: 'home' },
  { hash: '#/attendance', label: 'attendance' },
  { hash: '#/dcr', label: 'visits-list' },
  { hash: '#/dcr/new', label: 'visit-new' },
  { hash: '#/hr', label: 'hr-hub' },
  { hash: '#/leave', label: 'leave' },
  { hash: '#/leave/apply', label: 'leave-apply' },
  { hash: '#/expense', label: 'expense' },
  { hash: '#/expense/new', label: 'expense-new' },
  { hash: '#/advance', label: 'advance' },
  { hash: '#/advance/new', label: 'advance-new' },
  { hash: '#/salary', label: 'salary' },
  { hash: '#/leads', label: 'leads' },
  { hash: '#/lead/new', label: 'lead-new' },
  { hash: '#/opportunities', label: 'opportunities' },
  { hash: '#/quotations', label: 'quotations' },
  { hash: '#/sales-orders', label: 'sales-orders' },
  { hash: '#/delivery-notes', label: 'delivery-notes' },
  { hash: '#/sales-invoices', label: 'sales-invoices' },
  { hash: '#/customers', label: 'customers' },
  { hash: '#/follow-ups', label: 'follow-ups' },
  { hash: '#/pipeline', label: 'pipeline' },
  { hash: '#/approvals', label: 'approvals' },
  { hash: '#/team', label: 'team' },
  { hash: '#/inbox', label: 'inbox' },
  { hash: '#/search', label: 'search' },
  { hash: '#/profile', label: 'profile' },
  { hash: '#/chat', label: 'chat' },
  { hash: '#/service', label: 'service' },
  { hash: '#/installations', label: 'installations' },
  { hash: '#/breakdowns', label: 'breakdowns' },
  { hash: '#/devices', label: 'devices' },
  { hash: '#/amc', label: 'amc' },
  { hash: '#/projects', label: 'projects' },
  { hash: '#/stock', label: 'stock' },
  { hash: '#/revenue', label: 'revenue' },
  { hash: '#/debtors', label: 'debtors' },
  { hash: '#/budget', label: 'budget' },
  { hash: '#/monthly-report', label: 'monthly-report' },
];

function makeCase(route) {
  return async (page, h) => {
    await h.gotoRoute(page, route.hash, {
      session: { navTier: 'manager' },
      api: [
        // catch-all returns empty list to avoid network errors
      ]
    });
    // Wait for either content OR error
    const ok = await page.evaluate(() => {
      const app = document.getElementById('app');
      return !!app && (app.children.length > 0);
    });
    h.assert(ok, `${route.hash} should render content into #app`);
  };
}

const cases = {};
for (const r of ROUTES) cases['route_' + r.label.replace(/-/g, '_')] = makeCase(r);

module.exports = cases;
