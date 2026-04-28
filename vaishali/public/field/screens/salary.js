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
    var el = UI.el;
    var contentArea = el('div');
    var skel = UI.skeleton(3);
    contentArea.appendChild(skel);
    appEl.appendChild(contentArea);

    var name = params && params.id ? params.id : '';
    if (!name) {
      skel.remove();
      contentArea.appendChild(UI.error('No salary slip specified'));
      return;
    }

    api.apiCall('GET', '/api/resource/Salary Slip/' + encodeURIComponent(name)).then(function (res) {
      skel.remove();

      if (res.error) {
        contentArea.appendChild(UI.error('Could not load salary slip'));
        return;
      }

      var data = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : null;
      if (!data) {
        contentArea.appendChild(UI.error('Salary slip not found'));
        return;
      }

      // M3 hero — month + net pay
      contentArea.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: monthYear(data.start_date) }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: data.name + (data.employee_name ? ' · ' + data.employee_name : '') })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: formatCurrency(data.net_pay) }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Net pay' })
          ])
        ])
      ]));

      // PDF action
      contentArea.appendChild(el('div', { className: 'm3-doc-actions' }, [
        UI.btn('Download PDF', {
          type: 'tonal',
          icon: 'file',
          onClick: function () {
            window.open('/api/method/frappe.utils.print_format.download_pdf?doctype=Salary Slip&name=' + encodeURIComponent(name) + '&format=Standard', '_blank');
          }
        })
      ]));

      // Earnings as items table
      var earnings = data.earnings || [];
      if (earnings.length > 0) {
        contentArea.appendChild(UI.sectionHeader('Earnings', { support: 'Components added to gross pay' }));
        var earnBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < earnings.length; i++) {
          earnBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: earnings[i].salary_component })
            ]),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(earnings[i].amount) })
          ]));
        }
        contentArea.appendChild(earnBox);
      }

      // Deductions as items table
      var deductions = data.deductions || [];
      if (deductions.length > 0) {
        contentArea.appendChild(UI.sectionHeader('Deductions', { support: 'Components subtracted from gross' }));
        var dedBox = el('div', { className: 'm3-doc-items' });
        for (var j = 0; j < deductions.length; j++) {
          dedBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: deductions[j].salary_component })
            ]),
            el('div', { className: 'm3-doc-item-amount', textContent: '-' + formatCurrency(deductions[j].amount) })
          ]));
        }
        contentArea.appendChild(dedBox);
      }

      // Totals
      contentArea.appendChild(UI.sectionHeader('Summary'));
      var totalsBox = el('div', { className: 'm3-doc-totals' });
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
        el('span', { textContent: 'Gross pay' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(data.gross_pay) })
      ]));
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
        el('span', { textContent: 'Total deductions' }),
        el('span', { className: 'm3-doc-totals-value', textContent: '-' + formatCurrency(data.total_deduction) })
      ]));
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row grand' }, [
        el('span', { textContent: 'Net pay' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(data.net_pay) })
      ]));
      contentArea.appendChild(totalsBox);

    }).catch(function () {
      skel.remove();
      contentArea.appendChild(UI.error('Could not load salary slip'));
    });
  };

})();
