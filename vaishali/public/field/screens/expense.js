/* expense.js — Expense Claim screens for Field PWA */
(function () {
  'use strict';

  window.Screens = window.Screens || {};
  var api = window.fieldAPI;

  var TYPES_CACHE = null;

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
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function deriveStatus(claim) {
    // Best-effort consolidated status for chips/filtering.
    if (!claim) return 'Draft';
    if (claim.docstatus === 2) return 'Cancelled';
    if (claim.approval_status === 'Rejected') return 'Rejected';
    if (claim.approval_status === 'Approved') {
      if (claim.status === 'Paid') return 'Paid';
      if (claim.status === 'Unpaid') return 'Unpaid';
      return 'Approved';
    }
    if (claim.docstatus === 1) return claim.status || 'Submitted';
    return 'Draft';
  }

  function statusColor(status) {
    var s = (status || '').toLowerCase();
    if (s === 'paid' || s === 'approved') return 'green';
    if (s === 'unpaid' || s === 'submitted' || s === 'pending') return 'yellow';
    if (s === 'rejected' || s === 'cancelled') return 'red';
    return 'gray';
  }

  function fetchExpenseTypes() {
    if (TYPES_CACHE) return Promise.resolve(TYPES_CACHE);
    return api.apiCall('GET', '/api/field/expense-claim-types').then(function (res) {
      var list = (res && res.data && (res.data.message || res.data.data)) || [];
      // Filter out empty values just in case
      list = list.filter(function (n) { return !!n; });
      // Sane fallback if the desk hasn't seeded them
      if (!list.length) {
        list = ['Travel', 'Food', 'Calls', 'Medical', 'Accommodation', 'Other'];
      }
      TYPES_CACHE = list;
      return list;
    }).catch(function () {
      TYPES_CACHE = ['Travel', 'Food', 'Calls', 'Medical', 'Accommodation', 'Other'];
      return TYPES_CACHE;
    });
  }

  function loadClaims() {
    var emp = Auth.getEmployee() || {};
    var empId = emp.name || '';
    if (!empId) return Promise.resolve({ error: 'no_emp' });

    var fields = JSON.stringify([
      'name', 'posting_date', 'total_claimed_amount',
      'total_sanctioned_amount', 'status', 'approval_status',
      'docstatus', 'expense_approver'
    ]);
    var filters = JSON.stringify([['employee', '=', empId]]);
    var qs = '?filters=' + encodeURIComponent(filters) +
             '&fields=' + encodeURIComponent(fields) +
             '&order_by=modified desc' +
             '&limit_page_length=50';

    return api.apiCall('GET', '/api/resource/Expense Claim' + qs).then(function (res) {
      if (res.error) return { error: res.error };
      var claims = (res.data && (res.data.data || res.data.message)) || [];
      return { claims: claims };
    });
  }

  // ── Screen 1: Expense List ──────────────────────────────────────────

  window.Screens.expenseList = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'Expenses',
      'Submit and track reimbursements for travel, food and other claims.'
    ));

    var statsArea = el('div');
    appEl.appendChild(statsArea);

    appEl.appendChild(el('div', { style: { margin: '8px 0 16px' } }, [
      UI.btn('New expense claim', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/expense/new'; }
      })
    ]));

    var activeFilter = 'all';
    var allClaims = [];

    var segLabel = el('div', {
      textContent: 'Filter by status',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    appEl.appendChild(segLabel);

    var segBar = UI.segmented([
      { value: 'all', label: 'All' },
      { value: 'draft', label: 'Drafts' },
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' }
    ], { value: 'all', onChange: function (v) { activeFilter = v; renderList(); } });
    appEl.appendChild(segBar);

    appEl.appendChild(UI.sectionHeader('Claims', { support: 'Most recent first' }));

    var listArea = el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    function matchesFilter(claim) {
      if (activeFilter === 'all') return true;
      var s = deriveStatus(claim).toLowerCase();
      if (activeFilter === 'draft') return s === 'draft';
      if (activeFilter === 'rejected') return s === 'rejected';
      if (activeFilter === 'approved') return s === 'approved' || s === 'paid' || s === 'unpaid';
      if (activeFilter === 'pending') return claim.docstatus === 1 && claim.approval_status !== 'Approved' && claim.approval_status !== 'Rejected';
      return true;
    }

    function renderStats() {
      statsArea.textContent = '';
      var pendingTotal = 0, approvedTotal = 0, draftCt = 0, paidTotal = 0;
      for (var p = 0; p < allClaims.length; p++) {
        var c = allClaims[p];
        if (c.approval_status === 'Approved') {
          approvedTotal += (c.total_sanctioned_amount || c.total_claimed_amount || 0);
          if (c.status === 'Paid') paidTotal += (c.total_sanctioned_amount || 0);
        } else if (c.approval_status !== 'Rejected' && c.docstatus !== 2) {
          pendingTotal += (c.total_claimed_amount || 0);
        }
        if (c.docstatus === 0) draftCt++;
      }
      statsArea.appendChild(UI.statGrid([
        { value: formatCurrency(pendingTotal), label: 'Pending', support: 'awaiting approval' },
        { value: formatCurrency(approvedTotal), label: 'Approved', support: 'sanctioned' },
        { value: formatCurrency(paidTotal), label: 'Paid', support: 'reimbursed' },
        { value: draftCt, label: 'Drafts', support: 'not yet submitted' }
      ], 2));
    }

    function renderList() {
      listArea.textContent = '';
      var filtered = [];
      for (var i = 0; i < allClaims.length; i++) {
        if (matchesFilter(allClaims[i])) filtered.push(allClaims[i]);
      }

      if (filtered.length === 0) {
        listArea.appendChild(UI.empty('receipt',
          activeFilter === 'all' ? 'No expense claims yet' : 'No claims match this filter',
          activeFilter === 'all'
            ? { text: 'New expense claim', onClick: function () { location.hash = '#/expense/new'; } }
            : null
        ));
        return;
      }

      var listWrap = el('div', { className: 'm3-list' });
      for (var j = 0; j < filtered.length; j++) {
        (function (claim) {
          var status = deriveStatus(claim);
          listWrap.appendChild(UI.listCard({
            title: formatDate(claim.posting_date),
            sub: formatCurrency(claim.total_claimed_amount) + ' · ' + claim.name,
            right: UI.pill(status, statusColor(status)),
            onClick: function () {
              location.hash = '#/expense/' + encodeURIComponent(claim.name);
            }
          }));
        })(filtered[j]);
      }
      listArea.appendChild(listWrap);
    }

    loadClaims().then(function (res) {
      listArea.textContent = '';
      if (res.error === 'no_emp') {
        appEl.appendChild(UI.error('Employee record not linked. Contact admin.'));
        return;
      }
      if (res.error) {
        listArea.appendChild(UI.error('Could not load expense claims.'));
        return;
      }
      allClaims = res.claims || [];
      renderStats();
      renderList();
    });
  };

  // ── Screen 2: Expense New / Edit ────────────────────────────────────

  function expenseFormScreen(appEl, params, isEdit) {
    var el = UI.el;
    var name = isEdit && params && params.id ? params.id : '';

    appEl.appendChild(UI.pageHeader(
      isEdit ? 'Edit expense claim' : 'New expense claim',
      isEdit
        ? 'Update line items before submitting for approval.'
        : 'Add line items and submit for approval.'
    ));

    var formArea = el('div');
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);
    appEl.appendChild(formArea);

    fetchExpenseTypes().then(function (types) {
      if (!isEdit) {
        skel.remove();
        renderForm(types, null);
        return;
      }
      api.apiCall('GET', '/api/resource/Expense Claim/' + encodeURIComponent(name)).then(function (res) {
        skel.remove();
        if (res.error || !res.data) {
          formArea.appendChild(UI.error('Could not load claim'));
          return;
        }
        var claim = res.data.data || res.data.message;
        if (!claim || claim.docstatus !== 0) {
          formArea.appendChild(UI.error('This claim cannot be edited'));
          return;
        }
        renderForm(types, claim);
      });
    });

    function renderForm(types, existing) {
      var lines = [];
      var linesContainer = el('div', { className: 'expense-lines' });
      var allAdvances = [];           // fetched once below
      var selectedAdvance = null;     // { name, remaining, purpose }
      var allocatedAmount = 0;        // ₹ to deduct from advance

      // ── Advance picker (optional) ────────────────────────────
      var advanceCard = el('div', { style: {
        background: 'var(--m3-surface-container-low)',
        borderRadius: 'var(--m3-shape-md)', padding: '14px', marginBottom: '16px',
        display: 'none'
      }});
      var advanceLabel = el('div', {
        textContent: 'Apply against advance (optional)',
        style: { font: '500 13px/1.3 system-ui', color: 'var(--ink-secondary, #5B5B61)', marginBottom: '8px' }
      });
      var advanceSelect = el('select', {
        className: 'm3-text-input',
        style: { width: '100%' }
      });
      advanceSelect.appendChild(el('option', { value: '', textContent: '— No advance —' }));
      var advanceAmtInput = el('input', {
        type: 'number', min: '0', step: '0.01',
        placeholder: 'Allocated amount (₹)',
        className: 'm3-text-input',
        style: { width: '100%', marginTop: '8px', display: 'none' }
      });
      var advanceHelp = el('div', {
        style: { font: '400 11px/1.4 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginTop: '6px' }
      });
      advanceSelect.addEventListener('change', function () {
        var v = advanceSelect.value;
        if (!v) {
          selectedAdvance = null;
          advanceAmtInput.style.display = 'none';
          advanceHelp.textContent = '';
          return;
        }
        for (var i = 0; i < allAdvances.length; i++) {
          if (allAdvances[i].name === v) { selectedAdvance = allAdvances[i]; break; }
        }
        if (!selectedAdvance) return;
        advanceAmtInput.style.display = 'block';
        // Default to min(claim total, remaining) — set on each recalc
        var total = computeTotal();
        var defaultAlloc = Math.min(total, selectedAdvance.remaining);
        advanceAmtInput.value = defaultAlloc.toFixed(2);
        advanceHelp.textContent = '₹' + Math.round(selectedAdvance.remaining).toLocaleString('en-IN')
          + ' remaining on this advance · default allocation = lesser of claim total and remaining';
      });
      advanceCard.appendChild(advanceLabel);
      advanceCard.appendChild(advanceSelect);
      advanceCard.appendChild(advanceAmtInput);
      advanceCard.appendChild(advanceHelp);

      // Fetch outstanding advances
      api.apiCall('GET', '/api/field/outstanding-advances').then(function (res) {
        var raw = res.data || {};
        var list = raw.message || raw.data || (Array.isArray(raw) ? raw : []);
        allAdvances = list || [];
        if (allAdvances.length > 0) {
          advanceCard.style.display = 'block';
          for (var i = 0; i < allAdvances.length; i++) {
            var a = allAdvances[i];
            advanceSelect.appendChild(el('option', {
              value: a.name,
              textContent: a.name + ' · ₹' + Math.round(a.remaining).toLocaleString('en-IN')
                + ' remaining · ' + (a.purpose || '').substring(0, 40)
            }));
          }
        }
      });
      formArea.appendChild(advanceCard);

      var totalEl = el('div', { className: 'amount-large', textContent: '₹ 0' });
      var totalCard = UI.card([totalEl], { className: 'total-display' });

      function computeTotal() {
        var total = 0;
        for (var i = 0; i < lines.length; i++) {
          total += parseFloat(lines[i].amountInput.value) || 0;
        }
        return total;
      }
      function recalcTotal() {
        totalEl.textContent = formatCurrency(computeTotal());
        // If an advance is selected, re-default the allocation to min(total, remaining)
        if (selectedAdvance) {
          var t = computeTotal();
          var defaultAlloc = Math.min(t, selectedAdvance.remaining);
          // Only auto-adjust if user hasn't overridden (keep their value if non-empty and ≤ remaining)
          var current = parseFloat(advanceAmtInput.value);
          if (!current || current > selectedAdvance.remaining) {
            advanceAmtInput.value = defaultAlloc.toFixed(2);
          }
        }
      }

      function showReceiptCodeModal(code, fileUrl) {
        var overlay = el('div', { style: {
          position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '9999',
          padding: '20px'
        }});
        var card = el('div', { style: {
          background: '#fff', borderRadius: '16px', padding: '28px 24px',
          maxWidth: '360px', width: '100%', textAlign: 'center',
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)'
        }}, [
          el('div', { textContent: 'Receipt captured ✓',
            style: { font: '500 14px/1 system-ui', color: '#388E3C', marginBottom: '8px' }}),
          el('div', { textContent: 'Write this code on the physical receipt:',
            style: { font: '400 13px/1.4 system-ui', color: 'var(--ink-secondary, #5B5B61)', marginBottom: '14px' }}),
          el('div', { textContent: code, style: {
            font: '700 36px/1 ui-monospace, Menlo, monospace',
            letterSpacing: '0.08em', color: '#1F2937',
            padding: '14px', background: '#F3F4F6', borderRadius: '12px',
            marginBottom: '18px'
          }}),
          el('div', { textContent: 'This code links the paper receipt to your digital claim. Accounts will use it during settlement.',
            style: { font: '400 12px/1.4 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginBottom: '18px' }})
        ]);
        var okBtn = UI.btn('I have written the code', {
          type: 'primary', block: true,
          onClick: function () { document.body.removeChild(overlay); }
        });
        card.appendChild(okBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
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

      function addLine(prefill) {
        var typeOptions = types.map(function (t) { return { value: t, text: t }; });
        var typeField = UI.m3SelectField('Type', typeOptions, {
          required: true,
          value: prefill ? prefill.expense_type : ''
        });
        var typeSelect = typeField._getSelect();

        var dateField = UI.m3TextField('Date', {
          type: 'date',
          value: (prefill && prefill.expense_date) || todayISO(),
          required: true
        });
        var dateInput = dateField._getInput();

        var amountField = UI.m3TextField('Amount (₹)', {
          type: 'number',
          min: '0',
          step: '0.01',
          required: true,
          value: prefill ? String(prefill.amount || '') : '',
          onInput: recalcTotal
        });
        var amountInput = amountField._getInput();

        var descField = UI.m3TextField('Description', {
          support: 'Optional',
          value: prefill ? (prefill.description || '') : ''
        });
        var descInput = descField._getInput();

        // Per-line receipt capture — staged files re-parent to claim on submit
        var receipts = [];  // [{file_name, code, file_url}]
        var receiptsList = el('div', { style: { marginTop: '8px' } });

        function renderReceiptsList() {
          receiptsList.textContent = '';
          if (!receipts.length) return;
          for (var i = 0; i < receipts.length; i++) {
            (function (r, idx) {
              receiptsList.appendChild(el('div', {
                style: {
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', background: '#ECFDF5', borderRadius: '8px',
                  marginBottom: '4px'
                }
              }, [
                el('span', { textContent: '📎  ' + r.code,
                  style: { font: '600 12px/1.2 ui-monospace, Menlo, monospace', color: '#065F46', letterSpacing: '0.04em' } }),
                el('button', {
                  textContent: 'View',
                  onClick: function () { window.open(r.file_url, '_blank'); },
                  style: { background: 'none', border: 'none', color: '#065F46', font: '500 12px/1 system-ui', cursor: 'pointer' }
                })
              ]));
            })(receipts[i], i);
          }
        }

        var fileInput = el('input', {
          type: 'file', accept: 'image/*', capture: 'environment',
          style: { display: 'none' },
          onChange: function () {
            var f = fileInput.files && fileInput.files[0];
            if (!f) return;
            captureBtn._setLoading(true, 'Uploading…');
            // Upload as an unattached File (no parent doctype). Frappe
            // creates a loose File owned by the current user, no
            // per-doctype perm check needed. submit_expense_claim
            // re-parents it to the new Expense Claim on submit.
            window.fieldAPI.uploadFile(f, '', '').then(function (file) {
              return api.apiCall('POST', '/api/field/tag-receipt', { file_name: file.name });
            }).then(function (res) {
              captureBtn._setLoading(false);
              if (res.error) { UI.toast('Failed: ' + res.error, 'danger'); return; }
              var raw = res.data || {};
              var d = raw.message || raw.data || raw;
              if (!d || !d.code) { UI.toast('No code returned', 'danger'); return; }
              receipts.push({ file_name: d.file_name, code: d.code, file_url: d.file_url });
              renderReceiptsList();
              showReceiptCodeModal(d.code, d.file_url);
              fileInput.value = '';
            }).catch(function (err) {
              captureBtn._setLoading(false);
              UI.toast('Upload failed: ' + (err.message || 'try again'), 'danger');
            });
          }
        });

        var captureBtn = UI.btn('📷  Capture receipt photo', {
          type: 'outline', block: true,
          onClick: function () { fileInput.click(); }
        });

        var lineObj;
        var removeBtn = UI.btn('Remove line', {
          type: 'outline-danger',
          icon: 'x',
          onClick: function () { removeLine(lineObj); }
        });

        var rowEl = el('div', {
          style: {
            background: 'var(--m3-surface-container-low)',
            borderRadius: 'var(--m3-shape-md)',
            padding: '16px',
            marginBottom: '12px'
          }
        }, [
          typeField,
          dateField,
          amountField,
          descField,
          fileInput,
          captureBtn,
          receiptsList,
          el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '4px' } }, [removeBtn])
        ]);

        lineObj = {
          rowEl: rowEl,
          typeSelect: typeSelect,
          dateInput: dateInput,
          amountInput: amountInput,
          descInput: descInput,
          removeBtn: removeBtn,
          receipts: receipts
        };

        lines.push(lineObj);
        linesContainer.appendChild(rowEl);
        updateRemoveButtons();
      }

      // Seed lines
      if (existing && existing.expenses && existing.expenses.length) {
        for (var k = 0; k < existing.expenses.length; k++) addLine(existing.expenses[k]);
      } else {
        addLine();
      }
      recalcTotal();

      var addLineBtn = UI.btn('Add line', {
        type: 'outline',
        block: true,
        icon: 'plus',
        onClick: function () { addLine(); }
      });

      var submitBtn = UI.btn(isEdit ? 'Save changes' : 'Submit claim', {
        type: 'primary',
        block: true,
        onClick: doSubmit
      });

      function collect() {
        var expenses = [];
        var receipt_files = [];
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var t = line.typeSelect.value;
          var amt = parseFloat(line.amountInput.value);
          if (!t) {
            UI.toast('Pick an expense type for every line.', 'danger');
            return null;
          }
          if (!amt || amt <= 0) {
            UI.toast('Enter a valid amount for every line.', 'danger');
            return null;
          }
          expenses.push({
            expense_type: t,
            expense_date: line.dateInput.value || todayISO(),
            amount: amt,
            description: line.descInput.value || ''
          });
          // Roll receipts up — server uses line_index to stamp code into desc
          for (var ri = 0; ri < (line.receipts || []).length; ri++) {
            receipt_files.push({
              file_name: line.receipts[ri].file_name,
              code: line.receipts[ri].code,
              line_index: i
            });
          }
        }
        return { expenses: expenses, receipt_files: receipt_files };
      }

      function doSubmit() {
        var collected = collect();
        if (!collected) return;
        var expenses = collected.expenses;
        var receipt_files = collected.receipt_files;

        // Advance allocation (optional)
        var advances = [];
        if (selectedAdvance) {
          var alloc = parseFloat(advanceAmtInput.value);
          if (!alloc || alloc <= 0) {
            UI.toast('Enter an allocation amount for the selected advance', 'danger');
            return;
          }
          if (alloc > selectedAdvance.remaining) {
            UI.toast('Allocation exceeds remaining advance (₹' + Math.round(selectedAdvance.remaining).toLocaleString('en-IN') + ')', 'danger');
            return;
          }
          advances.push({
            employee_advance: selectedAdvance.name,
            allocated_amount: alloc
          });
        }

        submitBtn._setLoading(true, isEdit ? 'Saving…' : 'Submitting…');

        var body = {
          expenses: JSON.stringify(expenses),
          posting_date: (existing && existing.posting_date) || todayISO()
        };
        if (advances.length) body.advances = JSON.stringify(advances);
        if (receipt_files.length) body.receipt_files = JSON.stringify(receipt_files);

        var promise = isEdit
          ? api.apiCall('POST', '/api/field/expense/' + encodeURIComponent(name), body)
          : api.apiCall('POST', '/api/field/expense', body);

        promise.then(function (res) {
          if (res.error) {
            var msg = res.error;
            if (res.data && res.data._server_messages) {
              try {
                var arr = JSON.parse(res.data._server_messages);
                msg = JSON.parse(arr[0]).message || msg;
              } catch (e) { /* keep raw msg */ }
            }
            UI.toast('Failed: ' + msg, 'danger');
            submitBtn._setLoading(false);
            return;
          }
          UI.toast(isEdit ? 'Claim updated.' : 'Claim submitted for approval.', 'success');
          var newName = (res.data && (res.data.message && res.data.message.name)) || name;
          if (newName) {
            location.hash = '#/expense/' + encodeURIComponent(newName);
          } else {
            location.hash = '#/expense';
          }
        }).catch(function (err) {
          UI.toast('Failed: ' + (err.message || 'Network error'), 'danger');
          submitBtn._setLoading(false);
        });
      }

      formArea.appendChild(linesContainer);
      formArea.appendChild(addLineBtn);
      formArea.appendChild(totalCard);
      formArea.appendChild(submitBtn);
    }
  }

  window.Screens.expenseNew = function (appEl) { expenseFormScreen(appEl, null, false); };
  window.Screens.expenseEdit = function (appEl, params) { expenseFormScreen(appEl, params, true); };

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

    api.apiCall('GET', '/api/resource/Expense Claim/' + encodeURIComponent(name)).then(function (res) {
      skel.remove();

      if (res.error || !res.data || !(res.data.data || res.data.message)) {
        appEl.appendChild(UI.error('Failed to load expense claim.'));
        return;
      }

      var claim = res.data.data || res.data.message;
      var status = deriveStatus(claim);

      // Hero
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: claim.employee_name || claim.employee || 'Expense claim' }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: claim.name + ' · ' + formatDate(claim.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: formatCurrency(claim.total_claimed_amount) }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Claimed' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
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
              meta.length ? el('div', { className: 'm3-doc-item-meta', textContent: meta.join(' · ') }) : null
            ].filter(Boolean)),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(exp.amount) })
          ]));
        }
        appEl.appendChild(itemsBox);
      } else {
        appEl.appendChild(UI.empty('receipt', 'No expense items.'));
      }

      // Summary
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
      if (claim.total_amount_reimbursed) {
        totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
          el('span', { textContent: 'Reimbursed' }),
          el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(claim.total_amount_reimbursed) })
        ]));
      }
      appEl.appendChild(totalsBox);

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Claim ID', value: claim.name },
        { label: 'Employee', value: claim.employee_name || claim.employee || '' },
        { label: 'Posting date', value: formatDate(claim.posting_date) },
        { label: 'Approver', value: claim.expense_approver || '—' },
        { label: 'Status', value: status }
      ]));

      // Receipt photos — camera-only attachment for proof of expense.
      // Editable on drafts; read-only thumbnails after submit (re-renders
      // existing photos but no new uploads via the disabled button).
      if (UI.attachPhotos) {
        appEl.appendChild(UI.attachPhotos({
          doctype: 'Expense Claim',
          docname: claim.name,
          label: 'Receipt photos',
          max: 8
        }));
      }

      // Actions for drafts only — owner can edit or cancel
      if (claim.docstatus === 0) {
        appEl.appendChild(el('div', { style: { marginTop: '24px' } }, [
          UI.actionBar([
            {
              text: 'Edit',
              type: 'primary',
              icon: 'edit',
              onClick: function () {
                location.hash = '#/expense/' + encodeURIComponent(claim.name) + '/edit';
              }
            },
            {
              text: 'Delete draft',
              type: 'outline-danger',
              icon: 'x',
              onClick: function () {
                UI.confirmDialog('Delete this draft?',
                  'The claim will be removed permanently.',
                  { confirmText: 'Delete', danger: true }
                ).then(function (ok) {
                  if (!ok) return;
                  api.apiCall('DELETE', '/api/field/expense/' + encodeURIComponent(claim.name)).then(function (r) {
                    if (r.error) {
                      UI.toast('Could not delete', 'danger');
                      return;
                    }
                    UI.toast('Draft deleted', 'success');
                    location.hash = '#/expense';
                  });
                });
              }
            }
          ])
        ]));
      }
    }).catch(function () {
      skel.remove();
      appEl.appendChild(UI.error('Could not load expense claim.'));
    });
  };

})();
