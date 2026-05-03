/* leave.js — Leave screens for DSPL Field PWA (Home, Apply, Detail) — M3 */
(function () {
  'use strict';

  // Fallback only — actual list comes from /api/field/leave-types so that
  // legacy/system-managed types (LWP) are filtered out per company policy.
  var LEAVE_TYPES_FALLBACK = ['Paid Leave', 'Sick Leave'];

  function fetchLeaveTypes() {
    return window.fieldAPI.apiCall('GET', '/api/field/leave-types').then(function (res) {
      var data = (res && res.data && (res.data.message || res.data.data)) || [];
      if (!Array.isArray(data) || data.length === 0) return LEAVE_TYPES_FALLBACK.slice();
      return data;
    }).catch(function () { return LEAVE_TYPES_FALLBACK.slice(); });
  }

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
    var appFields = JSON.stringify(['name', 'leave_type', 'from_date', 'to_date', 'total_leave_days', 'status', 'posting_date', 'half_day']);
    var appPath = '/api/resource/Leave Application?filters=' +
      encodeURIComponent(appFilters) +
      '&fields=' + encodeURIComponent(appFields) +
      '&order_by=posting_date desc&limit_page_length=20';

    Promise.all([
      window.fieldAPI.apiCall('GET', '/api/field/leave-types'),
      window.fieldAPI.apiCall('GET', appPath),
      window.fieldAPI.apiCall('GET', '/api/field/attendance-summary')
    ]).then(function (results) {
      var typesRes = results[0];
      var appRes = results[1];
      var attRes = results[2];

      skel.remove();

      // ── Balance — pulled from /api/field/leave-types so it matches the
      // policy-visible types only (Paid + Sick), with allocated/used/remaining.
      var ltypes = (typesRes && typesRes.data && (typesRes.data.message || typesRes.data.data)) || [];

      var statItems = [];
      for (var j = 0; j < ltypes.length; j++) {
        var t = ltypes[j];
        statItems.push({
          value: t.remaining,
          label: t.leave_type,
          support: t.used + ' used of ' + t.allocated
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

      // ── Attendance link — late marks + straight half-days + OT ──
      var attData = (attRes && attRes.data && (attRes.data.message || attRes.data.data)) || null;
      if (attData) {
        var lm = (attData.this_month && attData.this_month.late_marks) || 0;
        var hdRoll = (attData.this_month && attData.this_month.half_day_deductions) || 0;
        var hdStraight = (attData.this_month && attData.this_month.straight_half_days) || 0;
        var otH = (attData.this_month && attData.this_month.ot_hours) || 0;
        var otOpen = (attData.this_month && attData.this_month.ot_open_count) || 0;

        var rows = [];

        // Office mode → late marks + half-day rows
        if (attData.attendance_mode === 'Office' && (lm > 0 || hdRoll > 0 || hdStraight > 0)) {
          var totalHd = hdRoll + hdStraight;
          var subText;
          if (hdStraight > 0 && hdRoll > 0) {
            subText = hdStraight + ' from late check-in (after 11:00) · ' +
                      hdRoll + ' from 3-late rollup';
          } else if (hdStraight > 0) {
            subText = hdStraight + (hdStraight === 1 ? ' day' : ' days') + ' from check-in after 11:00';
          } else if (hdRoll > 0) {
            subText = hdRoll + (hdRoll === 1 ? ' day' : ' days') + ' from 3-late rollup';
          } else {
            subText = 'No half-day deductions yet — 3 lates → 1 deduction';
          }
          rows.push(UI.listCard({
            title: lm + (lm === 1 ? ' late mark' : ' late marks') + (totalHd > 0 ? ' · ' + totalHd + ' half-day' + (totalHd === 1 ? '' : 's') : ''),
            sub: subText,
            right: UI.pill(totalHd > 0 ? 'Deduction' : 'Watch', totalHd > 0 ? 'red' : 'yellow'),
            onClick: function () { location.hash = '#/attendance'; }
          }));
        }

        // OT-eligible → OT hours row
        if (attData.overtime_eligible) {
          rows.push(UI.listCard({
            title: otH.toFixed(2) + ' OT hours',
            sub: otOpen > 0
              ? otOpen + (otOpen === 1 ? ' day' : ' days') + ' awaiting approval'
              : 'No OT pending approval',
            right: UI.pill(otOpen > 0 ? 'Open' : 'Logged', otOpen > 0 ? 'yellow' : 'green'),
            onClick: function () { location.hash = '#/attendance'; }
          }));
        }

        if (rows.length) {
          content.appendChild(UI.sectionHeader('This month', {
            support: attData.overtime_eligible
              ? 'Late marks reduce leave; overtime accrues for payroll'
              : 'Late marks reduce your effective leave balance'
          }));
          content.appendChild(el('div', { className: 'm3-list' }, rows));
        }
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

            // Right column: status pill + optional half-day chip stacked.
            var rightPills = el('div', {
              style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }
            }, [
              UI.pill(app.status, statusColor(app.status)),
              app.half_day ? UI.pill('Half day', 'blue') : null
            ].filter(Boolean));

            listWrap.appendChild(UI.listCard({
              title: app.leave_type,
              sub: sub,
              right: rightPills,
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

    // Pull policy-visible leave types asynchronously, then render the form.
    // This avoids hardcoding types that don't match the active policy
    // (e.g. older builds offered "Privilege Leave" which has no allocation).
    var formArea = el('div');
    var formSkel = UI.skeleton(3);
    content.appendChild(formSkel);
    content.appendChild(formArea);

    fetchLeaveTypes().then(function (types) {
      formSkel.remove();
      var typeNames = types.map(function (t) {
        return (t && typeof t === 'object') ? t.leave_type : t;
      }).filter(Boolean);
      renderForm(typeNames, types);
    });

    function renderForm(typeNames, fullTypes) {
    var balanceByType = {};
    if (fullTypes) {
      for (var bi = 0; bi < fullTypes.length; bi++) {
        var bt = fullTypes[bi];
        if (bt && typeof bt === 'object' && bt.leave_type) balanceByType[bt.leave_type] = bt;
      }
    }
    // M3 floating-label fields
    var leaveTypeField = UI.m3SelectField('Leave type', typeNames, { required: true });
    var fromDateField = UI.m3TextField('From date', { type: 'date', value: todayISO(), required: true });
    var toDateField = UI.m3TextField('To date', { type: 'date', value: todayISO(), required: true });

    var halfDay = false;
    var durationLabel = el('div', {
      textContent: 'Duration',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    var durationSeg = UI.segmented([
      { value: 'full', label: 'Full day' },
      { value: 'half', label: 'Half day' }
    ], { value: 'full', onChange: function (v) { halfDay = (v === 'half'); } });

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

    // Balance hint — only render when we have a balance for the picked type.
    var balanceHint = el('div', {
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        padding: '4px 4px 8px',
        letterSpacing: '0.5px',
        minHeight: '18px'
      }
    });
    function refreshBalanceHint() {
      var lt = leaveTypeField._getValue();
      var bt = balanceByType[lt];
      if (!bt) { balanceHint.textContent = ''; return; }
      balanceHint.textContent = lt + ': ' + bt.remaining + ' day' +
        (bt.remaining === 1 ? '' : 's') + ' remaining of ' + bt.allocated;
    }
    var leaveTypeSelect = leaveTypeField._getSelect && leaveTypeField._getSelect();
    if (leaveTypeSelect) {
      leaveTypeSelect.addEventListener('change', refreshBalanceHint);
    }

    formArea.appendChild(leaveTypeField);
    formArea.appendChild(balanceHint);
    formArea.appendChild(fromDateField);
    formArea.appendChild(toDateField);
    formArea.appendChild(durationLabel);
    formArea.appendChild(durationSeg);
    formArea.appendChild(reasonField);
    formArea.appendChild(errorBox);
    formArea.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' } }, [
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
      if (halfDay && fromDate !== toDate) {
        showError('Half day applies to a single date — From and To must match.');
        return;
      }

      submitBtn._setLoading(true, 'Submitting...');

      var emp = Auth.getEmployee() || {};
      var payload = {
        employee: empName,
        leave_type: leaveType,
        from_date: fromDate,
        to_date: toDate,
        half_day: halfDay ? 1 : 0,
        description: reason,
        company: emp.company || 'Dynamic Servitech Private Limited',
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
    } // end renderForm
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

      // Status pill row + optional half-day chip
      var pillRow = el('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }
      }, [
        UI.pill(data.status, statusColor(data.status)),
        data.half_day ? UI.pill('Half day', 'blue') : null
      ].filter(Boolean));
      content.appendChild(pillRow);

      // Detail card (half_day is shown as the pill above; omitted from rows)
      content.appendChild(UI.detailCard([
        { label: 'Status', value: data.status },
        { label: 'Leave type', value: data.leave_type || '' },
        { label: 'From', value: formatDate(data.from_date) },
        { label: 'To', value: formatDate(data.to_date) },
        { label: 'Days', value: data.total_leave_days != null ? String(data.total_leave_days) : '' },
        { label: 'Reason', value: data.description || '—' },
        { label: 'Posted on', value: formatDate(data.posting_date) }
      ]));

      // Cancel button — Open drafts (delete) or Approved (cancel with reason)
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
      } else if (data.status === 'Approved' && data.docstatus === 1) {
        var cancelApprovedBtn = UI.btn('Cancel approved leave', {
          type: 'outline-danger',
          block: true,
          icon: 'x',
          onClick: function () {
            var reasonField = UI.m3TextField('Cancellation reason', {
              multiline: true,
              rows: 3,
              required: true,
              support: 'Required — sent on the same email thread to your manager and HR.'
            });
            var sheet = UI.bottomSheet('Cancel approved leave', el('div', {}, [
              el('div', {
                style: { font: 'var(--m3-body-medium)', color: 'var(--m3-on-surface-variant)', marginBottom: '12px' },
                textContent: 'Your manager and HR will be notified by email on the original approval thread.'
              }),
              reasonField,
              UI.btn('Confirm cancellation', {
                type: 'danger',
                block: true,
                icon: 'check',
                onClick: function () {
                  var reason = reasonField._getValue().trim();
                  if (reason.length < 10) {
                    UI.toast('Please provide a reason of at least 10 characters', 'danger');
                    return;
                  }
                  window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.cancel_approved_leave', {
                    leave_name: name,
                    reason: reason
                  }).then(function (res) {
                    if (res.error || (res.status && res.status >= 400)) {
                      var msg = (res.data && res.data._server_messages) ? 'Failed' : (res.error || 'Server error');
                      try {
                        var msgs = JSON.parse(res.data._server_messages);
                        msg = JSON.parse(msgs[0]).message;
                      } catch (e) {}
                      UI.toast('Failed: ' + msg, 'danger');
                      return;
                    }
                    UI.toast('Approved leave cancelled — manager and HR notified', 'success');
                    sheet.close();
                    location.hash = '#/leave';
                  }).catch(function () {
                    UI.toast('Failed to cancel — try again', 'danger');
                  });
                }
              })
            ]));
            document.body.appendChild(sheet);
          }
        });
        content.appendChild(el('div', { style: { marginTop: '16px' } }, [cancelApprovedBtn]));
      }

    }).catch(function (err) {
      skel.remove();
      content.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });
  };

})();
