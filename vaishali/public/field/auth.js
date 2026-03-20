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
    dispatch: 'all'
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
    return window.fieldAPI.idbPut('session', { id: 'current' }).then(function () {
      location.hash = '#/login';
      location.reload();
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
    canAccess: canAccess,
    getNavTabs: getNavTabs
  };
})();
