/* expense.js — Expense Claims feature for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var COMPANY = 'Dynamic Servitech Private Limited';

  var EXPENSE_TYPES = [
    'Calls', 'Medical', 'Travel Fare', 'Food Expenses',
    'Tour Local Conveyance', 'Local Conveyance',
    'Accommodation Exp', 'Other Travel Exp', 'Tele-Xerox'
  ];

  // ─── Helpers ────────────────────────────────────────────────────────

  function formatCurrency(amount) {
    return '\u20B9' + Number(amount || 0).toLocaleString('en-IN');
  }

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
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'approved') return 'green';
    if (s === 'rejected') return 'red';
    if (s === 'cancelled') return 'gray';
    return 'yellow'; // Draft
  }

  function getEmployeeId() {
    return api.getSession().then(function (session) {
      if (!session || !session.employee) return null;
      return session.employee.name || session.employee.employee_id || null;
    });
  }

  function clearContainer(container) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  // ─── API Wrappers ──────────────────────────────────────────────────

  function getExpenseClaims(employeeId) {
    var fields = [
      'name', 'employee', 'employee_name', 'posting_date',
      'approval_status', 'total_claimed_amount', 'total_sanctioned_amount',
      'status', 'docstatus'
    ];
    var filters = JSON.stringify([['employee', '=', employeeId]]);
    var qs = '?filters=' + encodeURIComponent(filters) +
             '&fields=' + encodeURIComponent(JSON.stringify(fields)) +
             '&order_by=posting_date desc' +
             '&limit_page_length=20';
    return api.apiCall('GET', '/api/resource/Expense Claim' + qs);
  }

  function getExpenseClaimDetail(name) {
    return api.apiCall('GET', '/api/resource/Expense Claim/' + encodeURIComponent(name));
  }

  function createExpenseClaim(employeeId, expenses) {
    var body = {
      employee: employeeId,
      company: COMPANY,
      posting_date: todayISO(),
      expenses: expenses.map(function (e) {
        return {
          expense_date: e.expense_date || todayISO(),
          expense_type: e.expense_type,
          amount: parseFloat(e.amount) || 0,
          description: e.description || ''
        };
      })
    };
    return api.apiCall('POST', '/api/resource/Expense Claim', body);
  }

  // ─── DOM builder (uses global el) ─────────────────────────────────

  function el(tag, attrs, children) {
    // Delegate to the global el defined in app.js if available at runtime,
    // otherwise provide a compatible fallback.
    if (window._fieldEl) return window._fieldEl(tag, attrs, children);

    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!attrs.hasOwnProperty(k)) continue;
        if (k === 'textContent') { node.textContent = attrs[k]; }
        else if (k === 'className') { node.className = attrs[k]; }
        else if (k === 'htmlFor') { node.htmlFor = attrs[k]; }
        else if (k === 'disabled') { node.disabled = attrs[k]; }
        else if (k === 'hidden') { node.hidden = attrs[k]; }
        else if (k === 'value') { node.value = attrs[k]; }
        else if (k === 'type') { node.type = attrs[k]; }
        else if (k === 'placeholder') { node.placeholder = attrs[k]; }
        else if (k === 'readOnly') { node.readOnly = attrs[k]; }
        else if (k === 'selected') { node.selected = attrs[k]; }
        else if (k === 'checked') { node.checked = attrs[k]; }
        else if (k.indexOf('on') === 0) { node.addEventListener(k.substring(2).toLowerCase(), attrs[k]); }
        else if (k === 'style' && typeof attrs[k] === 'object') {
          for (var s in attrs[k]) { if (attrs[k].hasOwnProperty(s)) node.style[s] = attrs[k][s]; }
        }
        else { node.setAttribute(k, attrs[k]); }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] == null) continue;
        if (typeof children[i] === 'string') {
          node.appendChild(document.createTextNode(children[i]));
        } else {
          node.appendChild(children[i]);
        }
      }
    }
    return node;
  }

  // ─── Screen: Expense List ─────────────────────────────────────────

  function renderExpenseList() {
    var appEl = document.getElementById('app');
    clearContainer(appEl);

    var header = el('div', { className: 'screen-header' }, [
      el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/home'; } }),
      el('h2', { textContent: 'Expense Claims' })
    ]);
    appEl.appendChild(header);

    var loadingEl = el('div', { textContent: 'Loading...', style: { padding: '2rem', textAlign: 'center', color: '#666' } });
    appEl.appendChild(loadingEl);

    getEmployeeId().then(function (empId) {
      if (!empId) {
        loadingEl.textContent = 'Employee not found. Please log in again.';
        return;
      }
      return getExpenseClaims(empId).then(function (result) {
        appEl.removeChild(loadingEl);

        if (result.error) {
          appEl.appendChild(el('div', { textContent: 'Failed to load expense claims. ' + (result.error || ''),
            style: { padding: '1rem', color: '#c0392b' } }));
          return;
        }

        var claims = (result.data && result.data.data) || [];

        // Calculate pending total
        var pendingTotal = 0;
        for (var p = 0; p < claims.length; p++) {
          if (claims[p].approval_status === 'Draft') {
            pendingTotal += (claims[p].total_claimed_amount || 0);
          }
        }

        // Pending summary
        if (pendingTotal > 0) {
          var summaryEl = el('div', { className: 'stats-row', style: { padding: '0 1rem' } }, [
            el('div', { className: 'stat-card', style: { flex: '1' } }, [
              el('div', { className: 'stat-value', textContent: formatCurrency(pendingTotal) }),
              el('div', { className: 'stat-label', textContent: 'Pending Claims' })
            ])
          ]);
          appEl.appendChild(summaryEl);
        }

        // New claim button
        var newBtn = el('button', {
          className: 'btn btn-primary btn-block btn-lg',
          textContent: '+ New Claim',
          style: { margin: '1rem' },
          onClick: function () { location.hash = '#/expense/new'; }
        });
        appEl.appendChild(newBtn);

        if (claims.length === 0) {
          appEl.appendChild(el('div', { textContent: 'No expense claims yet.',
            style: { padding: '2rem', textAlign: 'center', color: '#999' } }));
          return;
        }

        // Claims list
        var listEl = el('div', { style: { padding: '0 1rem 1rem' } });
        for (var i = 0; i < claims.length; i++) {
          (function (claim) {
            var card = el('div', { className: 'visit-card', style: { cursor: 'pointer' },
              onClick: function () { location.hash = '#/expense/' + encodeURIComponent(claim.name); }
            }, [
              el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' } }, [
                el('span', { textContent: formatDate(claim.posting_date), style: { fontWeight: '600', fontSize: '0.95rem' } }),
                el('span', { textContent: formatCurrency(claim.total_claimed_amount), style: { fontWeight: '700', fontSize: '1rem' } })
              ]),
              el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
                el('span', { className: 'indicator-pill ' + statusColor(claim.approval_status), textContent: claim.approval_status || 'Draft' }),
                el('span', { textContent: claim.name, style: { fontSize: '0.8rem', color: '#888' } })
              ])
            ]);
            listEl.appendChild(card);
          })(claims[i]);
        }
        appEl.appendChild(listEl);
      });
    });
  }

  // ─── Screen: New Expense Claim ────────────────────────────────────

  function renderExpenseNew() {
    var appEl = document.getElementById('app');
    clearContainer(appEl);

    var header = el('div', { className: 'screen-header' }, [
      el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/expense'; } }),
      el('h2', { textContent: 'New Expense' })
    ]);
    appEl.appendChild(header);

    var lines = [];
    var linesContainer = el('div', { style: { padding: '0 1rem' } });
    var totalDisplay = el('div', {
      style: { padding: '1rem', fontSize: '1.1rem', fontWeight: '700', textAlign: 'right' }
    }, [
      el('span', { textContent: 'Total: ' }),
      el('span', { textContent: formatCurrency(0) })
    ]);

    function recalcTotal() {
      var total = 0;
      for (var i = 0; i < lines.length; i++) {
        total += parseFloat(lines[i].amountInput.value) || 0;
      }
      totalDisplay.lastChild.textContent = formatCurrency(total);
    }

    function buildTypeOptions() {
      var opts = [el('option', { value: '', textContent: 'Select type...' })];
      for (var t = 0; t < EXPENSE_TYPES.length; t++) {
        opts.push(el('option', { value: EXPENSE_TYPES[t], textContent: EXPENSE_TYPES[t] }));
      }
      return opts;
    }

    function addLine() {
      var typeSelect = el('select', { className: 'form-control', 'aria-label': 'Expense type' }, buildTypeOptions());
      var amountInput = el('input', { className: 'form-control', type: 'number', placeholder: 'Amount',
        style: { marginTop: '0.5rem' }, onInput: recalcTotal });
      var descInput = el('input', { className: 'form-control', type: 'text', placeholder: 'Description (optional)',
        style: { marginTop: '0.5rem' } });
      var dateInput = el('input', { className: 'form-control', type: 'date', value: todayISO(),
        style: { marginTop: '0.5rem' } });

      var removeBtn = el('button', {
        className: 'btn btn-default',
        textContent: 'Remove',
        style: { marginTop: '0.5rem', color: '#c0392b', fontSize: '0.85rem' },
        onClick: function () { removeLine(lineObj); }
      });

      var lineEl = el('div', {
        style: { padding: '0.75rem', marginBottom: '0.75rem', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee' }
      }, [
        el('div', { className: 'section-heading', textContent: 'EXPENSE ITEM' }),
        el('div', { className: 'field-group' }, [
          el('label', { textContent: 'Type' }),
          typeSelect
        ]),
        el('div', { className: 'field-group' }, [
          el('label', { textContent: 'Date' }),
          dateInput
        ]),
        el('div', { className: 'field-group' }, [
          el('label', { textContent: 'Amount (\u20B9)' }),
          amountInput
        ]),
        el('div', { className: 'field-group' }, [
          el('label', { textContent: 'Description' }),
          descInput
        ]),
        removeBtn
      ]);

      var lineObj = {
        el: lineEl,
        typeSelect: typeSelect,
        amountInput: amountInput,
        descInput: descInput,
        dateInput: dateInput
      };

      lines.push(lineObj);
      linesContainer.appendChild(lineEl);

      // Hide remove if only 1 line
      updateRemoveButtons();
    }

    function removeLine(lineObj) {
      var idx = lines.indexOf(lineObj);
      if (idx === -1) return;
      lines.splice(idx, 1);
      linesContainer.removeChild(lineObj.el);
      recalcTotal();
      updateRemoveButtons();
    }

    function updateRemoveButtons() {
      for (var i = 0; i < lines.length; i++) {
        var btn = lines[i].el.querySelector('.btn-default');
        if (btn) btn.hidden = lines.length <= 1;
      }
    }

    // Add first line
    addLine();

    var addBtn = el('button', {
      className: 'btn btn-default btn-block',
      textContent: '+ Add Expense',
      style: { margin: '0 1rem 1rem' },
      onClick: addLine
    });

    var submitBtn = el('button', {
      className: 'btn btn-primary btn-block btn-lg',
      textContent: 'Submit Claim',
      style: { margin: '0 1rem 2rem' },
      onClick: function () { submitClaim(); }
    });

    function submitClaim() {
      // Validate
      var expenses = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var expType = line.typeSelect.value;
        var amount = parseFloat(line.amountInput.value);

        if (!expType) {
          api.showToast('Please select expense type for all items', 'error');
          return;
        }
        if (!amount || amount <= 0) {
          api.showToast('Please enter a valid amount for all items', 'error');
          return;
        }

        expenses.push({
          expense_type: expType,
          expense_date: line.dateInput.value || todayISO(),
          amount: amount,
          description: line.descInput.value || ''
        });
      }

      if (expenses.length === 0) {
        api.showToast('Please add at least one expense item', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      getEmployeeId().then(function (empId) {
        if (!empId) {
          api.showToast('Employee not found. Please log in again.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Claim';
          return;
        }
        return createExpenseClaim(empId, expenses).then(function (result) {
          if (result.error) {
            api.showToast('Failed to create claim: ' + (result.error || 'Unknown error'), 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Claim';
            return;
          }
          api.showToast('Expense claim created', 'success');
          location.hash = '#/expense';
        });
      });
    }

    appEl.appendChild(linesContainer);
    appEl.appendChild(addBtn);
    appEl.appendChild(totalDisplay);
    appEl.appendChild(submitBtn);
  }

  // ─── Screen: Expense Detail ───────────────────────────────────────

  function renderExpenseDetail(name) {
    var appEl = document.getElementById('app');
    clearContainer(appEl);

    var header = el('div', { className: 'screen-header' }, [
      el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/expense'; } }),
      el('h2', { textContent: 'Expense Claim' })
    ]);
    appEl.appendChild(header);

    var loadingEl = el('div', { textContent: 'Loading...', style: { padding: '2rem', textAlign: 'center', color: '#666' } });
    appEl.appendChild(loadingEl);

    getExpenseClaimDetail(name).then(function (result) {
      appEl.removeChild(loadingEl);

      if (result.error || !result.data || !result.data.data) {
        appEl.appendChild(el('div', { textContent: 'Failed to load expense claim.',
          style: { padding: '1rem', color: '#c0392b' } }));
        return;
      }

      var claim = result.data.data;

      // Status badge
      var statusEl = el('div', { style: { padding: '0.5rem 1rem' } }, [
        el('span', { className: 'indicator-pill ' + statusColor(claim.approval_status),
          textContent: claim.approval_status || 'Draft' })
      ]);
      appEl.appendChild(statusEl);

      // Amounts summary
      var amountSection = el('div', { className: 'stats-row', style: { padding: '0.5rem 1rem' } }, [
        el('div', { className: 'stat-card', style: { flex: '1' } }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(claim.total_claimed_amount) }),
          el('div', { className: 'stat-label', textContent: 'Claimed' })
        ]),
        el('div', { className: 'stat-card', style: { flex: '1' } }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(claim.total_sanctioned_amount) }),
          el('div', { className: 'stat-label', textContent: 'Sanctioned' })
        ])
      ]);
      appEl.appendChild(amountSection);

      // Claim info
      var infoEl = el('div', { style: { padding: '0.5rem 1rem 0' } }, [
        el('div', { style: { fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' } }, [
          el('span', { textContent: 'Date: ' }),
          el('span', { textContent: formatDate(claim.posting_date) })
        ]),
        el('div', { style: { fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' } }, [
          el('span', { textContent: 'Employee: ' }),
          el('span', { textContent: claim.employee_name || claim.employee || '' })
        ]),
        el('div', { style: { fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem' } }, [
          el('span', { textContent: 'ID: ' }),
          el('span', { textContent: claim.name || '' })
        ])
      ]);
      appEl.appendChild(infoEl);

      // Expense items
      var expenses = claim.expenses || [];
      if (expenses.length > 0) {
        var itemsHeading = el('div', { className: 'section-heading', style: { padding: '0 1rem' },
          textContent: 'EXPENSE ITEMS (' + expenses.length + ')' });
        appEl.appendChild(itemsHeading);

        var itemsList = el('div', { style: { padding: '0 1rem 1rem' } });
        for (var i = 0; i < expenses.length; i++) {
          var exp = expenses[i];
          var itemChildren = [
            el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' } }, [
              el('span', { textContent: exp.expense_type || 'Expense', style: { fontWeight: '600', fontSize: '0.95rem' } }),
              el('span', { textContent: formatCurrency(exp.amount), style: { fontWeight: '700' } })
            ]),
            el('div', { style: { fontSize: '0.85rem', color: '#666' } }, [
              el('span', { textContent: formatDate(exp.expense_date) })
            ])
          ];
          if (exp.description) {
            itemChildren.push(el('div', { textContent: exp.description, style: { fontSize: '0.85rem', color: '#555', marginTop: '0.25rem' } }));
          }
          if (exp.sanctioned_amount != null && exp.sanctioned_amount !== exp.amount) {
            itemChildren.push(el('div', { style: { fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' } }, [
              el('span', { textContent: 'Sanctioned: ' + formatCurrency(exp.sanctioned_amount) })
            ]));
          }
          var itemCard = el('div', { className: 'visit-card' }, itemChildren);
          itemsList.appendChild(itemCard);
        }
        appEl.appendChild(itemsList);
      } else {
        appEl.appendChild(el('div', { textContent: 'No expense items.',
          style: { padding: '1rem', color: '#999', textAlign: 'center' } }));
      }

      // Approval summary
      if (claim.approval_status && claim.approval_status !== 'Draft') {
        var approvalChildren = [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('span', { textContent: 'Status' }),
            el('span', { className: 'indicator-pill ' + statusColor(claim.approval_status),
              textContent: claim.approval_status })
          ])
        ];
        if (claim.total_advance_amount) {
          approvalChildren.push(el('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.9rem' } }, [
            el('span', { textContent: 'Advance Amount' }),
            el('span', { textContent: formatCurrency(claim.total_advance_amount) })
          ]));
        }
        var approvalEl = el('div', { style: { padding: '0 1rem 2rem' } }, [
          el('div', { className: 'section-heading', textContent: 'APPROVAL' }),
          el('div', { className: 'visit-card' }, approvalChildren)
        ]);
        appEl.appendChild(approvalEl);
      }
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.expenseFeature = {
    renderExpenseList: renderExpenseList,
    renderExpenseNew: renderExpenseNew,
    renderExpenseDetail: renderExpenseDetail,
    getExpenseClaims: getExpenseClaims,
    getExpenseClaimDetail: getExpenseClaimDetail,
    createExpenseClaim: createExpenseClaim,
    formatCurrency: formatCurrency
  };

})();
