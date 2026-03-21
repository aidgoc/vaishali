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
    var emp = Auth.getEmployee() || {};
    // emp.name is the ERPNext Employee ID (e.g. HR-EMP-00001)
    // emp.employee_name is the human-readable name
    var empId = emp.name || emp.employee_id || '';
    var empHumanName = emp.employee_name || '';

    var listArea = UI.el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    if (!empId && !empHumanName) {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Employee record not linked. Contact admin.'));
      return;
    }

    // Use Employee ID for the filter; fall back to employee_name if ID looks like a human name
    var filterField = 'employee';
    var filterValue = empId;
    if (empId && empId.indexOf(' ') !== -1 && empHumanName) {
      // emp.name contains spaces — it's actually the employee name, not the ID
      filterField = 'employee_name';
      filterValue = empId;
    } else if (!empId && empHumanName) {
      filterField = 'employee_name';
      filterValue = empHumanName;
    }

    var filters = JSON.stringify([[filterField, '=', filterValue], ['docstatus', '=', 1]]);
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

      var slips = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : [];

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

      var data = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : null;
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
        contentArea.appendChild(UI.sectionHeading('Earnings'));
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
        contentArea.appendChild(UI.sectionHeading('Deductions'));
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
