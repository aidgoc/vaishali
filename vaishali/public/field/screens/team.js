/* team.js — Team Overview screen for Field PWA (Manager) */
(function () {
  'use strict';

  var api = window.fieldAPI;

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    var mm = minutes < 10 ? '0' + minutes : String(minutes);
    return hours + ':' + mm + ' ' + ampm;
  }

  // ── Screen: Team Overview ────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.teamOverview = function (appEl) {
    var el = UI.el;
    var content = el('div', { style: { padding: '0 16px 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/team').then(function (res) {
      content.textContent = '';

      if (res.error) {
        content.appendChild(UI.error('Could not load team data'));
        return;
      }

      var data = (res.data && res.data) ? res.data : {};
      var employees = data.data || [];
      var presentCount = data.present_count || 0;
      var totalCount = data.total_count || 0;
      var absentCount = totalCount - presentCount;

      // Stats
      content.appendChild(UI.grid([
        UI.statCard(presentCount, 'Present'),
        UI.statCard(absentCount, 'Absent')
      ], 2));

      // Employee list
      content.appendChild(UI.sectionHeading('Employees'));

      if (employees.length === 0) {
        content.appendChild(UI.empty('users', 'No team members found'));
        return;
      }

      for (var i = 0; i < employees.length; i++) {
        (function (emp) {
          var isPresent = emp.status === 'present';
          var sub = emp.department || '';
          if (emp.check_in_time) {
            sub += (sub ? '  \u00b7  ' : '') + formatTime(emp.check_in_time);
          }

          content.appendChild(UI.listCard({
            avatar: emp.employee_name,
            title: emp.employee_name,
            sub: sub,
            right: UI.pill(
              isPresent ? 'Present' : 'Absent',
              isPresent ? 'green' : 'gray'
            )
          }));
        })(employees[i]);
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load team data: ' + (err.message || err)));
    });
  };

})();
