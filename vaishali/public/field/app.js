/* app.js — DSPL Field App: route dispatcher + login screen
   All other screens live in screens/*.js and register on window.Screens.
   HTML provides #app-header, #app, #bottom-nav — no dynamic shell creation.
*/
(function () {
  'use strict';

  var api = window.fieldAPI;

  var el = UI.el;

  var appEl  = document.getElementById('app');
  var navEl  = document.getElementById('bottom-nav');

  var _navigatingBack = false;

  // ─── Helpers ────────────────────────────────────────────────────────

  function navigate(hash) {
    location.hash = hash;
  }

  function hideBottomNav() {
    navEl.style.display = 'none';
  }

  function showBottomNav() {
    navEl.style.display = '';
  }

  // ─── Dismiss splash screen ────────────────────────────────────────
  function dismissSplash() {
    var splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('splash-hide');
      setTimeout(function () { splash.remove(); }, 500);
    }
  }

  // ─── Bottom Nav — 3 tabs ──────────────────────────────────────────

  function buildBottomNav() {
    navEl.textContent = '';
    var tabs = [
      { tab: 'home',    ic: 'home', label: 'Home',    hash: '#/home' },
      { tab: 'chat',    ic: 'bot',  label: 'AI',      hash: '#/chat' },
      { tab: 'profile', ic: 'user', label: 'Me',      hash: '#/profile' }
    ];
    for (var i = 0; i < tabs.length; i++) {
      (function (t) {
        var iconSpan = el('span', { className: 'nav-icon' });
        if (window.icon) iconSpan.appendChild(window.icon(t.ic));
        var a = el('a', {
          className: 'nav-item',
          href: t.hash,
          'data-tab': t.tab,
          'aria-label': t.label,
          onClick: function (e) { e.preventDefault(); location.hash = t.hash; }
        }, [
          iconSpan,
          el('span', { className: 'nav-label', textContent: t.label })
        ]);
        navEl.appendChild(a);
      })(tabs[i]);
    }
  }

  function updateNavActive(tabName) {
    var links = navEl.querySelectorAll('.nav-item');
    for (var i = 0; i < links.length; i++) {
      var tab = links[i].getAttribute('data-tab');
      if (tab === tabName) {
        links[i].classList.add('active');
        links[i].setAttribute('aria-current', 'page');
      } else {
        links[i].classList.remove('active');
        links[i].removeAttribute('aria-current');
      }
    }
  }

  // ─── Route Table (delegates to window.Screens) ─────────────────────

  var S = function () { return window.Screens || {}; };

  var routes = [
    // Auth
    { pattern: '#/login', handler: renderLogin, tab: null, title: null, back: null },

    // Core
    { pattern: '#/home',       handler: function () { S().home(appEl); },       tab: 'home',    title: 'DSPL Field', back: null },
    { pattern: '#/attendance', handler: function () { S().attendance(appEl); },  tab: 'home',    title: 'Attendance', back: '#/home' },

    // Visits / DCR
    { pattern: '#/dcr/new',  handler: function () { S().visitNew(appEl); },          tab: 'home', title: 'New Visit', back: '#/dcr' },
    { pattern: '#/dcr',      handler: function () { S().visitsList(appEl); },        tab: 'home', title: 'Visits',    back: '#/home' },
    { pattern: '#/dcr/:id',  handler: function (p) { S().visitDetail(appEl, p); },   tab: 'home', title: 'Visit',     back: '#/dcr' },

    // HR Hub
    { pattern: '#/hr',          handler: function () { S().hrHub(appEl); },          tab: 'home', title: 'HR Services', back: '#/home' },

    // Leave
    { pattern: '#/leave/apply', handler: function () { S().leaveApply(appEl); },     tab: 'home', title: 'Apply Leave',  back: '#/leave' },
    { pattern: '#/leave',       handler: function () { S().leaveHome(appEl); },      tab: 'home', title: 'Leave',        back: '#/hr' },
    { pattern: '#/leave/:id',   handler: function (p) { S().leaveDetail(appEl, p); },tab: 'home', title: 'Leave Detail', back: '#/leave' },

    // Expense
    { pattern: '#/expense/new', handler: function () { S().expenseNew(appEl); },         tab: 'home', title: 'New Expense',    back: '#/expense' },
    { pattern: '#/expense',     handler: function () { S().expenseList(appEl); },        tab: 'home', title: 'Expenses',       back: '#/hr' },
    { pattern: '#/expense/:id', handler: function (p) { S().expenseDetail(appEl, p); },  tab: 'home', title: 'Expense Detail', back: '#/expense' },

    // Advance
    { pattern: '#/advance/new', handler: function () { S().advanceNew(appEl); },         tab: 'home', title: 'Request Advance', back: '#/advance' },
    { pattern: '#/advance',     handler: function () { S().advanceList(appEl); },        tab: 'home', title: 'Advances',        back: '#/hr' },
    { pattern: '#/advance/:id', handler: function (p) { S().advanceDetail(appEl, p); },  tab: 'home', title: 'Advance Detail',  back: '#/advance' },

    // Salary
    { pattern: '#/salary',     handler: function () { S().salaryList(appEl); },        tab: 'home', title: 'Salary Slips',  back: '#/hr' },
    { pattern: '#/salary/:id', handler: function (p) { S().salaryDetail(appEl, p); },  tab: 'home', title: 'Salary Slip',   back: '#/salary' },

    // Leads
    { pattern: '#/lead/new', handler: function () { S().leadNew(appEl); },   tab: 'home', title: 'New Lead', back: '#/leads' },
    { pattern: '#/leads',    handler: function () { S().leadList(appEl); },  tab: 'home', title: 'Leads',    back: null },
    { pattern: '#/lead/:id', handler: function (p) { S().leadDetail(appEl, p); }, tab: 'home', title: 'Lead', back: '#/leads' },

    // Opportunities
    { pattern: '#/opportunities',    handler: function () { S().opportunityList(appEl); },         tab: 'home', title: 'Opportunities', back: '#/home' },
    { pattern: '#/opportunity/:id',  handler: function (p) { S().opportunityDetail(appEl, p); },   tab: 'home', title: 'Opportunity',   back: '#/opportunities' },

    // Quotations
    { pattern: '#/quotations/new', handler: function () { S().quotationNew(appEl); },  tab: 'home', title: 'New Quotation', back: '#/quotations' },
    { pattern: '#/quotations',     handler: function () { S().quotationList(appEl); }, tab: 'home', title: 'Quotations',    back: '#/home' },

    // Sales Orders
    { pattern: '#/sales-orders/new', handler: function () { S().salesOrderNew(appEl); },  tab: 'home', title: 'New Sales Order', back: '#/sales-orders' },
    { pattern: '#/sales-orders',     handler: function () { S().salesOrderList(appEl); }, tab: 'home', title: 'Sales Orders',    back: '#/home' },

    // Delivery Notes
    { pattern: '#/delivery-notes/new', handler: function () { S().deliveryNoteNew(appEl); },  tab: 'home', title: 'New Delivery Note', back: '#/delivery-notes' },
    { pattern: '#/delivery-notes',     handler: function () { S().deliveryNoteList(appEl); }, tab: 'home', title: 'Delivery Notes',    back: '#/home' },

    // Sales Invoices
    { pattern: '#/sales-invoices/new', handler: function () { S().salesInvoiceNew(appEl); },  tab: 'home', title: 'New Invoice', back: '#/sales-invoices' },
    { pattern: '#/sales-invoices',     handler: function () { S().salesInvoiceList(appEl); }, tab: 'home', title: 'Sales Invoices', back: '#/home' },

    // Payments
    { pattern: '#/payments/new', handler: function () { S().paymentNew(appEl); }, tab: 'home', title: 'Record Payment', back: '#/debtors' },

    // Stock
    { pattern: '#/stock/update', handler: function () { S().stockUpdate(appEl); },  tab: 'home', title: 'Add Stock',    back: '#/stock' },
    { pattern: '#/stock',        handler: function () { S().stockList(appEl); },    tab: 'home', title: 'Stock Levels', back: '#/home' },

    // Sales
    { pattern: '#/pipeline',   handler: function () { S().pipeline(appEl); },       tab: 'home', title: 'Pipeline',   back: '#/home' },
    { pattern: '#/targets',    handler: function () { S().myTargets(appEl); },      tab: 'home', title: 'My Targets', back: '#/home' },
    { pattern: '#/sales-targets', handler: function () { S().salesTargets(appEl); }, tab: 'home', title: 'Sales Targets', back: '#/home' },
    { pattern: '#/follow-ups', handler: function () { S().followUps(appEl); },      tab: 'home', title: 'Follow Ups', back: '#/home' },
    { pattern: '#/customers',  handler: function () { S().customerSearch(appEl); }, tab: 'home', title: 'Customers',  back: '#/home' },

    // Customer / Debtors / Revenue
    { pattern: '#/customer/:id', handler: function (p) { S().customerDetail(appEl, p); }, tab: 'home', title: 'Customer',    back: '#/customers' },
    { pattern: '#/customer-timeline/:id', handler: function (p) { S().customerTimeline(appEl, p); }, tab: 'home', title: 'Sales Timeline', back: function(p) { return '#/customer/' + p.id; } },
    { pattern: '#/debtors',      handler: function () { S().debtors(appEl); },            tab: 'home', title: 'Receivables', back: '#/home' },
    { pattern: '#/revenue',      handler: function () { S().revenueDashboard(appEl); },   tab: 'home', title: 'Revenue',     back: '#/home' },

    // Projects
    { pattern: '#/projects',    handler: function () { S().projectList(appEl); },         tab: 'home', title: 'Projects', back: '#/home' },
    { pattern: '#/project/:id', handler: function (p) { S().projectDetail(appEl, p); },   tab: 'home', title: 'Project',  back: '#/projects' },

    // AMC
    { pattern: '#/amc', handler: function () { S().amcTracker(appEl); }, tab: 'home', title: 'AMC Tracker', back: '#/home' },

    // Service
    { pattern: '#/service',          handler: function () { S().serviceDashboard(appEl); },       tab: 'home', title: 'Service',      back: '#/home' },
    { pattern: '#/installations',    handler: function () { S().installationList(appEl); },       tab: 'home', title: 'Installations', back: '#/service' },
    { pattern: '#/installation/:id', handler: function (p) { S().installationDetail(appEl, p); }, tab: 'home', title: 'Installation',  back: '#/installations' },
    { pattern: '#/breakdowns',       handler: function () { S().breakdownList(appEl); },          tab: 'home', title: 'Breakdowns',    back: '#/service' },
    { pattern: '#/breakdown/new',    handler: function () { S().breakdownNew(appEl); },           tab: 'home', title: 'Log Breakdown', back: '#/breakdowns' },
    { pattern: '#/breakdown/:id',    handler: function (p) { S().breakdownDetail(appEl, p); },    tab: 'home', title: 'Breakdown',     back: '#/breakdowns' },

    // Devices
    { pattern: '#/devices/:id', handler: function (p) { S().deviceDetail(appEl, p); }, tab: 'home', title: 'Devices', back: '#/devices' },
    { pattern: '#/devices', handler: function () { S().deviceList(appEl); }, tab: 'home', title: 'Devices', back: '#/home' },

    // Production
    { pattern: '#/production', handler: function () { S().productionDashboard(appEl); }, tab: 'home', title: 'Production', back: '#/home' },
    { pattern: '#/dispatch',   handler: function () { S().dispatchTracker(appEl); },     tab: 'home', title: 'Dispatch',   back: '#/home' },

    // Manager
    { pattern: '#/approvals',            handler: function () { S().approvalsList(appEl); },        tab: 'home', title: 'Approvals', back: null },
    { pattern: '#/approvals/:type/:id',  handler: function (p) { S().approvalDetail(appEl, p); },   tab: 'home', title: 'Approval',  back: '#/approvals' },
    { pattern: '#/team',                 handler: function () { S().teamOverview(appEl); },          tab: 'home', title: 'Team',      back: null },

    // Reports
    { pattern: '#/monthly-report', handler: function () { S().monthlyReport(appEl); }, tab: 'home', title: 'Monthly Report', back: '#/home' },
    { pattern: '#/budget', handler: function () { S().budgetDashboard(appEl); }, tab: 'home', title: 'Budget', back: '#/home' },

    // AI Chat
    { pattern: '#/chat', handler: function () { S().chat(appEl); }, tab: 'chat', title: 'AI Chat', back: null },

    // Profile
    { pattern: '#/profile', handler: function () { S().profile(appEl); }, tab: 'profile', title: 'Profile', back: null }
  ];

  // ─── Route Matching ─────────────────────────────────────────────────

  function matchRoute(hash) {
    if (!hash || hash === '#' || hash === '#/') hash = '#/home';
    // Strip query params for matching (screens read them from location.hash)
    var hashPath = hash.split('?')[0];
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.pattern.indexOf(':') === -1) {
        if (hashPath === r.pattern) return { handler: r.handler, params: {}, tab: r.tab, title: r.title, back: r.back };
      } else {
        var patParts = r.pattern.split('/');
        var hashParts = hashPath.split('/');
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
        if (match) return { handler: r.handler, params: params, tab: r.tab, title: r.title, back: r.back };
      }
    }
    return null;
  }

  // ─── Route Rendering ────────────────────────────────────────────────

  function onRouteChange() {
    var hash = location.hash || '#/home';
    var matched = matchRoute(hash);
    if (!matched) {
      matched = matchRoute('#/home');
      if (!matched) return;
    }

    // Read session synchronously from Auth cache (already loaded at startup)
    var session = Auth.getEmployee();
    if (!session && hash !== '#/login') {
      Auth.getSession().then(function (s) {
        if (!s) { navigate('#/login'); return; }
        _renderRoute(matched, hash);
      });
      return;
    }

    _renderRoute(matched, hash);
  }

  var _lastRouteHash = null;

  function _renderRoute(matched, hash) {
    var headerEl = document.getElementById('app-header');
    var isBack = _navigatingBack;
    _navigatingBack = false;

    // Determine if we should animate (skip for initial load or same-tab root nav)
    var shouldAnimate = _lastRouteHash !== null && _lastRouteHash !== hash;
    _lastRouteHash = hash;

    // ── 1. Snapshot old screen as ghost layer for layered transition ──
    if (shouldAnimate && appEl.firstChild) {
      var ghost = document.createElement('div');
      ghost.className = 'transition-ghost ' + (isBack ? 'ghost-back' : 'ghost-forward');

      // Clone content into ghost
      var children = appEl.childNodes;
      for (var i = 0; i < children.length; i++) {
        ghost.appendChild(children[i].cloneNode(true));
      }
      // Match scroll position and padding
      ghost.style.padding = getComputedStyle(appEl).padding;
      ghost.scrollTop = appEl.scrollTop;

      document.body.appendChild(ghost);

      // Clean up ghost after animation
      ghost.addEventListener('animationend', function () { ghost.remove(); });
      // Safety fallback
      setTimeout(function () { if (ghost.parentNode) ghost.remove(); }, 500);
    }

    // ── 2. Render header with crossfade ──
    headerEl.textContent = '';
    headerEl.classList.remove('header-transition');
    if (shouldAnimate) {
      void headerEl.offsetWidth;
      headerEl.classList.add('header-transition');
    }

    if (matched.back) {
      var backBtn = el('button', { className: 'header-back', 'aria-label': 'Go back', onClick: function () { _navigatingBack = true; location.hash = matched.back; } });
      if (window.icon) backBtn.appendChild(window.icon('back'));
      headerEl.appendChild(backBtn);
    }
    if (matched.title) {
      headerEl.appendChild(el('span', { className: 'header-title', textContent: matched.title, role: 'heading', 'aria-level': '1' }));
    }

    // ── 3. Render content ──
    appEl.textContent = '';
    appEl.scrollTop = 0;
    appEl.style.padding = '';
    appEl.style.display = '';
    appEl.style.flexDirection = '';
    appEl.style.transform = '';
    appEl.style.transition = '';
    appEl.style.position = '';

    // Apply transition class
    appEl.className = '';
    if (shouldAnimate) {
      void appEl.offsetWidth;
      appEl.classList.add(isBack ? 'transition-back' : 'transition-forward');
    }

    // ── 4. Update nav highlight ──
    if (matched.tab !== null) {
      updateNavActive(matched.tab);
    }

    // ── 5. Call screen handler ──
    matched.handler(matched.params);
  }

  // ─── Login Screen (kept here — only screen not in screens/) ────────

  function renderLogin() {
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';

    api.getSession().then(function (session) {
      if (session) { navigate('#/home'); return; }

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
          loginFn = api.apiCall('POST', '/api/method/login', { usr: email, pwd: pass }).then(function (res) {
            if (res.error || res.status >= 400) {
              return api.apiCall('POST', '/api/field/login', { email: email, password: pass });
            }
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
          var saveFn = typeof api.saveSession === 'function' && api.saveSession.length >= 4
            ? api.saveSession(d.employee, d.nav_tier || 'field', d.api_key, d.api_secret)
            : api.saveSession(d.api_key, d.api_secret, d.employee);
          saveFn.then(function () {
            Auth.saveSession(d.employee, d.nav_tier || 'field', d.roles || []).then(function () {
              if (typeof api.ensureApiKeys === 'function') {
                api.ensureApiKeys();
              }
              document.getElementById('app-header').style.display = '';
              document.getElementById('bottom-nav').style.display = '';
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
        el('img', { src: '/files/Dyamic Logo - Colour.png', className: 'login-logo', alt: 'DSPL' }),
        el('h1', { textContent: 'DSPL Field' }),
        el('p', { className: 'login-subtitle', textContent: 'Dynamic Servitech Private Limited' }),
        el('div', { className: 'field-group', style: { width: '100%', maxWidth: '320px' } }, [emailInput]),
        el('div', { className: 'field-group', style: { width: '100%', maxWidth: '320px' } }, [passInput]),
        errorBox,
        el('div', { style: { width: '100%', maxWidth: '320px' } }, [submitBtn]),
        el('div', { className: 'login-footer', textContent: 'Powered by Vaishali' })
      ]);

      appEl.textContent = '';
      appEl.appendChild(form);
    });
  }

  // ─── Startup ───────────────────────────────────────────────────────

  window.addEventListener('hashchange', onRouteChange);

  function _startup() {
    Auth.getSession().then(function (session) {
      if (!session) {
        // Check Frappe cookie before showing login
        var userCookie = document.cookie.match(/user_id=([^;]+)/);
        var userId = userCookie ? decodeURIComponent(userCookie[1]) : null;
        if (userId && userId !== 'Guest') {
          return api.apiCall('GET', '/api/field/session-info').then(function (res) {
            var info = (res.data && (res.data.data || res.data.message)) || {};
            if (info.employee) {
              return Auth.saveSession(info.employee, info.nav_tier || 'field', []).then(function () {
                buildBottomNav();
                dismissSplash();
                navigate('#/home');
              });
            }
            dismissSplash();
            navigate('#/login');
          }).catch(function () { dismissSplash(); navigate('#/login'); });
        }
        dismissSplash();
        navigate('#/login');
        return;
      }

      // Session exists — build nav and route
      buildBottomNav();
      dismissSplash();

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
    });

    if (!navigator.onLine) {
      api.updateOfflineBanner(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _startup);
  } else {
    _startup();
  }

  // ─── Edge-Swipe Back Gesture (iOS-style) ─────────────────────────────

  (function initEdgeSwipe() {
    var EDGE_ZONE = 24;      // px from left edge to trigger
    var TRIGGER_DIST = 80;   // px to swipe before triggering back
    var startX = 0;
    var startY = 0;
    var swiping = false;
    var indicator = null;

    function getCurrentBack() {
      var matched = matchRoute(location.hash || '#/home');
      return matched && matched.back ? matched.back : null;
    }

    function createIndicator() {
      var el = document.createElement('div');
      el.className = 'edge-swipe-indicator';
      document.body.appendChild(el);
      return el;
    }

    appEl.addEventListener('touchstart', function (e) {
      var touch = e.touches[0];
      if (touch.pageX <= EDGE_ZONE && getCurrentBack()) {
        startX = touch.pageX;
        startY = touch.pageY;
        swiping = true;
      }
    }, { passive: true });

    appEl.addEventListener('touchmove', function (e) {
      if (!swiping) return;
      var dx = e.touches[0].pageX - startX;
      var dy = Math.abs(e.touches[0].pageY - startY);

      // Cancel if swiping more vertically than horizontally
      if (dy > dx * 1.2) { swiping = false; return; }

      if (dx > 10) {
        if (!indicator) indicator = createIndicator();
        var progress = Math.min(dx / TRIGGER_DIST, 1);
        indicator.style.opacity = String(progress);
        indicator.style.transform = 'translateY(-50%) scale(' + (0.5 + progress * 0.5) + ')';
      }
    }, { passive: true });

    appEl.addEventListener('touchend', function (e) {
      if (!swiping) return;
      swiping = false;

      var finalX = e.changedTouches[0].pageX;
      var dx = finalX - startX;

      if (indicator) {
        indicator.style.transition = 'all 0.2s ease';
        indicator.style.opacity = '0';
        indicator.style.transform = 'translateY(-50%) scale(0)';
        var ind = indicator;
        setTimeout(function () { ind.remove(); }, 200);
        indicator = null;
      }

      if (dx >= TRIGGER_DIST) {
        var backHash = getCurrentBack();
        if (backHash) {
          _navigatingBack = true;
          location.hash = backHash;
        }
      }

      startX = 0;
      startY = 0;
    }, { passive: true });
  })();

  // ─── Pull-to-Refresh — iOS-style with circular progress ──────────────

  (function initPTR() {
    var THRESHOLD = 70;      // px to pull before triggering
    var MAX_PULL = 120;      // max visual displacement
    var RESISTANCE = 0.45;   // rubber-band resistance factor

    var startY = 0;
    var pulling = false;
    var refreshing = false;
    var ptrEl = null;
    var circleEl = null;
    var arcEl = null;

    // Build the PTR indicator (stays in DOM, hidden above #app via transform)
    function ensurePTR() {
      // If ptrEl was orphaned by a route change, reset references
      if (ptrEl && !ptrEl.parentNode) {
        ptrEl = null; circleEl = null; arcEl = null;
      }
      if (ptrEl) return;
      // SVG circle arc — circumference = 2πr = 2π*8 ≈ 50.3
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      arcEl.setAttribute('cx', '10');
      arcEl.setAttribute('cy', '10');
      arcEl.setAttribute('r', '8');
      arcEl.setAttribute('class', 'ptr-arc');
      arcEl.setAttribute('stroke-dasharray', '0 50.3');
      arcEl.setAttribute('transform', 'rotate(-90 10 10)');
      svg.appendChild(arcEl);

      circleEl = document.createElement('div');
      circleEl.className = 'ptr-circle';
      circleEl.appendChild(svg);

      ptrEl = document.createElement('div');
      ptrEl.className = 'ptr-container';
      ptrEl.appendChild(circleEl);

      // Insert as first child of #app so it scrolls with content area
      appEl.style.position = 'relative';
      appEl.insertBefore(ptrEl, appEl.firstChild);
    }

    function setPullProgress(pullDist) {
      // pullDist is the rubber-banded distance (0 to MAX_PULL)
      var progress = Math.min(pullDist / THRESHOLD, 1);
      var arcLen = progress * 50.3;

      // Move indicator down
      ptrEl.style.transform = 'translateY(' + (pullDist - 48) + 'px)';

      // Fill arc
      arcEl.setAttribute('stroke-dasharray', arcLen + ' 50.3');

      // Rotate arrow as you pull for extra juice
      circleEl.style.transform = 'rotate(' + (progress * 270) + 'deg)';
    }

    function resetPTR(callback) {
      if (!ptrEl) { if (callback) callback(); return; }
      ptrEl.classList.add('ptr-settling');
      ptrEl.style.transform = 'translateY(-48px)';
      appEl.style.transform = '';
      appEl.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';

      setTimeout(function () {
        ptrEl.classList.remove('ptr-settling');
        circleEl.classList.remove('ptr-spinning', 'ptr-done');
        circleEl.style.transform = '';
        arcEl.setAttribute('stroke-dasharray', '0 50.3');
        appEl.style.transition = '';
        if (callback) callback();
      }, 350);
    }

    function doRefresh() {
      refreshing = true;
      circleEl.classList.add('ptr-spinning');
      circleEl.style.transform = '';

      // Suppress staggered content reveal during refresh
      appEl.classList.add('ptr-refreshing');

      // Hold at threshold position during refresh
      ptrEl.style.transform = 'translateY(' + (THRESHOLD * RESISTANCE - 48) + 'px)';
      ptrEl.classList.add('ptr-settling');
      appEl.style.transform = 'translateY(' + (THRESHOLD * RESISTANCE) + 'px)';
      appEl.style.transition = 'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)';

      // Re-invoke current screen handler (no ghost transition)
      var hash = location.hash || '#/home';
      var matched = matchRoute(hash);
      if (!matched) { resetPTR(function () { refreshing = false; appEl.classList.remove('ptr-refreshing'); }); return; }

      // Clear and re-render content only (keep PTR element)
      var children = Array.prototype.slice.call(appEl.childNodes);
      for (var i = 0; i < children.length; i++) {
        if (children[i] !== ptrEl) appEl.removeChild(children[i]);
      }

      // Call screen handler — it will populate appEl
      matched.handler(matched.params);

      // Give the handler time to render + any async fetch
      setTimeout(function () {
        circleEl.classList.remove('ptr-spinning');
        circleEl.classList.add('ptr-done');
        setTimeout(function () {
          resetPTR(function () {
            refreshing = false;
            appEl.classList.remove('ptr-refreshing');
          });
        }, 250);
      }, 600);
    }

    // ── Touch handlers ──

    appEl.addEventListener('touchstart', function (e) {
      if (refreshing) return;
      if (appEl.scrollTop <= 0) {
        startY = e.touches[0].pageY;
        pulling = true;
        ensurePTR();
      }
    }, { passive: true });

    appEl.addEventListener('touchmove', function (e) {
      if (!pulling || refreshing) return;
      var rawDist = e.touches[0].pageY - startY;
      if (rawDist <= 0 || appEl.scrollTop > 0) {
        pulling = false;
        return;
      }

      // Apply rubber-band resistance — diminishing returns past threshold
      var pullDist = rawDist * RESISTANCE;
      if (pullDist > MAX_PULL) pullDist = MAX_PULL;

      setPullProgress(pullDist);

      // Translate content down to follow the pull
      appEl.style.transition = 'none';
      appEl.style.transform = 'translateY(' + pullDist + 'px)';
    }, { passive: true });

    appEl.addEventListener('touchend', function () {
      if (!pulling || refreshing) { pulling = false; return; }
      pulling = false;

      var rawDist = parseFloat(appEl.style.transform.replace(/[^0-9.-]/g, '')) || 0;
      if (rawDist >= THRESHOLD * RESISTANCE) {
        doRefresh();
      } else {
        resetPTR();
      }
      startY = 0;
    }, { passive: true });
  })();

})();
