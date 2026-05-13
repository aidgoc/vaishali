(function () {
  'use strict';

  var _session = null;

  var SCREEN_ACCESS = {
    home: 'all', attendance: 'all', profile: 'all', chat: 'all',
    hr: 'all', leave: 'all', 'leave-apply': 'all', 'leave-detail': 'all',
    expense: 'all', 'expense-new': 'all', 'expense-detail': 'all',
    advance: 'all', 'advance-new': 'all', 'advance-detail': 'all',
    salary: 'all', 'salary-detail': 'all',
    leads: 'all', 'lead-new': 'all',
    visits: 'all', 'visit-new': 'all', 'visit-detail': 'all',
    projects: 'all', 'project-detail': 'all',
    amc: 'manager',
    approvals: 'manager', 'approval-detail': 'manager',
    team: 'manager', 'team-detail': 'manager',
    quotations: 'all', 'quotation-new': 'all', 'quotation-detail': 'all',
    stock: 'all', 'stock-update': 'all',
    'sales-orders': 'admin', 'sales-order-detail': 'admin',
    pipeline: 'manager',
    targets: 'all',
    'sales-targets': 'all',
    'follow-ups': 'all',
    customers: 'all',
    'customer-detail': 'all',
    debtors: 'manager',
    revenue: 'manager',
    service: 'all',
    installations: 'all',
    'installation-detail': 'all',
    breakdowns: 'all',
    'breakdown-new': 'all',
    'breakdown-detail': 'all',
    production: 'all',
    dispatch: 'all',
    'monthly-report': 'manager'
  };

  var FIELD_TABS = [
    { tab: 'home', ic: 'home', label: 'Home', hash: '#/home' },
    { tab: 'visits', ic: 'clip', label: 'Visits', hash: '#/dcr' },
    { tab: 'chat', ic: 'bot', label: 'AI', hash: '#/chat' },
    { tab: 'profile', ic: 'user', label: 'Profile', hash: '#/profile' }
  ];

  var MANAGER_TABS = [
    { tab: 'home', ic: 'home', label: 'Home', hash: '#/home' },
    { tab: 'approvals', ic: 'check', label: 'Approvals', hash: '#/approvals' },
    { tab: 'chat', ic: 'bot', label: 'AI', hash: '#/chat' },
    { tab: 'team', ic: 'users', label: 'Team', hash: '#/team' },
    { tab: 'profile', ic: 'user', label: 'Profile', hash: '#/profile' }
  ];

  function saveSession(employee, navTier, roles) {
    // Merge into existing session to preserve api_key/api_secret from api.js
    return getSession().then(function (existing) {
      var session = existing || { id: 'current' };
      session.id = 'current';
      session.employee = employee;
      session.nav_tier = navTier;
      session.roles = roles || [];
      session.logged_in_at = Date.now();
      _session = session;
      return window.fieldAPI.idbPut('session', session);
    });
  }

  function getSession() {
    if (_session) {
      return Promise.resolve(_session);
    }
    return window.fieldAPI.idbGet('session', 'current').then(function (session) {
      if (session) {
        _session = session;
      }
      return session || null;
    });
  }

  function clearSession() {
    _session = null;
    // Tell Frappe to invalidate the server-side session and clear the
    // sid / user_id cookies. Without this, _startup() reads user_id
    // from the surviving cookie, calls /api/field/session-info, and
    // silently re-creates a session — user ends up bounced back to
    // home instead of the login screen.
    var logoutCall = (window.fieldAPI && window.fieldAPI.apiCall)
      ? window.fieldAPI.apiCall('POST', '/api/method/logout').catch(function () { /* swallow */ })
      : fetch('/api/method/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {});
    return Promise.resolve(logoutCall).then(function () {
      // Best-effort cookie nuke (defends against Frappe leaving stragglers
      // or returning a 4xx that skipped its own cookie clearing).
      ['sid', 'user_id', 'user_image', 'full_name', 'system_user', 'csrf_token']
        .forEach(function (n) {
          document.cookie = n + '=; Max-Age=0; path=/;';
          document.cookie = n + '=; Max-Age=0; path=/api;';
        });
      // Actually delete the IDB row. idbPut({id:'current'}) writes a truthy
      // shell that fools getSession() on next boot → _startup sees a non-null
      // session and skips the login check, trapping the user on home.
      return window.fieldAPI.idbDelete
        ? window.fieldAPI.idbDelete('session', 'current')
        : window.fieldAPI.clearSession();
    }).then(function () {
      // Use replace + full reload so the SW re-bootstraps from a clean slate.
      // location.hash before reload guarantees the next boot sees #/login.
      location.replace('/field#/login');
      // Belt-and-braces: some browsers ignore replace-then-reload in PWA mode
      setTimeout(function () { location.reload(); }, 50);
    });
  }

  function getEmployee() {
    return _session ? _session.employee : null;
  }

  function getNavTier() {
    return _session ? _session.nav_tier || 'field' : 'field';
  }

  function isManager() {
    var tier = getNavTier();
    return tier === 'manager' || tier === 'admin';
  }

  function isAdmin() {
    return getNavTier() === 'admin';
  }

  function hasRole(roleName) {
    if (!_session || !_session.roles) return false;
    return _session.roles.indexOf(roleName) !== -1;
  }

  // Synchronously update cached roles so checks after a mid-session
  // role grant (e.g. 'DSPL Director') reflect the change immediately.
  // The async IDB write is fire-and-forget — _session is the source of
  // truth for hasRole().
  function refreshRoles(roles) {
    if (!_session) return;
    _session.roles = Array.isArray(roles) ? roles : [];
    if (window.fieldAPI && window.fieldAPI.idbPut) {
      window.fieldAPI.idbPut('session', _session);
    }
  }

  // Merge fresh employee fields into the cached object so reads via
  // Auth.getEmployee() see new server-side fields (company_abbr,
  // default_company, etc.) without requiring a logout.
  function refreshEmployee(employee) {
    if (!_session || !employee) return;
    var existing = _session.employee || {};
    var merged = {};
    Object.keys(existing).forEach(function (k) { merged[k] = existing[k]; });
    Object.keys(employee).forEach(function (k) { merged[k] = employee[k]; });
    _session.employee = merged;
    if (window.fieldAPI && window.fieldAPI.idbPut) {
      window.fieldAPI.idbPut('session', _session);
    }
  }

  function canAccess(screenName) {
    var level = SCREEN_ACCESS[screenName];
    if (!level) return false;
    if (level === 'all') return true;
    if (level === 'manager') return isManager();
    if (level === 'admin') return isAdmin();
    return false;
  }

  function getNavTabs() {
    var tier = getNavTier();
    if (tier === 'manager' || tier === 'admin') {
      return MANAGER_TABS;
    }
    return FIELD_TABS;
  }

  window.Auth = {
    saveSession: saveSession,
    getSession: getSession,
    clearSession: clearSession,
    getEmployee: getEmployee,
    getNavTier: getNavTier,
    isManager: isManager,
    isAdmin: isAdmin,
    hasRole: hasRole,
    refreshRoles: refreshRoles,
    refreshEmployee: refreshEmployee,
    canAccess: canAccess,
    getNavTabs: getNavTabs
  };
})();
