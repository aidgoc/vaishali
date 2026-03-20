/* app.js — DSPL Field App: route dispatcher + login screen
   All other screens live in screens/*.js and register on window.Screens.
   HTML provides #app-header, #app, #bottom-nav — no dynamic shell creation.
*/
(function () {
  'use strict';

  var api = window.fieldAPI;

  // Use UI.el if available, otherwise inline fallback
  var el = (window.UI && window.UI.el) || function (tag, attrs, children) {
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
  };

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

    // Quotations
    { pattern: '#/quotations/new', handler: function () { S().quotationNew(appEl); },  tab: 'home', title: 'New Quotation', back: '#/quotations' },
    { pattern: '#/quotations',     handler: function () { S().quotationList(appEl); }, tab: 'home', title: 'Quotations',    back: '#/home' },

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

    // Production
    { pattern: '#/production', handler: function () { S().productionDashboard(appEl); }, tab: 'home', title: 'Production', back: '#/home' },
    { pattern: '#/dispatch',   handler: function () { S().dispatchTracker(appEl); },     tab: 'home', title: 'Dispatch',   back: '#/home' },

    // Manager
    { pattern: '#/approvals',            handler: function () { S().approvalsList(appEl); },        tab: 'home', title: 'Approvals', back: null },
    { pattern: '#/approvals/:type/:id',  handler: function (p) { S().approvalDetail(appEl, p); },   tab: 'home', title: 'Approval',  back: '#/approvals' },
    { pattern: '#/team',                 handler: function () { S().teamOverview(appEl); },          tab: 'home', title: 'Team',      back: null },

    // AI Chat
    { pattern: '#/chat', handler: function () { S().chat(appEl); }, tab: 'chat', title: 'AI Chat', back: null },

    // Profile
    { pattern: '#/profile', handler: function () { S().profile(appEl); }, tab: 'profile', title: 'Profile', back: null }
  ];

  // ─── Route Matching ─────────────────────────────────────────────────

  function matchRoute(hash) {
    if (!hash || hash === '#' || hash === '#/') hash = '#/home';
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.pattern.indexOf(':') === -1) {
        if (hash === r.pattern) return { handler: r.handler, params: {}, tab: r.tab, title: r.title, back: r.back };
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

  function _renderRoute(matched, hash) {
    // 1. Render header
    var headerEl = document.getElementById('app-header');
    headerEl.textContent = '';
    if (matched.back) {
      var backBtn = el('button', { className: 'header-back', 'aria-label': 'Go back', onClick: function () { _navigatingBack = true; location.hash = matched.back; } });
      if (window.icon) backBtn.appendChild(window.icon('back'));
      headerEl.appendChild(backBtn);
    }
    if (matched.title) {
      headerEl.appendChild(el('span', { className: 'header-title', textContent: matched.title, role: 'heading', 'aria-level': '1' }));
    }

    // 2. Render content — reset any screen-specific overrides (e.g. chat layout)
    appEl.textContent = '';
    appEl.scrollTop = 0;
    appEl.style.padding = '';
    appEl.style.display = '';
    appEl.style.flexDirection = '';

    // 2a. Apply slide transition
    appEl.className = '';
    void appEl.offsetWidth; // force reflow
    appEl.classList.add(_navigatingBack ? 'transition-back' : 'transition-forward');
    _navigatingBack = false;

    // 3. Update nav highlight
    if (matched.tab !== null) {
      updateNavActive(matched.tab);
    }

    // 4. Call screen handler
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
              return api.saveSession(info.employee, info.nav_tier).then(function () {
                Auth.setEmployee(info.employee);
                Auth.setNavTier(info.nav_tier);
                buildBottomNav();
                navigate('#/home');
              });
            }
            navigate('#/login');
          }).catch(function () { navigate('#/login'); });
        }
        navigate('#/login');
        return;
      }

      // Session exists — build nav and route
      buildBottomNav();

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

  // Pull-to-refresh
  (function initPTR() {
    var startY = 0;
    var pulling = false;
    var indicator = null;

    appEl.addEventListener('touchstart', function(e) {
      if (appEl.scrollTop <= 0) {
        startY = e.touches[0].pageY;
        pulling = true;
      }
    }, { passive: true });

    appEl.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      var diff = e.touches[0].pageY - startY;
      if (diff > 60 && appEl.scrollTop <= 0) {
        if (!indicator) {
          var spinner = document.createElement('div');
          spinner.className = 'ptr-spinner';
          indicator = document.createElement('div');
          indicator.className = 'ptr-indicator visible';
          indicator.appendChild(spinner);
          indicator.appendChild(document.createTextNode('Refreshing...'));
          appEl.insertBefore(indicator, appEl.firstChild);
        }
      }
    }, { passive: true });

    appEl.addEventListener('touchend', function() {
      if (indicator) {
        // Re-trigger current route
        setTimeout(function() {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
          indicator = null;
          // Re-navigate to same hash to refresh
          onRouteChange();
        }, 300);
      }
      pulling = false;
      startY = 0;
    }, { passive: true });
  })();

})();
