// integrations.js — feature integrations from this round
'use strict';

const LEAD_FIXTURE = {
  match: 'doctype=Lead',
  data: { data: {
    name: 'CRM-LEAD-001',
    lead_name: 'Anil Kumar',
    company_name: 'Tata Steel',
    mobile_no: '+91 98765 43210',
    email_id: 'anil@tatasteel.in',
    source: 'Trade Show',
    status: 'Lead',
    creation: '2026-04-25 10:30:00',
  } }
};

const COMMENTS_FIXTURE = {
  match: 'doctype=Comment',
  data: { data: [
    { name: 'C1', content: '<p>Spoke to procurement</p>', comment_email: 'harsh@dgoc.in', comment_by: 'Harsh', comment_type: 'Comment', creation: '2026-04-26 14:00:00' },
    { name: 'C2', content: '<p>Sent specs by email</p>', comment_email: 'harsh@dgoc.in', comment_by: 'Harsh', comment_type: 'Comment', creation: '2026-04-25 11:30:00' }
  ] }
};

const VERSIONS_FIXTURE = {
  match: 'doctype=Version',
  data: { data: [
    { name: 'V1', data: '{"changed":[["status","Open","Open"]]}', owner: 'harsh@dgoc.in', creation: '2026-04-25 10:30:00' }
  ] }
};

const QUOT_FIXTURE = {
  match: 'doctype=Quotation',
  data: { message: {
    name: 'SAL-QTN-2026-001',
    party_name: 'Tata Motors Ltd',
    customer_name: 'Tata Motors Ltd',
    transaction_date: '2026-04-25',
    valid_till: '2026-05-25',
    status: 'Open',
    docstatus: 1,
    items: [{ item_name: 'ATB Sensor', qty: 4, uom: 'Nos', rate: 18500, amount: 74000 }],
    grand_total: 74000,
  } }
};

const LEADS_LIST = {
  match: '/api/field/leads',
  data: { data: [
    { name: 'CRM-LEAD-1', lead_name: 'Anil Kumar', company_name: 'Tata', mobile_no: '+91 98765 11111', source: 'Trade Show', status: 'Lead', creation: '2026-04-25 10:00:00' }
  ] }
};

const QUOT_LIST = {
  match: '/api/field/quotations',
  data: { data: [
    { name: 'QTN-001', party_name: 'Tata Motors', transaction_date: '2026-04-25', grand_total: 74000, status: 'Open', docstatus: 1 }
  ] }
};

const APPROVALS_LIST = {
  match: '/api/field/approvals',
  data: { data: [
    { name: 'HR-LAP-001', employee_name: 'Test User', type: 'Leave', from_date: '2026-04-30', to_date: '2026-05-02', total_leave_days: 3 }
  ] }
};

module.exports = {
  // Lead detail must include the activity timeline section
  async leadDetailHasActivityTimeline(page, h) {
    await h.gotoRoute(page, '#/lead/CRM-LEAD-001', {
      session: {},
      api: [LEAD_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      timelineExists: !!document.querySelector('.m3-timeline'),
      composerExists: !!document.querySelector('.m3-comment-box'),
      timelineRows: document.querySelectorAll('.m3-timeline-row').length,
      sectionTitles: Array.from(document.querySelectorAll('.m3-section-title')).map((e) => e.textContent.trim())
    }));
    h.assert(out.timelineExists, 'Lead detail missing m3-timeline');
    h.assert(out.composerExists, 'Lead detail missing m3-comment-box');
    h.assert(out.sectionTitles.includes('Activity'), `Expected "Activity" section heading, got: ${out.sectionTitles.join(', ')}`);
    h.assert(out.timelineRows >= 1, `Expected at least 1 timeline row, got ${out.timelineRows}`);
  },

  // Quotation detail must include the activity timeline
  async quotationDetailHasActivityTimeline(page, h) {
    await h.gotoRoute(page, '#/quotation/SAL-QTN-2026-001', {
      session: {},
      api: [QUOT_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      timelineExists: !!document.querySelector('.m3-timeline'),
      composerExists: !!document.querySelector('.m3-comment-box'),
    }));
    h.assert(out.timelineExists, 'Quotation detail missing m3-timeline');
    h.assert(out.composerExists, 'Quotation detail missing comment composer');
  },

  // Leads list rows must be wrapped in m3-swipe-row
  async leadsListHasSwipeRows(page, h) {
    await h.gotoRoute(page, '#/leads', {
      session: { navTier: 'manager' },
      api: [LEADS_LIST]
    });
    const out = await page.evaluate(() => ({
      swipeRows: document.querySelectorAll('.m3-swipe-row').length,
      leadingActions: Array.from(document.querySelectorAll('.m3-swipe-actions.leading .m3-swipe-action')).map((b) => (b.textContent || '').trim()),
      trailingActions: Array.from(document.querySelectorAll('.m3-swipe-actions.trailing .m3-swipe-action')).map((b) => (b.textContent || '').trim())
    }));
    h.assert(out.swipeRows >= 1, `Expected swipe rows on leads list, got ${out.swipeRows}`);
    h.assert(out.leadingActions.some((s) => /call/i.test(s)), `Leads list missing Call action — saw: ${out.leadingActions.join(', ')}`);
    h.assert(out.trailingActions.some((s) => /convert/i.test(s)), `Leads list missing Convert action — saw: ${out.trailingActions.join(', ')}`);
  },

  // Approvals list rows must have Approve / Reject swipe actions
  async approvalsListHasSwipeRows(page, h) {
    await h.gotoRoute(page, '#/approvals', {
      session: { navTier: 'manager' },
      api: [APPROVALS_LIST]
    });
    const out = await page.evaluate(() => ({
      swipeRows: document.querySelectorAll('.m3-swipe-row').length,
      leadingActions: Array.from(document.querySelectorAll('.m3-swipe-actions.leading .m3-swipe-action')).map((b) => (b.textContent || '').trim()),
      trailingActions: Array.from(document.querySelectorAll('.m3-swipe-actions.trailing .m3-swipe-action')).map((b) => (b.textContent || '').trim())
    }));
    h.assert(out.swipeRows >= 1, `Expected swipe rows on approvals list, got ${out.swipeRows}`);
    h.assert(out.leadingActions.some((s) => /approve/i.test(s)), 'Approvals missing Approve action');
    h.assert(out.trailingActions.some((s) => /reject/i.test(s)), 'Approvals missing Reject action');
  },

  // Quotations list — Make SO trailing
  async quotationsListHasMakeSO(page, h) {
    await h.gotoRoute(page, '#/quotations', {
      session: { navTier: 'manager' },
      api: [QUOT_LIST]
    });
    const out = await page.evaluate(() => ({
      swipeRows: document.querySelectorAll('.m3-swipe-row').length,
      trailingActions: Array.from(document.querySelectorAll('.m3-swipe-actions.trailing .m3-swipe-action')).map((b) => (b.textContent || '').trim())
    }));
    h.assert(out.swipeRows >= 1, `Expected swipe rows on quotations list, got ${out.swipeRows}`);
    h.assert(out.trailingActions.some((s) => /make so/i.test(s)), `Quotations missing Make SO action — saw: ${out.trailingActions.join(', ')}`);
  }
};
