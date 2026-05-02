/* advance.js — Employee Advance screens for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var MOP_CACHE = null;

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
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function deriveStatus(adv) {
    if (!adv) return 'Draft';
    if (adv.docstatus === 2) return 'Cancelled';
    if (adv.docstatus === 0) return 'Draft';
    return adv.status || 'Submitted';
  }

  function statusColor(status) {
    var s = (status || '').toLowerCase();
    if (s === 'paid' || s === 'claimed' || s === 'returned') return 'green';
    if (s === 'submitted' || s === 'unpaid' || s === 'partly claimed and returned') return 'yellow';
    if (s === 'cancelled' || s === 'rejected') return 'red';
    return 'gray';
  }

  function fetchModesOfPayment() {
    if (MOP_CACHE) return Promise.resolve(MOP_CACHE);
    return api.apiCall('GET', '/api/field/modes-of-payment').then(function (res) {
      var list = (res && res.data && (res.data.message || res.data.data)) || [];
      var names = list.map(function (m) { return m.name || m; }).filter(Boolean);
      if (!names.length) names = ['Cash', 'Bank Transfer', 'UPI'];
      MOP_CACHE = names;
      return names;
    }).catch(function () {
      MOP_CACHE = ['Cash', 'Bank Transfer', 'UPI'];
      return MOP_CACHE;
    });
  }

  function loadAdvances() {
    var emp = Auth.getEmployee() || {};
    var empId = emp.name || '';
    if (!empId) return Promise.resolve({ error: 'no_emp' });

    var filters = JSON.stringify([['employee', '=', empId]]);
    var fields = JSON.stringify([
      'name', 'posting_date', 'advance_amount', 'paid_amount',
      'claimed_amount', 'return_amount', 'status', 'purpose',
      'docstatus', 'mode_of_payment'
    ]);
    var path = '/api/resource/Employee Advance'
      + '?filters=' + encodeURIComponent(filters)
      + '&fields=' + encodeURIComponent(fields)
      + '&order_by=modified desc'
      + '&limit_page_length=50';

    return api.apiCall('GET', path).then(function (res) {
      if (res.error) return { error: res.error };
      var advances = (res.data && (res.data.data || res.data.message)) || [];
      return { advances: advances };
    });
  }

  // ── Screen: Advance List ─────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.advanceList = function (appEl) {
    var el = UI.el;

    appEl.appendChild(UI.pageHeader(
      'Advances',
      'Request a salary or expense advance and track repayment.'
    ));

    var statsArea = el('div');
    appEl.appendChild(statsArea);

    appEl.appendChild(el('div', { style: { margin: '8px 0 16px' } }, [
      UI.btn('Request advance', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/advance/new'; }
      })
    ]));

    var activeFilter = 'all';
    var allAdvances = [];

    appEl.appendChild(el('div', {
      textContent: 'Filter by status',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    }));

    var segBar = UI.segmented([
      { value: 'all', label: 'All' },
      { value: 'draft', label: 'Drafts' },
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' }
    ], { value: 'all', onChange: function (v) { activeFilter = v; renderList(); } });
    appEl.appendChild(segBar);

    appEl.appendChild(UI.sectionHeader('Your advances', { support: 'Most recent first' }));

    var listArea = el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    function matchesFilter(adv) {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'draft') return adv.docstatus === 0;
      if (activeFilter === 'closed') {
        return adv.docstatus === 2 || adv.status === 'Claimed' || adv.status === 'Returned';
      }
      if (activeFilter === 'open') {
        return adv.docstatus === 1 && (adv.status === 'Paid' || adv.status === 'Unpaid' ||
          adv.status === 'Partly Claimed and Returned' || !adv.status);
      }
      return true;
    }

    function renderStats() {
      statsArea.textContent = '';
      var totalRequested = 0, totalPaid = 0, totalClaimed = 0, openCt = 0, draftCt = 0;
      for (var i = 0; i < allAdvances.length; i++) {
        var a = allAdvances[i];
        if (a.docstatus === 2) continue;
        totalRequested += (a.advance_amount || 0);
        totalPaid += (a.paid_amount || 0);
        totalClaimed += (a.claimed_amount || 0);
        if (a.docstatus === 0) draftCt++;
        else if (a.status !== 'Claimed' && a.status !== 'Returned') openCt++;
      }
      var outstanding = Math.max(0, totalPaid - totalClaimed);
      statsArea.appendChild(UI.statGrid([
        { value: formatCurrency(totalRequested), label: 'Total requested', support: 'across all advances' },
        { value: formatCurrency(outstanding), label: 'Outstanding', support: 'paid but not claimed' },
        { value: openCt, label: 'Open', support: 'in progress' },
        { value: draftCt, label: 'Drafts', support: 'not yet submitted' }
      ], 2));
    }

    function renderList() {
      listArea.textContent = '';
      var filtered = [];
      for (var i = 0; i < allAdvances.length; i++) {
        if (matchesFilter(allAdvances[i])) filtered.push(allAdvances[i]);
      }

      if (filtered.length === 0) {
        listArea.appendChild(UI.empty('banknote',
          activeFilter === 'all' ? 'No advances yet' : 'No advances match this filter',
          activeFilter === 'all'
            ? { text: 'Request advance', onClick: function () { location.hash = '#/advance/new'; } }
            : null
        ));
        return;
      }

      var listWrap = UI.el('div', { className: 'm3-list' });
      for (var j = 0; j < filtered.length; j++) {
        (function (adv) {
          var status = deriveStatus(adv);
          var rightEl = UI.el('div', {
            style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }
          }, [
            UI.amount(adv.advance_amount),
            UI.pill(status, statusColor(status))
          ]);

          listWrap.appendChild(UI.listCard({
            title: adv.purpose || 'No purpose specified',
            sub: formatDate(adv.posting_date) + ' · ' + adv.name,
            right: rightEl,
            onClick: function () { location.hash = '#/advance/' + encodeURIComponent(adv.name); }
          }));
        })(filtered[j]);
      }
      listArea.appendChild(listWrap);
    }

    loadAdvances().then(function (res) {
      listArea.textContent = '';
      if (res.error === 'no_emp') {
        appEl.appendChild(UI.error('Employee record not linked. Contact admin.'));
        return;
      }
      if (res.error) {
        listArea.appendChild(UI.error('Could not load advances'));
        return;
      }
      allAdvances = res.advances || [];
      renderStats();
      renderList();
    });
  };

  // ── Screen: Advance New / Edit ───────────────────────────────────────

  function advanceFormScreen(appEl, params, isEdit) {
    var el = UI.el;
    var name = isEdit && params && params.id ? params.id : '';

    appEl.appendChild(UI.pageHeader(
      isEdit ? 'Edit advance request' : 'Request advance',
      isEdit
        ? 'Update amount, purpose or mode of payment.'
        : 'Enter amount, purpose, date and preferred mode of payment.'
    ));

    var formArea = el('div');
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);
    appEl.appendChild(formArea);

    fetchModesOfPayment().then(function (mops) {
      if (!isEdit) {
        skel.remove();
        renderForm(mops, null);
        return;
      }
      api.apiCall('GET', '/api/resource/Employee Advance/' + encodeURIComponent(name)).then(function (res) {
        skel.remove();
        if (res.error || !res.data) {
          formArea.appendChild(UI.error('Could not load advance'));
          return;
        }
        var adv = res.data.data || res.data.message;
        if (!adv || adv.docstatus !== 0) {
          formArea.appendChild(UI.error('This advance cannot be edited'));
          return;
        }
        renderForm(mops, adv);
      });
    });

    function renderForm(mops, existing) {
      var amountField = UI.m3TextField('Amount (₹)', {
        type: 'number',
        min: '0',
        step: '1',
        required: true,
        support: 'Whole rupees, no decimals.',
        value: existing ? String(existing.advance_amount || '') : ''
      });
      var purposeField = UI.m3TextField('Purpose of advance', {
        multiline: true,
        rows: 3,
        required: true,
        support: 'Briefly describe what this advance is for.',
        value: existing ? (existing.purpose || '') : ''
      });
      var dateField = UI.m3TextField('Date', {
        type: 'date',
        value: (existing && existing.posting_date) || todayISO(),
        required: true
      });

      var mopOptions = [{ value: '', text: 'Select mode of payment…' }];
      for (var i = 0; i < mops.length; i++) {
        mopOptions.push({ value: mops[i], text: mops[i] });
      }
      var mopField = UI.m3SelectField('Mode of payment', mopOptions, {
        support: 'How you want to receive the advance.',
        value: existing ? (existing.mode_of_payment || '') : ''
      });

      formArea.appendChild(amountField);
      formArea.appendChild(purposeField);
      formArea.appendChild(dateField);
      formArea.appendChild(mopField);

      var submitBtn = UI.btn(isEdit ? 'Save changes' : 'Submit request', {
        type: 'primary',
        block: true,
        icon: 'check',
        onClick: doSubmit
      });
      formArea.appendChild(submitBtn);

      function doSubmit() {
        var amount = parseFloat(amountField._getValue());
        var purpose = (purposeField._getValue() || '').trim();
        var postingDate = dateField._getValue() || todayISO();
        var mop = mopField._getSelect ? mopField._getSelect().value : '';

        if (!amount || amount <= 0) {
          UI.toast('Enter a valid amount.', 'danger');
          return;
        }
        if (!purpose) {
          UI.toast('Enter the purpose.', 'danger');
          return;
        }

        submitBtn._setLoading(true, isEdit ? 'Saving…' : 'Submitting…');

        var body = {
          advance_amount: amount,
          purpose: purpose,
          posting_date: postingDate,
          mode_of_payment: mop || null
        };

        var promise = isEdit
          ? api.apiCall('POST', '/api/field/advance/' + encodeURIComponent(name), body)
          : api.apiCall('POST', '/api/field/advance', body);

        promise.then(function (res) {
          if (res.error) {
            var msg = res.error;
            if (res.data && res.data._server_messages) {
              try {
                var arr = JSON.parse(res.data._server_messages);
                msg = JSON.parse(arr[0]).message || msg;
              } catch (e) { /* keep raw */ }
            }
            UI.toast('Failed: ' + msg, 'danger');
            submitBtn._setLoading(false);
            return;
          }
          UI.toast(isEdit ? 'Advance updated.' : 'Advance request submitted.', 'success');
          var newName = (res.data && (res.data.message && res.data.message.name)) || name;
          if (newName) location.hash = '#/advance/' + encodeURIComponent(newName);
          else location.hash = '#/advance';
        }).catch(function (err) {
          UI.toast('Failed: ' + (err.message || 'Network error'), 'danger');
          submitBtn._setLoading(false);
        });
      }
    }
  }

  window.Screens.advanceNew = function (appEl) { advanceFormScreen(appEl, null, false); };
  window.Screens.advanceEdit = function (appEl, params) { advanceFormScreen(appEl, params, true); };

  // ── Screen: Advance Detail ───────────────────────────────────────────

  window.Screens.advanceDetail = function (appEl, params) {
    var el = UI.el;
    var contentArea = el('div');
    var skel = UI.skeleton(2);
    contentArea.appendChild(skel);
    appEl.appendChild(contentArea);

    var name = params && params.id ? params.id : '';
    if (!name) {
      skel.remove();
      contentArea.appendChild(UI.error('No advance specified'));
      return;
    }

    api.apiCall('GET', '/api/resource/Employee Advance/' + encodeURIComponent(name)).then(function (res) {
      skel.remove();

      if (res.error) {
        contentArea.appendChild(UI.error('Could not load advance details'));
        return;
      }

      var adv = (res.data && (res.data.data || res.data.message)) ? (res.data.data || res.data.message) : null;
      if (!adv) {
        contentArea.appendChild(UI.error('Advance not found'));
        return;
      }

      var status = deriveStatus(adv);
      var paid = adv.paid_amount || 0;
      var claimed = adv.claimed_amount || 0;
      var requested = adv.advance_amount || 0;
      var outstanding = Math.max(0, paid - claimed);

      contentArea.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: adv.purpose || 'Advance' }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: adv.name + ' · ' + formatDate(adv.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: formatCurrency(requested) }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Requested' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      contentArea.appendChild(UI.sectionHeader('Status'));
      var totalsBox = el('div', { className: 'm3-doc-totals' });
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
        el('span', { textContent: 'Paid out' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(paid) })
      ]));
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
        el('span', { textContent: 'Claimed against' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(claimed) })
      ]));
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row grand' }, [
        el('span', { textContent: 'Outstanding' }),
        el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(outstanding) })
      ]));
      contentArea.appendChild(totalsBox);

      contentArea.appendChild(UI.sectionHeader('Details'));
      contentArea.appendChild(UI.detailCard([
        { label: 'Advance ID', value: adv.name },
        { label: 'Purpose', value: adv.purpose || '—' },
        { label: 'Date', value: formatDate(adv.posting_date) },
        { label: 'Employee', value: adv.employee_name || adv.employee || '—' },
        { label: 'Mode of payment', value: adv.mode_of_payment || '—' },
        { label: 'Advance account', value: adv.advance_account || '—' },
        { label: 'Status', value: status }
      ]));

      // Owner actions on draft
      if (adv.docstatus === 0) {
        contentArea.appendChild(el('div', { style: { marginTop: '24px' } }, [
          UI.actionBar([
            {
              text: 'Edit',
              type: 'primary',
              icon: 'edit',
              onClick: function () { location.hash = '#/advance/' + encodeURIComponent(adv.name) + '/edit'; }
            },
            {
              text: 'Delete draft',
              type: 'outline-danger',
              icon: 'x',
              onClick: function () {
                UI.confirmDialog('Delete this draft?',
                  'The advance request will be removed permanently.',
                  { confirmText: 'Delete', danger: true }
                ).then(function (ok) {
                  if (!ok) return;
                  api.apiCall('DELETE', '/api/field/advance/' + encodeURIComponent(adv.name)).then(function (r) {
                    if (r.error) {
                      UI.toast('Could not delete', 'danger');
                      return;
                    }
                    UI.toast('Draft deleted', 'success');
                    location.hash = '#/advance';
                  });
                });
              }
            }
          ])
        ]));
      }
    }).catch(function () {
      skel.remove();
      contentArea.appendChild(UI.error('Could not load advance details'));
    });
  };

})();
