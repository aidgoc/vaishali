/* leave.js — Leave screens for DSPL Field PWA (Home, Apply, Detail) — M3 */
(function () {
  'use strict';

  var LEAVE_TYPES = [
    'Casual Leave',
    'Compensatory Off',
    'Leave Without Pay',
    'Privilege Leave',
    'Sick Leave'
  ];

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function statusColor(status) {
    if (status === 'Approved') return 'green';
    if (status === 'Rejected') return 'red';
    if (status === 'Open') return 'yellow';
    return 'gray';
  }

  function getEmployeeName() {
    var emp = Auth.getEmployee();
    return emp ? emp.name : null;
  }

  // ── Screen: Leave Home ──────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.leaveHome = function (appEl) {
    var el = UI.el;
    var content = el('div');
    appEl.appendChild(content);

    // Page header — title + supporting text (Heuristic 1: visibility)
    content.appendChild(UI.pageHeader(
      'Leave',
      'Track your balance and apply for time off.'
    ));

    var skel = UI.skeleton(3);
    content.appendChild(skel);

    var empName = getEmployeeName();
    if (!empName) {
      skel.remove();
      content.appendChild(UI.error('Employee not linked. Please contact HR.'));
      return;
    }

    var balanceFilters = JSON.stringify([['employee', '=', empName], ['docstatus', '=', 1]]);
    var balanceFields = JSON.stringify(['leave_type', 'total_leaves_allocated', 'total_leaves_encashed', 'new_leaves_allocated']);
    var balancePath = '/api/resource/Leave Allocation?filters=' +
      encodeURIComponent(balanceFilters) +
      '&fields=' + encodeURIComponent(balanceFields) +
      '&limit_page_length=0&order_by=creation desc';

    var appFilters = JSON.stringify([['employee', '=', empName]]);
    var appFields = JSON.stringify(['name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status', 'posting_date']);
    var appPath = '/api/resource/Leave Application?filters=' +
      encodeURIComponent(appFilters) +
      '&fields=' + encodeURIComponent(appFields) +
      '&order_by=posting_date desc&limit_page_length=20';

    Promise.all([
      window.fieldAPI.apiCall('GET', balancePath),
      window.fieldAPI.apiCall('GET', appPath)
    ]).then(function (results) {
      var balanceRes = results[0];
      var appRes = results[1];

      skel.remove();

      // ── Balance — uniform M3 stat grid ──
      var allocations = (balanceRes && balanceRes.data && (balanceRes.data.data || balanceRes.data.message)) || [];
      var byType = {};
      for (var i = 0; i < allocations.length; i++) {
        var a = allocations[i];
        if (!byType[a.leave_type]) byType[a.leave_type] = a;
      }

      var statItems = [];
      var types = Object.keys(byType);
      for (var j = 0; j < types.length; j++) {
        var alloc = byType[types[j]];
        var total = alloc.total_leaves_allocated || 0;
        var used = alloc.total_leaves_encashed || 0;
        var remaining = Math.max(0, total - used);
        statItems.push({
          value: remaining,
          label: types[j],
          support: 'of ' + total + ' allocated'
        });
      }

      if (statItems.length > 0) {
        content.appendChild(UI.sectionHeader('Balance', { support: 'Days remaining by type' }));
        content.appendChild(UI.statGrid(statItems, 2));
      } else {
        content.appendChild(UI.sectionHeader('Balance'));
        content.appendChild(el('div', {
          textContent: 'No leave allocations found.',
          style: { color: 'var(--m3-on-surface-variant)', padding: '12px 0', font: 'var(--m3-body-medium)' }
        }));
      }

      // ── Primary action — visible filled button ──
      content.appendChild(el('div', { style: { margin: '16px 0 8px' } }, [
        UI.btn('Apply for leave', {
          type: 'primary',
          block: true,
          icon: 'plus',
          onClick: function () { location.hash = '#/leave/apply'; }
        })
      ]));

      // ── Applications list ──
      var applications = (appRes && appRes.data && (appRes.data.data || appRes.data.message)) || [];
      content.appendChild(UI.sectionHeader('Applications', { support: 'Your recent requests' }));
      if (applications.length > 0) {
        var listWrap = el('div', { className: 'm3-list' });
        for (var k = 0; k < applications.length; k++) {
          (function (app) {
            var dateRange = formatDate(app.from_date);
            if (app.to_date && app.to_date !== app.from_date) {
              dateRange += ' – ' + formatDate(app.to_date);
            }
            var days = app.total_leave_days ? (app.total_leave_days + (app.total_leave_days === 1 ? ' day' : ' days')) : '';
            var sub = dateRange + (days ? '  ·  ' + days : '');

            listWrap.appendChild(UI.listCard({
              title: app.leave_type,
              sub: sub,
              right: UI.pill(app.status, statusColor(app.status)),
              onClick: function () { location.hash = '#/leave/' + app.name; }
            }));
          })(applications[k]);
        }
        content.appendChild(listWrap);
      } else {
        content.appendChild(UI.empty('umbrella', 'No leave applications yet', {
          text: 'Apply for leave',
          onClick: function () { location.hash = '#/leave/apply'; }
        }));
      }

    }).catch(function (err) {
      skel.remove();
      content.appendChild(UI.error('Failed to load leave data: ' + (err.message || err)));
    });
  };

  // ── Screen: Leave Apply ─────────────────────────────────────────────

  window.Screens.leaveApply = function (appEl) {
    var el = UI.el;
    var empName = getEmployeeName();
    if (!empName) {
      appEl.appendChild(UI.error('Employee not linked. Please contact HR.'));
      return;
    }

    var content = el('div');
    appEl.appendChild(content);

    content.appendChild(UI.pageHeader(
      'Apply for leave',
      'Choose leave type, dates and add a reason.'
    ));

    // M3 floating-label fields
    var leaveTypeField = UI.m3SelectField('Leave type', LEAVE_TYPES, { required: true });
    var fromDateField = UI.m3TextField('From date', { type: 'date', value: todayISO(), required: true });
    var toDateField = UI.m3TextField('To date', { type: 'date', value: todayISO(), required: true });

    var halfDay = false;
    var halfDayToggle = UI.toggle('Half day', false, function (val) {
      halfDay = val;
    });

    var reasonField = UI.m3TextField('Reason', {
      multiline: true,
      rows: 3,
      support: 'Optional — add details to help your manager decide.'
    });

    var errorBox = el('div', {
      style: {
        color: 'var(--m3-error)',
        font: 'var(--m3-body-small)',
        display: 'none',
        padding: '8px 0'
      }
    });

    var submitBtn = UI.btn('Submit application', {
      type: 'primary',
      block: true,
      icon: 'check',
      onClick: handleSubmit
    });

    var cancelBtn = UI.btn('Cancel', {
      type: 'outline',
      block: true,
      onClick: function () { location.hash = '#/leave'; }
    });

    content.appendChild(leaveTypeField);
    content.appendChild(fromDateField);
    content.appendChild(toDateField);
    content.appendChild(el('div', { style: { padding: '0 4px' } }, [halfDayToggle]));
    content.appendChild(reasonField);
    content.appendChild(errorBox);
    content.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' } }, [
      cancelBtn,
      submitBtn
    ]));

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    function handleSubmit() {
      errorBox.style.display = 'none';

      var leaveType = leaveTypeField._getValue();
      var fromDate = fromDateField._getValue();
      var toDate = toDateField._getValue();
      var reason = reasonField._getValue().trim();

      if (!leaveType) { showError('Please select a leave type.'); return; }
      if (!fromDate) { showError('Please select a from date.'); return; }
      if (!toDate) { showError('Please select a to date.'); return; }
      if (toDate < fromDate) { showError('To date cannot be before from date.'); return; }

      submitBtn._setLoading(true, 'Submitting...');

      var payload = {
        employee: empName,
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        half_day: halfDay ? 1 : 0,
        description: reason,
        company: 'Dynamic Servitech Private Limited',
        posting_date: todayISO(),
        status: 'Open'
      };
      if (halfDay) {
        payload.half_day_date = fromDate;
      }

      window.fieldAPI.apiCall('POST', '/api/resource/Leave Application', payload).then(function (res) {
        if (res.error) {
          showError('Failed: ' + res.error);
          submitBtn._setLoading(false);
          return;
        }
        if (res.status && res.status >= 400) {
          var errMsg = 'Server error';
          if (res.data && res.data._server_messages) {
            try {
              var msgs = JSON.parse(res.data._server_messages);
              var parsed = JSON.parse(msgs[0]);
              errMsg = parsed.message || errMsg;
            } catch (e) {
              errMsg = String(res.data._server_messages);
            }
          } else if (res.data && res.data.message) {
            errMsg = res.data.message;
          }
          showError(errMsg);
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Leave applied', 'success');
        location.hash = '#/leave';
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Leave Detail ────────────────────────────────────────────

  window.Screens.leaveDetail = function (appEl, params) {
    var el = UI.el;
    var name = params.id || params.name;
    var content = el('div');
    appEl.appendChild(content);

    content.appendChild(UI.pageHeader('Leave application', name));

    var skel = UI.skeleton(3);
    content.appendChild(skel);

    var path = '/api/resource/Leave Application/' + encodeURIComponent(name);
    window.fieldAPI.apiCall('GET', path).then(function (res) {
      skel.remove();

      var data = (res && res.data && (res.data.data || res.data.message)) || null;
      if (!data) {
        content.appendChild(UI.error('Could not load leave application.'));
        return;
      }

      // Status pill
      content.appendChild(el('div', { style: { marginBottom: '16px' } }, [
        UI.pill(data.status, statusColor(data.status))
      ]));

      // Detail card
      content.appendChild(UI.detailCard([
        { label: 'Status', value: data.status },
        { label: 'Leave type', value: data.leave_type || '' },
        { label: 'From', value: formatDate(data.from_date) },
        { label: 'To', value: formatDate(data.to_date) },
        { label: 'Days', value: data.total_leave_days != null ? String(data.total_leave_days) : '' },
        { label: 'Half day', value: data.half_day ? 'Yes' : 'No' },
        { label: 'Reason', value: data.description || '—' },
        { label: 'Posted on', value: formatDate(data.posting_date) }
      ]));

      // Cancel button for Open/draft applications
      if (data.status === 'Open' && data.docstatus === 0) {
        var cancelBtn = UI.btn('Cancel application', {
          type: 'outline-danger',
          block: true,
          icon: 'x',
          onClick: function () {
            UI.confirmDialog(
              'Cancel this leave application?',
              'This will withdraw your request. You can submit a new application later if needed.',
              { confirmText: 'Cancel application', cancelText: 'Keep it', danger: true, icon: 'x' }
            ).then(function (ok) {
              if (!ok) return;
              cancelBtn._setLoading(true, 'Cancelling...');

              window.fieldAPI.apiCall('DELETE', '/api/resource/Leave Application/' + encodeURIComponent(name)).then(function (delRes) {
                if (delRes.error || (delRes.status && delRes.status >= 400)) {
                  UI.toast('Failed to cancel: ' + (delRes.error || 'Server error'), 'danger');
                  cancelBtn._setLoading(false);
                  return;
                }
                UI.toast('Leave application cancelled', 'success');
                location.hash = '#/leave';
              }).catch(function () {
                UI.toast('Failed to cancel application', 'danger');
                cancelBtn._setLoading(false);
              });
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '16px' } }, [cancelBtn]));
      }

    }).catch(function (err) {
      skel.remove();
      content.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });
  };

})();
