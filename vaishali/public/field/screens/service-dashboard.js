/* service-dashboard.js — Service engineer home dashboard */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'fully completed' || s === 'completed' || s === 'closed') return 'green';
    if (s === 'partially completed' || s === 'work in progress' || s === 'ongoing') return 'orange';
    if (s === 'open') return 'red';
    return 'gray';
  }

  function removeSkeleton(container) {
    var skeletons = container.querySelectorAll('.skeleton');
    for (var i = 0; i < skeletons.length; i++) {
      if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
    }
  }

  // ── Main Screen ──────────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.serviceDashboard = function (appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/service_dashboard').then(function (res) {
      removeSkeleton(appEl);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load service dashboard'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var pendingInstalls = sections.pending_installations || [];
      var openBreakdowns = sections.open_breakdowns || [];
      var todaysVisits = sections.todays_visits || [];
      var recentCompleted = sections.recent_completed || [];

      // ── Stat Cards ──
      appEl.appendChild(UI.grid([
        UI.statCard(openBreakdowns.length, 'Open Breakdowns'),
        UI.statCard(pendingInstalls.length, 'Pending Installs'),
        UI.statCard(todaysVisits.length, 'Visits Today'),
        UI.statCard(recentCompleted.length, 'Completed This Month')
      ], 2));

      // ── Quick Actions ──
      var actions = el('div', { className: 'service-actions' }, [
        UI.btn('Log Breakdown', {
          type: 'primary',
          icon: 'alert',
          onClick: function () { location.hash = '#/breakdown/new'; }
        }),
        UI.btn('Installations', {
          type: 'outline',
          icon: 'settings',
          onClick: function () { location.hash = '#/installations'; }
        })
      ]);
      appEl.appendChild(actions);

      // ── Today's Visits ──
      if (todaysVisits.length > 0) {
        appEl.appendChild(el('h3', { textContent: "Today's Visits", style: { margin: '20px 0 8px 0' } }));
        for (var i = 0; i < todaysVisits.length; i++) {
          (function (v) {
            var customer = v.customer || 'Unknown';
            var type = v.maintenance_type || '';
            var status = v.completion_status || '';
            var sub = [type, formatDate(v.mntc_date)].filter(Boolean).join(' \u00b7 ');

            appEl.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/installation/' + encodeURIComponent(v.name); }
            }));
          })(todaysVisits[i]);
        }
      }

      // ── Open Breakdowns Preview ──
      if (openBreakdowns.length > 0) {
        appEl.appendChild(el('h3', { textContent: 'Open Breakdowns', style: { margin: '20px 0 8px 0' } }));
        var showCount = Math.min(openBreakdowns.length, 3);
        for (var j = 0; j < showCount; j++) {
          (function (b) {
            var customer = b.customer || 'Unknown';
            var complaint = b.complaint || '';
            var sub = [complaint.substring(0, 60), formatDate(b.complaint_date)].filter(Boolean).join(' \u00b7 ');

            appEl.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(b.status || 'Open', statusColor(b.status)),
              onClick: function () { location.hash = '#/breakdown/' + encodeURIComponent(b.name); }
            }));
          })(openBreakdowns[j]);
        }
        if (openBreakdowns.length > 3) {
          appEl.appendChild(el('div', { style: { textAlign: 'center', padding: '8px 0' } }, [
            UI.btn('View All Breakdowns', {
              type: 'outline',
              onClick: function () { location.hash = '#/breakdowns'; }
            })
          ]));
        }
      }

    }).catch(function () {
      removeSkeleton(appEl);
      appEl.appendChild(UI.error('Could not load service dashboard'));
    });
  };

})();
