var CACHE_NAME = 'dspl-field-v16';
var PRECACHE_URLS = [
  '/field/',
  '/field/index.html',
  '/field/icons.js',
  '/field/ui.js',
  '/field/api.js',
  '/field/auth.js',
  '/field/router.js',
  '/field/screens/home.js',
  '/field/screens/profile.js',
  '/field/screens/attendance.js',
  '/field/screens/hr-hub.js',
  '/field/screens/leave.js',
  '/field/screens/expense.js',
  '/field/screens/advance.js',
  '/field/screens/salary.js',
  '/field/screens/visits.js',
  '/field/screens/approvals.js',
  '/field/screens/team.js',
  '/field/screens/pipeline.js',
  '/field/screens/project-hub.js',
  '/field/screens/amc.js',
  '/field/screens/customer-detail.js',
  '/field/screens/debtors.js',
  '/field/screens/my-targets.js',
  '/field/screens/follow-ups.js',
  '/field/screens/customer-search.js',
  '/field/screens/service-dashboard.js',
  '/field/screens/installation.js',
  '/field/screens/breakdown.js',
  '/field/screens/production.js',
  '/field/screens/dispatch.js',
  '/field/screens/revenue.js',
  '/field/screens/chat.js',
  '/field/app.js',
  '/field/style.css',
  '/field/manifest.json',
  '/field/icons/icon-192.png',
  '/field/icons/icon-512.png',
  'https://unpkg.com/@knadh/oat@0.4.1/oat.min.css',
  'https://unpkg.com/@knadh/oat@0.4.1/oat.min.js',
];

// ---------------------------------------------------------------------------
// 1. Install — Precache static shell
// ---------------------------------------------------------------------------
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ---------------------------------------------------------------------------
// 2. Activate — Clean old caches
// ---------------------------------------------------------------------------
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) {
          return name.startsWith('dspl-field-') && name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ---------------------------------------------------------------------------
// 3. Fetch — Stale-while-revalidate for static, passthrough for API
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API requests: let the browser handle normally
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(event.request).then(function(cachedResponse) {
        var fetchPromise = fetch(event.request).then(function(networkResponse) {
          // Only cache successful responses and same-origin / CORS-ok responses
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(function() {
          // Network failed — return nothing (cachedResponse already served if available)
          return undefined;
        });

        // Return cached immediately, update in background
        return cachedResponse || fetchPromise;
      });
    })
  );
});

// ---------------------------------------------------------------------------
// 4. Background Sync — "field-sync" tag
// ---------------------------------------------------------------------------

function openDBFromSW() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open('dspl-field', 1);
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function getStoreEntries(db, storeName, indexName, value) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction(storeName, 'readonly');
    var store = tx.objectStore(storeName);
    var req = indexName ? store.index(indexName).getAll(value) : store.getAll();
    req.onsuccess = function() { resolve(req.result || []); };
    req.onerror = function() { reject(req.error); };
  });
}

function updateOutboxEntry(db, entry) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('outbox', 'readwrite');
    var store = tx.objectStore('outbox');
    var req = store.put(entry);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

self.addEventListener('sync', function(event) {
  if (event.tag !== 'field-sync') {
    return;
  }

  event.waitUntil(doBackgroundSync());
});

function doBackgroundSync() {
  var db;
  var pending;
  var session;

  return openDBFromSW().then(function(openedDB) {
    db = openedDB;
    return getStoreEntries(db, 'outbox', 'status', 'pending');
  }).then(function(entries) {
    // Sort by queued_at ascending
    pending = entries.sort(function(a, b) {
      return (a.queued_at || 0) - (b.queued_at || 0);
    });

    if (pending.length === 0) {
      return null;
    }

    return getStoreEntries(db, 'session');
  }).then(function(sessions) {
    if (!pending || pending.length === 0) {
      return;
    }

    // Get session — stored with key "current"
    session = null;
    if (sessions && sessions.length > 0) {
      for (var i = 0; i < sessions.length; i++) {
        if (sessions[i].id === 'current' || sessions[i].key === 'current') {
          session = sessions[i];
          break;
        }
      }
      if (!session) {
        session = sessions[0];
      }
    }

    if (!session) {
      return;
    }

    // Build actions array from pending entries
    var actions = pending.map(function(entry) {
      return {
        id: entry.id,
        type: entry.type,
        doctype: entry.doctype,
        name: entry.name,
        data: entry.data,
        queued_at: entry.queued_at
      };
    });

    // Build auth header
    var headers = {
      'Content-Type': 'application/json'
    };
    if (session.token) {
      headers['Authorization'] = 'Bearer ' + session.token;
    } else if (session.api_key && session.api_secret) {
      headers['Authorization'] = 'token ' + session.api_key + ':' + session.api_secret;
    }

    // POST to sync endpoint
    return fetch('/api/field/sync', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ actions: actions })
    }).then(function(response) {
      return response.json();
    }).then(function(result) {
      var synced = 0;
      var failed = 0;
      var results = result.results || [];

      // Build a map of results by id for quick lookup
      var resultMap = {};
      for (var i = 0; i < results.length; i++) {
        resultMap[results[i].id] = results[i];
      }

      // Update each outbox entry based on results
      var updates = pending.map(function(entry) {
        var r = resultMap[entry.id];
        if (r && r.ok) {
          entry.status = 'synced';
          entry.synced_at = Date.now();
          synced++;
        } else {
          entry.status = 'failed';
          entry.error = r ? r.error : 'No result returned';
          failed++;
        }
        return updateOutboxEntry(db, entry);
      });

      return Promise.all(updates).then(function() {
        // Notify all client pages
        return self.clients.matchAll();
      }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'sync-complete',
            synced: synced,
            failed: failed
          });
        });

        // Show notification
        var body;
        if (synced > 0 && failed > 0) {
          body = synced + ' synced, ' + failed + ' failed';
        } else if (synced > 0) {
          body = synced + ' action' + (synced > 1 ? 's' : '') + ' synced successfully';
        } else {
          body = failed + ' action' + (failed > 1 ? 's' : '') + ' failed to sync';
        }

        return self.registration.showNotification('DSPL Field Sync', {
          body: body,
          icon: '/field/icons/icon-192.png',
          badge: '/field/icons/icon-192.png'
        });
      });
    });
  }).catch(function(err) {
    // Network error — throw so the browser retries later
    throw err;
  });
}
