/* attendance.js — Attendance screen for DSPL Field PWA */
(function () {
  'use strict';

  var _timers = [];

  // Cleanup on navigation
  window.addEventListener('hashchange', function () {
    for (var i = 0; i < _timers.length; i++) clearInterval(_timers[i]);
    _timers = [];
  });

  // ── Helpers ──────────────────────────────────────────────────────────

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

  function formatTime(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function formatDurationLive(startISO) {
    var start = new Date(startISO).getTime();
    var diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    var s = diff % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatDurationHM(startISO, endISO) {
    var start = new Date(startISO).getTime();
    var end = new Date(endISO).getTime();
    var diff = Math.max(0, Math.floor((end - start) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function padHHmm() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + (m < 10 ? '0' : '') + m;
  }

  // ── Screen ──────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.attendance = function (appEl) {
    // Clear any leftover timers from previous render
    for (var i = 0; i < _timers.length; i++) clearInterval(_timers[i]);
    _timers = [];

    var el = UI.el;

    // Header
    appEl.appendChild(UI.page('Attendance', '#/home'));

    // GPS display card
    var gpsBox = UI.card([
      el('div', { className: 'coords', textContent: 'Locating...' })
    ], { className: 'gps-display' });
    appEl.appendChild(gpsBox);

    // Action area
    var actionArea = el('div', { style: { marginTop: '20px' } });
    appEl.appendChild(actionArea);

    // GPS state
    var gps = { lat: null, lng: null, accuracy: null };

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
        className: 'coords',
        textContent: gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6)
      }));
      gpsBox.appendChild(el('div', {
        textContent: 'Accuracy: ' + gps.accuracy + 'm',
        style: { marginTop: '4px', fontSize: '13px', color: 'var(--text-muted)' }
      }));
    });

    // Show loading while fetching attendance
    actionArea.appendChild(UI.skeleton(2));

    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || 'unknown';
    var today = todayISO();

    // Fetch attendance status
    window.fieldAPI.apiCall('GET', '/api/field/attendance/today').then(function (res) {
      var raw = (!res.error && res.data) ? res.data : null;
      var att = raw ? (raw.message || raw.data || raw) : null;
      renderState(actionArea, att, empName, today, gps);
    }).catch(function () {
      actionArea.textContent = '';
      actionArea.appendChild(UI.error('Could not load attendance status'));
    });

    function renderState(container, att, empName, today, gps) {
      container.textContent = '';
      att = att || {};
      // Normalize field names (FastAPI uses check_in_time, native uses checkin_time)
      if (att.checkin_time && !att.check_in_time) att.check_in_time = att.checkin_time;
      if (att.checkout_time && !att.check_out_time) att.check_out_time = att.checkout_time;

      if (!att.check_in_time) {
        // State 1: Not checked in
        var checkinBtn = UI.btn('CHECK IN', {
          type: 'success',
          block: true,
          icon: 'clock',
          onClick: function () {
            checkinBtn._setLoading(true, 'Checking in...');
            var key = empName + '_' + today + '_IN_' + padHHmm();
            window.fieldAPI.apiCall('POST', '/api/field/attendance', {
              log_type: 'IN',
              latitude: gps.lat,
              longitude: gps.lng,
              idempotency_key: key
            }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast('Check-in failed: ' + (res.error || 'Server error'), 'danger');
                checkinBtn._setLoading(false);
                return;
              }
              UI.toast('Checked in!', 'success');
              window.fieldAPI.apiCall('GET', '/api/field/attendance/today').then(function (r2) {
                var r2raw = (!r2.error && r2.data) ? r2.data : null;
                var newAtt = r2raw ? (r2raw.message || r2raw.data || r2raw) : null;
                renderState(container, newAtt, empName, today, gps);
              });
            }).catch(function (err) {
              UI.toast('Check-in failed: ' + (err.message || 'Network error'), 'danger');
              checkinBtn._setLoading(false);
            });
          }
        });
        container.appendChild(checkinBtn);

      } else if (!att.check_out_time) {
        // State 2: Checked in, not checked out
        container.appendChild(el('div', {
          textContent: 'Checked in at ' + formatTime(att.check_in_time),
          style: { textAlign: 'center', fontWeight: '500', marginBottom: '12px', color: 'var(--text-muted)', fontSize: '14px' }
        }));

        var durationEl = el('div', {
          className: 'duration-timer',
          textContent: formatDurationLive(att.check_in_time)
        });
        container.appendChild(durationEl);

        // Live timer
        var tid = setInterval(function () {
          durationEl.textContent = formatDurationLive(att.check_in_time);
        }, 1000);
        _timers.push(tid);

        var checkoutBtn = UI.btn('CHECK OUT', {
          type: 'primary',
          block: true,
          icon: 'clock',
          onClick: function () {
            checkoutBtn._setLoading(true, 'Checking out...');
            var key = empName + '_' + today + '_OUT_' + padHHmm();
            window.fieldAPI.apiCall('POST', '/api/field/attendance', {
              log_type: 'OUT',
              latitude: gps.lat,
              longitude: gps.lng,
              idempotency_key: key
            }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast('Check-out failed: ' + (res.error || 'Server error'), 'danger');
                checkoutBtn._setLoading(false);
                return;
              }
              // Clear timers on successful checkout
              for (var j = 0; j < _timers.length; j++) clearInterval(_timers[j]);
              _timers = [];
              UI.toast('Checked out!', 'success');
              window.fieldAPI.apiCall('GET', '/api/field/attendance/today').then(function (r2) {
                var r2raw = (!r2.error && r2.data) ? r2.data : null;
                var newAtt = r2raw ? (r2raw.message || r2raw.data || r2raw) : null;
                renderState(container, newAtt, empName, today, gps);
              });
            }).catch(function (err) {
              UI.toast('Check-out failed: ' + (err.message || 'Network error'), 'danger');
              checkoutBtn._setLoading(false);
            });
          }
        });
        container.appendChild(checkoutBtn);

      } else {
        // State 3: Both done
        for (var j = 0; j < _timers.length; j++) clearInterval(_timers[j]);
        _timers = [];

        var checkIcon = icon('check', 48);
        var iconWrapper = el('div', { style: { textAlign: 'center', marginBottom: '12px', color: 'var(--green, #28a745)', display: 'flex', justifyContent: 'center' } });
        iconWrapper.appendChild(checkIcon);

        container.appendChild(el('div', { style: { textAlign: 'center' } }, [
          iconWrapper,
          el('div', {
            textContent: 'Attendance Complete',
            style: { fontWeight: '600', fontSize: '18px', marginBottom: '12px' }
          }),
          UI.detailCard([
            { label: 'Check In', value: formatTime(att.check_in_time) },
            { label: 'Check Out', value: formatTime(att.check_out_time) },
            { label: 'Duration', value: formatDurationHM(att.check_in_time, att.check_out_time) }
          ])
        ]));
      }
    }
  };
})();
