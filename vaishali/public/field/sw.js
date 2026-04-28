var CACHE_NAME = 'dspl-field-v34';
var PRECACHE_URLS = [
  '/field',
  '/assets/vaishali/field/style.css',
  '/assets/vaishali/field/icons.js',
  '/assets/vaishali/field/ui.js',
  '/assets/vaishali/field/api.js',
  '/assets/vaishali/field/auth.js',
  '/assets/vaishali/field/router.js',
  '/assets/vaishali/field/app.js',
  '/assets/vaishali/field/screens/home.js',
  '/assets/vaishali/field/screens/attendance.js',
  '/assets/vaishali/field/screens/chat.js',
  '/assets/vaishali/field/screens/profile.js',
  '/assets/vaishali/field/screens/visits.js'
];

// Install — precache shell assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate — clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
             .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch — network-first for API, cache-first for assets
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API calls — network only (never cache API responses in SW)
  if (url.pathname.indexOf('/api/') === 0) {
    return;  // let the browser handle it normally
  }

  // Assets — stale-while-revalidate (serve from cache, update in background)
  // ignoreSearch: true so ?v=XXX cache-busting params don't cause misses
  if (url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request, { ignoreSearch: true }).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // HTML page — network first, fallback to cache
  if (event.request.mode === 'navigate' || url.pathname === '/field') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('/field');
      })
    );
    return;
  }
});

// ---------------------------------------------------------------------------
// Background Sync — "field-sync" tag
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
  if (event.tag !== 'outbox-sync') {
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
          icon: '/assets/vaishali/field/icons/icon-192.png',
          badge: '/assets/vaishali/field/icons/icon-192.png'
        });
      });
    });
  }).catch(function(err) {
    // Network error — throw so the browser retries later
    throw err;
  });
}
