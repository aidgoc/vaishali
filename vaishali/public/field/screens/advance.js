/* advance.js — Employee Advance screens for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'paid' || s === 'claimed' || s === 'returned') return 'green';
    if (s === 'submitted' || s === 'partly claimed and returned') return 'yellow';
    if (s === 'cancelled') return 'red';
    return 'gray';
  }

  // ── Screen: Advance List ─────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.advanceList = function (appEl) {
    var el = UI.el;
    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || '';

    appEl.appendChild(UI.pageHeader(
      'Advances',
      'Request a salary advance and track repayment status.'
    ));

    // Stats placeholder, populated after fetch
    var statsArea = el('div');
    appEl.appendChild(statsArea);

    // Request Advance button — primary action, always visible
    appEl.appendChild(el('div', { style: { margin: '8px 0 16px' } }, [
      UI.btn('Request advance', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/advance/new'; }
      })
    ]));

    appEl.appendChild(UI.sectionHeader('Your advances', { support: 'Most recent first' }));

    var listArea = el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    if (!empName) {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Employee record not linked. Contact admin.'));
      return;
    }

    var filters = JSON.stringify([['employee', '=', empName], ['docstatus', '!=', 2]]);
    var fields = JSON.stringify(['name', 'posting_date', 'advance_amount', 'paid_amount', 'claimed_amount', 'status', 'purpose']);
    var path = '/api/resource/Employee Advance'
      + '?filters=' + encodeURIComponent(filters)
      + '&fields=' + encodeURIComponent(fields)
      + '&order_by=posting_date desc'
      + '&limit_page_length=20';

    api.apiCall('GET', path).then(function (res) {
      listArea.textContent = '';

      if (res.error) {
        listArea.appendChild(UI.error('Could not load advances'));
        return;
      }

      var advances = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : [];

      // Stats — uniform M3
      var totalRequested = 0, totalPaid = 0, totalClaimed = 0, openCt = 0;
      for (var sIdx = 0; sIdx < advances.length; sIdx++) {
        totalRequested += (advances[sIdx].advance_amount || 0);
        totalPaid += (advances[sIdx].paid_amount || 0);
        totalClaimed += (advances[sIdx].claimed_amount || 0);
        if ((advances[sIdx].status || 'Draft') !== 'Claimed') openCt++;
      }
      function fmtINR(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
      statsArea.appendChild(UI.statGrid([
        { value: fmtINR(totalRequested), label: 'Total requested', support: 'across all advances' },
        { value: fmtINR(totalPaid - totalClaimed), label: 'Outstanding', support: 'yet to be claimed' },
        { value: openCt, label: 'Open', support: 'in progress' },
        { value: advances.length, label: 'Total', support: 'records' }
      ], 2));

      if (advances.length === 0) {
        listArea.appendChild(UI.empty('banknote', 'No advances yet', { text: 'Request advance', onClick: function() { location.hash = '#/advance/new'; } }));
        return;
      }

      var listWrap = UI.el('div', { className: 'm3-list' });
      for (var i = 0; i < advances.length; i++) {
        (function (adv) {
          var rightEl = UI.el('div', { style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
            UI.amount(adv.advance_amount),
            UI.pill(adv.status || 'Draft', statusColor(adv.status))
          ]);

          listWrap.appendChild(UI.listCard({
            title: adv.purpose || 'No purpose specified',
            sub: formatDate(adv.posting_date),
            right: rightEl,
            onClick: function () { location.hash = '#/advance/' + encodeURIComponent(adv.name); }
          }));
        })(advances[i]);
      }
      listArea.appendChild(listWrap);
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Could not load advances'));
    });
  };

  // ── Screen: Advance New ──────────────────────────────────────────────

  window.Screens.advanceNew = function (appEl) {
    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || '';

    appEl.appendChild(UI.pageHeader(
      'Request advance',
      'Enter amount, purpose and date. HR will review and pay out.'
    ));

    var amountField = UI.m3TextField('Amount (₹)', {
      type: 'number',
      name: 'amount',
      min: '0',
      step: '1',
      required: true,
      support: 'Whole rupees, no decimals.'
    });
    var purposeField = UI.m3TextField('Purpose of advance', {
      multiline: true,
      rows: 3,
      name: 'purpose',
      required: true,
      support: 'Briefly describe what this advance is for.'
    });
    var dateField = UI.m3TextField('Date', { type: 'date', value: todayISO(), required: true });

    appEl.appendChild(amountField);
    appEl.appendChild(purposeField);
    appEl.appendChild(dateField);

    var submitBtn = UI.btn('Submit request', {
      type: 'primary',
      block: true,
      icon: 'check',
      onClick: function () {
        var amount = parseFloat(amountField._getValue());
        var purpose = purposeField._getValue().trim();
        var postingDate = dateField._getValue() || todayISO();

        if (!amount || amount <= 0) {
          UI.toast('Please enter a valid amount', 'danger');
          return;
        }
        if (!purpose) {
          UI.toast('Please enter a purpose', 'danger');
          return;
        }
        if (!empName) {
          UI.toast('Employee record not linked. Contact admin.', 'danger');
          return;
        }

        submitBtn._setLoading(true, 'Submitting...');

        api.apiCall('POST', '/api/resource/Employee Advance', {
          employee: empName,
          company: 'Dynamic Servitech Private Limited',
          posting_date: postingDate,
          purpose: purpose,
          advance_amount: amount,
          advance_account: 'Employee Advances - DSPL',
          currency: 'INR',
          exchange_rate: 1
        }).then(function (res) {
          submitBtn._setLoading(false);

          if (res.error) {
            var msg = (res.data && res.data._server_messages) ? res.data._server_messages : 'Failed to submit advance request';
            UI.toast(msg, 'danger');
            return;
          }

          UI.toast('Advance request submitted!', 'success');
          location.hash = '#/advance';
        }).catch(function () {
          submitBtn._setLoading(false);
          UI.toast('Network error. Try again.', 'danger');
        });
      }
    });
    appEl.appendChild(submitBtn);
  };

  // ── Screen: Advance Detail ───────────────────────────────────────────

  window.Screens.advanceDetail = function (appEl, params) {
    appEl.appendChild(UI.pageHeader('Advance', params.id || ''));
    var contentArea = UI.el('div');
    contentArea.appendChild(UI.skeleton(2));
    appEl.appendChild(contentArea);

    var name = params && params.id ? params.id : '';
    if (!name) {
      contentArea.textContent = '';
      contentArea.appendChild(UI.error('No advance specified'));
      return;
    }

    api.apiCall('GET', '/api/resource/Employee Advance/' + encodeURIComponent(name)).then(function (res) {
      contentArea.textContent = '';

      if (res.error) {
        contentArea.appendChild(UI.error('Could not load advance details'));
        return;
      }

      var adv = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : null;
      if (!adv) {
        contentArea.appendChild(UI.error('Advance not found'));
        return;
      }

      contentArea.appendChild(UI.detailCard([
        { label: 'Status', value: adv.status || 'Draft' },
        { label: 'Amount', value: formatCurrency(adv.advance_amount) },
        { label: 'Paid', value: formatCurrency(adv.paid_amount) },
        { label: 'Claimed', value: formatCurrency(adv.claimed_amount) },
        { label: 'Purpose', value: adv.purpose || '\u2014' },
        { label: 'Date', value: formatDate(adv.posting_date) }
      ]));

      // Status pill displayed prominently
      var pillWrapper = UI.el('div', { style: { marginTop: '12px' } }, [
        UI.pill(adv.status || 'Draft', statusColor(adv.status))
      ]);
      contentArea.insertBefore(pillWrapper, contentArea.firstChild);
    }).catch(function () {
      contentArea.textContent = '';
      contentArea.appendChild(UI.error('Could not load advance details'));
    });
  };

})();
