/* salary.js — Salary Slips feature for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  function el(tag, attrs, children) { return (window._fieldEl || function(t) { return document.createElement(t); })(tag, attrs, children); }
  function navigate(h) { (window._fieldNavigate || function(x) { location.hash = x; })(h); }
  var COMPANY = 'Dynamic Servitech Private Limited';

  // ─── Helpers ──────────────────────────────────────────────────────

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function getMonthName(dateStr) {
    var months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[parseInt(dateStr.split('-')[1], 10) - 1];
  }

  function getYear(dateStr) {
    return dateStr.split('-')[0];
  }

  function statusLabel(docstatus) {
    if (docstatus === 1) return 'Submitted';
    if (docstatus === 0) return 'Draft';
    return 'Cancelled';
  }

  function statusColor(docstatus) {
    if (docstatus === 1) return 'green';
    if (docstatus === 0) return 'yellow';
    return 'red';
  }

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  // ─── API Wrappers ─────────────────────────────────────────────────

  function getSalarySlips(employeeId, year) {
    var filters = [
      ['company', '=', COMPANY],
      ['docstatus', '!=', 2]
    ];
    if (employeeId) {
      filters.push(['employee', '=', employeeId]);
    }
    if (year) {
      filters.push(['start_date', '>=', year + '-01-01']);
      filters.push(['start_date', '<=', year + '-12-31']);
    }

    var fields = [
      'name', 'employee', 'employee_name', 'posting_date',
      'start_date', 'end_date', 'department', 'designation',
      'gross_pay', 'total_deduction', 'net_pay', 'docstatus', 'currency'
    ];

    var qs = '?filters=' + encodeURIComponent(JSON.stringify(filters))
      + '&fields=' + encodeURIComponent(JSON.stringify(fields))
      + '&order_by=start_date desc'
      + '&limit_page_length=100';

    return api.apiCall('GET', '/api/resource/Salary Slip' + qs).then(function (res) {
      if (res.error) return { error: res.error };
      var list = (res.data && res.data.data) ? res.data.data : [];
      return { data: list };
    });
  }

  function getSalarySlipDetail(name) {
    return api.apiCall('GET', '/api/resource/Salary Slip/' + encodeURIComponent(name)).then(function (res) {
      if (res.error) return { error: res.error };
      var slip = (res.data && res.data.data) ? res.data.data : null;
      return { data: slip };
    });
  }

  // ─── Screen: Salary Slip List ─────────────────────────────────────

  function checkIsHRAdmin() {
    // Check if current user has HR Manager or System Manager role
    return api.apiCall('GET', '/api/method/frappe.client.get_roles').then(function (res) {
      if (res.error || !res.data || !res.data.message) return false;
      var roles = res.data.message;
      return roles.indexOf('HR Manager') !== -1 || roles.indexOf('System Manager') !== -1;
    }).catch(function () { return false; });
  }

  function getMyEmployeeId() {
    return api.getSession().then(function (s) {
      if (!s || !s.employee) return null;
      return typeof s.employee === 'string' ? s.employee : s.employee.name;
    });
  }

  function renderSalaryList() {
    var appEl = document.getElementById('app');
    var currentYear = new Date().getFullYear();
    var selectedYear = currentYear;

    clearChildren(appEl);

    // Header
    var header = el('div', { className: 'screen-header' }, [
      el('button', {
        className: 'back-btn',
        textContent: '\u2190',
        onClick: function () { navigate('#/home'); }
      }),
      el('span', { textContent: 'Salary Slips' })
    ]);
    appEl.appendChild(header);

    // Year filter
    var yearSelect = el('select', { className: 'form-control', style: { marginBottom: '16px' } }, [
      el('option', { value: String(currentYear), textContent: String(currentYear), selected: true }),
      el('option', { value: String(currentYear - 1), textContent: String(currentYear - 1) })
    ]);

    var filterGroup = el('div', { className: 'field-group' }, [
      el('label', { textContent: 'Year' }),
      yearSelect
    ]);
    appEl.appendChild(filterGroup);

    // List container
    var listContainer = el('div', { className: 'salary-list' });
    appEl.appendChild(listContainer);

    // Resolve employee and admin status
    var myEmployeeId = null;
    var isAdmin = false;

    Promise.all([getMyEmployeeId(), checkIsHRAdmin()]).then(function (results) {
      myEmployeeId = results[0];
      isAdmin = results[1];
      loadSlips();
    });

    yearSelect.addEventListener('change', function () {
      selectedYear = parseInt(yearSelect.value, 10);
      loadSlips();
    });

    function loadSlips() {
      clearChildren(listContainer);
      listContainer.appendChild(el('div', {
        textContent: 'Loading salary slips...',
        style: { padding: '24px', textAlign: 'center', color: '#888' }
      }));

      // Non-admin users only see their own slips
      var empFilter = isAdmin ? null : myEmployeeId;
      getSalarySlips(empFilter, selectedYear).then(function (result) {
        clearChildren(listContainer);

        if (result.error) {
          listContainer.appendChild(el('div', {
            textContent: 'Error: ' + (result.error || 'Failed to load'),
            style: { padding: '24px', textAlign: 'center', color: '#d32f2f' }
          }));
          return;
        }

        var slips = result.data || [];
        if (slips.length === 0) {
          listContainer.appendChild(el('div', {
            textContent: 'No salary slips found for ' + selectedYear,
            style: { padding: '24px', textAlign: 'center', color: '#888' }
          }));
          return;
        }

        for (var i = 0; i < slips.length; i++) {
          listContainer.appendChild(buildSlipCard(slips[i]));
        }
      });
    }

    function buildSlipCard(slip) {
      var month = getMonthName(slip.start_date);
      var year = getYear(slip.start_date);
      var label = statusLabel(slip.docstatus);
      var color = statusColor(slip.docstatus);

      var card = el('div', {
        className: 'stat-card',
        style: { cursor: 'pointer', marginBottom: '10px' },
        onClick: function () { navigate('#/salary/' + slip.name); }
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          el('div', {}, [
            el('div', {
              textContent: month + ' ' + year,
              style: { fontWeight: '600', fontSize: '15px' }
            }),
            el('div', {
              textContent: slip.employee_name || slip.employee,
              style: { fontSize: '13px', color: '#666', marginTop: '2px' }
            })
          ]),
          el('div', { style: { textAlign: 'right' } }, [
            el('div', {
              textContent: formatCurrency(slip.net_pay),
              style: { fontWeight: '700', fontSize: '16px', marginBottom: '4px' }
            }),
            el('span', { className: 'indicator-pill ' + color, textContent: label })
          ])
        ])
      ]);

      return card;
    }

    loadSlips();
  }

  // ─── Screen: Salary Slip Detail ───────────────────────────────────

  function renderSalaryDetail(name) {
    var appEl = document.getElementById('app');
    clearChildren(appEl);

    // Header
    var header = el('div', { className: 'screen-header' }, [
      el('button', {
        className: 'back-btn',
        textContent: '\u2190',
        onClick: function () { navigate('#/salary'); }
      }),
      el('span', { textContent: 'Salary Slip' })
    ]);
    appEl.appendChild(header);

    // Loading state
    var contentEl = el('div', {
      textContent: 'Loading...',
      style: { padding: '24px', textAlign: 'center', color: '#888' }
    });
    appEl.appendChild(contentEl);

    getSalarySlipDetail(name).then(function (result) {
      clearChildren(contentEl);

      if (result.error || !result.data) {
        contentEl.appendChild(el('span', {
          textContent: 'Error: ' + (result.error || 'Salary slip not found')
        }));
        contentEl.style.color = '#d32f2f';
        return;
      }

      var slip = result.data;
      var month = getMonthName(slip.start_date);
      var year = getYear(slip.start_date);
      var label = statusLabel(slip.docstatus);
      var color = statusColor(slip.docstatus);

      // Month/Year heading + status
      contentEl.appendChild(el('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
      }, [
        el('h3', { textContent: month + ' ' + year, style: { margin: '0' } }),
        el('span', { className: 'indicator-pill ' + color, textContent: label })
      ]));

      // Employee info
      contentEl.appendChild(el('div', {
        style: { marginBottom: '16px', fontSize: '14px', color: '#555' }
      }, [
        el('div', { textContent: slip.employee_name || slip.employee }),
        slip.department ? el('div', { textContent: slip.department }) : null,
        slip.designation ? el('div', { textContent: slip.designation }) : null
      ]));

      // Net Pay stat card
      contentEl.appendChild(el('div', { className: 'stat-card', style: { textAlign: 'center', marginBottom: '20px' } }, [
        el('div', { className: 'stat-value', textContent: formatCurrency(slip.net_pay) }),
        el('div', { className: 'stat-label', textContent: 'Net Pay' })
      ]));

      // Earnings section
      var earnings = slip.earnings || [];
      contentEl.appendChild(el('div', { className: 'section-heading', textContent: 'Earnings' }));

      var earningsCard = el('div', { className: 'stat-card', style: { marginBottom: '16px' } });
      for (var i = 0; i < earnings.length; i++) {
        earningsCard.appendChild(buildComponentRow(earnings[i].salary_component, earnings[i].amount, false));
      }
      earningsCard.appendChild(buildComponentRow('Gross Pay', slip.gross_pay, true));
      contentEl.appendChild(earningsCard);

      // Deductions section
      var deductions = slip.deductions || [];
      contentEl.appendChild(el('div', { className: 'section-heading', textContent: 'Deductions' }));

      var deductionsCard = el('div', { className: 'stat-card', style: { marginBottom: '16px' } });
      for (var j = 0; j < deductions.length; j++) {
        deductionsCard.appendChild(buildComponentRow(deductions[j].salary_component, deductions[j].amount, false));
      }
      deductionsCard.appendChild(buildComponentRow('Total Deduction', slip.total_deduction, true));
      contentEl.appendChild(deductionsCard);

      // Net Pay summary
      contentEl.appendChild(el('div', { className: 'section-heading', textContent: 'Summary' }));
      var summaryCard = el('div', { className: 'stat-card' });
      summaryCard.appendChild(buildComponentRow('Gross Pay', slip.gross_pay, false));
      summaryCard.appendChild(buildComponentRow('Total Deduction', slip.total_deduction, false));
      summaryCard.appendChild(buildComponentRow('Net Pay', slip.net_pay, true));
      contentEl.appendChild(summaryCard);
    });
  }

  function buildComponentRow(label, amount, isBold) {
    var weight = isBold ? '700' : '400';
    var borderTop = isBold ? '1px solid #e0e0e0' : 'none';
    var paddingTop = isBold ? '8px' : '0';
    var marginTop = isBold ? '8px' : '0';

    return el('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontWeight: weight,
        borderTop: borderTop,
        paddingTop: paddingTop,
        marginTop: marginTop
      }
    }, [
      el('span', { textContent: label }),
      el('span', { textContent: formatCurrency(amount) })
    ]);
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.salaryFeature = {
    getSalarySlips: getSalarySlips,
    getSalarySlipDetail: getSalarySlipDetail,
    renderSalaryList: renderSalaryList,
    renderSalaryDetail: renderSalaryDetail,
    formatCurrency: formatCurrency,
    getMonthName: getMonthName
  };

})();
