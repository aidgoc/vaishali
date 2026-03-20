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

  // ─── API Client ────────────────────────────────────────────────────

  function apiCall(method, path, body, options) {
    options = options || {};
    var timeout = options.timeout || API_TIMEOUT;

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
      else if (path === '/api/field/lead' && method === 'POST') path = '/api/method/vaishali.api.field.create_lead';
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
        path = '/api/method/vaishali.api.field.checkout_dcr';
      }
      else if (path.match(/^\/api\/field\/dcr\/[^/]+$/)) {
        var dcrId = path.replace('/api/field/dcr/', '');
        path = '/api/method/vaishali.api.field.get_dcr?dcr_id=' + encodeURIComponent(dcrId);
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
      else if (path === '/api/field/holidays') path = '/api/method/vaishali.api.field.get_upcoming_holidays';
      else if (path === '/api/field/login') path = '/api/method/login';

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
        // Auto-recovery: only on 401 (unauthorized = expired session). NOT 403 (forbidden = no permission)
        if (resp.status === 401 && path.indexOf('/login') === -1) {
          console.warn('[API] Auth failed (' + resp.status + ') — clearing session');
          clearSession().then(function () {
            location.hash = '#/login';
            location.reload();
          });
          return { data: null, status: resp.status, error: 'Session expired' };
        }
        return resp.json().then(function (data) {
          // Normalize Frappe {message: X} → {data: X, message: X}
          // This way res.data.data always works regardless of source
          if (data && data.message !== undefined && data.data === undefined) {
            data.data = data.message;
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
    generateId: generateId
  };

})();
