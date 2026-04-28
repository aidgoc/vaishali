// helpers.js — shared utilities for PWA tests
'use strict';

const BASE = process.env.PWA_BASE || 'https://dgoc.logstop.com/field';

// Inject a fake authenticated session + mock fieldAPI for a Playwright page.
// This bypasses the real login flow so tests don't need credentials.
async function mockSession(page, opts) {
  opts = opts || {};
  const employee = opts.employee || {
    name: 'HR-EMP-00001',
    employee_name: 'Test User',
    department: opts.department || 'Sales',
    company: 'Dynamic Servitech Private Limited'
  };
  const navTier = opts.navTier || 'manager';

  await page.evaluate(({ employee, navTier }) => {
    window.Auth = window.Auth || {};
    window.Auth.getEmployee = () => employee;
    window.Auth.getSession = () => Promise.resolve({ id: 'current', employee, nav_tier: navTier });
    window.Auth.getNavTier = () => navTier;
    window.Auth.isManager = () => navTier === 'manager' || navTier === 'admin';
    window.Auth.isAdmin = () => navTier === 'admin';
    window.Auth.canAccess = () => true;
    window.Auth.getNavTabs = () => [
      { tab: 'home', ic: 'home', label: 'Home', hash: '#/home' },
      { tab: 'chat', ic: 'bot', label: 'AI', hash: '#/chat' },
      { tab: 'profile', ic: 'user', label: 'Me', hash: '#/profile' }
    ];
    window.Auth.saveSession = () => Promise.resolve();
    window.Auth.clearSession = () => Promise.resolve();
  }, { employee, navTier });
}

// Replace fieldAPI.apiCall with a stub that returns the given fixtures.
// fixtures: array of { match: substring, data: any }
async function mockApi(page, fixtures) {
  await page.evaluate((fixtures) => {
    window.__pwaApiCalls = [];
    window.fieldAPI = window.fieldAPI || {};
    window.fieldAPI.apiCall = (method, path, body) => {
      window.__pwaApiCalls.push({ method, path, body });
      for (const f of fixtures) {
        if (path.includes(f.match)) {
          return Promise.resolve({ data: f.data, status: 200 });
        }
      }
      return Promise.resolve({ data: { data: [] }, status: 200 });
    };
    // For stubbing other helpers
    window.fieldAPI.cacheGet = () => Promise.resolve(null);
    window.fieldAPI.cacheSet = () => Promise.resolve();
    window.fieldAPI.idbGet = () => Promise.resolve(null);
    window.fieldAPI.idbPut = () => Promise.resolve();
    window.fieldAPI.ensureApiKeys = () => {};
    window.fieldAPI.updateOfflineBanner = () => {};
  }, fixtures);
}

// Visit a hash route with a mocked session + api, wait for paint.
async function gotoRoute(page, hash, opts) {
  opts = opts || {};
  await page.goto(BASE);
  // Clear caches so the latest deploy is fetched
  await page.evaluate(async () => {
    if (window.caches) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Wait for window.UI to be ready
  await page.waitForFunction(() => window.UI && window.Screens, { timeout: 10000 });
  if (opts.session !== false) await mockSession(page, opts.session || {});
  if (opts.api) await mockApi(page, opts.api);
  // Build a fake header + nav so the screen renders standalone
  await page.evaluate((hash) => {
    const appEl = document.getElementById('app');
    const headerEl = document.getElementById('app-header');
    const navEl = document.getElementById('bottom-nav');
    appEl.style.display = '';
    headerEl.style.display = '';
    navEl.style.display = '';

    // Ensure bottom nav DOM exists. _startup may have skipped buildBottomNav
    // because it ran before mockSession installed the fake Auth. Build it
    // here using the same 4-tab structure that app.js uses.
    if (navEl.children.length === 0) {
      const tabs = [
        { tab: 'home', ic: 'home', label: 'Home', hash: '#/home' },
        { tab: 'inbox', ic: 'bell', label: 'Inbox', hash: '#/inbox' },
        { tab: 'chat', ic: 'bot', label: 'AI', hash: '#/chat' },
        { tab: 'profile', ic: 'user', label: 'Me', hash: '#/profile' },
      ];
      for (const t of tabs) {
        const a = document.createElement('a');
        a.className = 'nav-item';
        a.href = t.hash;
        a.setAttribute('data-tab', t.tab);
        a.setAttribute('aria-label', t.label);
        a.onclick = (e) => { e.preventDefault(); location.hash = t.hash; };
        const ic = document.createElement('span');
        ic.className = 'nav-icon';
        if (window.icon) ic.appendChild(window.icon(t.ic));
        a.appendChild(ic);
        const label = document.createElement('span');
        label.className = 'nav-label';
        label.textContent = t.label;
        a.appendChild(label);
        navEl.appendChild(a);
      }
    }
    location.hash = hash;
  }, hash);
  // Allow handler + async data to settle
  await page.waitForTimeout(opts.settle || 800);
}

// Assert helper — adds to a results array and throws on failure
function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// Collect console errors during a flow
function attachConsoleCollector(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err.message || err)));
  return errors;
}

module.exports = {
  BASE,
  mockSession,
  mockApi,
  gotoRoute,
  assert,
  attachConsoleCollector
};
