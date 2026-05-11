/* home.js — Home screen for Field App (field staff + manager views) */
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

  function daysAgoISO(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function shortDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var mi = parseInt(parts[1], 10) - 1;
    if (mi < 0 || mi > 11) return iso;
    return parseInt(parts[2], 10) + ' ' + months[mi];
  }

  function formatDate(date) {
    var d = date || new Date();
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
  }

  // Server returns naive IST or tz-aware ISO. Browser parses both correctly
  // without us appending 'Z'.
  function parseUTC(s) {
    if (!s) return null;
    var t = String(s).replace(' ', 'T');
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatTime(isoString) {
    var d = parseUTC(isoString);
    if (!d) return '';
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

  // ─── Setup nudges (onboarding) ────────────────────────────────────

  function nudgeDismissedKey(kind, ymd) {
    return 'nudge_dismissed:' + kind + ':' + ymd;
  }

  function isNudgeDismissed(kind) {
    return api.idbGet('cache', nudgeDismissedKey(kind, todayISO())).then(function (e) {
      return !!(e && e.data === true);
    });
  }

  function dismissNudge(kind) {
    return api.cacheSet(nudgeDismissedKey(kind, todayISO()), true, 24 * 60 * 60 * 1000);
  }

  function nudgeCard(opts) {
    var card = el('div', { className: 'nudge-card' }, [
      el('div', { className: 'nudge-icon' }, [icon(opts.icon || 'bell')]),
      el('div', { className: 'nudge-body' }, [
        el('div', { className: 'nudge-title', textContent: opts.title }),
        opts.sub ? el('div', { className: 'nudge-sub', textContent: opts.sub }) : null
      ].filter(Boolean)),
      el('button', {
        className: 'nudge-cta',
        textContent: opts.cta,
        onClick: function () { if (opts.onClick) opts.onClick(); }
      }),
      el('button', {
        className: 'nudge-dismiss',
        'aria-label': 'Dismiss',
        textContent: '×',
        onClick: function () {
          dismissNudge(opts.kind).then(function () {
            if (card.parentNode) card.parentNode.removeChild(card);
          });
        }
      })
    ]);
    return card;
  }

  // Render a stack of pending setup nudges. Each item has its own dismiss
  // state, scoped to the current day so the nudge re-appears tomorrow if
  // still applicable.
  function renderSetupNudges(container, ctx) {
    var checks = [];

    // Telegram not connected — only nudge if profile data is loaded
    if (ctx.telegramConnected === false) {
      checks.push({
        kind: 'telegram',
        check: function () { return Promise.resolve(true); },
        build: function () {
          return nudgeCard({
            kind: 'telegram',
            icon: 'bell',
            title: 'Connect Telegram for alerts',
            sub: 'Get notified about approvals, leads, and SLAs',
            cta: 'Connect',
            onClick: function () { location.hash = '#/profile'; }
          });
        }
      });
    }

    // Not checked in today
    if (ctx.checkedInToday === false) {
      checks.push({
        kind: 'checkin',
        check: function () { return Promise.resolve(true); },
        build: function () {
          return nudgeCard({
            kind: 'checkin',
            icon: 'mapPin',
            title: 'Check in for today',
            sub: 'Mark attendance with one tap',
            cta: 'Check in',
            onClick: function () { location.hash = '#/attendance'; }
          });
        }
      });
    }

    if (checks.length === 0) return;

    var stack = el('div', { className: 'nudge-stack' });
    container.appendChild(stack);

    checks.forEach(function (c) {
      isNudgeDismissed(c.kind).then(function (dismissed) {
        if (dismissed) return;
        stack.appendChild(c.build());
      });
    });
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

  function companyBadgeColor(abbr) {
    // Deterministic palette by abbr \u2014 DCEPL gets red-ish, DSPL navy, etc.
    var map = { 'DCEPL': '#C62828', 'DSPL': '#1565C0', 'GEAR': '#388E3C' };
    return map[(abbr || '').toUpperCase().slice(0, 5)] || '#37474F';
  }

  function companyBadge(abbr) {
    if (!abbr) return null;
    return el('span', {
      textContent: abbr,
      title: 'Company',
      style: {
        display: 'inline-block', marginLeft: '8px',
        padding: '2px 8px', borderRadius: '999px',
        background: companyBadgeColor(abbr), color: '#fff',
        font: '600 10px/1.4 system-ui', letterSpacing: '0.04em',
        verticalAlign: 'middle'
      }
    });
  }

  function greetingHero(showDepartment) {
    var emp = Auth.getEmployee() || {};
    var nameSpan = el('span', { className: 'greeting-name' }, [firstName()]);
    var titleRow = el('h2', null, [greetingText() + ', ', nameSpan]);
    // Company chip beside the name for every employee, on every home load
    if (emp.company_abbr) {
      titleRow.appendChild(companyBadge(emp.company_abbr));
    }
    var children = [titleRow];
    var metaParts = [];
    metaParts.push(formatDate());
    metaParts.push(formatCurrentTime());
    if (showDepartment) {
      var dept = emp.department || '';
      if (dept) metaParts.push(dept);
    }
    children.push(el('div', { className: 'greeting-meta' }, [metaParts.join(' \u00b7 ')]));
    return el('div', { className: 'greeting-hero' }, children);
  }

  // ─── Visit card ───────────────────────────────────────────────────

  function visitCard(dcr, opts) {
    var statusColor = dcr.status === 'Completed' ? 'green' : 'orange';
    var purpose = dcr.visit_purpose || dcr.service_purpose || '';
    var sub = purpose;
    if (opts && opts.showDate && dcr.date) {
      sub = [shortDate(dcr.date), purpose].filter(Boolean).join(' · ');
    }
    return UI.listCard({
      title: dcr.customer || dcr.lead || dcr.prospect_name || 'Visit',
      sub: sub,
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
    var weekAgo = daysAgoISO(7);

    Promise.all([
      api.apiCall('GET', '/api/field/attendance/today'),
      api.apiCall('GET', '/api/field/dcr?from_date=' + weekAgo + '&to_date=' + today),
      api.apiCall('GET', '/api/field/leave-balance'),
      api.apiCall('GET', '/api/field/pending-expenses'),
      api.apiCall('GET', '/api/field/me')
    ]).then(function (results) {
      appEl.textContent = '';

      var attResult = results[0];
      var dcrResult = results[1];
      var leaveResult = results[2];
      var expenseResult = results[3];
      var meResult = results[4];

      var attRaw = attResult.data || {};
      var att = attRaw.message || attRaw.data || attRaw;
      var dcrRaw = dcrResult.data || {};
      var allDcrs = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);
      var dcrs = [], recentDcrs = [];
      for (var di = 0; di < allDcrs.length; di++) {
        if (allDcrs[di].date === today) dcrs.push(allDcrs[di]);
        else recentDcrs.push(allDcrs[di]);
      }

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

      // 0. Refresh cached session BEFORE the greeting hero so the
      //    company badge can read the fresh company_abbr.
      var meRaw = meResult.data || {};
      var meData = meRaw.message || meRaw.data || meRaw || {};
      if (Array.isArray(meData.roles) && Auth.refreshRoles) {
        Auth.refreshRoles(meData.roles);
      }
      if (Auth.refreshEmployee) {
        Auth.refreshEmployee(meData);
      }

      // 1. Greeting hero
      appEl.appendChild(greetingHero(true));

      // 1b. Setup nudges (onboarding prompts — dismissible per day)
      renderSetupNudges(appEl, {
        telegramConnected: !!meData.telegram_chat_id,
        checkedInToday: !!checkedIn
      });

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

      // Recently viewed strip — only when there's something to show
      if (UI.recents && UI.recentsStrip) {
        var recentItems = UI.recents.list();
        if (recentItems.length > 0) {
          appEl.appendChild(UI.recentsStrip({ limit: 8, emptyText: null }));
        }
      }

      // 3. Today's visits
      appEl.appendChild(UI.sectionHeading("Today's visits"));
      if (dcrs.length === 0) {
        appEl.appendChild(UI.empty('mapPin', 'No visits today', { text: '+ New visit', onClick: function() { location.hash = '#/dcr/new'; } }));
      } else {
        for (var j = 0; j < dcrs.length; j++) {
          appEl.appendChild(visitCard(dcrs[j]));
        }
      }

      // 3b. Recent visits (last 7 days, excluding today) — gives continuity
      // when the user opens the PWA on a new day before logging anything.
      if (recentDcrs.length > 0) {
        appEl.appendChild(UI.sectionHeading('Recent visits'));
        var recentLimit = Math.min(recentDcrs.length, 5);
        for (var ri = 0; ri < recentLimit; ri++) {
          appEl.appendChild(visitCard(recentDcrs[ri], { showDate: true }));
        }
        if (recentDcrs.length > recentLimit) {
          appEl.appendChild(UI.listCard({
            title: 'View all visits',
            sub: recentDcrs.length + ' more in the past 7 days',
            onClick: function () { location.hash = '#/dcr'; }
          }));
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
    var weekAgo = daysAgoISO(7);

    Promise.all([
      api.apiCall('GET', '/api/field/team'),
      api.apiCall('GET', '/api/field/approvals'),
      api.apiCall('GET', '/api/field/attendance/today'),
      api.apiCall('GET', '/api/field/dcr?from_date=' + weekAgo + '&to_date=' + today),
      api.apiCall('GET', '/api/field/leave-balance'),
      api.apiCall('GET', '/api/field/pending-expenses'),
      api.apiCall('GET', '/api/field/me')
    ]).then(function (results) {
      appEl.textContent = '';

      var teamResult = results[0];
      var approvalsResult = results[1];
      var attResult = results[2];
      var dcrResult = results[3];
      var leaveResult = results[4];
      var expenseResult = results[5];
      var meResultM = results[6];

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
      var allDcrsM = dcrRaw.data || dcrRaw.message || (Array.isArray(dcrRaw) ? dcrRaw : []);
      var dcrs = [], recentDcrsM = [];
      for (var dmi = 0; dmi < allDcrsM.length; dmi++) {
        if (allDcrsM[dmi].date === today) dcrs.push(allDcrsM[dmi]);
        else recentDcrsM.push(allDcrsM[dmi]);
      }
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

      // 0. Refresh cached session BEFORE rendering greeting + banner so the
      //    company badge + DSPL Director check see fresh data.
      var meRawM = meResultM.data || {};
      var meDataM = meRawM.message || meRawM.data || meRawM || {};
      if (Array.isArray(meDataM.roles) && Auth.refreshRoles) {
        Auth.refreshRoles(meDataM.roles);
      }
      if (Auth.refreshEmployee) {
        Auth.refreshEmployee(meDataM);
      }

      // 1. Greeting hero
      appEl.appendChild(greetingHero(true));

      // 1b. Setup nudges
      renderSetupNudges(appEl, {
        telegramConnected: !!meDataM.telegram_chat_id,
        checkedInToday: !!checkedIn
      });

      // 2. KPI chips row
      // Count total team visits from DCR data (team members in field)
      var teamVisitCount = 0;
      for (var vi = 0; vi < teamMembers.length; vi++) {
        teamVisitCount += (teamMembers[vi].visit_count || 0);
      }
      // Fall back to own visit count if team visit data unavailable
      if (teamVisitCount === 0) teamVisitCount = myVisitCount;

      appEl.appendChild(UI.statGrid([
        { value: presentCount + '/' + totalCount, label: 'Team present', support: 'today' },
        { value: pendingCount, label: 'Approvals', support: 'pending' },
        { value: teamVisitCount, label: 'Visits', support: 'today' }
      ], 3));

      // Director banner — links to the Management dashboard.
      if (Auth.hasRole && Auth.hasRole('DSPL Director')) {
        var mgmtBanner = el('div', {
          onClick: function () { location.hash = '#/management'; },
          style: {
            marginTop: '12px', padding: '14px 16px',
            background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
            color: '#fff', borderRadius: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }
        }, [
          el('div', null, [
            el('div', { textContent: 'Management dashboard',
              style: { font: '600 15px/1.2 system-ui', letterSpacing: '-0.01em' } }),
            el('div', { textContent: 'Cash, sales, people, service — live KPIs',
              style: { font: '400 12px/1.3 system-ui', opacity: '0.8', marginTop: '2px' } })
          ]),
          el('span', { textContent: '→', style: { font: '600 18px/1 system-ui' } })
        ]);
        appEl.appendChild(mgmtBanner);
      }

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

      // Recently viewed strip — only when there's something to show
      if (UI.recents && UI.recentsStrip) {
        var recentItemsM = UI.recents.list();
        if (recentItemsM.length > 0) {
          appEl.appendChild(UI.recentsStrip({ limit: 8, emptyText: null }));
        }
      }

      // 3a. My visits — managers have no "Visits" tab in bottom nav, so
      // surface the user's own week of visits here for continuity.
      if (dcrs.length > 0 || recentDcrsM.length > 0) {
        appEl.appendChild(UI.sectionHeading('My visits'));
        for (var mj = 0; mj < dcrs.length; mj++) {
          appEl.appendChild(visitCard(dcrs[mj], { showDate: true }));
        }
        var mrLimit = Math.min(recentDcrsM.length, 4);
        for (var mri = 0; mri < mrLimit; mri++) {
          appEl.appendChild(visitCard(recentDcrsM[mri], { showDate: true }));
        }
        if (recentDcrsM.length > mrLimit || dcrs.length + recentDcrsM.length > 0) {
          appEl.appendChild(UI.listCard({
            title: 'View all visits',
            sub: 'Last 7 days · ' + (dcrs.length + recentDcrsM.length) + ' total',
            onClick: function () { location.hash = '#/dcr'; }
          }));
        }
      }

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
