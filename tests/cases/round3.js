// round3.js — kanban pipeline, notification bell, SO/DN/SI stage paths, email composer
'use strict';

// PIPELINE_FIXTURE removed — see tests/cases/spanco.js for the 6-stage board.

const SO_FIXTURE = {
  match: '/api/method/frappe.client.get?doctype=Sales Order',
  data: { message: {
    name: 'SO-2026-001',
    customer_name: 'Reliance Industries',
    transaction_date: '2026-04-25',
    delivery_date: '2026-05-15',
    grand_total: 980000,
    docstatus: 1,
    status: 'To Deliver and Bill',
    items: [{ item_name: 'EOT Crane Kit', qty: 2, uom: 'Nos', rate: 490000, amount: 980000 }]
  } }
};

const SI_FIXTURE = {
  match: '/api/method/frappe.client.get?doctype=Sales Invoice',
  data: { message: {
    name: 'SI-2026-001',
    customer_name: 'Reliance Industries',
    posting_date: '2026-04-25',
    due_date: '2026-05-25',
    grand_total: 980000,
    outstanding_amount: 500000,
    docstatus: 1,
    status: 'Partly Paid',
    items: [{ item_name: 'EOT Crane Kit', qty: 2, uom: 'Nos', rate: 490000, amount: 980000 }]
  } }
};

const COMMENTS_FIXTURE = { match: '/api/resource/Comment', data: { data: [] } };
const VERSIONS_FIXTURE = { match: '/api/resource/Version', data: { data: [] } };

module.exports = {
  // Pipeline kanban — superseded by tests/cases/spanco.js. The 4-stage
  // m3-kanban was replaced by the 6-stage SPANCO board with .spanco-* selectors.
  // (case removed)

  // Bell icon shows in top app bar
  async bellInAppBar(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    const out = await page.evaluate(() => {
      var bell = document.querySelector('.bell-btn');
      return {
        bellExists: !!bell,
        ariaLabel: bell ? bell.getAttribute('aria-label') : '',
        hasBadge: bell ? !!bell.querySelector('.bell-badge') : false
      };
    });
    h.assert(out.bellExists, 'Bell button missing from app bar');
    h.assert(/notif/i.test(out.ariaLabel), `Expected notifications aria-label, got: ${out.ariaLabel}`);
    h.assert(out.hasBadge, 'Bell badge span missing (needed for unread indicator)');
  },

  // Bell badge reflects inbox_unread_count localStorage value
  async bellBadgeReflectsCount(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    await page.evaluate(() => {
      localStorage.setItem('inbox_unread_count', '7');
      // trigger refresh by dispatching hashchange (or just call refresh)
      if (typeof window._refreshBellBadge === 'function') window._refreshBellBadge();
    });
    // Navigate to refresh
    await page.evaluate(() => { location.hash = '#/profile'; });
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
      var badge = document.querySelector('.bell-badge');
      return {
        hidden: badge ? badge.hidden : true,
        text: badge ? badge.textContent : ''
      };
    });
    h.assert(!out.hidden, 'Badge should be visible when count > 0');
    h.assert(out.text === '7', `Expected badge text "7", got "${out.text}"`);
  },

  // Sales Order detail has a stage path
  async soDetailHasStagePath(page, h) {
    await h.gotoRoute(page, '#/sales-order/SO-2026-001', {
      session: {},
      api: [SO_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      stagePathExists: !!document.querySelector('.m3-stage-path'),
      stageCount: document.querySelectorAll('.m3-stage').length,
      currentLabel: (document.querySelector('.m3-stage.current') || {}).textContent || ''
    }));
    h.assert(out.stagePathExists, 'SO detail missing stage path');
    h.assert(out.stageCount >= 4, `Expected ≥4 SO stages, got ${out.stageCount}`);
    h.assert(/deliver/i.test(out.currentLabel), `Expected 'To deliver' as current, got: ${out.currentLabel}`);
  },

  // Sales Invoice detail has a stage path; "Partly Paid" stage current
  async siDetailHasStagePath(page, h) {
    await h.gotoRoute(page, '#/sales-invoice/SI-2026-001', {
      session: {},
      api: [SI_FIXTURE, COMMENTS_FIXTURE, VERSIONS_FIXTURE]
    });
    const out = await page.evaluate(() => ({
      stagePathExists: !!document.querySelector('.m3-stage-path'),
      currentLabel: (document.querySelector('.m3-stage.current') || {}).textContent || ''
    }));
    h.assert(out.stagePathExists, 'SI detail missing stage path');
    h.assert(/partly|paid/i.test(out.currentLabel), `Expected partly-paid current, got: ${out.currentLabel}`);
  },

  // UI.emailComposer is exported and instantiable
  async emailComposerExposed(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    const out = await page.evaluate(() => {
      var fn = window.UI && window.UI.emailComposer;
      if (typeof fn !== 'function') return { hasFn: false };
      var sheet = fn({
        to: 'test@example.com',
        subject: 'Test subject',
        body: 'Test body',
        doctype: 'Lead', name: 'X'
      });
      document.body.appendChild(sheet);
      return {
        hasFn: true,
        hasOverlay: !!document.querySelector('.bottom-sheet-overlay'),
        hasComposer: !!document.querySelector('.m3-email-composer'),
        hasSendBar: !!document.querySelector('.m3-email-composer-send-bar'),
        toFieldValue: (document.querySelector('.m3-email-composer input[type="email"]') || {}).value || ''
      };
    });
    h.assert(out.hasFn, 'UI.emailComposer function missing');
    h.assert(out.hasOverlay, 'Email composer did not mount an overlay');
    h.assert(out.hasComposer, 'Email composer body missing');
    h.assert(out.hasSendBar, 'Send bar (sticky) missing');
    h.assert(out.toFieldValue === 'test@example.com', `To field should pre-fill, got: ${out.toFieldValue}`);
  }
};
