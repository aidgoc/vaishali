/* expense.js — Expense Claim screens for DSPL Field PWA */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  var COMPANY = 'Dynamic Servitech Private Limited';
  var EXPENSE_TYPES = [
    { value: '', text: 'Select type\u2026' },
    { value: 'Travel Fare', text: 'Travel' },
    { value: 'Food Expenses', text: 'Food' },
    { value: 'Calls', text: 'Calls' },
    { value: 'Medical', text: 'Medical' },
    { value: 'Accommodation Exp', text: 'Accommodation' },
    { value: 'Other Travel Exp', text: 'Other' }
  ];

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'paid' || s === 'approved') return 'green';
    if (s === 'submitted' || s === 'unpaid') return 'yellow';
    if (s === 'rejected' || s === 'cancelled') return 'red';
    return 'gray'; // Draft
  }

  // ── Screen 1: Expense List ──────────────────────────────────────────

  window.Screens.expenseList = function (appEl) {
    var loadingEl = UI.skeleton(3);
    appEl.appendChild(loadingEl);

    var emp = Auth.getEmployee() || {};
    // emp.name is the ERPNext Employee ID (e.g. HR-EMP-00001)
    // emp.employee_name is the human-readable name
    var empId = emp.name || '';
    var empHumanName = emp.employee_name || '';

    if (!empId && !empHumanName) {
      appEl.removeChild(loadingEl);
      appEl.appendChild(UI.error('Employee not found. Please log in again.'));
      return;
    }

    // Use Employee ID for the filter; fall back to employee_name if ID looks like a human name
    var filterField = 'employee';
    var filterValue = empId;
    if (empId && empId.indexOf(' ') !== -1 && empHumanName) {
      filterField = 'employee_name';
      filterValue = empId;
    } else if (!empId && empHumanName) {
      filterField = 'employee_name';
      filterValue = empHumanName;
    }

    var fields = JSON.stringify([
      'name', 'posting_date', 'total_claimed_amount',
      'total_sanctioned_amount', 'status', 'approval_status'
    ]);
    var filters = JSON.stringify([[filterField, '=', filterValue]]);
    var qs = '?filters=' + encodeURIComponent(filters) +
             '&fields=' + encodeURIComponent(fields) +
             '&order_by=posting_date desc' +
             '&limit_page_length=20';

    window.fieldAPI.apiCall('GET', '/api/resource/Expense Claim' + qs).then(function (res) {
      appEl.removeChild(loadingEl);

      if (res.error) {
        appEl.appendChild(UI.error('Failed to load expense claims.'));
        return;
      }

      var claims = (res.data && (res.data.data || res.data.message)) || [];

      // Pending total card
      var pendingTotal = 0;
      for (var p = 0; p < claims.length; p++) {
        if (claims[p].approval_status !== 'Rejected') {
          pendingTotal += (claims[p].total_claimed_amount || 0);
        }
      }
      if (pendingTotal > 0) {
        appEl.appendChild(UI.card([
          UI.statCard(formatCurrency(pendingTotal), 'Pending Total')
        ]));
      }

      // New Claim button
      appEl.appendChild(UI.btn('+ New Claim', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/expense/new'; }
      }));

      appEl.appendChild(UI.sectionHeading('Claims'));

      if (claims.length === 0) {
        appEl.appendChild(UI.empty('receipt', 'No expense claims yet', { text: '+ New Expense', onClick: function() { location.hash = '#/expense/new'; } }));
        return;
      }

      for (var i = 0; i < claims.length; i++) {
        (function (claim) {
          var displayStatus = claim.approval_status || claim.status || 'Draft';
          appEl.appendChild(UI.listCard({
            title: formatDate(claim.posting_date),
            sub: formatCurrency(claim.total_claimed_amount),
            right: UI.pill(displayStatus, statusColor(displayStatus)),
            onClick: function () {
              location.hash = '#/expense/' + encodeURIComponent(claim.name);
            }
          }));
        })(claims[i]);
      }
    }).catch(function () {
      if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
      appEl.appendChild(UI.error('Could not load expense claims.'));
    });
  };

  // ── Screen 2: Expense New ───────────────────────────────────────────

  window.Screens.expenseNew = function (appEl) {
    var el = UI.el;
    var lines = [];
    var linesContainer = el('div', { className: 'expense-lines' });

    var totalEl = el('div', { className: 'amount-large', textContent: '\u20B9 0' });
    var totalCard = UI.card([totalEl], { className: 'total-display' });

    function recalcTotal() {
      var total = 0;
      for (var i = 0; i < lines.length; i++) {
        total += parseFloat(lines[i].amountInput.value) || 0;
      }
      totalEl.textContent = formatCurrency(total);
    }

    function updateRemoveButtons() {
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].removeBtn) {
          lines[i].removeBtn.hidden = lines.length <= 1;
        }
      }
    }

    function removeLine(lineObj) {
      var idx = lines.indexOf(lineObj);
      if (idx === -1) return;
      lines.splice(idx, 1);
      linesContainer.removeChild(lineObj.rowEl);
      recalcTotal();
      updateRemoveButtons();
    }

    function addLine() {
      // Type select
      var typeOpts = [];
      for (var t = 0; t < EXPENSE_TYPES.length; t++) {
        typeOpts.push(el('option', {
          value: EXPENSE_TYPES[t].value,
          textContent: EXPENSE_TYPES[t].text
        }));
      }
      var typeSelect = el('select', { className: 'form-control' }, typeOpts);

      // Date input
      var dateInput = el('input', {
        className: 'form-control',
        type: 'date',
        value: todayISO()
      });

      // Amount input
      var amountInput = el('input', {
        className: 'form-control',
        type: 'number',
        placeholder: 'Amount',
        min: '0',
        step: '0.01',
        onInput: recalcTotal
      });

      // Description input
      var descInput = el('input', {
        className: 'form-control',
        type: 'text',
        placeholder: 'Description (optional)'
      });

      // Remove button
      var lineObj;
      var removeBtn = el('button', {
        className: 'btn btn-outline-danger',
        style: { marginTop: '8px', fontSize: '13px', padding: '4px 12px' },
        onClick: function () { removeLine(lineObj); }
      });
      removeBtn.appendChild(icon('x', 14));

      var rowEl = UI.card([
        UI.field('Type', typeSelect),
        UI.field('Date', dateInput),
        UI.field('Amount (\u20B9)', amountInput),
        UI.field('Description', descInput),
        removeBtn
      ]);

      lineObj = {
        rowEl: rowEl,
        typeSelect: typeSelect,
        dateInput: dateInput,
        amountInput: amountInput,
        descInput: descInput,
        removeBtn: removeBtn
      };

      lines.push(lineObj);
      linesContainer.appendChild(rowEl);
      updateRemoveButtons();
    }

    // Start with one line
    addLine();

    var addLineBtn = UI.btn('+ Add Line', {
      type: 'outline',
      block: true,
      icon: 'plus',
      onClick: addLine
    });

    var submitBtn = UI.btn('Submit Claim', {
      type: 'primary',
      block: true,
      onClick: function () { submitClaim(); }
    });

    function submitClaim() {
      var emp = Auth.getEmployee() || {};
      // emp.name should be the ERPNext Employee ID (e.g. HR-EMP-00001)
      var empId = emp.name || '';

      if (!empId) {
        UI.toast('Employee not found. Please log in again.', 'danger');
        return;
      }

      // Validate and collect
      var expenses = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var expType = line.typeSelect.value;
        var amt = parseFloat(line.amountInput.value);

        if (!expType) {
          UI.toast('Please select expense type for all items.', 'danger');
          return;
        }
        if (!amt || amt <= 0) {
          UI.toast('Please enter a valid amount for all items.', 'danger');
          return;
        }

        expenses.push({
          expense_type: expType,
          expense_date: line.dateInput.value || todayISO(),
          amount: amt,
          description: line.descInput.value || ''
        });
      }

      if (expenses.length === 0) {
        UI.toast('Please add at least one expense item.', 'danger');
        return;
      }

      submitBtn._setLoading(true, 'Submitting\u2026');

      var body = {
        employee: empId,
        company: COMPANY,
        posting_date: todayISO(),
        expenses: expenses
      };

      window.fieldAPI.apiCall('POST', '/api/resource/Expense Claim', body).then(function (res) {
        if (res.error) {
          UI.toast('Failed: ' + (res.error || 'Unknown error'), 'danger');
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Expense claim created!', 'success');
        location.hash = '#/expense';
      }).catch(function (err) {
        UI.toast('Failed: ' + (err.message || 'Network error'), 'danger');
        submitBtn._setLoading(false);
      });
    }

    appEl.appendChild(linesContainer);
    appEl.appendChild(addLineBtn);
    appEl.appendChild(totalCard);
    appEl.appendChild(submitBtn);
  };

  // ── Screen 3: Expense Detail ────────────────────────────────────────

  window.Screens.expenseDetail = function (appEl, params) {
    var loadingEl = UI.skeleton(3);
    appEl.appendChild(loadingEl);

    var name = params && params.id ? params.id : '';
    if (!name) {
      appEl.removeChild(loadingEl);
      appEl.appendChild(UI.error('No expense claim ID provided.'));
      return;
    }

    window.fieldAPI.apiCall('GET', '/api/resource/Expense Claim/' + encodeURIComponent(name)).then(function (res) {
      appEl.removeChild(loadingEl);

      if (res.error || !res.data || !(res.data.data || res.data.message)) {
        appEl.appendChild(UI.error('Failed to load expense claim.'));
        return;
      }

      var claim = res.data.data || res.data.message;
      var displayStatus = claim.approval_status || claim.status || 'Draft';

      // Header: status pill + total amount
      var el = UI.el;
      appEl.appendChild(el('div', { style: { textAlign: 'center', padding: '16px 0 8px' } }, [
        UI.pill(displayStatus, statusColor(displayStatus)),
        el('div', {
          className: 'amount-large',
          textContent: formatCurrency(claim.total_claimed_amount),
          style: { marginTop: '12px' }
        })
      ]));

      // Detail card
      appEl.appendChild(UI.detailCard([
        { label: 'Employee', value: claim.employee_name || claim.employee || '' },
        { label: 'Posting Date', value: formatDate(claim.posting_date) },
        { label: 'Total Claimed', value: formatCurrency(claim.total_claimed_amount) },
        { label: 'Total Sanctioned', value: formatCurrency(claim.total_sanctioned_amount) },
        { label: 'Status', value: claim.status || 'Draft' },
        { label: 'Approval Status', value: claim.approval_status || 'Draft' }
      ]));

      // Expense items
      var expenses = claim.expenses || [];
      appEl.appendChild(UI.sectionHeading('Items'));

      if (expenses.length === 0) {
        appEl.appendChild(UI.empty('receipt', 'No expense items.'));
        return;
      }

      for (var i = 0; i < expenses.length; i++) {
        (function (exp) {
          var subParts = [];
          if (exp.expense_date) subParts.push(formatDate(exp.expense_date));
          if (exp.description) subParts.push(exp.description);

          appEl.appendChild(UI.listCard({
            title: exp.expense_type || 'Expense',
            sub: subParts.join(' \u00B7 '),
            right: UI.amount(exp.amount)
          }));
        })(expenses[i]);
      }
    }).catch(function () {
      if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
      appEl.appendChild(UI.error('Could not load expense claim.'));
    });
  };

})();
