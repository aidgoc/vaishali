/* app.js — DSPL Field App: route dispatcher + login screen
   All other screens live in screens/*.js and register on window.Screens.
*/
(function () {
  'use strict';

  var api = window.fieldAPI;

  // On Frappe Cloud, #app and #bottom-nav don't exist (HTML is sanitized).
  // Create them dynamically if missing.
  function ensureShell() {
    if (document.getElementById('app') && document.getElementById('bottom-nav')) return;
    var target = document.querySelector('.web-page-content') ||
                 document.querySelector('.webpage-content') ||
                 document.querySelector('.page_content') ||
                 document.querySelector('main') ||
                 document.body;
    target.textContent = '';
    // App container
    var appMain = document.createElement('main');
    appMain.id = 'app';
    appMain.className = 'container app-container';
    target.appendChild(appMain);
    // Bottom nav
    var nav = document.createElement('nav');
    nav.id = 'bottom-nav';
    nav.className = 'bottom-nav';
    nav.hidden = true;
    target.appendChild(nav);
  }
  ensureShell();

  var appEl = document.getElementById('app');
  var navEl = document.getElementById('bottom-nav');

  // ─── Helpers ────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i], v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'textContent') node.textContent = v;
        else if (k === 'className') node.className = v;
        else if (k === 'disabled') node.disabled = !!v;
        else if (k === 'type') node.type = v;
        else if (k === 'placeholder') node.placeholder = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        }
        else if (k === 'style' && typeof v === 'object') {
          var sk = Object.keys(v);
          for (var j = 0; j < sk.length; j++) node.style[sk[j]] = v[sk[j]];
        }
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (var c = 0; c < children.length; c++) {
        var child = children[c];
        if (!child) continue;
        if (typeof child === 'string') child = document.createTextNode(child);
        node.appendChild(child);
      }
    }
    return node;
  }

  function navigate(hash) {
    location.hash = hash;
  }

  function hideBottomNav() {
    navEl.hidden = true;
  }

  // Icon emoji fallbacks (used when icon() isn't available)
  var _emojiMap = { home: '\u{1F3E0}', clip: '\u{1F4CB}', bot: '\u{1F916}', user: '\u{1F464}', check: '\u2705', users: '\u{1F465}' };

  function buildBottomNav() {
    var tabs = Auth.getNavTabs();
    navEl.textContent = '';
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      var iconSpan = el('span', { className: 'nav-icon' });
      if (window.icon && t.ic) {
        // icon() returns an HTMLSpanElement wrapping an SVG
        iconSpan.appendChild(window.icon(t.ic));
      } else {
        iconSpan.textContent = _emojiMap[t.ic] || t.label.charAt(0);
      }
      var a = el('a', { className: 'nav-item', href: t.hash, 'data-tab': t.tab }, [
        iconSpan,
        el('span', { className: 'nav-label', textContent: t.label })
      ]);
      navEl.appendChild(a);
    }
    navEl.hidden = false;
  }

  function updateNavActive(tabName) {
    var links = navEl.querySelectorAll('.nav-item');
    for (var i = 0; i < links.length; i++) {
      var tab = links[i].getAttribute('data-tab');
      if (tab === tabName) links[i].classList.add('active');
      else links[i].classList.remove('active');
    }
  }

  // ─── Route Table (delegates to window.Screens) ─────────────────────

  var S = function () { return window.Screens || {}; };

  var routes = [
    // Auth
    { pattern: '#/login', handler: renderLogin, tab: null },
    // Core
    { pattern: '#/home',        handler: function () { S().home(appEl); },          tab: 'home' },
    { pattern: '#/attendance',  handler: function () { S().attendance(appEl); },     tab: 'home' },
    // Visits / DCR
    { pattern: '#/dcr/new',     handler: function () { S().visitNew(appEl); },       tab: 'visits' },
    { pattern: '#/dcr',         handler: function () { S().visitsList(appEl); },     tab: 'visits' },
    { pattern: '#/dcr/:id',     handler: function (p) { S().visitDetail(appEl, p); }, tab: 'visits' },
    // HR
    { pattern: '#/hr',          handler: function () { S().hrHub(appEl); },          tab: 'home' },
    { pattern: '#/leave',       handler: function () { S().leaveHome(appEl); },      tab: 'home' },
    { pattern: '#/leave/apply', handler: function () { S().leaveApply(appEl); },     tab: 'home' },
    { pattern: '#/leave/:id',   handler: function (p) { S().leaveDetail(appEl, p); }, tab: 'home' },
    { pattern: '#/expense',     handler: function () { S().expenseList(appEl); },    tab: 'home' },
    { pattern: '#/expense/new', handler: function () { S().expenseNew(appEl); },     tab: 'home' },
    { pattern: '#/expense/:id', handler: function (p) { S().expenseDetail(appEl, p); }, tab: 'home' },
    { pattern: '#/advance',     handler: function () { S().advanceList(appEl); },    tab: 'home' },
    { pattern: '#/advance/new', handler: function () { S().advanceNew(appEl); },     tab: 'home' },
    { pattern: '#/advance/:id', handler: function (p) { S().advanceDetail(appEl, p); }, tab: 'home' },
    { pattern: '#/salary',      handler: function () { S().salaryList(appEl); },     tab: 'home' },
    { pattern: '#/salary/:id',  handler: function (p) { S().salaryDetail(appEl, p); }, tab: 'home' },
    // Sales
    { pattern: '#/pipeline',      handler: function () { S().pipeline(appEl); },         tab: 'home' },
    { pattern: '#/targets',       handler: function () { S().myTargets(appEl); },        tab: 'home' },
    { pattern: '#/follow-ups',    handler: function () { S().followUps(appEl); },        tab: 'home' },
    { pattern: '#/customers',     handler: function () { S().customerSearch(appEl); },   tab: 'home' },
    // Customer / Debtors / Revenue
    { pattern: '#/customer/:id',  handler: function (p) { S().customerDetail(appEl, p); }, tab: 'home' },
    { pattern: '#/debtors',       handler: function () { S().debtors(appEl); },          tab: 'home' },
    { pattern: '#/revenue',       handler: function () { S().revenueDashboard(appEl); }, tab: 'home' },
    // Projects
    { pattern: '#/projects',      handler: function () { S().projectList(appEl); },       tab: 'home' },
    { pattern: '#/project/:id',   handler: function (p) { S().projectDetail(appEl, p); }, tab: 'home' },
    // AMC
    { pattern: '#/amc',           handler: function () { S().amcTracker(appEl); },        tab: 'home' },
    // Service
    { pattern: '#/service',          handler: function () { S().serviceDashboard(appEl); }, tab: 'home' },
    { pattern: '#/installations',    handler: function () { S().installationList(appEl); }, tab: 'home' },
    { pattern: '#/installation/:id', handler: function (p) { S().installationDetail(appEl, p); }, tab: 'home' },
    { pattern: '#/breakdowns',       handler: function () { S().breakdownList(appEl); }, tab: 'home' },
    { pattern: '#/breakdown/new',    handler: function () { S().breakdownNew(appEl); }, tab: 'home' },
    { pattern: '#/breakdown/:id',    handler: function (p) { S().breakdownDetail(appEl, p); }, tab: 'home' },
    // Production
    { pattern: '#/production',  handler: function () { S().productionDashboard(appEl); }, tab: 'home' },
    { pattern: '#/dispatch',    handler: function () { S().dispatchTracker(appEl); },     tab: 'home' },
    // Manager
    { pattern: '#/approvals',     handler: function () { S().approvalsList(appEl); },    tab: 'approvals' },
    { pattern: '#/approvals/:type/:id', handler: function (p) { S().approvalDetail(appEl, p); }, tab: 'approvals' },
    { pattern: '#/team',          handler: function () { S().teamOverview(appEl); },     tab: 'team' },
    // AI Chat
    { pattern: '#/chat',        handler: function () { S().chat(appEl); },           tab: 'chat' },
    // Profile
    { pattern: '#/profile',     handler: function () { S().profile(appEl); },        tab: 'profile' },
  ];

  function matchRoute(hash) {
    if (!hash || hash === '#' || hash === '#/') hash = '#/home';
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.pattern.indexOf(':') === -1) {
        if (hash === r.pattern) return { handler: r.handler, params: {}, tab: r.tab };
      } else {
        var patParts = r.pattern.split('/');
        var hashParts = hash.split('/');
        if (patParts.length !== hashParts.length) continue;
        var params = {};
        var match = true;
        for (var j = 0; j < patParts.length; j++) {
          if (patParts[j].charAt(0) === ':') {
            params[patParts[j].substring(1)] = decodeURIComponent(hashParts[j]);
          } else if (patParts[j] !== hashParts[j]) {
            match = false;
            break;
          }
        }
        if (match) return { handler: r.handler, params: params, tab: r.tab };
      }
    }
    return null;
  }

  function onRouteChange() {
    var hash = location.hash || '#/home';
    var matched = matchRoute(hash);
    if (!matched) {
      // Unknown route — show home
      matched = matchRoute('#/home');
      if (!matched) return;
    }

    // Read session synchronously from Auth cache (already loaded at startup)
    var session = Auth.getEmployee();
    if (!session && hash !== '#/login') {
      // Not logged in — try async load first
      Auth.getSession().then(function (s) {
        if (!s) { navigate('#/login'); return; }
        // Session loaded, retry
        _renderRoute(matched, hash);
      });
      return;
    }

    _renderRoute(matched, hash);
  }

  function _renderRoute(matched, hash) {
    // Rebuild nav if empty
    if (navEl.children.length === 0 && hash !== '#/login') {
      buildBottomNav();
    }
    appEl.textContent = '';
    if (matched.tab !== null) {
      updateNavActive(matched.tab);
    }
    matched.handler(matched.params);
  }

  // ─── Login Screen (kept here — only screen not in screens/) ────────

  function renderLogin() {
    api.getSession().then(function (session) {
      if (session) { navigate('#/home'); return; }
      hideBottomNav();

      var errorBox = el('div', { className: 'field-group', style: { color: 'var(--dspl-red)', display: 'none' } });
      var emailInput = el('input', { type: 'email', placeholder: 'Email', 'aria-label': 'Email' });
      var passInput = el('input', { type: 'password', placeholder: 'Password', 'aria-label': 'Password' });
      var submitBtn = el('button', { textContent: 'Sign In', className: 'checkin-btn' });

      submitBtn.addEventListener('click', function () {
        var email = emailInput.value.trim();
        var pass = passInput.value;
        if (!email || !pass) {
          errorBox.textContent = 'Please enter email and password.';
          errorBox.style.display = 'block';
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';
        errorBox.style.display = 'none';

        // Try Frappe native login first, then fall back to FastAPI tunnel
        var loginFn;
        if (typeof api.frappeLogin === 'function') {
          // Explicit frappeLogin method available
          loginFn = api.frappeLogin(email, pass).then(function (res) {
            if (res.error) return { error: res.error, status: res.status || 401 };
            return {
              data: {
                employee: res.employee,
                nav_tier: res.nav_tier || 'field',
                api_key: res.api_key || null,
                api_secret: res.api_secret || null,
              },
              status: 200
            };
          });
        } else {
          // Try Frappe native login (POST /api/method/login), then get session info
          loginFn = api.apiCall('POST', '/api/method/login', { usr: email, pwd: pass }).then(function (res) {
            if (res.error || res.status >= 400) {
              // Fall back to FastAPI tunnel login
              return api.apiCall('POST', '/api/field/login', { email: email, password: pass });
            }
            // Frappe login succeeded — now get session info from our custom endpoint
            return api.apiCall('GET', '/api/method/vaishali.api.field.get_session_info').then(function (infoRes) {
              if (infoRes.error || !infoRes.data) {
                return { error: 'Failed to get session info', status: 500 };
              }
              var info = infoRes.data.message || infoRes.data;
              return {
                data: {
                  employee: info.employee,
                  nav_tier: info.nav_tier || 'field',
                  api_key: null,
                  api_secret: null,
                },
                status: 200
              };
            });
          });
        }

        loginFn.then(function (res) {
          if (res.error || res.status >= 400) {
            var msg = (res.data && res.data.message) || res.error || 'Login failed';
            errorBox.textContent = msg;
            errorBox.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            return;
          }
          var d = res.data;
          // Save session (with API keys if available)
          var saveFn = typeof api.saveSession === 'function' && api.saveSession.length >= 4
            ? api.saveSession(d.employee, d.nav_tier || 'field', d.api_key, d.api_secret)
            : api.saveSession(d.api_key, d.api_secret, d.employee);
          saveFn.then(function () {
            Auth.saveSession(d.employee, d.nav_tier || 'field', d.roles || []).then(function () {
              // Auto-generate API keys if missing (for tunnel calls)
              if (typeof api.ensureApiKeys === 'function') {
                api.ensureApiKeys();
              }
              buildBottomNav();
              navigate('#/home');
            });
          });
        });
      });

      passInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitBtn.click();
      });

      var form = el('div', { className: 'login-container' }, [
        el('h1', { textContent: 'DSPL Field', style: { marginBottom: '0.5rem' } }),
        el('div', { className: 'field-group', style: { width: '100%', maxWidth: '320px' } }, [emailInput]),
        el('div', { className: 'field-group', style: { width: '100%', maxWidth: '320px' } }, [passInput]),
        errorBox,
        el('div', { style: { width: '100%', maxWidth: '320px' } }, [submitBtn])
      ]);

      appEl.textContent = '';
      appEl.appendChild(form);
    });
  }

  // ─── Startup ───────────────────────────────────────────────────────

  window.addEventListener('hashchange', onRouteChange);

  document.addEventListener('DOMContentLoaded', function () {
    // Wait for Auth to load session from IDB (async), then route
    Auth.getSession().then(function (session) {
      if (!session) {
        navigate('#/login');
        return;
      }

      // Validate session is still active (Frappe cookie might have expired)
      // On Frappe Cloud, check get_logged_user. On FastAPI, skip (token auth).
      var validatePromise;
      if (window.CHAT_API_BASE) {
        // Frappe Cloud — check if cookie session is still valid
        validatePromise = api.apiCall('GET', '/api/method/frappe.auth.get_logged_user').then(function (res) {
          if (res.error || !res.data || !res.data.message) {
            // Cookie expired — clear session and redirect to login
            return api.clearSession ? api.clearSession() : Promise.resolve();
          }
          return 'valid';
        });
      } else {
        validatePromise = Promise.resolve('valid');
      }

      validatePromise.then(function (result) {
        if (result !== 'valid') {
          navigate('#/login');
          return;
        }

      // Session is loaded and validated — safe to build nav now
      buildBottomNav();

      // Ensure API keys exist for tunnel calls (auto-generates if missing)
      if (typeof api.ensureApiKeys === 'function') {
        api.ensureApiKeys();
      }

      var hash = location.hash;
      if (!hash || hash === '#' || hash === '#/' || hash === '#/login') {
        navigate('#/home');
      } else {
        onRouteChange();
      }

      // Prefetch customers in background
      api.cacheGet('customers').then(function (cached) {
        if (!cached) {
          api.apiCall('GET', '/api/field/customers').then(function (res) {
            if (!res.error && res.data && Array.isArray(res.data)) {
              api.cacheSet('customers', res.data, 24 * 60 * 60 * 1000);
            }
          });
        }
      });
      }); // end validatePromise.then
    }); // end Auth.getSession.then

    if (!navigator.onLine) {
      api.updateOfflineBanner(true);
    }
  });

})();
