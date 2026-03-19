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
    appEl.appendChild(UI.page('Advances', '#/hr'));

    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || '';

    // Request Advance button
    appEl.appendChild(UI.btn('+ Request Advance', {
      type: 'primary',
      block: true,
      icon: 'plus',
      onClick: function () { location.hash = '#/advance/new'; }
    }));

    appEl.appendChild(UI.sectionHeading('ADVANCES'));

    var listArea = UI.el('div');
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

      var advances = (res.data && res.data.data) ? res.data.data : [];

      if (advances.length === 0) {
        listArea.appendChild(UI.empty('banknote', 'No advances yet'));
        return;
      }

      for (var i = 0; i < advances.length; i++) {
        (function (adv) {
          var rightEl = UI.el('div', { style: { textAlign: 'right' } }, [
            UI.amount(adv.advance_amount),
            UI.el('div', { style: { marginTop: '4px' } }, [
              UI.pill(adv.status || 'Draft', statusColor(adv.status))
            ])
          ]);

          listArea.appendChild(UI.listCard({
            title: adv.purpose || 'No purpose specified',
            sub: formatDate(adv.posting_date),
            right: rightEl,
            onClick: function () { location.hash = '#/advance/' + encodeURIComponent(adv.name); }
          }));
        })(advances[i]);
      }
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Could not load advances'));
    });
  };

  // ── Screen: Advance New ──────────────────────────────────────────────

  window.Screens.advanceNew = function (appEl) {
    appEl.appendChild(UI.page('Request Advance', '#/advance'));

    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || '';

    var amountInput = UI.textInput('Enter amount', { type: 'number', name: 'amount' });
    var purposeInput = UI.textarea('Purpose of advance', { name: 'purpose' });
    var dateField = UI.dateInput('Date', todayISO());

    // Extract the actual input from the dateInput field-group wrapper
    var dateInput = dateField.querySelector('input');

    appEl.appendChild(UI.card([
      UI.field('Amount', amountInput),
      UI.field('Purpose', purposeInput),
      dateField
    ]));

    var submitBtn = UI.btn('Submit', {
      type: 'primary',
      block: true,
      onClick: function () {
        var amount = parseFloat(amountInput.value);
        var purpose = purposeInput.value.trim();
        var postingDate = dateInput ? dateInput.value : todayISO();

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
    appEl.appendChild(UI.page('Advance Detail', '#/advance'));

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

      var adv = (res.data && res.data.data) ? res.data.data : null;
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
