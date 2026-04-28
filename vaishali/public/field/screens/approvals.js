/* approvals.js — Manager Approval screens for DSPL Field PWA */
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
          listWrap.appendChild(UI.listCard({
            avatar: item.employee_name,
            title: item.employee_name,
            sub: buildSubText(item),
            right: UI.pill(item.type, pillColor(item.type)),
            onClick: function () {
              location.hash = '#/approvals/' + item.type.toLowerCase() + '/' + encodeURIComponent(item.name);
            }
          }));
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
          { label: 'Amount', value: formatCurrency(data.advance_amount) },
          { label: 'Purpose', value: data.purpose || '\u2014' },
          { label: 'Date', value: formatDate(data.posting_date) }
        ];
      }

      content.appendChild(UI.detailCard(fields));

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

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });

    function doAction(action) {
      var confirmMsg = action === 'approve'
        ? 'Approve this ' + type + '?'
        : 'Reject this ' + type + '?';
      if (!confirm(confirmMsg)) return;

      var actionPath = '/api/field/approvals/' + encodeURIComponent(type) + '/' + encodeURIComponent(name) + '/' + action;
      api.apiCall('POST', actionPath).then(function (res) {
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
    }
  };

})();
