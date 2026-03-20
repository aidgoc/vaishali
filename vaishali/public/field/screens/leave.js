/* leave.js — Leave screens for DSPL Field PWA (Home, Apply, Detail) */
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
    var content = el('div', { style: { padding: '0 16px 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    var empName = getEmployeeName();
    if (!empName) {
      content.textContent = '';
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

      content.textContent = '';

      // ── Balance cards ──
      var allocations = (balanceRes && balanceRes.data && (balanceRes.data.data || balanceRes.data.message)) || [];
      // Group by leave_type, take first (latest) per type
      var byType = {};
      for (var i = 0; i < allocations.length; i++) {
        var a = allocations[i];
        if (!byType[a.leave_type]) {
          byType[a.leave_type] = a;
        }
      }

      var balanceCards = [];
      var types = Object.keys(byType);
      for (var j = 0; j < types.length; j++) {
        var alloc = byType[types[j]];
        var total = alloc.total_leaves_allocated || 0;
        balanceCards.push(UI.card([
          el('div', { className: 'amount-large', style: { fontWeight: '700' }, textContent: String(total) }),
          el('div', { style: { fontSize: '13px', color: 'var(--text-muted, #6c757d)', marginTop: '4px' }, textContent: types[j] })
        ]));
      }

      if (balanceCards.length > 0) {
        content.appendChild(UI.sectionHeading('BALANCE'));
        content.appendChild(UI.grid(balanceCards, 2));
      } else {
        content.appendChild(el('div', {
          textContent: 'No leave allocations found.',
          style: { color: '#888', padding: '12px 0', fontSize: '14px' }
        }));
      }

      // ── Apply button ──
      content.appendChild(el('div', { style: { margin: '12px 0' } }, [
        UI.btn('+ Apply Leave', {
          type: 'primary',
          block: true,
          icon: 'plus',
          onClick: function () { location.hash = '#/leave/apply'; }
        })
      ]));

      // ── Applications list ──
      var applications = (appRes && appRes.data && (appRes.data.data || appRes.data.message)) || [];
      if (applications.length > 0) {
        content.appendChild(UI.sectionHeading('APPLICATIONS'));
        for (var k = 0; k < applications.length; k++) {
          (function (app) {
            var dateRange = formatDate(app.from_date);
            if (app.to_date && app.to_date !== app.from_date) {
              dateRange += ' \u2013 ' + formatDate(app.to_date);
            }
            var days = app.total_leave_days ? (app.total_leave_days + (app.total_leave_days === 1 ? ' day' : ' days')) : '';
            var sub = dateRange + (days ? '  \u00b7  ' + days : '');

            content.appendChild(UI.listCard({
              title: app.leave_type,
              sub: sub,
              right: UI.pill(app.status, statusColor(app.status)),
              onClick: function () { location.hash = '#/leave/' + app.name; }
            }));
          })(applications[k]);
        }
      } else {
        content.appendChild(UI.sectionHeading('APPLICATIONS'));
        content.appendChild(UI.empty('umbrella', 'No leave applications yet'));
      }

    }).catch(function (err) {
      content.textContent = '';
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

    // Build form elements — UI.select / UI.dateInput / UI.toggle return field-group wrappers
    var leaveTypeField = UI.select('Leave Type', LEAVE_TYPES);
    var leaveTypeSelect = leaveTypeField.querySelector('select');

    var fromDateField = UI.dateInput('From Date', todayISO());
    var fromInput = fromDateField.querySelector('input');

    var toDateField = UI.dateInput('To Date', todayISO());
    var toInput = toDateField.querySelector('input');

    var halfDay = false;
    var halfDayToggle = UI.toggle('Half Day', false, function (val) {
      halfDay = val;
    });

    var reasonTextarea = UI.textarea('Enter reason...');
    var reasonField = UI.field('Reason', reasonTextarea);

    var errorBox = el('div', { style: { color: 'var(--red-500)', fontSize: '14px', display: 'none', padding: '8px 0' } });

    var submitBtn = UI.btn('Submit', {
      type: 'primary',
      block: true,
      onClick: handleSubmit
    });

    var formCard = UI.card([
      leaveTypeField,
      fromDateField,
      toDateField,
      halfDayToggle,
      reasonField,
      errorBox,
      el('div', { style: { marginTop: '16px' } }, [submitBtn])
    ]);

    appEl.appendChild(el('div', { style: { padding: '0 16px' } }, [formCard]));

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    function handleSubmit() {
      errorBox.style.display = 'none';

      var leaveType = leaveTypeSelect.value;
      var fromDate = fromInput.value;
      var toDate = toInput.value;
      var reason = reasonTextarea.value.trim();

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
    var content = el('div', { style: { padding: '0 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    var path = '/api/resource/Leave Application/' + encodeURIComponent(name);
    window.fieldAPI.apiCall('GET', path).then(function (res) {
      content.textContent = '';

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
      var dateRange = formatDate(data.from_date);
      if (data.to_date && data.to_date !== data.from_date) {
        dateRange += ' \u2013 ' + formatDate(data.to_date);
      }

      content.appendChild(UI.detailCard([
        { label: 'Status', value: data.status },
        { label: 'Leave Type', value: data.leave_type || '' },
        { label: 'From', value: formatDate(data.from_date) },
        { label: 'To', value: formatDate(data.to_date) },
        { label: 'Days', value: data.total_leave_days != null ? String(data.total_leave_days) : '' },
        { label: 'Half Day', value: data.half_day ? 'Yes' : 'No' },
        { label: 'Reason', value: data.description || '\u2014' },
        { label: 'Posting Date', value: formatDate(data.posting_date) }
      ]));

      // Cancel button for Open/draft applications
      if (data.status === 'Open' && data.docstatus === 0) {
        var cancelBtn = UI.btn('Cancel', {
          type: 'outline-danger',
          block: true,
          onClick: function () {
            if (!confirm('Cancel this leave application?')) return;
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
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [cancelBtn]));
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });
  };

})();
