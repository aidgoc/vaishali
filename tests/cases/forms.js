// forms.js — form interactions on key flows
'use strict';

module.exports = {
  // Apply leave form should render M3 floating-label fields
  async applyLeaveFormRenders(page, h) {
    await h.gotoRoute(page, '#/leave/apply', { session: {}, api: [] });
    const result = await page.evaluate(() => {
      return {
        m3Fields: document.querySelectorAll('.m3-textfield').length,
        labels: Array.from(document.querySelectorAll('.m3-textfield-label')).map((l) => l.textContent.trim()),
        hasSubmit: !!document.querySelector('button.btn-primary-styled, .m3-btn-filled, .btn'),
      };
    });
    h.assert(result.m3Fields >= 3, `Expected ≥3 M3 textfields on apply leave, got ${result.m3Fields}`);
    h.assert(result.hasSubmit, 'No submit button found on apply leave form');
  },

  // Lead new form has all expected fields
  async leadNewFormFields(page, h) {
    await h.gotoRoute(page, '#/lead/new', {
      session: { navTier: 'manager' },
      api: [{ match: 'lead-sources', data: { data: ['Cold Calling', 'Reference', 'Trade Show'] } }]
    });
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.m3-textfield-label')).map((l) => l.textContent.trim().toLowerCase())
    );
    const required = ['lead name', 'company name', 'mobile number', 'email address'];
    for (const r of required) {
      h.assert(labels.some((l) => l.includes(r.toLowerCase())), `Missing field "${r}" — got: ${labels.join(', ')}`);
    }
  },

  // Visit new form has GPS card and visit-type segmented buttons
  async visitNewHasGPSAndType(page, h) {
    await h.gotoRoute(page, '#/dcr/new', { session: { navTier: 'manager' }, api: [] });
    const result = await page.evaluate(() => ({
      hasGPSCard: !!document.querySelector('.gps-display, .card-surface'),
      hasSegmented: !!document.querySelector('.m3-segmented'),
      segments: Array.from(document.querySelectorAll('.m3-segment')).map((s) => s.textContent.trim()),
    }));
    h.assert(result.hasGPSCard, 'Visit new should show GPS card');
    h.assert(result.hasSegmented, 'Visit new should show segmented visit-type picker');
    h.assert(result.segments.includes('Sales') || result.segments.length >= 2, 'Sales/Service segments missing');
  },
};
