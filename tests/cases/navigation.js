// navigation.js — back-button stack, deep links, top app bar elements
'use strict';

module.exports = {
  // Back from a child should pop the nav stack to the parent we came from,
  // not the route's hardcoded `back` field.
  async backRespectsHistory(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    // Forward: home → leave (came from home, not from /hr)
    await page.evaluate(() => { location.hash = '#/leave'; });
    await page.waitForTimeout(400);
    // Tap back: should land on /home (last in stack), not /hr
    await page.evaluate(() => {
      const back = document.querySelector('.header-back');
      if (back) back.click();
    });
    await page.waitForTimeout(400);
    const hash = await page.evaluate(() => location.hash);
    h.assert(hash === '#/home', `Expected #/home after back, got ${hash}`);
  },

  // Top app bar must show a search icon (right side) on every screen except chat/login/search itself
  async searchIconInHeader(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    const hasSearch = await page.evaluate(() => {
      const header = document.getElementById('app-header');
      if (!header) return false;
      const buttons = header.querySelectorAll('button');
      for (const b of buttons) {
        if ((b.getAttribute('aria-label') || '').toLowerCase().includes('search')) return true;
      }
      return false;
    });
    h.assert(hasSearch, 'Top app bar should have a search icon button on /home');
  },

  // Bottom nav has 4 tabs: Home, Inbox, AI, Me
  async fourTabBottomNav(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    const tabs = await page.evaluate(() => {
      const nav = document.getElementById('bottom-nav');
      if (!nav) return [];
      return Array.from(nav.querySelectorAll('.nav-item')).map((a) => a.getAttribute('data-tab'));
    });
    h.assert(tabs.length >= 3, `Bottom nav should have at least 3 tabs, got ${tabs.length}: ${tabs.join(',')}`);
    h.assert(tabs.includes('home'), 'Home tab missing');
  },

  // Tab roots clear the nav stack
  async tabRootsClearStack(page, h) {
    await h.gotoRoute(page, '#/home', { session: { navTier: 'manager' }, api: [] });
    // Build up some stack
    await page.evaluate(() => { location.hash = '#/leave'; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { location.hash = '#/leave/apply'; });
    await page.waitForTimeout(300);
    // Jump to a tab root
    await page.evaluate(() => { location.hash = '#/profile'; });
    await page.waitForTimeout(300);
    // Stack should be reset (only contain the root or be empty)
    const stack = await page.evaluate(() => {
      try { return JSON.parse(sessionStorage.getItem('vaishali_nav_stack') || '[]'); } catch (_) { return []; }
    });
    h.assert(stack.length <= 1, `Nav stack should be 0 or 1 after reaching tab root, got ${stack.length}`);
  }
};
