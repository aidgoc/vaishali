/* visits.js — DCR / Visit screens for Field PWA (List, New, Detail) */
(function () {
  'use strict';

  var _timers = [];

  // Cleanup on navigation
  window.addEventListener('hashchange', function () {
    for (var i = 0; i < _timers.length; i++) clearInterval(_timers[i]);
    _timers = [];
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // Server now stores naive IST (not UTC). If the value carries an explicit
  // timezone suffix (Z or +HH:MM), honour it; otherwise let the browser
  // parse the bare ISO as local time — user devices are in IST so the
  // wall-clock matches.
  function parseUTC(s) {
    if (!s) return null;
    var t = String(s).replace(' ', 'T');
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  // Naive IST datetime string in MySQL format ("YYYY-MM-DD HH:MM:SS").
  // Used for fields the server persists verbatim (DCR check_in/out_time).
  function nowIST() {
    var d = new Date();
    var ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return ist.getUTCFullYear() + '-' + pad(ist.getUTCMonth() + 1) + '-' + pad(ist.getUTCDate())
         + ' ' + pad(ist.getUTCHours()) + ':' + pad(ist.getUTCMinutes()) + ':' + pad(ist.getUTCSeconds());
  }

  function formatTime(isoString) {
    var d = parseUTC(isoString);
    if (!d) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDuration(startISO, endISO) {
    var s = parseUTC(startISO);
    var e = parseUTC(endISO);
    if (!s || !e) return '';
    var diff = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function formatDurationLive(startISO) {
    var d = parseUTC(startISO);
    if (!d) return '00:00:00';
    var diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    var s = diff % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getGPS() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, accuracy: null, error: 'Geolocation not supported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy)
          });
        },
        function (err) {
          resolve({ lat: null, lng: null, accuracy: null, error: err.message });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'completed') return 'green';
    if (s === 'ongoing') return 'yellow';
    return 'gray';
  }

  function weekStartISO() {
    var d = new Date();
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    var mon = new Date(d.setDate(diff));
    var mm = mon.getMonth() + 1;
    var dd = mon.getDate();
    return mon.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // Parse "lat,lng" string from check_in_gps / check_out_gps
  function parseGPS(s) {
    if (!s) return null;
    var parts = String(s).split(',');
    if (parts.length !== 2) return null;
    var lat = parseFloat(parts[0]);
    var lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat: lat, lng: lng };
  }

  // Lazy-load Leaflet (~40KB JS + 14KB CSS) on first map open
  var _leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (_leafletPromise) return _leafletPromise;
    _leafletPromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      css.crossOrigin = '';
      document.head.appendChild(css);

      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = function () { resolve(window.L); };
      script.onerror = function () { reject(new Error('Failed to load Leaflet')); };
      document.head.appendChild(script);
    });
    return _leafletPromise;
  }

  // Status → marker colour (matches PWA pill colours)
  function markerColor(status) {
    var s = (status || '').toLowerCase();
    if (s === 'completed') return '#16a34a'; // green
    if (s === 'ongoing' || s === 'in progress') return '#f59e0b'; // amber
    return '#6b7280'; // gray (planned / unknown)
  }

  function svgMarkerIcon(L, color) {
    var html =
      '<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22s14-12.5 14-22C28 6.27 21.73 0 14 0z" fill="' + color + '"/>' +
      '<circle cx="14" cy="14" r="5" fill="#fff"/></svg>';
    return L.divIcon({
      html: html,
      className: 'dcr-map-marker',
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -32]
    });
  }

  // ── Screen: Visits List ───────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.visitsList = function (appEl) {
    var el = UI.el;

    appEl.appendChild(UI.pageHeader(
      'Visits',
      'Daily call reports — log each customer or prospect visit.'
    ));

    var activeTab = 'week';
    var viewMode = 'list';
    var lastItems = [];
    var statsContainer = el('div');
    appEl.appendChild(statsContainer);

    var contentContainer = el('div', { style: { marginTop: '12px' } });

    // Filter — segmented (3 options, single-select)
    var segLabel = el('div', {
      textContent: 'Show',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    appEl.appendChild(segLabel);
    var segBar = UI.segmented([
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'all', label: 'All' }
    ], { value: 'week', onChange: function (val) {
      activeTab = val;
      loadVisits();
    } });
    appEl.appendChild(segBar);

    // View toggle \u2014 List / Map
    var viewLabel = el('div', {
      textContent: 'View',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '12px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    appEl.appendChild(viewLabel);
    var viewSeg = UI.segmented([
      { value: 'list', label: 'List' },
      { value: 'map', label: 'Map' }
    ], { value: 'list', onChange: function (val) {
      viewMode = val;
      render();
    } });
    appEl.appendChild(viewSeg);

    appEl.appendChild(el('div', { style: { padding: '16px 0 8px' } }, [
      UI.btn('Log new visit', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/dcr/new'; }
      })
    ]));

    appEl.appendChild(contentContainer);

    function render() {
      contentContainer.textContent = '';
      if (!lastItems.length) {
        contentContainer.appendChild(UI.empty('clip', 'No visits yet'));
        return;
      }
      if (viewMode === 'map') {
        renderMap(lastItems);
      } else {
        renderList(lastItems);
      }
    }

    function renderList(items) {
      var listWrap = el('div', { className: 'm3-list' });
      for (var i = 0; i < items.length; i++) {
        (function (dcr) {
          var customer = dcr.customer || dcr.prospect_name || 'Unknown';
          var purpose = dcr.visit_purpose || dcr.service_purpose || '';
          var time = formatTime(dcr.check_in_time);
          var duration = '';
          if (dcr.check_in_time && dcr.check_out_time) {
            duration = formatDuration(dcr.check_in_time, dcr.check_out_time);
          } else if (dcr.check_in_time) {
            duration = 'ongoing';
          }
          var status = dcr.status || 'Planned';
          var sub = [purpose, time, duration].filter(Boolean).join(' \u00b7 ');

          listWrap.appendChild(UI.listCard({
            avatar: customer,
            title: customer,
            sub: sub,
            right: UI.pill(status, statusColor(status)),
            onClick: function () { location.hash = '#/dcr/' + dcr.name; }
          }));
        })(items[i]);
      }
      contentContainer.appendChild(listWrap);
    }

    function renderMap(items) {
      var points = [];
      var withoutGps = 0;
      for (var i = 0; i < items.length; i++) {
        var dcr = items[i];
        var gps = parseGPS(dcr.check_in_gps) || parseGPS(dcr.check_out_gps);
        if (gps) {
          points.push({ dcr: dcr, lat: gps.lat, lng: gps.lng });
        } else {
          withoutGps++;
        }
      }

      var mapEl = el('div', {
        style: {
          width: '100%',
          height: '60vh',
          minHeight: '320px',
          borderRadius: '12px',
          overflow: 'hidden',
          background: 'var(--m3-surface-variant, #f1f1f1)'
        }
      });
      contentContainer.appendChild(mapEl);

      if (withoutGps > 0) {
        contentContainer.appendChild(el('div', {
          textContent: withoutGps + ' visit' + (withoutGps === 1 ? '' : 's') + ' without GPS \u2014 not shown on map',
          style: {
            font: 'var(--m3-label-medium)',
            color: 'var(--m3-on-surface-variant)',
            marginTop: '8px',
            textAlign: 'center'
          }
        }));
      }

      if (!points.length) {
        mapEl.appendChild(el('div', {
          textContent: 'No GPS coordinates on these visits',
          style: {
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--m3-on-surface-variant)'
          }
        }));
        return;
      }

      var loading = el('div', {
        textContent: 'Loading map\u2026',
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: 'var(--m3-on-surface-variant)'
        }
      });
      mapEl.appendChild(loading);

      loadLeaflet().then(function (L) {
        if (!mapEl.isConnected) return;
        mapEl.textContent = '';

        var first = points[0];
        var map = L.map(mapEl, {
          zoomControl: true,
          attributionControl: true
        }).setView([first.lat, first.lng], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '\u00a9 OpenStreetMap'
        }).addTo(map);

        var bounds = [];
        for (var i = 0; i < points.length; i++) {
          (function (p) {
            var dcr = p.dcr;
            var customer = dcr.customer || dcr.prospect_name || 'Unknown';
            var purpose = dcr.visit_purpose || dcr.service_purpose || '';
            var time = formatTime(dcr.check_in_time);
            var status = dcr.status || 'Planned';

            var marker = L.marker([p.lat, p.lng], {
              icon: svgMarkerIcon(L, markerColor(status))
            }).addTo(map);

            var pop = el('div', { style: { minWidth: '180px', font: 'var(--m3-body-medium)' } });
            pop.appendChild(el('div', {
              textContent: customer,
              style: { fontWeight: '600', marginBottom: '4px' }
            }));
            if (purpose) {
              pop.appendChild(el('div', {
                textContent: purpose,
                style: { color: 'var(--m3-on-surface-variant)', marginBottom: '2px' }
              }));
            }
            if (time) {
              pop.appendChild(el('div', {
                textContent: time + ' \u00b7 ' + status,
                style: { color: 'var(--m3-on-surface-variant)', marginBottom: '8px' }
              }));
            }
            var openLink = el('a', {
              textContent: 'Open visit \u2192',
              href: '#/dcr/' + dcr.name,
              style: { color: 'var(--m3-primary, #1a73e8)', fontWeight: '500' }
            });
            pop.appendChild(openLink);
            marker.bindPopup(pop);
            bounds.push([p.lat, p.lng]);
          })(points[i]);
        }

        if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
        }

        setTimeout(function () { map.invalidateSize(); }, 100);
      }).catch(function (err) {
        mapEl.textContent = '';
        mapEl.appendChild(UI.error('Failed to load map: ' + (err.message || err)));
      });
    }

    function loadVisits() {
      contentContainer.textContent = '';
      contentContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/dcr';
      if (activeTab === 'today') {
        path += '?date=' + todayISO();
      } else if (activeTab === 'week') {
        path += '?from_date=' + weekStartISO() + '&to_date=' + todayISO();
      }

      window.fieldAPI.apiCall('GET', path).then(function (res) {
        statsContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        lastItems = items;

        var ongoing = 0, completed = 0, planned = 0;
        for (var sIdx = 0; sIdx < items.length; sIdx++) {
          var st = items[sIdx].status || 'Planned';
          if (st === 'Completed') completed++;
          else if (st === 'Ongoing' || st === 'In Progress') ongoing++;
          else planned++;
        }
        statsContainer.appendChild(UI.statGrid([
          { value: items.length, label: 'Total visits', support: activeTab === 'today' ? 'today' : (activeTab === 'week' ? 'this week' : 'all-time') },
          { value: completed, label: 'Completed', support: 'closed out' },
          { value: ongoing, label: 'Ongoing', support: 'currently active' }
        ], 3));

        render();
      }).catch(function (err) {
        contentContainer.textContent = '';
        contentContainer.appendChild(UI.error('Failed to load visits: ' + (err.message || err)));
      });
    }

    loadVisits();

    // Quick-add FAB
    if (UI.fab) {
      var fab = UI.fab({
        icon: 'plus', ariaLabel: 'Log visit',
        onClick: function () { location.hash = '#/dcr/new'; }
      });
      document.body.appendChild(fab);
      var removeFab = function () {
        if (fab.parentNode) fab.parentNode.removeChild(fab);
        window.removeEventListener('hashchange', removeFab);
      };
      window.addEventListener('hashchange', removeFab);
    }
  };

  // ── Screen: New Visit ─────────────────────────────────────────────────

  window.Screens.visitNew = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'New visit',
      'Capture customer or prospect, purpose and outcome.'
    ));
    var emp = Auth.getEmployee() || {};
    var empDept = (emp.department || '').toLowerCase();
    var empDesig = (emp.designation || '').toLowerCase();

    // GPS state
    var gps = { lat: null, lng: null, accuracy: null };

    // GPS display card
    var gpsBox = UI.card([
      el('div', { className: 'gps-coords', style: { fontFamily: 'monospace' }, textContent: 'Locating...' })
    ], { className: 'gps-display' });
    appEl.appendChild(gpsBox);

    // Capture GPS
    getGPS().then(function (result) {
      if (result.error) {
        gpsBox.textContent = '';
        gpsBox.className = 'card-surface gps-display';
        gpsBox.appendChild(el('div', {
          textContent: 'GPS error: ' + result.error,
          style: { color: 'var(--red, #dc3545)' }
        }));
        return;
      }
      gps.lat = result.lat;
      gps.lng = result.lng;
      gps.accuracy = result.accuracy;

      gpsBox.textContent = '';
      gpsBox.className = 'card-surface gps-display';
      gpsBox.appendChild(el('div', {
        className: 'gps-coords',
        style: { fontFamily: 'monospace' },
        textContent: gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6)
      }));
      gpsBox.appendChild(el('div', {
        textContent: 'Accuracy: ' + gps.accuracy + 'm',
        style: { marginTop: '4px', fontSize: '13px', color: 'var(--text-muted, #6c757d)' }
      }));
    });

    // Form state
    var selectedCustomer = null;
    var isProspect = false;
    var followUpDoctype = null;
    var followUpName = null;

    // Purpose dropdowns — must match Daily Call Report DocType select options exactly
    var salesPurposes = ['Cold Call / New Enquiry', 'Lead Follow-up', 'Opportunity Follow-up', 'Quotation Follow-up', 'Order Follow-up', 'Recovery', 'Relationship Building'];
    var servicePurposes = ['Installation', 'Breakdown / Repair', 'Preventive Maintenance (AMC)', 'Commissioning', 'Training', 'Warranty Service', 'Inspection'];

    function matchAny(s, needles) {
      for (var i = 0; i < needles.length; i++) { if (s.indexOf(needles[i]) >= 0) return true; }
      return false;
    }
    var salesHints = ['sales', 'marketing'];
    var serviceHints = ['service', 'support', 'maintenance', 'technician', 'installation', 'commissioning', 'field engineer'];
    var isSales = matchAny(empDept, salesHints) || matchAny(empDesig, salesHints);
    var isService = matchAny(empDept, serviceHints) || matchAny(empDesig, serviceHints);
    // Sales wins if both somehow match (e.g. a "Sales & Service" dept)
    if (isSales && isService) isService = false;

    // Pre-select based on detection; user can always override via the picker below
    var visitType = isSales ? 'sales' : isService ? 'service' : null;

    var visitPurposeField = UI.m3SelectField('Visit purpose', salesPurposes, { required: true });
    var visitPurposeSelect = visitPurposeField._getSelect();
    var servicePurposeField = UI.m3SelectField('Service purpose', servicePurposes, { required: true });
    var servicePurposeSelect = servicePurposeField._getSelect();

    // Visit type picker — M3 segmented button (2 options, single-select)
    var typeSegBar = UI.segmented([
      { value: 'sales', label: 'Sales' },
      { value: 'service', label: 'Service' }
    ], { value: visitType || 'sales', onChange: function (v) { setVisitType(v); } });
    var typePickerEl = el('div', { style: { marginBottom: '16px' } }, [
      el('div', {
        textContent: 'Visit type',
        style: { font: 'var(--m3-label-medium)', color: 'var(--m3-on-surface-variant)', marginBottom: '8px', letterSpacing: '0.5px' }
      }),
      typeSegBar
    ]);

    function setVisitType(type) {
      visitType = type;
      if (type === 'sales') {
        visitPurposeField.style.display = 'block';
        servicePurposeField.style.display = 'none';
        serviceFields.style.display = 'none';
      } else {
        visitPurposeField.style.display = 'none';
        servicePurposeField.style.display = 'block';
        serviceFields.style.display = 'block';
      }
    }

    // Blur validation on purpose selects
    visitPurposeSelect.addEventListener('blur', function () {
      if (visitType === 'sales' && !visitPurposeSelect.value) {
        UI.fieldError(visitPurposeSelect, 'Required');
      } else {
        UI.fieldError(visitPurposeSelect, null);
      }
    });
    servicePurposeSelect.addEventListener('blur', function () {
      if (visitType === 'service' && !servicePurposeSelect.value) {
        UI.fieldError(servicePurposeSelect, 'Required');
      } else {
        UI.fieldError(servicePurposeSelect, null);
      }
    });

    // Initial visibility — both hidden until a type is chosen (final selection applied
    // after serviceFields is defined below, since setVisitType touches it)
    visitPurposeField.style.display = 'none';
    servicePurposeField.style.display = 'none';

    // Customer search
    var customerDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
    var searchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var customerSearch = UI.searchInput('Search customer...', function (query) {
      if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        searchResults.textContent = '';
        return;
      }
      window.fieldAPI.apiCall('GET', '/api/field/customers?search=' + encodeURIComponent(query)).then(function (res) {
        searchResults.textContent = '';
        var customers = [];
        if (res && res.data) {
          customers = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (customers.length === 0) {
          searchResults.style.display = 'none';
          return;
        }
        searchResults.style.display = 'block';
        for (var i = 0; i < customers.length; i++) {
          (function (c) {
            var name = c.name || c.customer_name || c;
            var label = typeof c === 'string' ? c : (c.customer_name || c.name);
            var resultItem = el('div', {
              className: 'search-result-item',
              textContent: label,
              onClick: function () {
                selectedCustomer = name;
                searchResults.style.display = 'none';
                showCustomerChip(label);
              }
            });
            searchResults.appendChild(resultItem);
          })(customers[i]);
        }
      });
    });

    var customerField = UI.field('Customer', el('div', null, [customerSearch, searchResults, customerDisplay]));
    var customerSearchInput = customerSearch.querySelector('input');

    // Blur validation on customer search — check if customer selected
    customerSearchInput.addEventListener('blur', function () {
      // Delay slightly so click-to-select can fire first
      setTimeout(function () {
        if (!selectedCustomer && !isProspect) {
          UI.fieldError(customerSearchInput, 'Required');
        } else {
          UI.fieldError(customerSearchInput, null);
        }
      }, 200);
    });

    function showCustomerChip(label) {
      UI.fieldError(customerSearchInput, null);
      customerDisplay.textContent = '';
      customerDisplay.style.display = 'block';
      var removeBtn = el('button', {
        textContent: '\u00d7',
        className: 'chip-remove',
        style: { marginLeft: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#666' },
        onClick: function () {
          selectedCustomer = null;
          customerDisplay.style.display = 'none';
          customerSearch.querySelector('input').value = '';
        }
      });
      customerDisplay.appendChild(el('div', { className: 'customer-chip', style: {
        display: 'inline-flex', alignItems: 'center', background: 'var(--control-bg, #f0f0f0)',
        borderRadius: '20px', padding: '6px 12px', fontSize: '14px'
      } }, [
        el('span', { textContent: label }),
        removeBtn
      ]));
      checkFollowUp();
    }

    // Follow-up selector (shown when purpose contains "Follow-up" and customer is selected)
    var followUpContainer = el('div', { style: { display: 'none' } });

    function checkFollowUp() {
      followUpDoctype = null;
      followUpName = null;
      followUpContainer.textContent = '';
      followUpContainer.style.display = 'none';

      var purpose = visitPurposeSelect.value || '';
      if (purpose.indexOf('Follow-up') === -1 || !selectedCustomer || isProspect) return;

      followUpContainer.style.display = 'block';
      followUpContainer.appendChild(UI.skeleton(2));

      window.fieldAPI.apiCall('GET', '/api/field/customer-open-items?customer=' + encodeURIComponent(selectedCustomer)).then(function (res) {
        followUpContainer.textContent = '';
        var data = {};
        if (res && res.data) {
          data = res.data.data || res.data.message || res.data;
        }
        var leads = data.leads || [];
        var quotations = data.quotations || [];
        var opportunities = data.opportunities || [];

        if (leads.length === 0 && quotations.length === 0 && opportunities.length === 0) {
          followUpContainer.style.display = 'none';
          return;
        }

        followUpContainer.appendChild(UI.sectionHeading('Following up on'));

        function makeCard(doctype, name, title, sub, selected) {
          var card = el('div', {
            className: 'card-surface' + (selected ? ' follow-up-selected' : ''),
            style: {
              padding: '10px 12px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer',
              border: selected ? '2px solid var(--primary, #E60005)' : '2px solid transparent'
            },
            onClick: function () {
              if (followUpName === name) {
                followUpDoctype = null;
                followUpName = null;
              } else {
                followUpDoctype = doctype;
                followUpName = name;
              }
              renderFollowUpCards(leads, quotations, opportunities);
            }
          }, [
            el('div', { textContent: title, style: { fontWeight: '500', fontSize: '14px' } }),
            el('div', { textContent: sub, style: { fontSize: '12px', color: 'var(--text-muted, #6c757d)' } })
          ]);
          return card;
        }

        function renderFollowUpCards(ld, qt, op) {
          followUpContainer.textContent = '';
          followUpContainer.appendChild(UI.sectionHeading('Following up on'));
          for (var i = 0; i < ld.length; i++) {
            var l = ld[i];
            followUpContainer.appendChild(makeCard('Lead', l.name, l.lead_name || l.name, 'Lead \u00b7 ' + (l.status || ''), followUpName === l.name));
          }
          for (var j = 0; j < op.length; j++) {
            var o = op[j];
            var oAmt = o.opportunity_amount ? ' \u00b7 \u20b9' + Number(o.opportunity_amount).toLocaleString('en-IN') : '';
            followUpContainer.appendChild(makeCard('Opportunity', o.name, o.name, 'Opportunity' + oAmt, followUpName === o.name));
          }
          for (var k = 0; k < qt.length; k++) {
            var q = qt[k];
            var qAmt = q.grand_total ? ' \u00b7 \u20b9' + Number(q.grand_total).toLocaleString('en-IN') : '';
            followUpContainer.appendChild(makeCard('Quotation', q.name, q.name, 'Quotation' + qAmt + ' \u00b7 ' + (q.status || ''), followUpName === q.name));
          }
        }

        renderFollowUpCards(leads, quotations, opportunities);
      });
    }

    // Trigger follow-up check when purpose or customer changes
    visitPurposeSelect.addEventListener('change', checkFollowUp);

    // Prospect toggle + fields — M3 floating-label
    var prospectFields = el('div', { style: { display: 'none' } });
    var prospectNameField = UI.m3TextField('Prospect name', { required: true });
    var prospectNameInput = prospectNameField._getInput();
    var prospectCompanyField = UI.m3TextField('Company');
    var prospectCompanyInput = prospectCompanyField._getInput();
    var prospectPhoneField = UI.m3TextField('Phone', { type: 'tel' });
    var prospectPhoneInput = prospectPhoneField._getInput();
    var prospectAddressField = UI.m3TextField('Address', { multiline: true, rows: 2 });
    var prospectAddressInput = prospectAddressField._getInput();
    prospectFields.appendChild(prospectNameField);
    prospectFields.appendChild(prospectCompanyField);
    prospectFields.appendChild(prospectPhoneField);
    prospectFields.appendChild(prospectAddressField);

    var prospectToggle = UI.toggle('New prospect?', false, function (val) {
      isProspect = val;
      prospectFields.style.display = val ? 'block' : 'none';
    });

    // Service-specific fields (only visible for service visits) — M3
    var serviceFields = el('div', { style: { display: 'none' } });
    var equipmentField = UI.m3TextField('Equipment name');
    var equipmentInput = equipmentField._getInput();
    var serialField = UI.m3TextField('Serial number');
    var serialInput = serialField._getInput();
    var jobCardField = UI.m3TextField('Job card number');
    var jobCardInput = jobCardField._getInput();
    serviceFields.appendChild(equipmentField);
    serviceFields.appendChild(serialField);
    serviceFields.appendChild(jobCardField);

    // Apply pre-selected visit type now that serviceFields exists
    if (visitType) setVisitType(visitType);

    // Error display
    var errorBox = el('div', { style: { display: 'none' } });

    // Submit button
    var submitBtn = UI.btn('Check in & start', {
      type: 'success',
      block: true,
      icon: 'mapPin',
      onClick: handleSubmit
    });

    // Build form card
    var formChildren = [];
    if (typePickerEl) formChildren.push(typePickerEl);
    formChildren.push(visitPurposeField);
    formChildren.push(servicePurposeField);
    formChildren.push(customerField);
    formChildren.push(followUpContainer);
    formChildren.push(prospectToggle);
    formChildren.push(prospectFields);
    formChildren.push(serviceFields);
    formChildren.push(errorBox);
    formChildren.push(el('div', { style: { marginTop: '12px' } }, [submitBtn]));

    appEl.appendChild(UI.card(formChildren));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      // Must pick visit type
      if (!visitType) {
        showError('Please select a visit type (Sales or Service).');
        return;
      }

      // Validate customer or prospect
      if (!isProspect && !selectedCustomer) {
        UI.fieldError(customerSearchInput, 'Customer is required');
        valid = false;
      } else {
        UI.fieldError(customerSearchInput, null);
      }

      if (isProspect && !prospectNameInput.value.trim()) {
        UI.fieldError(prospectNameInput, 'Prospect name is required');
        valid = false;
      } else if (isProspect) {
        UI.fieldError(prospectNameInput, null);
      }

      // Validate purpose
      if (visitType === 'sales' && !visitPurposeSelect.value) {
        UI.fieldError(visitPurposeSelect, 'Visit purpose is required');
        valid = false;
      } else if (visitType === 'sales') {
        UI.fieldError(visitPurposeSelect, null);
      }
      if (visitType === 'service' && !servicePurposeSelect.value) {
        UI.fieldError(servicePurposeSelect, 'Service purpose is required');
        valid = false;
      } else if (visitType === 'service') {
        UI.fieldError(servicePurposeSelect, null);
      }

      if (!valid) {
        var firstError = appEl.querySelector('.field-error-text');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Checking in...');

      var now = nowIST();
      var payload = {
        date: todayISO(),
        department: emp.department || '',
        check_in_time: now,
        check_in_gps: (gps.lat != null && gps.lng != null) ? gps.lat + ',' + gps.lng : ''
      };

      if (selectedCustomer && !isProspect) {
        payload.customer = selectedCustomer;
      }
      // Only send the purpose field matching the visit type
      if (visitType === 'sales') {
        payload.visit_purpose = visitPurposeSelect.value;
      } else if (visitType === 'service') {
        payload.service_purpose = servicePurposeSelect.value;
      }
      if (isProspect) {
        payload.prospect_name = prospectNameInput.value.trim();
        payload.prospect_company = prospectCompanyInput.value.trim();
        payload.prospect_phone = prospectPhoneInput.value.trim();
        payload.prospect_address = prospectAddressInput.value.trim();
      }
      if (visitType === 'service') {
        payload.equipment_name = equipmentInput.value.trim();
        payload.serial_no = serialInput.value.trim();
        payload.job_card_no = jobCardInput.value.trim();
      }
      if (followUpDoctype && followUpName) {
        payload.follow_up_doctype = followUpDoctype;
        payload.follow_up_name = followUpName;
      }

      window.fieldAPI.apiCall('POST', '/api/field/dcr', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Visit started!', 'success');
        var newName = (res.data && (res.data.name || (res.data.data && res.data.data.name) || (res.data.message && res.data.message.name))) || '';
        if (newName) {
          location.hash = '#/dcr/' + newName;
        } else {
          location.hash = '#/dcr';
        }
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Visit Detail ──────────────────────────────────────────────

  window.Screens.visitDetail = function (appEl, params) {
    var el = UI.el;
    var dcrName = params.id || params.name;

    var content = el('div');
    appEl.appendChild(content);
    var skel = UI.skeleton(3);
    content.appendChild(skel);

    window.fieldAPI.apiCall('GET', '/api/field/dcr/' + encodeURIComponent(dcrName)).then(function (res) {
      skel.remove();

      var dcr = null;
      if (res && res.data) {
        dcr = res.data.data || res.data.message || res.data;
      }
      if (!dcr) {
        content.appendChild(UI.error('Could not load visit.'));
        return;
      }

      var customer = dcr.customer || dcr.prospect_name || 'Unknown';
      var status = dcr.status || 'Planned';
      var isOngoing = status.toLowerCase() === 'ongoing';

      // M3 visit hero — customer name + visit purpose + status
      var hero = el('div', { className: 'profile-hero', style: { paddingTop: '8px', paddingBottom: '16px' } });
      hero.appendChild(UI.avatar(customer, 80));
      hero.appendChild(el('h2', { textContent: customer }));
      var purpose = dcr.visit_purpose || dcr.service_purpose || '';
      if (purpose) {
        hero.appendChild(el('p', { className: 'profile-subtitle', textContent: purpose }));
      }
      hero.appendChild(el('div', { style: { marginTop: '4px' } }, [UI.pill(status, statusColor(status))]));
      content.appendChild(hero);

      // Live duration timer (for ongoing visits)
      if (isOngoing && dcr.check_in_time) {
        var durationEl = el('div', {
          className: 'duration-timer',
          textContent: formatDurationLive(dcr.check_in_time)
        });
        content.appendChild(durationEl);

        var tid = setInterval(function () {
          durationEl.textContent = formatDurationLive(dcr.check_in_time);
        }, 1000);
        _timers.push(tid);
      }

      // Detail card
      var details = [
        { label: 'Customer', value: customer },
        { label: 'Purpose', value: dcr.visit_purpose || dcr.service_purpose || '\u2014' },
        { label: 'Department', value: dcr.department || '\u2014' },
        { label: 'Check In', value: formatTime(dcr.check_in_time) + (dcr.check_in_gps ? ' (' + dcr.check_in_gps + ')' : '') }
      ];

      if (dcr.check_out_time) {
        details.push({ label: 'Check Out', value: formatTime(dcr.check_out_time) + (dcr.check_out_gps ? ' (' + dcr.check_out_gps + ')' : '') });
      }

      if (dcr.check_in_time && dcr.check_out_time) {
        details.push({ label: 'Duration', value: formatDuration(dcr.check_in_time, dcr.check_out_time) });
      }

      if (dcr.remarks) {
        details.push({ label: 'Remarks', value: dcr.remarks });
      }
      if (dcr.discussion_remarks) {
        details.push({ label: 'Discussion', value: dcr.discussion_remarks });
      }
      if (dcr.next_action) {
        details.push({ label: 'Next Action', value: dcr.next_action });
      }
      if (dcr.next_action_date) {
        details.push({ label: 'Next Action Date', value: formatDate(dcr.next_action_date) });
      }
      if (dcr.conversion_status && dcr.conversion_status !== 'Open') {
        details.push({ label: 'Conversion', value: dcr.conversion_status });
      }

      content.appendChild(UI.detailCard(details));

      // Convert to Lead button (for completed visits with prospect data, no customer)
      if (!isOngoing && dcr.prospect_name && !dcr.customer) {
        var convertBtn = UI.btn('Convert to Lead', {
          type: 'outline',
          block: true,
          onClick: function () {
            convertBtn._setLoading(true, 'Creating lead...');
            var leadPayload = {
              lead_name: dcr.prospect_name,
              company_name: dcr.prospect_company || '',
              mobile_no: dcr.prospect_phone || '',
              source: 'Campaign',
              notes: 'Created from visit ' + dcrName + ' on ' + (dcr.date || '') + '. Purpose: ' + (dcr.visit_purpose || dcr.service_purpose || '')
            };
            window.fieldAPI.apiCall('POST', '/api/field/proxy/Lead', leadPayload).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                convertBtn._setLoading(false);
                return;
              }
              UI.toast('Lead created!', 'success');
              convertBtn._setLoading(false);
              convertBtn.style.display = 'none';
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              convertBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [convertBtn]));
      }

      // Editable remarks (for ongoing visits)
      if (isOngoing) {
        var remarksArea = UI.textarea('Add remarks...', { rows: 3, value: dcr.remarks || '' });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [
          UI.field('Remarks', remarksArea)
        ]));

        var saveRemarksBtn = UI.btn('Save Remarks', {
          type: 'outline',
          block: true,
          onClick: function () {
            var text = remarksArea.value.trim();
            if (!text) {
              UI.toast('Please enter remarks', 'danger');
              return;
            }
            saveRemarksBtn._setLoading(true, 'Saving...');
            window.fieldAPI.apiCall('PUT', '/api/field/dcr/' + encodeURIComponent(dcrName), {
              remarks: text
            }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed to save: ' + (r.error || 'Server error'), 'danger');
                saveRemarksBtn._setLoading(false);
                return;
              }
              UI.toast('Remarks saved', 'success');
              saveRemarksBtn._setLoading(false);
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              saveRemarksBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [saveRemarksBtn]));

        // Checkout button — opens outcome bottom sheet
        var checkoutBtn = UI.btn('Check out', {
          type: 'primary',
          block: true,
          icon: 'mapPin',
          onClick: function () {
            var purpose = dcr.visit_purpose || '';
            var sheetContent = el('div', { style: { padding: '0 4px' } });

            // Outcome checkboxes (conditional on visit_purpose)
            var leadToggle = null, oppToggle = null, orderToggle = null;
            var leadVal = false, oppVal = false, orderVal = false;

            var showLead = ['Cold Call / New Enquiry', 'Lead Follow-up'].indexOf(purpose) >= 0;
            var showOpp = ['Cold Call / New Enquiry', 'Lead Follow-up', 'Opportunity Follow-up'].indexOf(purpose) >= 0;
            var showOrder = purpose === 'Quotation Follow-up';

            if (showLead) {
              leadToggle = UI.toggle('Lead generated?', false, function (v) { leadVal = v; });
              sheetContent.appendChild(leadToggle);
            }
            if (showOpp) {
              oppToggle = UI.toggle('Opportunity generated?', false, function (v) { oppVal = v; });
              sheetContent.appendChild(oppToggle);
            }
            if (showOrder) {
              orderToggle = UI.toggle('Order received?', false, function (v) { orderVal = v; });
              sheetContent.appendChild(orderToggle);
            }

            // Discussion / Remark
            var discussionInput = UI.textarea('Discussion / Remark', { rows: 3 });
            sheetContent.appendChild(el('div', { style: { marginTop: '12px' } }, [
              UI.field('Discussion / Remark', discussionInput)
            ]));

            // Next action
            var nextActionInput = UI.textarea('Next action', { rows: 2 });
            sheetContent.appendChild(el('div', { style: { marginTop: '8px' } }, [
              UI.field('Next action', nextActionInput)
            ]));

            // Next action date
            var nextDateInput = UI.dateInput('Next action date', '');
            sheetContent.appendChild(el('div', { style: { marginTop: '8px' } }, [nextDateInput]));

            // Confirm checkout button
            var confirmBtn = UI.btn('Confirm checkout', {
              type: 'success',
              block: true,
              icon: 'mapPin',
              onClick: function () {
                confirmBtn._setLoading(true, 'Checking out...');
                getGPS().then(function (gpsResult) {
                  var now = nowIST();
                  var gpsStr = (gpsResult.lat != null && gpsResult.lng != null) ? gpsResult.lat + ',' + gpsResult.lng : '';
                  var dateInput = nextDateInput.querySelector('input');
                  var payload = {
                    check_out_time: now,
                    check_out_gps: gpsStr,
                    lead_generated: leadVal ? 1 : 0,
                    opportunity_generated: oppVal ? 1 : 0,
                    order_received: orderVal ? 1 : 0,
                    discussion_remarks: discussionInput.value.trim() || '',
                    next_action: nextActionInput.value.trim() || '',
                    next_action_date: (dateInput && dateInput.value) || ''
                  };
                  window.fieldAPI.apiCall('PUT', '/api/field/dcr/' + encodeURIComponent(dcrName) + '/checkout', payload).then(function (r) {
                    if (r.error || (r.status && r.status >= 400)) {
                      UI.toast('Checkout failed: ' + (r.error || 'Server error'), 'danger');
                      confirmBtn._setLoading(false);
                      return;
                    }
                    for (var j = 0; j < _timers.length; j++) clearInterval(_timers[j]);
                    _timers = [];
                    if (sheet && sheet._close) sheet._close();
                    UI.toast('Checked out!', 'success');
                    // Re-render the detail in place so the now-Completed state
                    // is reflected (hides remarks editor, checkout button, live
                    // duration timer). Avoid a hash round-trip — that flashes
                    // home and can strand the user there if a transition
                    // intercepts the bounce.
                    appEl.textContent = '';
                    window.Screens.visitDetail(appEl, { id: dcrName });
                  }).catch(function (err) {
                    UI.toast('Checkout failed: ' + (err.message || err), 'danger');
                    confirmBtn._setLoading(false);
                  });
                });
              }
            });
            sheetContent.appendChild(el('div', { style: { marginTop: '16px' } }, [confirmBtn]));

            var sheet = UI.bottomSheet('Check out', sheetContent);
            document.body.appendChild(sheet);
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [checkoutBtn]));
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load visit: ' + (err.message || err)));
    });
  };

})();
