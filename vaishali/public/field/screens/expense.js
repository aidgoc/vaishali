/* expense.js — Expense Claim screens for DSPL Field PWA */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  var emp = Auth.getEmployee() || {};
  var COMPANY = emp.company || 'Dynamic Servitech Private Limited';
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
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'Expenses',
      'Submit and track reimbursements for travel, food and other claims.'
    ));
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

      // Stats — uniform M3
      var pendingTotal = 0, approvedTotal = 0, draftCt = 0, submittedCt = 0;
      for (var p = 0; p < claims.length; p++) {
        var c = claims[p];
        if (c.approval_status === 'Approved') {
          approvedTotal += (c.total_sanctioned_amount || c.total_claimed_amount || 0);
        } else if (c.approval_status !== 'Rejected') {
          pendingTotal += (c.total_claimed_amount || 0);
        }
        if (!c.approval_status || c.approval_status === 'Draft' || c.status === 'Draft') draftCt++;
        else submittedCt++;
      }
      appEl.appendChild(UI.statGrid([
        { value: formatCurrency(pendingTotal), label: 'Pending', support: 'awaiting approval' },
        { value: formatCurrency(approvedTotal), label: 'Approved', support: 'sanctioned this period' },
        { value: claims.length, label: 'Total claims', support: 'in last 20 records' },
        { value: draftCt, label: 'Drafts', support: 'not yet submitted' }
      ], 2));

      // New Claim button
      appEl.appendChild(el('div', { style: { margin: '8px 0 16px' } }, [
        UI.btn('New expense claim', {
          type: 'primary',
          block: true,
          icon: 'plus',
          onClick: function () { location.hash = '#/expense/new'; }
        })
      ]));

      appEl.appendChild(UI.sectionHeader('Claims', { support: 'Most recent first' }));

      if (claims.length === 0) {
        appEl.appendChild(UI.empty('receipt', 'No expense claims yet', { text: 'New expense claim', onClick: function () { location.hash = '#/expense/new'; } }));
        return;
      }

      var listWrap = el('div', { className: 'm3-list' });
      for (var i = 0; i < claims.length; i++) {
        (function (claim) {
          var displayStatus = claim.approval_status || claim.status || 'Draft';
          listWrap.appendChild(UI.listCard({
            title: formatDate(claim.posting_date),
            sub: formatCurrency(claim.total_claimed_amount),
            right: UI.pill(displayStatus, statusColor(displayStatus)),
            onClick: function () {
              location.hash = '#/expense/' + encodeURIComponent(claim.name);
            }
          }));
        })(claims[i]);
      }
      appEl.appendChild(listWrap);
    }).catch(function () {
      if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
      appEl.appendChild(UI.error('Could not load expense claims.'));
    });
  };

  // ── Screen 2: Expense New ───────────────────────────────────────────

  window.Screens.expenseNew = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'New expense claim',
      'Add line items, attach receipts and submit for approval.'
    ));
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
      // M3 fields per line
      var typeOptions = [];
      for (var t = 0; t < EXPENSE_TYPES.length; t++) {
        if (EXPENSE_TYPES[t].value) {
          typeOptions.push({ value: EXPENSE_TYPES[t].value, text: EXPENSE_TYPES[t].text });
        }
      }
      var typeField = UI.m3SelectField('Type', typeOptions, { required: true });
      var typeSelect = typeField._getSelect();

      var dateField = UI.m3TextField('Date', { type: 'date', value: todayISO(), required: true });
      var dateInput = dateField._getInput();

      var amountField = UI.m3TextField('Amount (\u20B9)', {
        type: 'number',
        min: '0',
        step: '0.01',
        required: true,
        onInput: recalcTotal
      });
      var amountInput = amountField._getInput();

      var descField = UI.m3TextField('Description', { support: 'Optional' });
      var descInput = descField._getInput();

      var lineObj;
      var removeBtn = UI.btn('Remove line', {
        type: 'outline-danger',
        icon: 'x',
        onClick: function () { removeLine(lineObj); }
      });

      var rowEl = el('div', {
        className: 'm3-card',
        style: { background: 'var(--m3-surface-container-low)', borderRadius: 'var(--m3-shape-md)', padding: '16px', marginBottom: '12px' }
      }, [
        typeField,
        dateField,
        amountField,
        descField,
        el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '4px' } }, [removeBtn])
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

    var addLineBtn = UI.btn('Add Line', {
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
    var el = UI.el;
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);

    var name = params && params.id ? params.id : '';
    if (!name) {
      skel.remove();
      appEl.appendChild(UI.error('No expense claim ID provided.'));
      return;
    }

    window.fieldAPI.apiCall('GET', '/api/resource/Expense Claim/' + encodeURIComponent(name)).then(function (res) {
      skel.remove();

      if (res.error || !res.data || !(res.data.data || res.data.message)) {
        appEl.appendChild(UI.error('Failed to load expense claim.'));
        return;
      }

      var claim = res.data.data || res.data.message;
      var displayStatus = claim.approval_status || claim.status || 'Draft';

      // M3 hero — claimant + total
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: claim.employee_name || claim.employee || 'Expense claim' }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: claim.name + ' \u00B7 ' + formatDate(claim.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: formatCurrency(claim.total_claimed_amount) }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Claimed' })
          ])
        ]),
        el('div', {}, [UI.pill(displayStatus, statusColor(displayStatus))])
      ]));

      // Items
      var expenses = claim.expenses || [];
      if (expenses.length > 0) {
        appEl.appendChild(UI.sectionHeader('Line items', { support: expenses.length + (expenses.length === 1 ? ' item' : ' items') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < expenses.length; i++) {
          var exp = expenses[i];
          var meta = [];
          if (exp.expense_date) meta.push(formatDate(exp.expense_date));
          if (exp.description) meta.push(exp.description);
          itemsBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: exp.expense_type || 'Expense' }),
              meta.length ? el('div', { className: 'm3-doc-item-meta', textContent: meta.join(' \u00B7 ') }) : null
            ].filter(Boolean)),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(exp.amount) })
          ]));
        }
        appEl.appendChild(itemsBox);
      } else {
        appEl.appendChild(UI.empty('receipt', 'No expense items.'));
      }

      // Totals
      appEl.appendChild(UI.sectionHeader('Summary'));
      var totalsBox = el('div', { className: 'm3-doc-totals' });
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
        el('span', { textContent: 'Total claimed' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(claim.total_claimed_amount) })
      ]));
      if (claim.total_sanctioned_amount && claim.total_sanctioned_amount !== claim.total_claimed_amount) {
        totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
          el('span', { textContent: 'Sanctioned' }),
          el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(claim.total_sanctioned_amount) })
        ]));
      }
      appEl.appendChild(totalsBox);

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Claim ID', value: claim.name },
        { label: 'Employee', value: claim.employee_name || claim.employee || '' },
        { label: 'Posting date', value: formatDate(claim.posting_date) },
        { label: 'Status', value: claim.status || 'Draft' },
        { label: 'Approval status', value: claim.approval_status || 'Draft' }
      ]));
    }).catch(function () {
      skel.remove();
      appEl.appendChild(UI.error('Could not load expense claim.'));
    });
  };

})();
