/* api.js — DSPL Field App: IndexedDB, offline queue, GPS, sync, API client */
/* eslint-disable no-unused-vars */
(function () {
  'use strict';

  var DB_NAME = 'dspl-field';
  var DB_VERSION = 1;
  var API_TIMEOUT = 15000;

  // ─── IndexedDB setup ──────────────────────────────────────────────

  var _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('outbox')) {
          var outbox = db.createObjectStore('outbox', { keyPath: 'id' });
          outbox.createIndex('status', 'status', { unique: false });
          outbox.createIndex('queued_at', 'queued_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('cache')) {
          var cache = db.createObjectStore('cache', { keyPath: 'key' });
          cache.createIndex('updated_at', 'updated_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('local_dcrs')) {
          var dcrs = db.createObjectStore('local_dcrs', { keyPath: 'id' });
          dcrs.createIndex('date', 'date', { unique: false });
          dcrs.createIndex('status', 'status', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return _dbPromise;
  }

  function idbPut(store, data) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        var s = tx.objectStore(store);
        var req = s.put(data);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGet(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var s = tx.objectStore(store);
        var req = s.get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetAll(store) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var s = tx.objectStore(store);
        var req = s.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbDelete(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        var s = tx.objectStore(store);
        var req = s.delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbGetByIndex(store, indexName, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var s = tx.objectStore(store);
        var idx = s.index(indexName);
        var req = idx.getAll(value);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // ─── Session ───────────────────────────────────────────────────────

  function saveSession(apiKey, apiSecret, employee) {
    return idbPut('session', {
      id: 'current',
      api_key: apiKey,
      api_secret: apiSecret,
      employee: employee,
      saved_at: Date.now()
    });
  }

  function getSession() {
    return idbGet('session', 'current');
  }

  function clearSession() {
    return idbDelete('session', 'current');
  }

  function getAuthHeader(session) {
    if (!session || !session.api_key || !session.api_secret) return null;
    return 'token ' + session.api_key + ':' + session.api_secret;
  }

  // ─── Cache ─────────────────────────────────────────────────────────

  function cacheSet(key, data, ttlMs) {
    var entry = {
      key: key,
      data: data,
      updated_at: Date.now(),
      expires_at: ttlMs ? Date.now() + ttlMs : null
    };
    return idbPut('cache', entry);
  }

  function cacheGet(key) {
    return idbGet('cache', key).then(function (entry) {
      if (!entry) return null;
      if (entry.expires_at && Date.now() > entry.expires_at) {
        idbDelete('cache', key);
        return null;
      }
      return entry.data;
    });
  }

  // ─── Outbox ────────────────────────────────────────────────────────

  function addToOutbox(type, data, idempotencyKey) {
    var entry = {
      id: generateId(),
      type: type,
      data: data,
      idempotency_key: idempotencyKey || generateId(),
      status: 'pending',
      retries: 0,
      queued_at: Date.now(),
      updated_at: Date.now()
    };
    return idbPut('outbox', entry).then(function () {
      updatePendingBadge();
      return entry;
    });
  }

  function getPendingOutbox() {
    return idbGetByIndex('outbox', 'status', 'pending').then(function (items) {
      return items.sort(function (a, b) { return a.queued_at - b.queued_at; });
    });
  }

  function getOutboxCount() {
    return idbGetByIndex('outbox', 'status', 'pending').then(function (items) {
      return items.length;
    });
  }

  function updateOutboxEntry(id, updates) {
    return idbGet('outbox', id).then(function (entry) {
      if (!entry) return null;
      for (var k in updates) {
        if (updates.hasOwnProperty(k)) entry[k] = updates[k];
      }
      entry.updated_at = Date.now();
      return idbPut('outbox', entry).then(function () { return entry; });
    });
  }

  // ─── Local DCRs ────────────────────────────────────────────────────

  function saveLocalDCR(data) {
    if (!data.id) data.id = generateId();
    data.updated_at = Date.now();
    return idbPut('local_dcrs', data).then(function () { return data; });
  }

  function getLocalDCRs(date) {
    if (date) {
      return idbGetByIndex('local_dcrs', 'date', date);
    }
    return idbGetAll('local_dcrs');
  }

  function updateLocalDCR(id, updates) {
    return idbGet('local_dcrs', id).then(function (entry) {
      if (!entry) return null;
      for (var k in updates) {
        if (updates.hasOwnProperty(k)) entry[k] = updates[k];
      }
      entry.updated_at = Date.now();
      return idbPut('local_dcrs', entry).then(function () { return entry; });
    });
  }

  // ─── Error reporter ────────────────────────────────────────────────

  var _reportingError = false;

  function reportError(payload) {
    if (_reportingError) return;  // avoid recursive loops if reporter itself fails
    _reportingError = true;
    try {
      var p = payload || {};
      var body = JSON.stringify({
        message: String(p.message || '').slice(0, 1000),
        source: String(p.source || '').slice(0, 200),
        screen: String(p.screen || (location.hash || '').slice(0, 200)),
        route: String(p.route || (location.hash || '').slice(0, 200)),
        stack: String(p.stack || '').slice(0, 4000),
        user_agent: String(navigator.userAgent || '').slice(0, 200)
      });
      var csrf = (typeof frappe !== 'undefined' && frappe.csrf_token) || null;
      if (!csrf) {
        var match = document.cookie.match(/csrf_token=([^;]+)/);
        if (match) csrf = decodeURIComponent(match[1]);
      }
      var headers = { 'Content-Type': 'application/json' };
      if (csrf) headers['X-Frappe-CSRF-Token'] = csrf;
      fetch('/api/method/vaishali.api.client_log.log_client_error', {
        method: 'POST', credentials: 'same-origin', headers: headers, body: body, keepalive: true
      }).catch(function () { /* swallow */ });
    } catch (_) { /* swallow */ }
    finally { setTimeout(function () { _reportingError = false; }, 1000); }
  }

  // Universal "this response means session expired" detector.
  // Catches both the JSON shape Frappe returns on 403 (HTML "is not whitelisted"
  // body) and the new 401 we raise from auth_guard.
  function isSessionExpiredResponse(res) {
    if (!res) return false;
    if (res.status === 401) return true;
    if (res.status !== 403) return false;
    try {
      var blob = JSON.stringify(res.data || {});
      return blob.indexOf('is not whitelisted') !== -1 || blob.indexOf('Login to access') !== -1;
    } catch (_) { return false; }
  }

  // Pulls a human-readable message out of an apiCall result. Replaces the
  // copy-pasted helper that lived in attendance.js / others.
  function extractError(res) {
    if (!res) return 'Server error';
    if (isSessionExpiredResponse(res)) return 'Session expired';
    if (res.error) return res.error;
    var d = res.data;
    if (!d) return 'Server error';
    if (d._server_messages) {
      try {
        var msgs = JSON.parse(d._server_messages);
        var first = JSON.parse(msgs[0]);
        var msg = first.message || first;
        if (typeof msg === 'string') {
          if (msg.indexOf('is not whitelisted') !== -1 || msg.indexOf('Login to access') !== -1) {
            return 'Session expired';
          }
          // strip <details>/<summary>/<strong> tags so the toast reads cleanly even on legacy bodies
          return msg.replace(/<\/?(?:details|summary|strong|p|br)[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
        }
        return String(msg);
      } catch (_) { /* fall through */ }
    }
    if (d.exc_type) return d.exc_type.replace(/Error$/, '') + ' error';
    if (d.exception) return 'Server error';
    return 'Server error';
  }

  window.addEventListener('error', function (e) {
    reportError({
      message: (e && e.message) || 'window.error',
      source: 'window.onerror',
      stack: e && e.error && e.error.stack
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    reportError({
      message: (reason && reason.message) || String(reason || 'unhandledrejection'),
      source: 'unhandledrejection',
      stack: reason && reason.stack
    });
  });

  // ─── API Client ────────────────────────────────────────────────────

  // Concurrent 401/403 guard: chat fires loadHistory() + loadCommands() in
  // parallel on screen render; both could hit 401 and stack up two clearSession
  // + reload pairs, killing in-flight requests and looking like the chat hung.
  // First-to-fire wins; the rest just return a Session-expired result.
  var _redirectingToLogin = false;
  function redirectToLogin() {
    if (_redirectingToLogin) return;
    _redirectingToLogin = true;
    clearSession().then(function () {
      // location.replace avoids stacking a /login entry on top of #/chat in
      // history (back-button would otherwise drop the user onto a stale chat).
      location.replace('/field#/login');
    });
  }

  function apiCall(method, path, body, options) {
    options = options || {};
    var timeout = options.timeout || API_TIMEOUT;
    var origMethod = method;
    var origPath = path;

    return getSession().then(function (session) {
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

      // For Frappe native: use cookie auth + CSRF token
      // Check if we have API key (tunnel mode) or use cookies (Frappe mode)
      var auth = getAuthHeader(session);
      if (auth) {
        headers['Authorization'] = auth;
      } else if (method !== 'GET') {
        // Frappe cookie auth — add CSRF token for mutations
        var csrf = (typeof frappe !== 'undefined' && frappe.csrf_token) ? frappe.csrf_token : null;
        if (!csrf) {
          var match = document.cookie.match(/csrf_token=([^;]+)/);
          if (match) csrf = decodeURIComponent(match[1]);
        }
        if (csrf) headers['X-Frappe-CSRF-Token'] = csrf;
      }

      // ─── Path translation: /api/field/* → Frappe method paths ───
      // Translate /api/field/view/* to Frappe method path
      if (path.indexOf('/api/field/view/') === 0) {
        var viewParts = path.replace('/api/field/view/', '').split('/');
        var viewName = viewParts[0];
        var contextId = viewParts[1] || '';
        path = '/api/method/vaishali.api.views.get_view?view_name=' + encodeURIComponent(viewName);
        if (contextId) path += '&context_id=' + encodeURIComponent(contextId);
        method = 'GET'; // Views are always GET
      }

      // Translate /api/field/* to Frappe method paths
      if (path === '/api/field/attendance/today') path = '/api/method/vaishali.api.field.attendance_today';
      else if (path === '/api/field/attendance' && method === 'POST') path = '/api/method/vaishali.api.field.create_checkin';
      else if (path === '/api/field/me') path = '/api/method/vaishali.api.field.get_me';
      else if (path === '/api/field/nav-tier') path = '/api/method/vaishali.api.field.get_nav_tier';
      else if (path === '/api/field/session-info') path = '/api/method/vaishali.api.field.get_session_info';
      else if (path === '/api/field/conversion-funnel' || path.indexOf('/api/field/conversion-funnel?') === 0) {
        var cfQS = ''; var cfQI = path.indexOf('?'); if (cfQI !== -1) cfQS = path.substring(cfQI); path = '/api/method/vaishali.api.field.get_conversion_funnel' + cfQS;
      }
      else if (path.match(/^\/api\/field\/customer-timeline\/[^/]+$/)) {
        var ctId = path.replace('/api/field/customer-timeline/', '');
        path = '/api/method/vaishali.api.field.get_customer_timeline?customer_id=' + encodeURIComponent(ctId);
      }
      else if (path === '/api/field/customers' || path.indexOf('/api/field/customers?') === 0) {
        var custQS = '';
        var custQIdx = path.indexOf('?');
        if (custQIdx !== -1) custQS = path.substring(custQIdx);
        path = '/api/method/vaishali.api.field.get_customers' + custQS;
      }
      else if (path === '/api/field/leads' || path.indexOf('/api/field/leads?') === 0) {
        var leadQS = '';
        var leadQIdx = path.indexOf('?');
        if (leadQIdx !== -1) leadQS = path.substring(leadQIdx);
        path = '/api/method/vaishali.api.field.get_leads' + leadQS;
      }
      else if (path === '/api/field/lead-sources') path = '/api/method/vaishali.api.field.get_lead_sources';
      else if (path === '/api/field/lead' && method === 'POST') path = '/api/method/vaishali.api.field.create_lead';
      else if (path.match(/^\/api\/field\/customer-open-items/)) {
        var coiQS = ''; var coiQI = path.indexOf('?'); if (coiQI !== -1) coiQS = path.substring(coiQI);
        path = '/api/method/vaishali.api.field.get_customer_open_items' + coiQS;
      }
      else if (path === '/api/field/opportunities' || path.indexOf('/api/field/opportunities?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_opportunity_from_lead';
        } else {
          var oppQS = ''; var oppQI = path.indexOf('?'); if (oppQI !== -1) oppQS = path.substring(oppQI);
          path = '/api/method/vaishali.api.field.get_opportunities' + oppQS;
        }
      }
      else if (path.match(/^\/api\/field\/opportunity\/[^/]+$/)) {
        var oppId = path.replace('/api/field/opportunity/', '');
        path = '/api/method/vaishali.api.field.get_opportunity?name=' + encodeURIComponent(oppId);
      }
      else if (path === '/api/field/quotations' || path.indexOf('/api/field/quotations?') === 0) {
        if (method === 'POST') { path = '/api/method/vaishali.api.field.create_quotation'; }
        else { var qQS = ''; var qQI = path.indexOf('?'); if (qQI !== -1) qQS = path.substring(qQI); path = '/api/method/vaishali.api.field.get_my_quotations' + qQS; }
      }
      else if (path === '/api/field/items' || path.indexOf('/api/field/items?') === 0) {
        var iQS = ''; var iQI = path.indexOf('?'); if (iQI !== -1) iQS = path.substring(iQI); path = '/api/method/vaishali.api.field.get_items' + iQS;
      }
      else if (path === '/api/field/stock/warehouses') path = '/api/method/vaishali.api.field.get_warehouses';
      else if (path === '/api/field/stock/entry' && method === 'POST') path = '/api/method/vaishali.api.field.create_stock_entry';
      else if (path === '/api/field/stock/items' || path.indexOf('/api/field/stock/items?') === 0) {
        var siQS = ''; var siQI = path.indexOf('?'); if (siQI !== -1) siQS = path.substring(siQI); path = '/api/method/vaishali.api.field.get_stock_items' + siQS;
      }
      else if (path === '/api/field/stock' || path.indexOf('/api/field/stock?') === 0) {
        var sQS = ''; var sQI = path.indexOf('?'); if (sQI !== -1) sQS = path.substring(sQI); path = '/api/method/vaishali.api.field.get_stock_items' + sQS;
      }
      else if (path === '/api/field/warehouses') path = '/api/method/vaishali.api.field.get_warehouses';
      else if (path === '/api/field/stats') path = '/api/method/vaishali.api.field.get_stats';
      else if (path === '/api/field/team') path = '/api/method/vaishali.api.field.get_team';
      else if (path === '/api/field/approvals') path = '/api/method/vaishali.api.field.get_approvals';
      else if (path.match(/^\/api\/field\/approvals\/[^/]+\/[^/]+\/(approve|reject)$/)) {
        var apParts = path.replace('/api/field/approvals/', '').split('/');
        body = body || {};
        body.doctype = decodeURIComponent(apParts[0]);
        body.name = decodeURIComponent(apParts[1]);
        body.action = apParts[2];
        path = '/api/method/vaishali.api.field.process_approval';
      }
      else if (path.match(/^\/api\/field\/dcr\/[^/]+\/checkout$/)) {
        var coId = path.replace('/api/field/dcr/', '').replace('/checkout', '');
        body = body || {};
        body.dcr_id = decodeURIComponent(coId);
        path = '/api/method/vaishali.api.field.checkout_dcr';
        method = 'POST'; // server endpoint is POST-only
      }
      else if (path.match(/^\/api\/field\/dcr\/[^/]+$/)) {
        var dcrId = path.replace('/api/field/dcr/', '');
        if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
          body = body || {};
          body.dcr_id = decodeURIComponent(dcrId);
          path = '/api/method/vaishali.api.field.update_dcr';
          method = 'POST';
        } else {
          path = '/api/method/vaishali.api.field.get_dcr?dcr_id=' + encodeURIComponent(dcrId);
        }
      }
      else if (path === '/api/field/dcr' || path.indexOf('/api/field/dcr?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_dcr';
        } else {
          // Parse query params from original path and map to get_dcrs param names
          var dcrQS = '';
          var dcrQIdx = path.indexOf('?');
          if (dcrQIdx !== -1) {
            var dcrParams = new URLSearchParams(path.substring(dcrQIdx + 1));
            var mappedParams = [];
            if (dcrParams.get('date')) mappedParams.push('date_filter=' + encodeURIComponent(dcrParams.get('date')));
            if (dcrParams.get('from_date')) mappedParams.push('start_date=' + encodeURIComponent(dcrParams.get('from_date')));
            if (dcrParams.get('to_date')) mappedParams.push('end_date=' + encodeURIComponent(dcrParams.get('to_date')));
            if (dcrParams.get('department')) mappedParams.push('department=' + encodeURIComponent(dcrParams.get('department')));
            if (mappedParams.length) dcrQS = '?' + mappedParams.join('&');
          }
          path = '/api/method/vaishali.api.field.get_dcrs' + dcrQS;
        }
      }
      else if (path.indexOf('/api/field/chat') === 0) {
        if (method === 'POST') path = '/api/method/vaishali.api.chat.send_message';
        else if (method === 'DELETE') path = '/api/method/vaishali.api.chat.clear_history';
        else path = '/api/method/vaishali.api.chat.get_history';
      }
      else if (path === '/api/field/leave-balance') path = '/api/method/vaishali.api.field.get_leave_balance';
      else if (path === '/api/field/pending-expenses') path = '/api/method/vaishali.api.field.get_pending_expenses';
      else if (path === '/api/field/expense-claim-types') path = '/api/method/vaishali.api.field.get_expense_claim_types';
      else if (path === '/api/field/modes-of-payment') path = '/api/method/vaishali.api.field.get_modes_of_payment';
      else if (path === '/api/field/expense' && method === 'POST') {
        path = '/api/method/vaishali.api.field.submit_expense_claim';
      }
      else if (path.match(/^\/api\/field\/expense\/[^/]+$/)) {
        var exId = decodeURIComponent(path.replace('/api/field/expense/', ''));
        if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
          body = body || {}; body.name = exId;
          path = '/api/method/vaishali.api.field.update_expense_claim';
          method = 'POST';
        } else if (method === 'DELETE') {
          body = body || {}; body.name = exId;
          path = '/api/method/vaishali.api.field.cancel_expense_claim';
          method = 'POST';
        }
      }
      else if (path === '/api/field/advance' && method === 'POST') {
        path = '/api/method/vaishali.api.field.submit_advance_request';
      }
      else if (path.match(/^\/api\/field\/advance\/[^/]+$/)) {
        var adId = decodeURIComponent(path.replace('/api/field/advance/', ''));
        if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
          body = body || {}; body.name = adId;
          path = '/api/method/vaishali.api.field.update_advance_request';
          method = 'POST';
        } else if (method === 'DELETE') {
          body = body || {}; body.name = adId;
          path = '/api/method/vaishali.api.field.cancel_advance_request';
          method = 'POST';
        }
      }
      else if (path === '/api/field/holidays') path = '/api/method/vaishali.api.field.get_upcoming_holidays';
      else if (path === '/api/field/login') path = '/api/method/login';
      else if (path === '/api/field/sales-targets') path = '/api/method/vaishali.api.field.get_sales_targets';
      else if (path === '/api/field/my-performance') path = '/api/method/vaishali.api.field.get_my_sales_performance';
      else if (path === '/api/field/sales-funnel') path = '/api/method/vaishali.api.field.get_sales_funnel';
      else if (path === '/api/field/monthly-report') path = '/api/method/vaishali.api.field.get_monthly_report';
      else if (path === '/api/field/budget-summary' || path.indexOf('/api/field/budget-summary?') === 0) {
        var bsQS = ''; var bsQI = path.indexOf('?'); if (bsQI !== -1) bsQS = path.substring(bsQI);
        path = '/api/method/vaishali.api.field.get_budget_summary' + bsQS;
      }
      else if (path === '/api/field/budget-detail' || path.indexOf('/api/field/budget-detail?') === 0) {
        var bdQS = ''; var bdQI = path.indexOf('?'); if (bdQI !== -1) bdQS = path.substring(bdQI);
        path = '/api/method/vaishali.api.field.get_budget_detail' + bdQS;
      }
      else if (path === '/api/field/budget' && method === 'POST') {
        path = '/api/method/vaishali.api.field.set_budget';
      }
      else if (path === '/api/field/devices' || path.indexOf('/api/field/devices?') === 0) {
        var eqQS = ''; var eqQI = path.indexOf('?'); if (eqQI !== -1) eqQS = path.substring(eqQI);
        path = '/api/method/vaishali.api.field.get_devices' + eqQS;
      }
      // Sales cycle endpoints
      else if (path === '/api/field/sales-orders' || path.indexOf('/api/field/sales-orders?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_sales_order_from_quotation';
        } else {
          var soQS = ''; var soQI = path.indexOf('?'); if (soQI !== -1) soQS = path.substring(soQI);
          path = '/api/method/vaishali.api.field.get_sales_orders' + soQS;
        }
      }
      else if (path === '/api/field/submitted-quotations') path = '/api/method/vaishali.api.field.get_submitted_quotations';
      else if (path === '/api/field/delivery-notes' || path.indexOf('/api/field/delivery-notes?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_delivery_note_from_so';
        } else {
          var dnQS = ''; var dnQI = path.indexOf('?'); if (dnQI !== -1) dnQS = path.substring(dnQI);
          path = '/api/method/vaishali.api.field.get_delivery_notes' + dnQS;
        }
      }
      else if (path === '/api/field/pending-delivery-orders') path = '/api/method/vaishali.api.field.get_pending_delivery_orders';
      else if (path === '/api/field/sales-invoices' || path.indexOf('/api/field/sales-invoices?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_sales_invoice';
        } else {
          var siQS = ''; var siQI = path.indexOf('?'); if (siQI !== -1) siQS = path.substring(siQI);
          path = '/api/method/vaishali.api.field.get_sales_invoices' + siQS;
        }
      }
      else if (path === '/api/field/billable-documents') path = '/api/method/vaishali.api.field.get_billable_documents';
      else if (path === '/api/field/unpaid-invoices') path = '/api/method/vaishali.api.field.get_unpaid_invoices';
      else if (path === '/api/field/payments' && method === 'POST') path = '/api/method/vaishali.api.field.create_payment_entry';

      // Sales Interactions
      else if (path === '/api/field/interactions' || path.indexOf('/api/field/interactions?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_interaction';
        } else {
          var intQS = ''; var intQI = path.indexOf('?'); if (intQI !== -1) intQS = path.substring(intQI);
          path = '/api/method/vaishali.api.field.get_interactions' + intQS;
        }
      }
      else if (path.match(/^\/api\/field\/interaction\/[^/]+$/)) {
        var intId = path.replace('/api/field/interaction/', '');
        path = '/api/method/vaishali.api.field.get_interaction?interaction_id=' + encodeURIComponent(intId);
      }

      // Service Calls
      else if (path === '/api/field/service-calls' || path.indexOf('/api/field/service-calls?') === 0) {
        if (method === 'POST') {
          path = '/api/method/vaishali.api.field.create_service_call';
        } else {
          var svcQS = ''; var svcQI = path.indexOf('?'); if (svcQI !== -1) svcQS = path.substring(svcQI);
          path = '/api/method/vaishali.api.field.get_service_calls' + svcQS;
        }
      }
      else if (path.match(/^\/api\/field\/service-call\/[^/]+$/)) {
        var svcId = path.replace('/api/field/service-call/', '');
        if (method === 'PUT' || method === 'PATCH' || method === 'POST') {
          body = body || {};
          body.svc_id = decodeURIComponent(svcId);
          path = '/api/method/vaishali.api.field.update_service_call';
          method = 'POST';
        } else {
          path = '/api/method/vaishali.api.field.get_service_call?svc_id=' + encodeURIComponent(svcId);
        }
      }
      else if (path.match(/^\/api\/field\/customer\/[^/]+\/recent-context$/)) {
        var ccId = path.replace('/api/field/customer/', '').replace('/recent-context', '');
        path = '/api/method/vaishali.api.field.get_customer_context?customer_id=' + encodeURIComponent(ccId);
      }

      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeout);

      var fetchOpts = {
        method: method,
        headers: headers,
        credentials: 'same-origin',
        signal: controller.signal
      };
      if (body && method !== 'GET') {
        fetchOpts.body = JSON.stringify(body);
      }

      return fetch(path, fetchOpts).then(function (resp) {
        clearTimeout(timer);
        // Auto-recovery on 401 (explicit unauthorized)
        if (resp.status === 401 && path.indexOf('/login') === -1) {
          console.warn('[API] Auth failed (401) — redirecting to login');
          redirectToLogin();
          return { data: null, status: resp.status, error: 'Session expired' };
        }
        // CSRF token stale — fetch fresh token and retry once
        if (resp.status === 417 && !options._csrfRetried) {
          console.warn('[API] CSRF 417 — refreshing token and retrying');
          return fetch('/api/method/frappe.auth.get_csrf_token', {
            method: 'GET', credentials: 'same-origin'
          }).then(function (r) { return r.json(); }).then(function (d) {
            var fresh = d && d.message;
            if (fresh) {
              if (window.frappe) window.frappe.csrf_token = fresh;
              window.csrf_token = fresh;
            }
            return apiCall(origMethod, origPath, body, Object.assign({}, options, { _csrfRetried: true }));
          }).catch(function () {
            return { data: null, status: 417, error: 'CSRF refresh failed' };
          });
        }
        return resp.json().then(function (data) {
          // Normalize Frappe {message: X} → {data: X, message: X}
          if (data && data.message !== undefined && data.data === undefined) {
            data.data = data.message;
          }
          // Frappe returns 403 (not 401) when a logged-out user hits a whitelisted
          // method ("Function X is not whitelisted" / "Login to access"). Detect that
          // specific shape and trigger re-login; leave real 403 permission denials alone.
          if (resp.status === 403 && path.indexOf('/login') === -1) {
            var blob = JSON.stringify(data || {});
            if (blob.indexOf('is not whitelisted') !== -1 || blob.indexOf('Login to access') !== -1) {
              console.warn('[API] Session expired (403 not whitelisted) — redirecting to login');
              redirectToLogin();
              return { data: null, status: resp.status, error: 'Session expired' };
            }
          }
          return { data: data, status: resp.status };
        }).catch(function () {
          return { data: null, status: resp.status };
        });
      }).catch(function (err) {
        clearTimeout(timer);
        var isOffline = !navigator.onLine || err.name === 'AbortError' || err.name === 'TypeError';
        return {
          error: err.name === 'AbortError' ? 'Request timed out' : err.message,
          status: 0,
          offline: isOffline
        };
      });
    });
  }

  // ─── Local-first write ─────────────────────────────────────────────

  function localFirstWrite(type, data, idempotencyKey, apiPath, apiMethod, apiBody) {
    var outboxEntry;
    return addToOutbox(type, data, idempotencyKey).then(function (entry) {
      outboxEntry = entry;
      return apiCall(apiMethod || 'POST', apiPath, apiBody || data);
    }).then(function (result) {
      if (result.error) {
        if (result.offline) {
          registerSync();
          return {
            success: true,
            synced: false,
            outboxId: outboxEntry.id,
            data: data
          };
        }
        return updateOutboxEntry(outboxEntry.id, { status: 'failed', error: result.error }).then(function () {
          return {
            success: false,
            synced: false,
            outboxId: outboxEntry.id,
            error: result.error
          };
        });
      }
      return updateOutboxEntry(outboxEntry.id, { status: 'synced' }).then(function () {
        updatePendingBadge();
        return {
          success: true,
          synced: true,
          outboxId: outboxEntry.id,
          data: result.data
        };
      });
    });
  }

  // ─── Sync ──────────────────────────────────────────────────────────

  function runSync() {
    return getPendingOutbox().then(function (pending) {
      if (pending.length === 0) return { synced: 0, failed: 0 };

      var payload = pending.map(function (entry) {
        return {
          id: entry.id,
          type: entry.type,
          data: entry.data,
          idempotency_key: entry.idempotency_key
        };
      });

      return apiCall('POST', '/api/field/sync', { actions: payload }).then(function (result) {
        if (result.error) {
          return { synced: 0, failed: pending.length, error: result.error };
        }

        var results = (result.data && result.data.results) || [];
        var synced = 0;
        var failed = 0;
        var updates = [];

        for (var i = 0; i < pending.length; i++) {
          var serverResult = results[i] || {};
          var newStatus = serverResult.ok ? 'synced' : 'failed';
          if (serverResult.ok) {
            synced++;
          } else {
            failed++;
          }
          updates.push(updateOutboxEntry(pending[i].id, {
            status: newStatus,
            retries: pending[i].retries + 1,
            server_response: serverResult
          }));
        }

        return Promise.all(updates).then(function () {
          updatePendingBadge();
          return { synced: synced, failed: failed };
        });
      });
    });
  }

  function registerSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function (reg) {
        return reg.sync.register('outbox-sync');
      }).catch(function (err) {
        console.warn('Background sync registration failed:', err);
      });
    }
  }

  // ─── Event listeners ──────────────────────────────────────────────

  window.addEventListener('online', function () {
    updateOfflineBanner(false);
    runSync();
  });

  window.addEventListener('offline', function () {
    updateOfflineBanner(true);
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && navigator.onLine) {
      runSync();
    }
  });

  // ─── GPS ───────────────────────────────────────────────────────────

  function getGPS(highAccuracy) {
    if (highAccuracy === undefined) highAccuracy = true;

    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, accuracy: null, error: 'Geolocation not supported' });
        return;
      }

      var options = {
        enableHighAccuracy: highAccuracy,
        timeout: highAccuracy ? 10000 : 15000,
        maximumAge: 30000
      };

      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            error: null
          });
        },
        function (err) {
          if (err.code === err.TIMEOUT && highAccuracy) {
            // Retry with low accuracy
            getGPS(false).then(resolve);
            return;
          }
          var msg = 'Location error';
          if (err.code === err.PERMISSION_DENIED) {
            msg = 'Location permission denied. Please enable in Settings.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            msg = 'Location unavailable';
          } else if (err.code === err.TIMEOUT) {
            msg = 'Location request timed out';
          }
          resolve({ lat: null, lng: null, accuracy: null, error: msg });
        },
        options
      );
    });
  }

  // ─── UI helpers ────────────────────────────────────────────────────

  function showToast(msg, variant) {
    variant = variant || 'success';
    // Try Oat toast first
    if (typeof ot !== 'undefined' && ot.toast) {
      ot.toast(msg, { variant: variant, duration: 3000 });
      return;
    }
    // Fallback
    var el = document.createElement('div');
    el.className = 'toast-fallback ' + variant;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3500);
  }

  function updateOfflineBanner(offline) {
    var banner = document.getElementById('offline-banner');
    if (!banner) return;
    banner.hidden = !offline;
    if (offline) {
      updatePendingBadge();
    }
  }

  function updatePendingBadge() {
    getOutboxCount().then(function (count) {
      var countEl = document.getElementById('pending-count');
      var syncBtn = document.getElementById('sync-now-btn');
      if (countEl) {
        countEl.textContent = count > 0 ? '(' + count + ' pending)' : '';
      }
      if (syncBtn) {
        syncBtn.hidden = count === 0;
      }
    });
  }

  // ─── Sync Now button ──────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    var syncBtn = document.getElementById('sync-now-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        runSync().then(function (result) {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync now';
          if (result && result.synced > 0) {
            showToast(result.synced + ' item(s) synced', 'success');
          } else if (result && result.error) {
            showToast('Sync failed — still offline?', 'danger');
          }
        });
      });
    }

    // Set initial offline state
    if (!navigator.onLine) {
      updateOfflineBanner(true);
    }

    // Initial badge update
    updatePendingBadge();
  });

  // ─── SW message listener ──────────────────────────────────────────

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'sync-complete') {
        updatePendingBadge();
        if (event.data.synced > 0) {
          showToast(event.data.synced + ' item(s) synced in background', 'success');
        }
      }
    });
  }

  // ─── Utilities ─────────────────────────────────────────────────────

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // ─── Public API ────────────────────────────────────────────────────

  window.fieldAPI = {
    // DB
    openDB: openDB,
    idbPut: idbPut,
    idbGet: idbGet,
    idbGetAll: idbGetAll,
    idbDelete: idbDelete,
    idbGetByIndex: idbGetByIndex,
    // Session
    saveSession: saveSession,
    getSession: getSession,
    clearSession: clearSession,
    getAuthHeader: getAuthHeader,
    // Cache
    cacheSet: cacheSet,
    cacheGet: cacheGet,
    // Outbox
    addToOutbox: addToOutbox,
    getPendingOutbox: getPendingOutbox,
    getOutboxCount: getOutboxCount,
    updateOutboxEntry: updateOutboxEntry,
    // Local DCRs
    saveLocalDCR: saveLocalDCR,
    getLocalDCRs: getLocalDCRs,
    updateLocalDCR: updateLocalDCR,
    // API
    apiCall: apiCall,
    localFirstWrite: localFirstWrite,
    // Sync
    runSync: runSync,
    registerSync: registerSync,
    // GPS
    getGPS: getGPS,
    // UI
    showToast: showToast,
    updateOfflineBanner: updateOfflineBanner,
    updatePendingBadge: updatePendingBadge,
    // Util
    generateId: generateId,
    // Error helpers (centralized — screens should use these)
    extractError: extractError,
    isSessionExpiredResponse: isSessionExpiredResponse,
    reportError: reportError
  };

})();
