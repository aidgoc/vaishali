/* salary.js — Salary Slip screens for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function monthYear(isoDate) {
    if (!isoDate) return '';
    var months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    var parts = isoDate.split('-');
    var monthIdx = parseInt(parts[1], 10) - 1;
    return months[monthIdx] + ' ' + parts[0];
  }

  // ── Screen: Salary List ──────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.salaryList = function (appEl) {
    appEl.appendChild(UI.page('Salary Slips', '#/hr'));

    var emp = Auth.getEmployee() || {};
    var empName = emp.name || emp.employee_id || '';

    var listArea = UI.el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    if (!empName) {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Employee record not linked. Contact admin.'));
      return;
    }

    var filters = JSON.stringify([['employee', '=', empName], ['docstatus', '=', 1]]);
    var fields = JSON.stringify(['name', 'posting_date', 'start_date', 'end_date', 'net_pay', 'gross_pay', 'total_deduction']);
    var path = '/api/resource/Salary Slip'
      + '?filters=' + encodeURIComponent(filters)
      + '&fields=' + encodeURIComponent(fields)
      + '&order_by=posting_date desc'
      + '&limit_page_length=20';

    api.apiCall('GET', path).then(function (res) {
      listArea.textContent = '';

      if (res.error) {
        listArea.appendChild(UI.error('Could not load salary slips'));
        return;
      }

      var slips = (res.data && res.data.data) ? res.data.data : [];

      if (slips.length === 0) {
        listArea.appendChild(UI.empty('wallet', 'No salary slips yet'));
        return;
      }

      for (var i = 0; i < slips.length; i++) {
        (function (slip) {
          listArea.appendChild(UI.listCard({
            title: monthYear(slip.start_date),
            sub: 'Net Pay',
            right: UI.amount(slip.net_pay),
            onClick: function () { location.hash = '#/salary/' + encodeURIComponent(slip.name); }
          }));
        })(slips[i]);
      }
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Could not load salary slips'));
    });
  };

  // ── Screen: Salary Detail ────────────────────────────────────────────

  window.Screens.salaryDetail = function (appEl, params) {
    appEl.appendChild(UI.page('Salary Slip', '#/salary'));

    var contentArea = UI.el('div');
    contentArea.appendChild(UI.skeleton(3));
    appEl.appendChild(contentArea);

    var name = params && params.id ? params.id : '';
    if (!name) {
      contentArea.textContent = '';
      contentArea.appendChild(UI.error('No salary slip specified'));
      return;
    }

    api.apiCall('GET', '/api/resource/Salary Slip/' + encodeURIComponent(name)).then(function (res) {
      contentArea.textContent = '';

      if (res.error) {
        contentArea.appendChild(UI.error('Could not load salary slip'));
        return;
      }

      var data = (res.data && res.data.data) ? res.data.data : null;
      if (!data) {
        contentArea.appendChild(UI.error('Salary slip not found'));
        return;
      }

      // Summary card
      contentArea.appendChild(UI.detailCard([
        { label: 'Period', value: monthYear(data.start_date) },
        { label: 'Gross Pay', value: formatCurrency(data.gross_pay) },
        { label: 'Total Deduction', value: formatCurrency(data.total_deduction) },
        { label: 'Net Pay', value: formatCurrency(data.net_pay) }
      ]));

      // Earnings
      var earnings = data.earnings || [];
      if (earnings.length > 0) {
        contentArea.appendChild(UI.sectionHeading('EARNINGS'));
        for (var i = 0; i < earnings.length; i++) {
          contentArea.appendChild(UI.detailRow(
            earnings[i].salary_component,
            formatCurrency(earnings[i].amount)
          ));
        }
      }

      // Deductions
      var deductions = data.deductions || [];
      if (deductions.length > 0) {
        contentArea.appendChild(UI.sectionHeading('DEDUCTIONS'));
        for (var j = 0; j < deductions.length; j++) {
          contentArea.appendChild(UI.detailRow(
            deductions[j].salary_component,
            formatCurrency(deductions[j].amount)
          ));
        }
      }
    }).catch(function () {
      contentArea.textContent = '';
      contentArea.appendChild(UI.error('Could not load salary slip'));
    });
  };

})();
