/* approvals.js — Manager Approval screens for Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function pillColor(type) {
    if (type === 'Leave') return 'blue';
    if (type === 'Expense') return 'yellow';
    if (type === 'Advance') return 'green';
    return 'gray';
  }

  function buildSubText(item) {
    if (item.type === 'Leave') {
      var range = formatDate(item.from_date);
      if (item.to_date && item.to_date !== item.from_date) {
        range += ' \u2013 ' + formatDate(item.to_date);
      }
      if (item.total_leave_days) {
        range += '  \u00b7  ' + item.total_leave_days + (item.total_leave_days === 1 ? ' day' : ' days');
      }
      return range;
    }
    if (item.type === 'Expense') {
      return formatCurrency(item.amount);
    }
    if (item.type === 'Advance') {
      var text = formatCurrency(item.amount);
      if (item.purpose) {
        text += '  \u00b7  ' + item.purpose;
      }
      return text;
    }
    return '';
  }

  function typeToDoctype(type) {
    if (type === 'leave') return 'Leave Application';
    if (type === 'expense') return 'Expense Claim';
    if (type === 'advance') return 'Employee Advance';
    return '';
  }

  // ── Screen: Approvals List ───────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.approvalsList = function (appEl) {
    var el = UI.el;
    var activeTab = 'all';
    var allItems = [];

    var content = el('div');
    appEl.appendChild(content);

    // Page header — Heuristic 1 (visibility)
    content.appendChild(UI.pageHeader(
      'Approvals',
      'Pending leave, expense and advance requests from your team.'
    ));

    // History link — quick path to "what have I approved?"
    content.appendChild(el('div', { style: { marginBottom: '12px' } }, [
      el('a', {
        href: '#/approvals/history',
        textContent: 'View my approval history →',
        style: { font: 'var(--m3-label-large)', color: 'var(--m3-primary)', textDecoration: 'none' }
      })
    ]));

    // Stats row — uniform M3 stats
    var statsContainer = el('div');
    content.appendChild(statsContainer);

    // Filter — segmented buttons (4 options, fits 7-rule, single-select)
    var segLabel = el('div', {
      textContent: 'Filter by type',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    content.appendChild(segLabel);
    var segBar = UI.segmented([
      { value: 'all', label: 'All' },
      { value: 'leave', label: 'Leave' },
      { value: 'expense', label: 'Expense' },
      { value: 'advance', label: 'Advance' }
    ], { value: 'all', onChange: function (val) {
      activeTab = val;
      renderList();
    } });
    content.appendChild(segBar);

    var listArea = el('div', { style: { marginTop: '16px' } });
    listArea.appendChild(UI.skeleton(3));
    content.appendChild(listArea);

    function renderStats() {
      statsContainer.textContent = '';
      var leaveCt = 0, expenseCt = 0, advanceCt = 0;
      for (var i = 0; i < allItems.length; i++) {
        if (allItems[i].type === 'Leave') leaveCt++;
        else if (allItems[i].type === 'Expense') expenseCt++;
        else if (allItems[i].type === 'Advance') advanceCt++;
      }
      statsContainer.appendChild(UI.statGrid([
        { value: allItems.length, label: 'Total pending', support: 'awaiting your action' },
        { value: leaveCt, label: 'Leave', support: 'requests' },
        { value: expenseCt, label: 'Expense', support: 'claims' },
        { value: advanceCt, label: 'Advance', support: 'requests' }
      ], 2));
    }

    function renderList() {
      listArea.textContent = '';

      var filtered = allItems;
      if (activeTab !== 'all') {
        filtered = [];
        var matchType = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
        for (var i = 0; i < allItems.length; i++) {
          if (allItems[i].type === matchType) {
            filtered.push(allItems[i]);
          }
        }
      }

      if (filtered.length === 0) {
        listArea.appendChild(UI.empty('check', 'All caught up — no pending approvals.'));
        return;
      }

      var listWrap = el('div', { className: 'm3-list' });
      for (var j = 0; j < filtered.length; j++) {
        (function (item) {
          var card = UI.listCard({
            avatar: item.employee_name,
            title: item.employee_name,
            sub: buildSubText(item),
            right: UI.pill(item.type, pillColor(item.type)),
            onClick: function () {
              location.hash = '#/approvals/' + item.type.toLowerCase() + '/' + encodeURIComponent(item.name);
            }
          });
          // Swipe-row: leading=Approve, trailing=Reject — direct action without
          // navigating to detail. Hits the same endpoint the detail page uses.
          if (UI.swipeRow) {
            var doAction = function (action) {
              var path = '/api/field/approvals/' + encodeURIComponent(item.type.toLowerCase()) + '/' + encodeURIComponent(item.name) + '/' + action;
              api.apiCall('POST', path).then(function (res) {
                if (res.error || (res.status && res.status >= 400)) {
                  var verb = action === 'approve' ? 'Approve' : 'Reject';
                  UI.toast(verb + ' failed', 'danger');
                  return;
                }
                var pastTense = action === 'approve' ? 'approved' : 'rejected';
                UI.toast(item.type + ' ' + pastTense, 'success');
                // Reload list
                renderList();
              });
            };
            var leading = [{ icon: 'check', label: 'Approve', color: 'success', onClick: function () {
              UI.confirmDialog('Approve this ' + item.type + '?', 'The requester will be notified.', { confirmText: 'Approve' }).then(function (ok) {
                if (ok) doAction('approve');
              });
            } }];
            var trailing = [{ icon: 'x', label: 'Reject', color: 'danger', onClick: function () {
              UI.confirmDialog('Reject this ' + item.type + '?', 'The requester will be notified.', { confirmText: 'Reject', danger: true }).then(function (ok) {
                if (ok) doAction('reject');
              });
            } }];
            listWrap.appendChild(UI.swipeRow(card, { leadingActions: leading, trailingActions: trailing }));
          } else {
            listWrap.appendChild(card);
          }
        })(filtered[j]);
      }
      listArea.appendChild(listWrap);
    }

    // Fetch pending approvals
    api.apiCall('GET', '/api/field/approvals').then(function (res) {
      listArea.textContent = '';

      if (res.error) {
        listArea.appendChild(UI.error('Could not load approvals'));
        return;
      }

      allItems = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : [];
      renderStats();
      renderList();
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Could not load approvals'));
    });
  };

  // ── Screen: Approval Detail ──────────────────────────────────────────

  window.Screens.approvalDetail = function (appEl, params) {
    var el = UI.el;
    var type = params.type || '';
    var name = params.id || '';
    var doctype = typeToDoctype(type);
    var detailCtx = {};  // shared between fetch handler and doAction

    var content = el('div', { style: { padding: '0 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    if (!doctype || !name) {
      content.textContent = '';
      content.appendChild(UI.error('Invalid approval reference'));
      return;
    }

    var path = '/api/resource/' + encodeURIComponent(doctype) + '/' + encodeURIComponent(name);
    api.apiCall('GET', path).then(function (res) {
      content.textContent = '';

      if (res.error) {
        content.appendChild(UI.error('Could not load approval details'));
        return;
      }

      var data = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : null;
      if (!data) {
        content.appendChild(UI.error('Document not found'));
        return;
      }

      // Build detail fields based on type
      var fields = [];

      if (type === 'leave') {
        fields = [
          { label: 'Employee', value: data.employee_name || data.employee || '' },
          { label: 'Leave Type', value: data.leave_type || '' },
          { label: 'From', value: formatDate(data.from_date) },
          { label: 'To', value: formatDate(data.to_date) },
          { label: 'Days', value: data.total_leave_days != null ? String(data.total_leave_days) : '' },
          { label: 'Half Day', value: data.half_day ? 'Yes' : 'No' },
          { label: 'Reason', value: data.description || '\u2014' }
        ];
      } else if (type === 'expense') {
        fields = [
          { label: 'Employee', value: data.employee_name || data.employee || '' },
          { label: 'Posting Date', value: formatDate(data.posting_date) },
          { label: 'Total Amount', value: formatCurrency(data.total_claimed_amount || data.grand_total || 0) }
        ];

        // Show expense line items if available
        var expenses = data.expenses || [];
        for (var i = 0; i < expenses.length; i++) {
          var exp = expenses[i];
          fields.push({
            label: 'Item ' + (i + 1),
            value: (exp.expense_type || 'Expense') + ' \u2013 ' + formatCurrency(exp.amount)
          });
        }
      } else if (type === 'advance') {
        fields = [
          { label: 'Employee', value: data.employee_name || data.employee || '' },
          { label: 'Requested', value: formatCurrency(data.advance_amount) },
          { label: 'Purpose', value: data.purpose || '\u2014' },
          { label: 'Date', value: formatDate(data.posting_date) }
        ];
      }

      content.appendChild(UI.detailCard(fields));

      // Partial-approval inputs (advance only) + optional reason for any type.
      // ERPNext has no native partial-approval field \u2014 the convention is to
      // edit advance_amount down before submit. We surface that as an editable
      // input so approvers don't have to leave the PWA for the desk.
      var requestedAmount = type === 'advance' ? Number(data.advance_amount || 0) : 0;
      var amountInput = null;
      var reasonInput = null;
      if (type === 'advance') {
        amountInput = el('input', {
          type: 'number',
          min: '1',
          max: String(requestedAmount),
          step: '1',
          value: String(requestedAmount),
          className: 'm3-text-input',
          style: { width: '100%' }
        });
        content.appendChild(el('div', { style: { marginTop: '20px' } }, [
          el('div', {
            textContent: 'Approve amount (\u20b9)',
            style: { font: 'var(--m3-label-medium)', color: 'var(--m3-on-surface-variant)', marginBottom: '6px' }
          }),
          amountInput,
          el('div', {
            textContent: 'Lower this to partially approve. Cannot exceed \u20b9' + Number(requestedAmount).toLocaleString('en-IN') + '.',
            style: { font: 'var(--m3-label-small)', color: 'var(--m3-on-surface-variant)', marginTop: '4px' }
          })
        ]));
      }
      reasonInput = el('textarea', {
        rows: 2,
        placeholder: type === 'advance' ? 'Required if reducing the amount or rejecting' : 'Optional note',
        className: 'm3-text-input',
        style: { width: '100%', resize: 'vertical' }
      });
      content.appendChild(el('div', { style: { marginTop: '16px' } }, [
        el('div', {
          textContent: 'Note / reason',
          style: { font: 'var(--m3-label-medium)', color: 'var(--m3-on-surface-variant)', marginBottom: '6px' }
        }),
        reasonInput
      ]));

      // Action bar: Approve / Reject
      content.appendChild(el('div', { style: { marginTop: '24px' } }, [
        UI.actionBar([
          {
            text: 'Approve',
            type: 'success',
            onClick: function () { doAction('approve'); }
          },
          {
            text: 'Reject',
            type: 'outline-danger',
            onClick: function () { doAction('reject'); }
          }
        ])
      ]));

      // Capture closure-scoped refs for doAction
      detailCtx.amountInput = amountInput;
      detailCtx.reasonInput = reasonInput;
      detailCtx.requestedAmount = requestedAmount;

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });

    function doAction(action) {
      var isApprove = action === 'approve';
      var body = {};
      var summary = isApprove
        ? 'The request will be marked as approved and the requester will be notified.'
        : 'The request will be marked as rejected and the requester will be notified.';

      // Advance partial-approval client-side validation
      if (isApprove && type === 'advance' && detailCtx.amountInput) {
        var raw = (detailCtx.amountInput.value || '').trim();
        var requested = detailCtx.requestedAmount || 0;
        if (!raw) { UI.toast('Enter an approve amount', 'danger'); return; }
        var approved = Number(raw);
        if (!isFinite(approved) || approved <= 0) {
          UI.toast('Approve amount must be a positive number', 'danger'); return;
        }
        if (approved > requested) {
          UI.toast('Approve amount cannot exceed the requested ₹' + requested.toLocaleString('en-IN'), 'danger');
          return;
        }
        body.approved_amount = approved;
        if (approved < requested) {
          summary = 'Partial approval: ₹' + approved.toLocaleString('en-IN')
            + ' of ₹' + requested.toLocaleString('en-IN') + ' requested. Requester will be notified.';
        }
      }
      if (detailCtx.reasonInput && detailCtx.reasonInput.value && detailCtx.reasonInput.value.trim()) {
        body.reason = detailCtx.reasonInput.value.trim();
      }
      // Reduction without a reason — block, since the approver should justify it.
      if (isApprove && body.approved_amount && body.approved_amount < detailCtx.requestedAmount && !body.reason) {
        UI.toast('Add a note explaining the partial approval', 'danger');
        if (detailCtx.reasonInput) detailCtx.reasonInput.focus();
        return;
      }

      UI.confirmDialog(
        (isApprove ? 'Approve this ' : 'Reject this ') + type + '?',
        summary,
        {
          confirmText: isApprove ? 'Approve' : 'Reject',
          cancelText: 'Cancel',
          danger: !isApprove,
          icon: isApprove ? 'check' : 'x'
        }
      ).then(function (ok) {
        if (!ok) return;

        var actionPath = '/api/field/approvals/' + encodeURIComponent(type) + '/' + encodeURIComponent(name) + '/' + action;
        api.apiCall('POST', actionPath, body).then(function (res) {
          if (res.error || (res.status && res.status >= 400)) {
            var errMsg = 'Action failed';
            if (res.data && res.data.message) {
              errMsg = res.data.message;
            }
            UI.toast(errMsg, 'danger');
            return;
          }
          UI.toast(type.charAt(0).toUpperCase() + type.slice(1) + ' ' + action + 'd', 'success');
          location.hash = '#/approvals';
        }).catch(function () {
          UI.toast('Network error. Try again.', 'danger');
        });
      });
    }
  };

  // ── Screen: My Approval History ──────────────────────────────────────
  window.Screens.approvalsHistory = function (appEl) {
    var el = UI.el;
    var content = el('div');
    appEl.appendChild(content);
    content.appendChild(UI.pageHeader(
      'My approval history',
      'What you have approved or rejected in the last 30 days.'
    ));
    var listArea = el('div', { style: { marginTop: '16px' } });
    listArea.appendChild(UI.skeleton(3));
    content.appendChild(listArea);

    api.apiCall('GET', '/api/field/approvals/history?days=30').then(function (res) {
      listArea.textContent = '';
      if (res.error) {
        listArea.appendChild(UI.error('Could not load history'));
        return;
      }
      var raw = res.data || {};
      var items = raw.message || raw.data || (Array.isArray(raw) ? raw : []);
      if (!items || items.length === 0) {
        listArea.appendChild(UI.empty('clock', 'No approvals yet in the last 30 days.'));
        return;
      }
      var listWrap = el('div', { className: 'm3-list' });
      for (var i = 0; i < items.length; i++) {
        (function (item) {
          var sub = '';
          if (item.type === 'Leave') {
            sub = formatDate(item.from_date);
            if (item.to_date && item.to_date !== item.from_date) sub += ' – ' + formatDate(item.to_date);
            if (item.total_leave_days) sub += '  ·  ' + item.total_leave_days + 'd';
          } else if (item.type === 'Expense') {
            sub = formatCurrency(item.amount);
          } else if (item.type === 'Advance') {
            sub = formatCurrency(item.amount);
            if (item.purpose) sub += '  ·  ' + item.purpose;
          }
          var actionLabel = (item.action === 'approved' ? 'Approved' : 'Rejected');
          var actionColor = (item.action === 'approved' ? 'green' : 'red');
          listWrap.appendChild(UI.listCard({
            avatar: item.employee_name,
            title: item.employee_name,
            sub: sub + '  ·  ' + actionLabel.toLowerCase() + ' ' + relativeTime(item.modified),
            right: UI.pill(actionLabel, actionColor),
            onClick: function () {
              var t = (item.type || '').toLowerCase();
              location.hash = '#/approvals/' + t + '/' + encodeURIComponent(item.name);
            }
          }));
        })(items[i]);
      }
      listArea.appendChild(listWrap);
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Network error loading history'));
    });
  };

  function relativeTime(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso.replace(' ', 'T')).getTime();
    var mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }
})();
