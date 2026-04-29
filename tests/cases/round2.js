// round2.js — pro polish: stage path, status picker, recently viewed, FAB
'use strict';

const LEAD_FIXTURE = {
  match: '/api/method/frappe.client.get?doctype=Lead',
  data: { data: {
    name: 'CRM-LEAD-001',
    lead_name: 'Anil Kumar',
    company_name: 'Tata Steel',
    mobile_no: '+91 98765 43210',
    email_id: 'anil@tatasteel.in',
    source: 'Trade Show',
    status: 'Open',
    creation: '2026-04-25 10:30:00',
  } }
};

const OPP_FIXTURE = {
  match: '/api/method/frappe.client.get?doctype=Opportunity',
  data: { message: {
    name: 'CRM-OPP-001',
    party_name: 'Larsen & Toubro',
    opportunity_amount: 4250000,
    probability: 65,
    status: 'Replied',
    items: [{ item_name: 'EOT Crane Safety Kit', qty: 6, uom: 'Nos', rate: 425000, amount: 2550000 }],
  } }
};

const COMMENTS_FIXTURE = {
  match: '/api/resource/Comment',
  data: { data: [] }
};

const VERSIONS_FIXTURE = {
  match: '/api/resource/Version',
  data: { data: [] }
};

const LEADS_LIST = {
  match: '/api/field/leads',
  data: { data: [
    { name: 'CRM-LEAD-1', lead_name: 'Anil Kumar', company_name: 'Tata', mobile_no: '+91 98765 11111', source: 'Trade Show', status: 'Open', creation: '2026-04-25 10:00:00' }
  ] }
};

module.exports = {
  // Stage path renders on opportunity detail with the right current stage
  async opportunityHasStagePath(page, h) {
    await h.gotoRoute(page, '#/opportunity/CRM-OPP-001', {
      session: {},
      api: [OPP_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      stagePathExists: !!document.querySelector('.m3-stage-path'),
      currentStageLabel: (document.querySelector('.m3-stage.current') || {}).textContent || '',
      stageCount: document.querySelectorAll('.m3-stage').length,
    }));
    h.assert(out.stagePathExists, 'Opportunity detail missing m3-stage-path');
    h.assert(out.stageCount >= 4, `Expected 4 stages, got ${out.stageCount}`);
    h.assert(/replied/i.test(out.currentStageLabel), `Expected current stage to be Replied, got: ${out.currentStageLabel}`);
  },

  // Lead detail also has stage path with Open as current
  async leadHasStagePath(page, h) {
    await h.gotoRoute(page, '#/lead/CRM-LEAD-001', {
      session: {},
      api: [LEAD_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      stagePathExists: !!document.querySelector('.m3-stage-path'),
      currentStageLabel: (document.querySelector('.m3-stage.current') || {}).textContent || '',
    }));
    h.assert(out.stagePathExists, 'Lead detail missing m3-stage-path');
    h.assert(/open/i.test(out.currentStageLabel), `Expected current stage Open, got: ${out.currentStageLabel}`);
  },

  // Tapping the status pill on opportunity detail opens the status picker
  async opportunityStatusPillOpensPicker(page, h) {
    await h.gotoRoute(page, '#/opportunity/CRM-OPP-001', {
      session: {},
      api: [OPP_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    await page.evaluate(() => {
      // Tap the status pill in the hero
      var pill = document.querySelector('.m3-doc-hero .indicator-pill');
      if (pill) pill.click();
    });
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => ({
      pickerOpen: !!document.querySelector('.bottom-sheet-overlay'),
      optionCount: document.querySelectorAll('.m3-status-option').length,
      hasCurrentMarker: !!document.querySelector('.m3-status-option.is-current'),
    }));
    h.assert(out.pickerOpen, 'Status picker did not open after tapping pill');
    h.assert(out.optionCount >= 3, `Expected several status options, got ${out.optionCount}`);
    h.assert(out.hasCurrentMarker, 'Picker missing is-current marker');
  },

  // Leads list shows a quick-add FAB
  async leadsListHasFab(page, h) {
    await h.gotoRoute(page, '#/leads', {
      session: { navTier: 'manager' },
      api: [LEADS_LIST]
    });
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => ({
      fabExists: !!document.querySelector('.fab'),
      fabAriaLabel: (document.querySelector('.fab') || {}).getAttribute ? document.querySelector('.fab').getAttribute('aria-label') : '',
    }));
    h.assert(out.fabExists, 'Leads list missing FAB');
    h.assert(/lead/i.test(out.fabAriaLabel), `Expected FAB aria-label to mention lead, got: ${out.fabAriaLabel}`);
  },

  // UI.recents tracking + listing works
  async recentsTracksAndLists(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    const out = await page.evaluate(() => {
      // Clear, then track 3, then list
      UI.recents.clear();
      UI.recents.track({ doctype: 'Lead', name: 'A', title: 'Anil', subtitle: 'Tata', hash: '#/lead/A' });
      UI.recents.track({ doctype: 'Customer', name: 'B', title: 'Bharti', subtitle: 'BAL', hash: '#/customer/B' });
      UI.recents.track({ doctype: 'Quotation', name: 'C', title: 'Tata Motors', subtitle: '₹1.5L', hash: '#/quotation/C' });
      var list = UI.recents.list();
      return {
        count: list.length,
        first: list[0] ? list[0].title : '',
        order: list.map(function (i) { return i.name; }).join(',')
      };
    });
    h.assert(out.count === 3, `Expected 3 recents, got ${out.count}`);
    h.assert(out.first === 'Tata Motors', `Expected most-recent to be Tata Motors, got: ${out.first}`);
    h.assert(out.order === 'C,B,A', `Expected order C,B,A (most-recent first), got: ${out.order}`);
  },

  // Search screen renders the recents strip when localStorage has items
  async searchScreenShowsRecents(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    // Seed recents
    await page.evaluate(() => {
      UI.recents.clear();
      UI.recents.track({ doctype: 'Lead', name: 'X', title: 'Test Lead', subtitle: 'Co', hash: '#/lead/X' });
      UI.recents.track({ doctype: 'Customer', name: 'Y', title: 'Test Cust', subtitle: 'Industry', hash: '#/customer/Y' });
    });
    // Now navigate to search
    await page.evaluate(() => { location.hash = '#/search'; });
    await page.waitForTimeout(500);
    const out = await page.evaluate(() => ({
      recentsStripExists: !!document.querySelector('.m3-recents'),
      chipCount: document.querySelectorAll('.m3-recents-chip').length,
    }));
    h.assert(out.recentsStripExists, 'Search screen missing recents strip');
    h.assert(out.chipCount >= 2, `Expected ≥2 recents chips, got ${out.chipCount}`);
  }
};
