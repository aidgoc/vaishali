/* home.js — Home screen for DSPL Field App (field staff + manager views) */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ──────────────────────────────────────────────────────

  function greetingText() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function formatDate(date) {
    var d = date || new Date();
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
  }

  function formatTime(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function firstName() {
    var emp = Auth.getEmployee();
    if (!emp || !emp.employee_name) return '';
    return emp.employee_name.split(' ')[0];
  }

  // ─── Greeting hero ────────────────────────────────────────────────

  function greetingHero(showDepartment) {
    var children = [
      el('h2', null, [greetingText() + ', ' + firstName()])
    ];
    var metaParts = [];
    if (showDepartment) {
      var emp = Auth.getEmployee();
      var dept = emp && emp.department ? emp.department : '';
      if (dept) metaParts.push(dept);
    }
    metaParts.push(formatDate());
    children.push(el('div', { className: 'greeting-meta' }, [metaParts.join(' \u00b7 ')]));
    return el('div', { className: 'greeting-hero' }, children);
  }

  // ─── Attendance card ──────────────────────────────────────────────

  function attendanceCard(att) {
    var checkedIn = att && att.checked_in;
    var accent = checkedIn ? 'green' : 'blue';
    var statusText = checkedIn ? 'Checked in' : 'Not checked in';
    var children = [
      el('div', { className: 'attendance-status' }, [
        el('span', { className: 'attendance-dot ' + (checkedIn ? 'dot-green' : 'dot-gray') }),
        el('span', { textContent: statusText })
      ])
    ];
    if (checkedIn && att.check_in_time) {
      children.push(
        el('div', { className: 'attendance-time', textContent: 'Since ' + formatTime(att.check_in_time) })
      );
    }
    if (checkedIn && att.check_out_time) {
      children.push(
        el('div', { className: 'attendance-time', textContent: 'Out at ' + formatTime(att.check_out_time) })
      );
    }
    return UI.card(children, {
      accent: accent,
      tappable: true,
      onClick: function () { location.hash = '#/attendance'; }
    });
  }

  // ─── Visit card ───────────────────────────────────────────────────

  function visitCard(dcr) {
    var statusColor = dcr.status === 'Completed' ? 'green' : 'orange';
    return UI.listCard({
      title: dcr.customer || dcr.lead || 'Visit',
      sub: dcr.visit_purpose || dcr.service_purpose || '',
      right: UI.pill(dcr.status || 'Ongoing', statusColor),
      onClick: function () { location.hash = '#/dcr/' + encodeURIComponent(dcr.name); }
    });
  }

  // ─── HR tiles ─────────────────────────────────────────────────────

  function hrTiles() {
    var tiles = [
      { label: 'Leave', ic: 'umbrella', hash: '#/leave' },
      { label: 'Salary', ic: 'wallet', hash: '#/salary' },
      { label: 'Expenses', ic: 'receipt', hash: '#/expense' },
      { label: 'Advances', ic: 'banknote', hash: '#/advance' }
    ];
    var tileEls = [];
    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        var tileEl = el('div', {
          className: 'hr-tile',
          onClick: function () { location.hash = t.hash; }
        }, [
          icon(t.ic),
          el('span', { textContent: t.label })
        ]);
        tileEls.push(tileEl);
      })(tiles[i]);
    }
    return el('div', { className: 'hr-grid' }, tileEls);
  }

  // ─── Field Home ───────────────────────────────────────────────────

  function renderFieldHome(appEl) {
    appEl.appendChild(UI.skeleton(3));

    var today = todayISO();

    Promise.all([
      api.apiCall('GET', '/api/field/attendance/today'),
      api.apiCall('GET', '/api/field/dcr?date=' + today)
    ]).then(function (results) {
      appEl.textContent = '';

      var attResult = results[0];
      var dcrResult = results[1];

      var attRaw = attResult.data || {};
      var att = attRaw.message || attRaw.data || attRaw;
      var dcrRaw = dcrResult.data || {};
      var dcrs = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);

      var visitCount = dcrs.length;
      var completedCount = 0;
      for (var i = 0; i < dcrs.length; i++) {
        if (dcrs[i].status === 'Completed') completedCount++;
      }

      // Greeting
      appEl.appendChild(greetingHero(true));

      // Attendance card
      appEl.appendChild(attendanceCard(att));

      // Stats row
      appEl.appendChild(UI.grid([
        UI.statCard(visitCount, 'Visits'),
        UI.statCard(completedCount, 'Completed')
      ], 2));

      // New Visit button
      appEl.appendChild(UI.btn('+ New Visit', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/dcr/new'; }
      }));

      // HR tiles
      appEl.appendChild(UI.sectionHeading('HR SERVICES'));
      appEl.appendChild(hrTiles());

      // Service quick links (for service department employees)
      var empSvc = Auth.getEmployee();
      var deptSvc = (empSvc && empSvc.department) ? empSvc.department.toLowerCase() : '';
      if (deptSvc.indexOf('service') !== -1) {
        appEl.appendChild(UI.sectionHeading('SERVICE'));
        var serviceGrid = el('div', { className: 'hr-grid' }, [
          el('div', { className: 'hr-tile', onClick: function() { location.hash = '#/service'; } }, [
            icon('wrench'), el('span', { textContent: 'Dashboard' })
          ]),
          el('div', { className: 'hr-tile', onClick: function() { location.hash = '#/installations'; } }, [
            icon('package'), el('span', { textContent: 'Installs' })
          ]),
          el('div', { className: 'hr-tile', onClick: function() { location.hash = '#/breakdowns'; } }, [
            icon('alert'), el('span', { textContent: 'Breakdowns' })
          ])
        ]);
        appEl.appendChild(serviceGrid);
      }

      // Production quick links (for production department employees)
      var empProd = Auth.getEmployee();
      var deptProd = (empProd && empProd.department) ? empProd.department.toLowerCase() : '';
      if (deptProd.indexOf('production') !== -1 || deptProd.indexOf('manufacturing') !== -1) {
        appEl.appendChild(UI.sectionHeading('PRODUCTION'));
        var prodGrid = el('div', { className: 'hr-grid' }, [
          el('div', { className: 'hr-tile', onClick: function() { location.hash = '#/production'; } }, [
            icon('settings'), el('span', { textContent: 'Dashboard' })
          ]),
          el('div', { className: 'hr-tile', onClick: function() { location.hash = '#/dispatch'; } }, [
            icon('shoppingCart'), el('span', { textContent: 'Dispatch' })
          ])
        ]);
        appEl.appendChild(prodGrid);
      }

      // Sales quick links (for users with sales-related departments)
      var empData = Auth.getEmployee() || {};
      var dept = (empData.department || '').toLowerCase();
      var hasSalesAccess = dept.indexOf('sales') >= 0 || dept.indexOf('marketing') >= 0 || Auth.isManager();
      if (hasSalesAccess) {
        appEl.appendChild(UI.sectionHeading('SALES QUICK LINKS'));
        var salesLinksRow = el('div', { className: 'quick-links-row' }, [
          UI.btn('My Targets', {
            type: 'outline',
            onClick: function () { location.hash = '#/targets'; }
          }),
          UI.btn('Follow Ups', {
            type: 'outline',
            onClick: function () { location.hash = '#/follow-ups'; }
          })
        ]);
        appEl.appendChild(salesLinksRow);
      }

      // Upcoming holidays — via whitelisted endpoint (avoids Holiday List permission issues)
      var holidayContainer = el('div');
      appEl.appendChild(holidayContainer);
      api.apiCall('GET', '/api/field/holidays').then(function (hlRes) {
        var holidays = (hlRes.data && (hlRes.data.data || hlRes.data.message)) || hlRes.data || [];
        if (!Array.isArray(holidays) || holidays.length === 0) return;
        holidayContainer.appendChild(UI.sectionHeading('UPCOMING HOLIDAYS'));
        for (var h = 0; h < holidays.length; h++) {
          var hol = holidays[h];
          var hDate = hol.holiday_date || '';
          var hDesc = (hol.description || '').replace(/<[^>]*>/g, '').trim();
          var dParts = hDate.split('-');
          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var dateLabel = dParts.length === 3 ? parseInt(dParts[2], 10) + ' ' + months[parseInt(dParts[1], 10) - 1] : hDate;
          holidayContainer.appendChild(UI.listCard({ title: hDesc, sub: dateLabel }));
        }
      }).catch(function () { /* ignore */ });

      // Today's visits
      appEl.appendChild(UI.sectionHeading("TODAY'S VISITS"));
      if (dcrs.length === 0) {
        appEl.appendChild(UI.empty('empty', 'No visits today'));
      } else {
        for (var j = 0; j < dcrs.length; j++) {
          appEl.appendChild(visitCard(dcrs[j]));
        }
      }
    }).catch(function () {
      appEl.textContent = '';
      appEl.appendChild(greetingHero(true));
      appEl.appendChild(UI.error('Could not load dashboard data. Pull down to retry.'));
    });
  }

  // ─── Manager Home ─────────────────────────────────────────────────

  function renderManagerHome(appEl) {
    appEl.appendChild(UI.skeleton(3));

    var today = todayISO();

    Promise.all([
      api.apiCall('GET', '/api/field/team'),
      api.apiCall('GET', '/api/field/approvals'),
      api.apiCall('GET', '/api/field/attendance/today'),
      api.apiCall('GET', '/api/field/dcr?date=' + today)
    ]).then(function (results) {
      appEl.textContent = '';

      var teamResult = results[0];
      var approvalsResult = results[1];
      var attResult = results[2];
      var dcrResult = results[3];

      var teamRaw = teamResult.data || {};
      var teamData = teamRaw.message || teamRaw.data || teamRaw;
      var presentCount = teamData.present_count || 0;
      var totalCount = teamData.total_count || 0;
      var teamMembers = teamData.data || teamData.members || [];

      var appRaw = approvalsResult.data || {};
      var approvals = appRaw.data || appRaw.message || (Array.isArray(appRaw) ? appRaw : []);
      var pendingCount = approvals.length;

      var attRaw = attResult.data || {};
      var att = attRaw.message || attRaw.data || attRaw;

      var dcrRaw = dcrResult.data || {};
      var dcrs = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);
      var myVisitCount = dcrs.length;

      // Count team in-field from team data
      var teamFieldCount = 0;
      for (var i = 0; i < teamMembers.length; i++) {
        if (teamMembers[i].status === 'In Field') teamFieldCount++;
      }

      // Greeting
      appEl.appendChild(greetingHero(true));

      // KPI row
      appEl.appendChild(UI.grid([
        UI.statCard(presentCount + '/' + totalCount, 'Team Present'),
        UI.statCard(pendingCount, 'Approvals'),
        UI.statCard(teamFieldCount, 'In Field')
      ], 3));

      // ── ACTIONS — daily tasks everyone needs ──
      appEl.appendChild(UI.sectionHeading('ACTIONS'));

      // Attendance card
      appEl.appendChild(attendanceCard(att));

      // New Visit + My Visits row
      appEl.appendChild(el('div', { className: 'action-row', style: { display: 'flex', gap: '8px', margin: '8px 0' } }, [
        UI.btn('+ New Visit', {
          type: 'primary',
          icon: 'mapPin',
          onClick: function () { location.hash = '#/dcr/new'; }
        }),
        UI.btn('My Visits' + (myVisitCount ? ' (' + myVisitCount + ')' : ''), {
          type: 'outline',
          onClick: function () { location.hash = '#/dcr'; }
        })
      ]));

      // HR tiles
      appEl.appendChild(hrTiles());

      // ── PENDING APPROVALS ──
      appEl.appendChild(UI.sectionHeading('PENDING APPROVALS'));

      if (approvals.length === 0) {
        appEl.appendChild(UI.empty('check', 'No pending approvals'));
      } else {
        var shown = Math.min(approvals.length, 3);
        for (var j = 0; j < shown; j++) {
          var item = approvals[j];
          var typeName = item.doctype || item.type || '';
          var typeColor = typeName === 'Leave Application' ? 'blue'
            : typeName === 'Expense Claim' ? 'orange'
            : 'green';
          appEl.appendChild(UI.listCard({
            avatar: item.employee_name || item.employee || '',
            title: item.employee_name || item.employee || '',
            sub: item.name || '',
            right: UI.pill(typeName.replace(' Application', '').replace(' Claim', ''), typeColor),
            onClick: function () { location.hash = '#/approvals'; }
          }));
        }
        if (approvals.length > 3) {
          appEl.appendChild(el('div', { style: { textAlign: 'center', padding: '4px 0' } }, [
            UI.btn('View All (' + approvals.length + ')', {
              type: 'outline',
              onClick: function () { location.hash = '#/approvals'; }
            })
          ]));
        }
      }

      // ── SALES & CRM ──
      appEl.appendChild(UI.sectionHeading('SALES & CRM'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/pipeline'; } }, [
          icon('shoppingCart'), el('span', { textContent: 'Pipeline' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/targets'; } }, [
          icon('briefcase'), el('span', { textContent: 'Targets' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/follow-ups'; } }, [
          icon('clock'), el('span', { textContent: 'Follow Ups' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/customers'; } }, [
          icon('users'), el('span', { textContent: 'Customers' })
        ])
      ]));

      // ── OPERATIONS ──
      appEl.appendChild(UI.sectionHeading('OPERATIONS'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/service'; } }, [
          icon('settings'), el('span', { textContent: 'Service' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/production'; } }, [
          icon('refresh'), el('span', { textContent: 'Production' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/dispatch'; } }, [
          icon('shoppingCart'), el('span', { textContent: 'Dispatch' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/breakdowns'; } }, [
          icon('bell'), el('span', { textContent: 'Breakdowns' })
        ])
      ]));

      // ── FINANCE & MANAGEMENT ──
      appEl.appendChild(UI.sectionHeading('FINANCE'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/revenue'; } }, [
          icon('wallet'), el('span', { textContent: 'Revenue' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/debtors'; } }, [
          icon('receipt'), el('span', { textContent: 'Receivables' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/projects'; } }, [
          icon('clip'), el('span', { textContent: 'Projects' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/team'; } }, [
          icon('users'), el('span', { textContent: 'Team' })
        ])
      ]));

      // Upcoming holidays — via whitelisted endpoint
      var mgrHolidayContainer = el('div');
      appEl.appendChild(mgrHolidayContainer);
      api.apiCall('GET', '/api/field/holidays').then(function (hlRes) {
        var holidays = (hlRes.data && (hlRes.data.data || hlRes.data.message)) || hlRes.data || [];
        if (!Array.isArray(holidays) || holidays.length === 0) return;
        mgrHolidayContainer.appendChild(UI.sectionHeading('UPCOMING HOLIDAYS'));
        for (var h = 0; h < holidays.length; h++) {
          var hol = holidays[h];
          var hDate = hol.holiday_date || '';
          var hDesc = (hol.description || '').replace(/<[^>]*>/g, '').trim();
          var dParts = hDate.split('-');
          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var dateLabel = dParts.length === 3 ? parseInt(dParts[2], 10) + ' ' + months[parseInt(dParts[1], 10) - 1] : hDate;
          mgrHolidayContainer.appendChild(UI.listCard({ title: hDesc, sub: dateLabel }));
        }
      }).catch(function () { /* ignore */ });
    }).catch(function () {
      appEl.textContent = '';
      appEl.appendChild(greetingHero(false));
      appEl.appendChild(UI.error('Could not load manager dashboard. Pull down to retry.'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.home = function (appEl) {
    if (Auth.isManager()) {
      renderManagerHome(appEl);
    } else {
      renderFieldHome(appEl);
    }
  };

})();
