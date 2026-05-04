/* amc.js — AMC Tracker screen for Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'active' || s === 'scheduled' || s === 'completed') return 'green';
    if (s === 'upcoming' || s === 'pending') return 'yellow';
    if (s === 'overdue' || s === 'cancelled') return 'red';
    if (s === 'expired') return 'red';
    return 'gray';
  }

  function isRenewalDue(endDate) {
    if (!endDate) return false;
    var end = new Date(endDate + 'T00:00:00');
    if (isNaN(end.getTime())) return false;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var diffDays = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ═══════════════════════════════════════════════════════════════════
  // AMC TRACKER — #/amc
  // ═══════════════════════════════════════════════════════════════════

  function amcTracker(appEl) {
    appEl.textContent = '';

    var content = el('div');
    content.appendChild(UI.skeleton(3));
    appEl.appendChild(content);

    api.apiCall('GET', '/api/field/view/amc_tracker').then(function (res) {
      content.textContent = '';

      if (res.error) {
        content.appendChild(UI.error('Failed to load AMC data: ' + (res.error || 'Unknown error')));
        return;
      }

      var data = res.data || {};
      var schedules = data.schedules || data.data || [];
      var visits = data.visits || [];

      if ((!Array.isArray(schedules) || schedules.length === 0) && (!Array.isArray(visits) || visits.length === 0)) {
        // Helpful empty state
        var emptyBox = el('div', { className: 'empty-state' }, [
          el('div', { className: 'empty-icon', textContent: '' }),
          el('div', { textContent: 'No maintenance schedules found.' }),
          el('div', {
            className: 'list-sub',
            style: { marginTop: '8px' },
            textContent: 'Create them in ERPNext under Maintenance Schedule.'
          })
        ]);
        // Add icon via UI helper if available
        var iconContainer = emptyBox.querySelector('.empty-icon');
        if (iconContainer && window.icon) {
          iconContainer.textContent = '';
          iconContainer.appendChild(window.icon('calendar'));
        }
        content.appendChild(emptyBox);
        return;
      }

      // Active Maintenance Schedules
      if (Array.isArray(schedules) && schedules.length > 0) {
        content.appendChild(el('div', {
          className: 'list-sub',
          style: { fontWeight: '700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', color: 'var(--ink-secondary)' },
          textContent: 'Maintenance Schedules'
        }));

        for (var i = 0; i < schedules.length; i++) {
          (function (sched) {
            var sub = '';
            if (sched.maintenance_type) sub += sched.maintenance_type;
            if (sched.start_date) sub += (sub ? ' \u00B7 ' : '') + formatDate(sched.start_date);
            if (sched.end_date) sub += ' \u2013 ' + formatDate(sched.end_date);

            // Build header row with status pill and optional renewal badge
            var headerRight = el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });
            if (isRenewalDue(sched.end_date)) {
              headerRight.appendChild(UI.pill('Renewal Due', 'yellow'));
            }
            headerRight.appendChild(UI.pill(sched.status || 'Active', statusColor(sched.status)));

            // Log Visit button
            var logVisitBtn = el('button', {
              className: 'btn btn-outline',
              style: { marginTop: '8px', fontSize: '12px', padding: '4px 12px', alignSelf: 'flex-start' },
              textContent: 'Log Visit',
              onClick: function (e) {
                e.stopPropagation();
                var customer = sched.customer || sched.customer_name || '';
                location.hash = '#/dcr/new?department=Service&customer=' + encodeURIComponent(customer);
              }
            });

            var card = el('div', {
              className: 'amc-card list-card',
              style: { flexDirection: 'column', alignItems: 'stretch' },
              onClick: function () {
                var customer = sched.customer || sched.customer_name;
                if (customer) {
                  location.hash = '#/customer/' + encodeURIComponent(customer);
                }
              }
            }, [
              el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                el('div', { className: 'list-title', textContent: sched.customer_name || sched.customer || sched.name || '' }),
                headerRight
              ]),
              el('div', { className: 'list-sub', textContent: sub }),
              logVisitBtn
            ]);

            content.appendChild(card);
          })(schedules[i]);
        }
      }

      // Upcoming Maintenance Visits
      if (Array.isArray(visits) && visits.length > 0) {
        content.appendChild(el('div', {
          className: 'list-sub',
          style: { fontWeight: '700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', marginTop: '20px', color: 'var(--ink-secondary)' },
          textContent: 'Upcoming Visits'
        }));

        for (var j = 0; j < visits.length; j++) {
          (function (visit) {
            var sub = '';
            if (visit.maintenance_type) sub += visit.maintenance_type;
            if (visit.scheduled_date || visit.date) sub += (sub ? ' \u00B7 ' : '') + formatDate(visit.scheduled_date || visit.date);

            var card = el('div', {
              className: 'amc-card list-card',
              style: { flexDirection: 'column', alignItems: 'stretch' },
              onClick: function () {
                var customer = visit.customer || visit.customer_name;
                if (customer) {
                  location.hash = '#/customer/' + encodeURIComponent(customer);
                }
              }
            }, [
              el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, [
                el('div', { className: 'list-title', textContent: visit.customer_name || visit.customer || visit.name || '' }),
                UI.pill(visit.status || 'Upcoming', statusColor(visit.status))
              ]),
              el('div', { className: 'list-sub', textContent: sub })
            ]);

            content.appendChild(card);
          })(visits[j]);
        }
      }
    }).catch(function () {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load AMC data'));
    });
  }

  // ── Register screen ───────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.amcTracker = amcTracker;
})();
