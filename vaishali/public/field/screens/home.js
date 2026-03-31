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

  function formatCurrentTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function greetingHero(showDepartment) {
    var nameSpan = el('span', { className: 'greeting-name' }, [firstName()]);
    var children = [
      el('h2', null, [greetingText() + ', ', nameSpan])
    ];
    var metaParts = [];
    metaParts.push(formatDate());
    metaParts.push(formatCurrentTime());
    if (showDepartment) {
      var emp = Auth.getEmployee();
      var dept = emp && emp.department ? emp.department : '';
      if (dept) metaParts.push(dept);
    }
    children.push(el('div', { className: 'greeting-meta' }, [metaParts.join(' \u00b7 ')]));
    return el('div', { className: 'greeting-hero' }, children);
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

  // ─── Tabbed department navigation (manager) ───────────────────────

  function renderDeptTabs(container) {
    var tabContent = el('div');

    var tabBar = UI.tabs([
      { value: 'sales', label: 'Sales' },
      { value: 'operations', label: 'Operations' },
      { value: 'finance', label: 'Finance' }
    ], 'sales', function (val) {
      renderTabContent(tabContent, val);
    });

    container.appendChild(tabBar);
    container.appendChild(tabContent);
    renderTabContent(tabContent, 'sales');
  }

  function renderTabContent(container, tab) {
    container.textContent = '';
    var tiles = [];
    if (tab === 'sales') {
      tiles = [
        { label: 'Pipeline', ic: 'shoppingCart', hash: '#/pipeline' },
        { label: 'Targets', ic: 'briefcase', hash: '#/sales-targets' },
        { label: 'Follow Ups', ic: 'clock', hash: '#/follow-ups' },
        { label: 'Customers', ic: 'users', hash: '#/customers' },
        { label: 'Leads', ic: 'user', hash: '#/leads' },
        { label: 'Quotations', ic: 'file', hash: '#/quotations' }
      ];
    } else if (tab === 'operations') {
      tiles = [
        { label: 'Service', ic: 'settings', hash: '#/service' },
        { label: 'Devices', ic: 'package', hash: '#/devices' },
        { label: 'Production', ic: 'refresh', hash: '#/production' },
        { label: 'Dispatch', ic: 'shoppingCart', hash: '#/dispatch' },
        { label: 'Breakdowns', ic: 'bell', hash: '#/breakdowns' },
        { label: 'Stock', ic: 'briefcase', hash: '#/stock' }
      ];
    } else {
      tiles = [
        { label: 'Revenue', ic: 'wallet', hash: '#/revenue' },
        { label: 'Receivables', ic: 'receipt', hash: '#/debtors' },
        { label: 'Projects', ic: 'clip', hash: '#/projects' },
        { label: 'Team', ic: 'users', hash: '#/team' },
        { label: 'Approvals', ic: 'check', hash: '#/approvals' },
        { label: 'Report Card', ic: 'calendar', hash: '#/monthly-report' }
      ];
    }

    var grid = el('div', { className: 'hr-grid' });
    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        var tile = el('div', { className: 'hr-tile', onClick: function () { location.hash = t.hash; } }, [
          icon(t.ic), el('span', { textContent: t.label })
        ]);
        grid.appendChild(tile);
      })(tiles[i]);
    }
    container.appendChild(grid);
  }

  // ─── Department shortcuts (field staff) ───────────────────────────

  function renderDeptShortcuts(container) {
    var empData = Auth.getEmployee() || {};
    var dept = (empData.department || '').toLowerCase();

    if (dept.indexOf('sales') >= 0 || dept.indexOf('marketing') >= 0) {
      container.appendChild(UI.sectionHeading('Sales'));
      var salesTiles = [
        { label: 'Pipeline', ic: 'shoppingCart', hash: '#/pipeline' },
        { label: 'Targets', ic: 'briefcase', hash: '#/sales-targets' },
        { label: 'Follow Ups', ic: 'clock', hash: '#/follow-ups' },
        { label: 'Customers', ic: 'users', hash: '#/customers' }
      ];
      var salesGrid = el('div', { className: 'hr-grid' });
      for (var i = 0; i < salesTiles.length; i++) {
        (function (t) {
          salesGrid.appendChild(el('div', { className: 'hr-tile', onClick: function () { location.hash = t.hash; } }, [
            icon(t.ic), el('span', { textContent: t.label })
          ]));
        })(salesTiles[i]);
      }
      container.appendChild(salesGrid);
    }

    if (dept.indexOf('service') >= 0) {
      container.appendChild(UI.sectionHeading('Service'));
      var serviceTiles = [
        { label: 'Service', ic: 'settings', hash: '#/service' },
        { label: 'Devices', ic: 'package', hash: '#/devices' },
        { label: 'Installations', ic: 'package', hash: '#/installations' },
        { label: 'Breakdowns', ic: 'bell', hash: '#/breakdowns' }
      ];
      var serviceGrid = el('div', { className: 'hr-grid' });
      for (var j = 0; j < serviceTiles.length; j++) {
        (function (t) {
          serviceGrid.appendChild(el('div', { className: 'hr-tile', onClick: function () { location.hash = t.hash; } }, [
            icon(t.ic), el('span', { textContent: t.label })
          ]));
        })(serviceTiles[j]);
      }
      container.appendChild(serviceGrid);
    }

    if (dept.indexOf('production') >= 0 || dept.indexOf('manufacturing') >= 0) {
      container.appendChild(UI.sectionHeading('Production'));
      var prodTiles = [
        { label: 'Production', ic: 'settings', hash: '#/production' },
        { label: 'Dispatch', ic: 'shoppingCart', hash: '#/dispatch' }
      ];
      var prodGrid = el('div', { className: 'hr-grid' });
      for (var k = 0; k < prodTiles.length; k++) {
        (function (t) {
          prodGrid.appendChild(el('div', { className: 'hr-tile', onClick: function () { location.hash = t.hash; } }, [
            icon(t.ic), el('span', { textContent: t.label })
          ]));
        })(prodTiles[k]);
      }
      container.appendChild(prodGrid);
    }
  }

  // ─── Field Home ───────────────────────────────────────────────────

  function renderFieldHome(appEl) {
    appEl.appendChild(UI.skeleton(3));

    var today = todayISO();

    Promise.all([
      api.apiCall('GET', '/api/field/attendance/today'),
      api.apiCall('GET', '/api/field/dcr?date=' + today),
      api.apiCall('GET', '/api/field/leave-balance'),
      api.apiCall('GET', '/api/field/pending-expenses')
    ]).then(function (results) {
      appEl.textContent = '';

      var attResult = results[0];
      var dcrResult = results[1];
      var leaveResult = results[2];
      var expenseResult = results[3];

      var attRaw = attResult.data || {};
      var att = attRaw.message || attRaw.data || attRaw;
      var dcrRaw = dcrResult.data || {};
      var dcrs = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);

      var leaveRaw = leaveResult.data || {};
      var leaveBalances = leaveRaw.data || leaveRaw.message || (Array.isArray(leaveRaw) ? leaveRaw : []);
      var expenseRaw = expenseResult.data || {};
      var expenseData = expenseRaw.data || expenseRaw.message || expenseRaw || {};

      var checkedIn = att && att.checked_in;
      var visitCount = dcrs.length;

      // Find Privilege Leave balance
      var plBalance = null;
      for (var li = 0; li < leaveBalances.length; li++) {
        if (leaveBalances[li].leave_type === 'Privilege Leave') {
          plBalance = leaveBalances[li].remaining;
          break;
        }
      }
      // Fall back to first entry if no PL found
      if (plBalance === null && leaveBalances.length > 0) {
        plBalance = leaveBalances[0].remaining;
      }

      var expenseCount = expenseData.count || 0;
      var expenseTotal = expenseData.total || 0;

      // 1. Greeting hero
      appEl.appendChild(greetingHero(true));

      // 2. Action cards 2x2 grid
      var actionGrid = el('div', { className: 'action-grid' }, [
        UI.actionCard({
          icon: 'mapPin',
          label: checkedIn ? 'Check Out' : 'Check In',
          sub: checkedIn && att.check_in_time ? 'Since ' + formatTime(att.check_in_time) : 'Not checked in',
          onClick: function () { location.hash = '#/attendance'; }
        }),
        UI.actionCard({
          icon: 'clip',
          label: 'New Visit',
          value: visitCount || null,
          sub: visitCount ? (visitCount === 1 ? '1 visit today' : visitCount + ' visits today') : 'No visits yet',
          onClick: function () { location.hash = '#/dcr/new'; }
        }),
        UI.actionCard({
          icon: 'umbrella',
          label: 'Leave',
          value: plBalance !== null ? String(Math.floor(plBalance)) + ' PL' : null,
          onClick: function () { location.hash = '#/leave'; }
        }),
        UI.actionCard({
          icon: 'briefcase',
          label: 'My Targets',
          onClick: function () { location.hash = '#/my-targets'; }
        })
      ]);
      appEl.appendChild(actionGrid);

      // 3. Today's visits
      appEl.appendChild(UI.sectionHeading("Today's visits"));
      if (dcrs.length === 0) {
        appEl.appendChild(UI.empty('mapPin', 'No visits today', { text: '+ New visit', onClick: function() { location.hash = '#/dcr/new'; } }));
      } else {
        for (var j = 0; j < dcrs.length; j++) {
          appEl.appendChild(visitCard(dcrs[j]));
        }
      }

      // 4. HR Services
      appEl.appendChild(UI.sectionHeading('HR services'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/leave'; } }, [
          icon('umbrella'), el('span', { textContent: 'Leave' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/salary'; } }, [
          icon('wallet'), el('span', { textContent: 'Salary' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/expense'; } }, [
          icon('receipt'), el('span', { textContent: 'Expenses' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/advance'; } }, [
          icon('banknote'), el('span', { textContent: 'Advances' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/budget'; } }, [
          icon('receipt'), el('span', { textContent: 'Budget' })
        ])
      ]));

      // 5. Department shortcuts
      renderDeptShortcuts(appEl);

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
      api.apiCall('GET', '/api/field/dcr?date=' + today),
      api.apiCall('GET', '/api/field/leave-balance'),
      api.apiCall('GET', '/api/field/pending-expenses')
    ]).then(function (results) {
      appEl.textContent = '';

      var teamResult = results[0];
      var approvalsResult = results[1];
      var attResult = results[2];
      var dcrResult = results[3];
      var leaveResult = results[4];
      var expenseResult = results[5];

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
      var checkedIn = att && att.checked_in;

      var dcrRaw = dcrResult.data || {};
      var dcrs = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);
      var myVisitCount = dcrs.length;

      var leaveRaw = leaveResult.data || {};
      var leaveBalances = leaveRaw.data || leaveRaw.message || (Array.isArray(leaveRaw) ? leaveRaw : []);
      var expenseRaw = expenseResult.data || {};
      var expenseData = expenseRaw.data || expenseRaw.message || expenseRaw || {};

      // Count team in-field from team data
      var teamFieldCount = 0;
      for (var i = 0; i < teamMembers.length; i++) {
        if (teamMembers[i].status === 'In Field') teamFieldCount++;
      }

      // Find Privilege Leave balance
      var plBalance = null;
      for (var li = 0; li < leaveBalances.length; li++) {
        if (leaveBalances[li].leave_type === 'Privilege Leave') {
          plBalance = leaveBalances[li].remaining;
          break;
        }
      }
      if (plBalance === null && leaveBalances.length > 0) {
        plBalance = leaveBalances[0].remaining;
      }

      var expenseCount = expenseData.count || 0;
      var expenseTotal = expenseData.total || 0;

      // 1. Greeting hero
      appEl.appendChild(greetingHero(true));

      // 2. KPI chips row
      // Count total team visits from DCR data (team members in field)
      var teamVisitCount = 0;
      for (var vi = 0; vi < teamMembers.length; vi++) {
        teamVisitCount += (teamMembers[vi].visit_count || 0);
      }
      // Fall back to own visit count if team visit data unavailable
      if (teamVisitCount === 0) teamVisitCount = myVisitCount;

      appEl.appendChild(UI.kpiRow([
        { value: presentCount + '/' + totalCount, label: 'Team Present' },
        { value: pendingCount, label: 'Approvals' },
        { value: teamVisitCount, label: 'Visits Today' }
      ]));

      // 3. Action cards 2x2 grid
      var actionGrid = el('div', { className: 'action-grid' }, [
        UI.actionCard({
          icon: 'mapPin',
          label: checkedIn ? 'Check Out' : 'Check In',
          sub: checkedIn && att.check_in_time ? 'Since ' + formatTime(att.check_in_time) : 'Not checked in',
          onClick: function () { location.hash = '#/attendance'; }
        }),
        UI.actionCard({
          icon: 'clip',
          label: 'New Visit',
          value: myVisitCount || null,
          sub: myVisitCount ? (myVisitCount === 1 ? '1 visit today' : myVisitCount + ' visits today') : 'No visits yet',
          onClick: function () { location.hash = '#/dcr/new'; }
        }),
        UI.actionCard({
          icon: 'umbrella',
          label: 'Leave',
          value: plBalance !== null ? String(Math.floor(plBalance)) + ' PL' : null,
          onClick: function () { location.hash = '#/leave'; }
        }),
        UI.actionCard({
          icon: 'receipt',
          label: 'Expenses',
          value: expenseCount > 0 ? String(expenseCount) : null,
          sub: expenseCount > 0 ? '\u20b9' + expenseTotal.toLocaleString('en-IN') + ' pending' : null,
          onClick: function () { location.hash = '#/expense'; }
        }),
        UI.actionCard({
          icon: 'receipt',
          label: 'Budget',
          onClick: function () { location.hash = '#/budget'; }
        })
      ]);
      appEl.appendChild(actionGrid);

      // 3b. HR Services row
      appEl.appendChild(UI.sectionHeading('HR services'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/leave'; } }, [
          icon('umbrella'), el('span', { textContent: 'Leave' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/salary'; } }, [
          icon('wallet'), el('span', { textContent: 'Salary' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/expense'; } }, [
          icon('receipt'), el('span', { textContent: 'Expenses' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/advance'; } }, [
          icon('banknote'), el('span', { textContent: 'Advances' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/budget'; } }, [
          icon('receipt'), el('span', { textContent: 'Budget' })
        ])
      ]));

      // 4. Pending Approvals section
      appEl.appendChild(UI.sectionHeading('Pending approvals'));
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

      // 5. Sales cycle section (manager only)
      appEl.appendChild(UI.sectionHeading('Sales cycle'));
      appEl.appendChild(el('div', { className: 'hr-grid' }, [
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/sales-orders'; } }, [
          icon('file'), el('span', { textContent: 'Sales Orders' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/delivery-notes'; } }, [
          icon('package'), el('span', { textContent: 'Delivery Notes' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/sales-invoices'; } }, [
          icon('receipt'), el('span', { textContent: 'Invoices' })
        ]),
        el('div', { className: 'hr-tile', onClick: function () { location.hash = '#/payments/new'; } }, [
          icon('wallet'), el('span', { textContent: 'Record Payment' })
        ])
      ]));

      // 6. Tabbed department navigation
      appEl.appendChild(UI.sectionHeading('Departments'));
      renderDeptTabs(appEl);

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
