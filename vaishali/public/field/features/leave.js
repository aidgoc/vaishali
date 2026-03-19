/* leave.js — Leave Management feature for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  function el(tag, attrs, children) { return (window._fieldEl || function(t) { return document.createElement(t); })(tag, attrs, children); }
  function navigate(h) { (window._fieldNavigate || function(x) { location.hash = x; })(h); }
  function getAppEl() { return (window._fieldAppEl ? window._fieldAppEl() : null) || document.getElementById('app'); }
  var LEAVE_TYPES = [
    'Casual Leave',
    'Compensatory Off',
    'Leave Without Pay',
    'Privilege Leave',
    'Sick Leave'
  ];

  // ─── Helpers ──────────────────────────────────────────────────────

  function todayStr() {
    var d = new Date();
    var mm = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    var dd = (d.getDate() < 10 ? '0' : '') + d.getDate();
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function formatDateDisplay(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate + 'T00:00:00');
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

  function resolveEmployee() {
    return api.getSession().then(function (s) {
      if (!s || !s.employee) return null;
      return typeof s.employee === 'string' ? s.employee : s.employee.name;
    });
  }

  function showLoading(container) {
    container.appendChild(el('div', {
      textContent: 'Loading...',
      style: { textAlign: 'center', padding: '40px 0', color: '#888' }
    }));
  }

  function showError(container, msg) {
    container.appendChild(el('div', {
      textContent: msg || 'Something went wrong',
      style: { textAlign: 'center', padding: '40px 16px', color: '#d32f2f' }
    }));
  }

  function makeHeader(title, backHash) {
    return el('div', { className: 'screen-header' }, [
      el('button', {
        className: 'back-btn',
        textContent: '\u2190',
        onClick: function () { navigate(backHash); }
      }),
      el('span', { textContent: title })
    ]);
  }

  // ─── API Wrappers ─────────────────────────────────────────────────

  function getLeaveBalance(employeeId) {
    var filters = JSON.stringify([
      ['employee', '=', employeeId],
      ['docstatus', '=', 1]
    ]);
    var fields = JSON.stringify([
      'leave_type', 'total_leaves_allocated', 'new_leaves_allocated',
      'total_leaves_encashed', 'unused_leaves'
    ]);
    var path = '/api/resource/Leave Allocation?filters=' +
      encodeURIComponent(filters) +
      '&fields=' + encodeURIComponent(fields) +
      '&limit_page_length=50' +
      '&order_by=creation desc';

    return api.apiCall('GET', path).then(function (res) {
      if (res.error) return { error: res.error };
      var allocations = (res.data && res.data.data) || [];

      // Group by leave_type, take latest allocation per type
      var byType = {};
      for (var i = 0; i < allocations.length; i++) {
        var a = allocations[i];
        if (!byType[a.leave_type]) {
          byType[a.leave_type] = a;
        }
      }

      // Now fetch used leaves from Leave Application (Approved)
      var usedFilters = JSON.stringify([
        ['employee', '=', employeeId],
        ['status', '=', 'Approved'],
        ['docstatus', '=', 1]
      ]);
      var usedFields = JSON.stringify(['leave_type', 'total_leave_days']);
      var usedPath = '/api/resource/Leave Application?filters=' +
        encodeURIComponent(usedFilters) +
        '&fields=' + encodeURIComponent(usedFields) +
        '&limit_page_length=200';

      return api.apiCall('GET', usedPath).then(function (usedRes) {
        var usedMap = {};
        if (!usedRes.error && usedRes.data && usedRes.data.data) {
          var apps = usedRes.data.data;
          for (var j = 0; j < apps.length; j++) {
            var lt = apps[j].leave_type;
            usedMap[lt] = (usedMap[lt] || 0) + (apps[j].total_leave_days || 0);
          }
        }

        var result = [];
        for (var type in byType) {
          if (!byType.hasOwnProperty(type)) continue;
          var alloc = byType[type];
          var total = alloc.total_leaves_allocated || 0;
          var used = usedMap[type] || 0;
          result.push({
            leave_type: type,
            total_allocated: total,
            used: used,
            balance: total - used
          });
        }
        return result;
      });
    });
  }

  function getLeaveApplications(employeeId, status) {
    var filterArr = [['employee', '=', employeeId]];
    if (status) {
      filterArr.push(['status', '=', status]);
    }
    var filters = JSON.stringify(filterArr);
    var fields = JSON.stringify([
      'name', 'leave_type', 'from_date', 'to_date', 'total_leave_days',
      'status', 'posting_date', 'half_day', 'description'
    ]);
    var path = '/api/resource/Leave Application?filters=' +
      encodeURIComponent(filters) +
      '&fields=' + encodeURIComponent(fields) +
      '&order_by=posting_date desc' +
      '&limit_page_length=10';

    return api.apiCall('GET', path).then(function (res) {
      if (res.error) return { error: res.error };
      return (res.data && res.data.data) || [];
    });
  }

  function applyLeave(data) {
    return api.apiCall('POST', '/api/resource/Leave Application', data);
  }

  function getLeaveApplication(name) {
    var path = '/api/resource/Leave Application/' + encodeURIComponent(name);
    return api.apiCall('GET', path).then(function (res) {
      if (res.error) return { error: res.error };
      return (res.data && res.data.data) || null;
    });
  }

  function cancelLeaveApplication(name) {
    // To cancel: set docstatus to 2 (cancelled) — but Leave Application
    // uses workflow status. We set status to Cancelled via amend.
    // Frappe pattern: submit first (docstatus=1), then cancel (docstatus=2).
    // For Open (draft) applications, we can just delete or set Cancelled.
    var path = '/api/resource/Leave Application/' + encodeURIComponent(name);
    return api.apiCall('PUT', path, { status: 'Cancelled', docstatus: 2 });
  }

  // ─── Screen: Leave Home ───────────────────────────────────────────

  function renderLeaveHome() {
    var appContainer = getAppEl();
    appContainer.textContent = '';
    appContainer.appendChild(makeHeader('Leave', '#/home'));

    var content = el('div', { style: { padding: '16px' } });
    appContainer.appendChild(content);
    showLoading(content);

    resolveEmployee().then(function (empId) {
      if (!empId) {
        content.textContent = '';
        showError(content, 'Employee not linked. Please contact HR.');
        return;
      }

      Promise.all([
        getLeaveBalance(empId),
        getLeaveApplications(empId)
      ]).then(function (results) {
        var balances = results[0];
        var applications = results[1];

        content.textContent = '';

        // Error handling for balances
        if (balances && balances.error) {
          showError(content, 'Could not load leave balance: ' + balances.error);
          return;
        }

        // ── Balance cards ──
        if (balances && balances.length > 0) {
          content.appendChild(el('div', { className: 'section-heading', textContent: 'Leave Balance' }));
          var grid = el('div', { className: 'stats-row' });
          for (var i = 0; i < balances.length; i++) {
            var b = balances[i];
            var card = el('div', { className: 'stat-card' }, [
              el('div', { className: 'stat-value', textContent: b.balance + ' / ' + b.total_allocated }),
              el('div', { className: 'stat-label', textContent: b.leave_type })
            ]);
            grid.appendChild(card);
          }
          content.appendChild(grid);
        } else {
          content.appendChild(el('div', {
            textContent: 'No leave allocations found.',
            style: { color: '#888', padding: '12px 0', fontSize: '14px' }
          }));
        }

        // ── Apply button ──
        var applyBtn = el('button', {
          className: 'btn btn-primary btn-block btn-lg',
          textContent: '+ Apply Leave',
          style: { margin: '20px 0' },
          onClick: function () { navigate('#/leave/apply'); }
        });
        content.appendChild(applyBtn);

        // ── Recent applications ──
        if (applications && !applications.error && applications.length > 0) {
          content.appendChild(el('div', { className: 'section-heading', textContent: 'Recent Applications' }));

          for (var j = 0; j < applications.length; j++) {
            var app = applications[j];
            (function (a) {
              var dateRange = formatDateDisplay(a.from_date);
              if (a.to_date && a.to_date !== a.from_date) {
                dateRange += ' - ' + formatDateDisplay(a.to_date);
              }
              var days = a.total_leave_days ? (a.total_leave_days + (a.total_leave_days === 1 ? ' day' : ' days')) : '';

              var card = el('div', {
                className: 'att-card',
                style: { cursor: 'pointer' },
                onClick: function () { navigate('#/leave/' + a.name); }
              }, [
                el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                  el('strong', { textContent: a.leave_type }),
                  el('span', { className: 'indicator-pill ' + statusColor(a.status), textContent: a.status })
                ]),
                el('div', {
                  style: { fontSize: '13px', color: '#666', marginTop: '4px' },
                  textContent: dateRange + (days ? '  \u00b7  ' + days : '')
                })
              ]);
              content.appendChild(card);
            })(app);
          }
        } else if (applications && !applications.error) {
          content.appendChild(el('div', {
            textContent: 'No leave applications yet.',
            style: { color: '#888', padding: '12px 0', fontSize: '14px' }
          }));
        }
      }).catch(function (err) {
        content.textContent = '';
        showError(content, 'Failed to load leave data: ' + (err.message || err));
      });
    });
  }

  // ─── Screen: Apply Leave ──────────────────────────────────────────

  function renderLeaveApply() {
    var appContainer = getAppEl();
    appContainer.textContent = '';
    appContainer.appendChild(makeHeader('Apply Leave', '#/leave'));

    var content = el('div', { style: { padding: '16px' } });
    appContainer.appendChild(content);

    // Leave Type
    var leaveTypeSelect = el('select', { className: 'form-control' });
    leaveTypeSelect.appendChild(el('option', { value: '', textContent: '-- Select Leave Type --', disabled: true, selected: true }));
    for (var i = 0; i < LEAVE_TYPES.length; i++) {
      leaveTypeSelect.appendChild(el('option', { value: LEAVE_TYPES[i], textContent: LEAVE_TYPES[i] }));
    }

    // From Date
    var fromInput = el('input', { type: 'date', className: 'form-control', value: todayStr() });

    // To Date
    var toInput = el('input', { type: 'date', className: 'form-control', value: todayStr() });

    // Half Day
    var halfDayCheck = el('input', { type: 'checkbox' });
    var halfDayLabel = el('label', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }
    }, [halfDayCheck, 'Half Day']);

    // Reason
    var reasonArea = el('textarea', {
      className: 'form-control',
      placeholder: 'Reason for leave (optional)',
      style: { minHeight: '80px', resize: 'vertical' }
    });

    // Error display
    var errorDiv = el('div', { style: { color: '#d32f2f', fontSize: '14px', display: 'none', padding: '8px 0' } });

    // Submit button
    var submitBtn = el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: 'Submit Application',
      onClick: function () { handleSubmit(); }
    });

    content.appendChild(el('div', { className: 'field-group' }, [
      el('label', { textContent: 'Leave Type' }),
      leaveTypeSelect
    ]));
    content.appendChild(el('div', { className: 'field-group' }, [
      el('label', { textContent: 'From Date' }),
      fromInput
    ]));
    content.appendChild(el('div', { className: 'field-group' }, [
      el('label', { textContent: 'To Date' }),
      toInput
    ]));
    content.appendChild(el('div', { className: 'field-group' }, [halfDayLabel]));
    content.appendChild(el('div', { className: 'field-group' }, [
      el('label', { textContent: 'Reason' }),
      reasonArea
    ]));
    content.appendChild(errorDiv);
    content.appendChild(el('div', { style: { marginTop: '20px' } }, [submitBtn]));

    function handleSubmit() {
      // Validation
      var leaveType = leaveTypeSelect.value;
      var fromDate = fromInput.value;
      var toDate = toInput.value;
      var halfDay = halfDayCheck.checked ? 1 : 0;
      var reason = reasonArea.value.trim();

      if (!leaveType) {
        showFieldError('Please select a leave type.');
        return;
      }
      if (!fromDate) {
        showFieldError('Please select a from date.');
        return;
      }
      if (!toDate) {
        showFieldError('Please select a to date.');
        return;
      }
      if (toDate < fromDate) {
        showFieldError('To date cannot be before from date.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      errorDiv.style.display = 'none';

      resolveEmployee().then(function (empId) {
        if (!empId) {
          showFieldError('Employee not linked. Please contact HR.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Application';
          return;
        }

        var payload = {
          employee: empId,
          leave_type: leaveType,
          from_date: fromDate,
          to_date: toDate,
          half_day: halfDay,
          description: reason,
          posting_date: todayStr(),
          status: 'Open'
        };
        if (halfDay) {
          payload.half_day_date = fromDate;
        }

        applyLeave(payload).then(function (res) {
          if (res.error) {
            showFieldError('Failed to submit: ' + res.error);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Application';
            return;
          }
          if (res.status >= 400) {
            var errMsg = 'Server error';
            if (res.data && res.data.exc_type) {
              errMsg = res.data.exc_type;
            } else if (res.data && res.data._server_messages) {
              try {
                var msgs = JSON.parse(res.data._server_messages);
                var parsed = JSON.parse(msgs[0]);
                errMsg = parsed.message || errMsg;
              } catch (e) {
                errMsg = res.data._server_messages;
              }
            } else if (res.data && res.data.message) {
              errMsg = res.data.message;
            }
            showFieldError(errMsg);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Application';
            return;
          }
          api.showToast('Leave application submitted', 'success');
          navigate('#/leave');
        }).catch(function (err) {
          showFieldError('Error: ' + (err.message || err));
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Application';
        });
      });
    }

    function showFieldError(msg) {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }
  }

  // ─── Screen: Leave Detail ─────────────────────────────────────────

  function renderLeaveDetail(params) {
    var name = params.name || params.id;
    var appContainer = getAppEl();
    appContainer.textContent = '';
    appContainer.appendChild(makeHeader('Leave Application', '#/leave'));

    var content = el('div', { style: { padding: '16px' } });
    appContainer.appendChild(content);
    showLoading(content);

    getLeaveApplication(name).then(function (data) {
      content.textContent = '';

      if (!data || data.error) {
        showError(content, 'Could not load leave application: ' + (data && data.error ? data.error : 'Not found'));
        return;
      }

      // Status pill
      var statusPill = el('div', { style: { marginBottom: '16px' } }, [
        el('span', {
          className: 'indicator-pill ' + statusColor(data.status),
          textContent: data.status
        })
      ]);
      content.appendChild(statusPill);

      // Details card
      var dateRange = formatDateDisplay(data.from_date);
      if (data.to_date && data.to_date !== data.from_date) {
        dateRange += ' - ' + formatDateDisplay(data.to_date);
      }

      var detailCard = el('div', { className: 'att-card' }, [
        makeRow('Leave Type', data.leave_type || ''),
        makeRow('Dates', dateRange),
        makeRow('Total Days', data.total_leave_days != null ? String(data.total_leave_days) : ''),
        makeRow('Half Day', data.half_day ? 'Yes' : 'No'),
        makeRow('Posting Date', formatDateDisplay(data.posting_date))
      ]);
      content.appendChild(detailCard);

      // Half day date
      if (data.half_day && data.half_day_date) {
        var hdCard = el('div', { className: 'att-card', style: { marginTop: '8px' } }, [
          makeRow('Half Day Date', formatDateDisplay(data.half_day_date))
        ]);
        content.appendChild(hdCard);
      }

      // Reason
      if (data.description) {
        content.appendChild(el('div', { className: 'section-heading', textContent: 'Reason', style: { marginTop: '16px' } }));
        content.appendChild(el('div', {
          className: 'att-card',
          textContent: data.description
        }));
      }

      // Leave approver
      if (data.leave_approver_name || data.leave_approver) {
        content.appendChild(el('div', { className: 'section-heading', textContent: 'Approver', style: { marginTop: '16px' } }));
        content.appendChild(el('div', {
          className: 'att-card',
          textContent: data.leave_approver_name || data.leave_approver
        }));
      }

      // Cancel button for Open/draft applications
      if (data.status === 'Open' && data.docstatus === 0) {
        var cancelBtn = el('button', {
          className: 'btn btn-default btn-block btn-lg',
          textContent: 'Cancel Application',
          style: { marginTop: '24px', color: '#d32f2f' },
          onClick: function () {
            if (!confirm('Cancel this leave application?')) return;
            cancelBtn.disabled = true;
            cancelBtn.textContent = 'Cancelling...';

            // For draft (docstatus=0), delete instead
            api.apiCall('DELETE', '/api/resource/Leave Application/' + encodeURIComponent(name)).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                api.showToast('Failed to cancel: ' + (res.error || 'Server error'), 'danger');
                cancelBtn.disabled = false;
                cancelBtn.textContent = 'Cancel Application';
                return;
              }
              api.showToast('Leave application cancelled', 'success');
              navigate('#/leave');
            }).catch(function () {
              cancelBtn.disabled = false;
              cancelBtn.textContent = 'Cancel Application';
              api.showToast('Failed to cancel application', 'danger');
            });
          }
        });
        content.appendChild(cancelBtn);
      }
    }).catch(function (err) {
      content.textContent = '';
      showError(content, 'Failed to load: ' + (err.message || err));
    });
  }

  function makeRow(label, value) {
    return el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' } }, [
      el('span', { textContent: label, style: { color: '#888', fontSize: '13px' } }),
      el('span', { textContent: value, style: { fontWeight: '500', fontSize: '13px' } })
    ]);
  }

  // ─── Public API ───────────────────────────────────────────────────

  window.leaveFeature = {
    // Screen renderers
    renderLeaveHome: renderLeaveHome,
    renderLeaveApply: renderLeaveApply,
    renderLeaveDetail: renderLeaveDetail,

    // API functions
    getLeaveBalance: getLeaveBalance,
    getLeaveApplications: getLeaveApplications,
    applyLeave: applyLeave,
    getLeaveApplication: getLeaveApplication,
    cancelLeaveApplication: cancelLeaveApplication,

    // Helper
    resolveEmployee: resolveEmployee
  };

})();
