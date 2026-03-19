/* Router — hash-based SPA router with param parsing and route guards
   Depends on: Auth (getSession, canAccess), UI (updateNavActive, error, nav)
*/
;(function () {
  'use strict';

  var _routes = [];
  var _appEl = null;

  function _parsePattern(pattern) {
    var paramNames = [];
    var regexStr = pattern.replace(/:[^/]+/g, function (match) {
      paramNames.push(match.slice(1));
      return '([^/]+)';
    });
    // Escape any remaining special regex chars except the groups we inserted
    // The pattern parts outside params are literal hash paths, safe as-is
    return { regex: new RegExp('^' + regexStr + '$'), paramNames: paramNames };
  }

  function register(pattern, handler, opts) {
    opts = opts || {};
    if (typeof opts.requiresAuth === 'undefined') {
      opts.requiresAuth = true;
    }
    var parsed = _parsePattern(pattern);
    _routes.push({
      pattern: pattern,
      regex: parsed.regex,
      paramNames: parsed.paramNames,
      handler: handler,
      opts: opts
    });
  }

  async function _route() {
    if (!_appEl) return; // not started yet
    var hash = location.hash || '#/home';
    if (hash === '#' || hash === '#/') hash = '#/home';

    for (var i = 0; i < _routes.length; i++) {
      var route = _routes[i];
      var match = hash.match(route.regex);
      if (!match) continue;

      // Extract params
      var params = {};
      for (var j = 0; j < route.paramNames.length; j++) {
        params[route.paramNames[j]] = decodeURIComponent(match[j + 1]);
      }

      // Auth check
      if (route.opts.requiresAuth) {
        var session = await Auth.getSession();
        if (!session) {
          location.hash = '#/login';
          return;
        }
      }

      // Custom guard
      if (route.opts.guard) {
        var allowed = route.opts.guard(params);
        if (!allowed) {
          location.hash = '#/home';
          return;
        }
      }

      // Screen-level access check
      if (route.opts.screenName) {
        if (!Auth.canAccess(route.opts.screenName)) {
          _appEl.textContent = '';
          UI.error('Access denied');
          return;
        }
      }

      // Render
      _appEl.textContent = '';
      route.handler(_appEl, params);
      UI.updateNavActive(route.opts.tab || '');
      return;
    }

    // No match
    _appEl.textContent = '';
    UI.error('Page not found');
  }

  function start(appElId) {
    _appEl = document.getElementById(appElId);
    window.addEventListener('hashchange', function () { _route().catch(function (e) { console.error('[Router]', e); }); });

    if (!location.hash || location.hash === '#' || location.hash === '#/') {
      location.hash = '#/home';
    } else {
      _route();
    }
  }

  function navigate(hash) {
    location.hash = hash;
  }

  function getAppEl() {
    return _appEl;
  }

  function getCurrentHash() {
    return location.hash;
  }

  window.Router = {
    register: register,
    start: start,
    navigate: navigate,
    getAppEl: getAppEl,
    getCurrentHash: getCurrentHash
  };
})();
