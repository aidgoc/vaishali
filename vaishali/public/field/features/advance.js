/* advance.js — Employee Advance feature for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  function el(tag, attrs, children) { return (window._fieldEl || function(t) { return document.createElement(t); })(tag, attrs, children); }
  function navigate(h) { (window._fieldNavigate || function(x) { location.hash = x; })(h); }
  var COMPANY = 'Dynamic Servitech Private Limited';
  var ADVANCE_ACCOUNT = 'Employee Advances - DSPL';

  // ─── Helpers ────────────────────────────────────────────────────────

  function formatCurrency(amount) {
    return '\u20b9' + Number(amount || 0).toLocaleString('en-IN');
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'paid' || s === 'claimed' || s === 'returned') return 'green';
    if (s === 'submitted' || s === 'partly claimed and returned') return 'yellow';
    if (s === 'cancelled') return 'red';
    return 'gray';
  }

  // ─── API Wrappers ──────────────────────────────────────────────────

  function getAdvances(employeeId) {
    var filters = JSON.stringify([['employee', '=', employeeId], ['docstatus', '!=', 2]]);
    var fields = JSON.stringify([
      'name', 'employee', 'employee_name', 'posting_date',
      'advance_amount', 'paid_amount', 'claimed_amount', 'return_amount',
      'status', 'purpose'
    ]);
    var path = '/api/resource/Employee Advance'
      + '?filters=' + encodeURIComponent(filters)
      + '&fields=' + encodeURIComponent(fields)
      + '&order_by=posting_date desc'
      + '&limit_page_length=20';
    return api.apiCall('GET', path);
  }

  function getAdvanceDetail(name) {
    return api.apiCall('GET', '/api/resource/Employee Advance/' + encodeURIComponent(name));
  }

  function requestAdvance(data) {
    return api.apiCall('POST', '/api/resource/Employee Advance', {
      employee: data.employee,
      company: COMPANY,
      posting_date: data.posting_date || todayISO(),
      purpose: data.purpose,
      advance_amount: data.advance_amount,
      advance_account: ADVANCE_ACCOUNT,
      currency: 'INR',
      exchange_rate: 1
    });
  }

  // ─── Screen: Advance List ──────────────────────────────────────────

  function renderAdvanceList() {
    var appEl = document.getElementById('app');

    api.getSession().then(function (session) {
      if (!session) { location.hash = '#/login'; return; }

      var emp = session.employee || {};
      var employeeId = emp.name || emp.employee;

      var header = el('div', { className: 'screen-header' }, [
        el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/home'; } }),
        el('h2', { textContent: 'Advances' })
      ]);

      var summaryCard = el('div', { className: 'stat-card', style: { marginBottom: '1rem' } }, [
        el('div', { className: 'stat-value', textContent: formatCurrency(0) }),
        el('div', { className: 'stat-label', textContent: 'Outstanding Advance' })
      ]);

      var newBtn = el('button', {
        textContent: '+ Request Advance',
        className: 'btn btn-primary btn-block btn-lg',
        style: { marginBottom: '1rem' },
        onClick: function () { location.hash = '#/advance/new'; }
      });

      var listContainer = el('div');
      var loadingEl = el('div', { textContent: 'Loading advances...', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-grey, #6c757d)' } });
      listContainer.appendChild(loadingEl);

      appEl.textContent = '';
      appEl.appendChild(header);
      appEl.appendChild(summaryCard);
      appEl.appendChild(newBtn);
      appEl.appendChild(listContainer);

      if (!employeeId) {
        listContainer.textContent = '';
        listContainer.appendChild(el('div', { textContent: 'Employee record not linked. Contact admin.', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-red, #e74c3c)' } }));
        return;
      }

      getAdvances(employeeId).then(function (res) {
        listContainer.textContent = '';

        if (res.error || res.offline) {
          listContainer.appendChild(el('div', { textContent: res.offline ? 'You are offline. Cannot load advances.' : 'Failed to load advances.', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-red, #e74c3c)' } }));
          return;
        }

        var advances = (res.data && res.data.data) ? res.data.data : [];

        // Calculate outstanding: advance_amount - paid back amounts
        var totalOutstanding = 0;
        for (var i = 0; i < advances.length; i++) {
          var adv = advances[i];
          var outstanding = Number(adv.advance_amount || 0) - Number(adv.claimed_amount || 0) - Number(adv.return_amount || 0);
          if (outstanding > 0 && adv.status !== 'Cancelled') {
            totalOutstanding += outstanding;
          }
        }
        summaryCard.textContent = '';
        summaryCard.appendChild(el('div', { className: 'stat-value', textContent: formatCurrency(totalOutstanding) }));
        summaryCard.appendChild(el('div', { className: 'stat-label', textContent: 'Outstanding Advance' }));

        if (advances.length === 0) {
          listContainer.appendChild(el('div', { textContent: 'No advances found.', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-grey, #6c757d)' } }));
          return;
        }

        for (var j = 0; j < advances.length; j++) {
          (function (adv) {
            var pill = el('span', { className: 'indicator-pill ' + statusColor(adv.status), textContent: adv.status || 'Draft' });

            var card = el('div', {
              className: 'stat-card',
              style: { marginBottom: '0.75rem', cursor: 'pointer', padding: '1rem' },
              onClick: function () { location.hash = '#/advance/' + encodeURIComponent(adv.name); }
            }, [
              el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' } }, [
                el('span', { textContent: formatDate(adv.posting_date), style: { fontSize: '0.85rem', color: 'var(--field-grey, #6c757d)' } }),
                el('span', { textContent: formatCurrency(adv.advance_amount), style: { fontWeight: '700', fontSize: '1.1rem' } })
              ]),
              el('div', { textContent: adv.purpose || 'No purpose specified', style: { fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--field-dark, #333)' } }),
              el('div', null, [pill])
            ]);

            listContainer.appendChild(card);
          })(advances[j]);
        }
      });
    });
  }

  // ─── Screen: New Advance Request ───────────────────────────────────

  function renderAdvanceNew() {
    var appEl = document.getElementById('app');

    api.getSession().then(function (session) {
      if (!session) { location.hash = '#/login'; return; }

      var emp = session.employee || {};
      var employeeId = emp.name || emp.employee;

      var header = el('div', { className: 'screen-header' }, [
        el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/advance'; } }),
        el('h2', { textContent: 'Request Advance' })
      ]);

      var amountLabel = el('label', { className: 'section-heading', textContent: 'Amount' });
      var amountInput = el('input', { type: 'number', className: 'form-control', placeholder: 'Enter amount', style: { marginBottom: '1rem' } });

      var purposeLabel = el('label', { className: 'section-heading', textContent: 'Purpose' });
      var purposeInput = el('textarea', { className: 'form-control', placeholder: 'Describe the purpose of this advance', style: { marginBottom: '1.5rem', minHeight: '100px', resize: 'vertical' } });

      var errorBox = el('div', { style: { color: 'var(--field-red, #e74c3c)', marginBottom: '1rem', display: 'none' } });

      var submitBtn = el('button', {
        textContent: 'Submit Request',
        className: 'btn btn-primary btn-block btn-lg',
        onClick: function () {
          var amount = parseFloat(amountInput.value);
          var purpose = purposeInput.value.trim();

          // Validation
          if (!amount || amount <= 0) {
            errorBox.textContent = 'Please enter a valid amount.';
            errorBox.style.display = 'block';
            return;
          }
          if (!purpose) {
            errorBox.textContent = 'Please enter a purpose for the advance.';
            errorBox.style.display = 'block';
            return;
          }
          if (!employeeId) {
            errorBox.textContent = 'Employee record not linked. Contact admin.';
            errorBox.style.display = 'block';
            return;
          }

          errorBox.style.display = 'none';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';

          requestAdvance({
            employee: employeeId,
            advance_amount: amount,
            purpose: purpose
          }).then(function (res) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Request';

            if (res.error || res.offline) {
              errorBox.textContent = res.offline ? 'You are offline. Try again later.' : (res.data && res.data._server_messages ? res.data._server_messages : 'Failed to submit advance request.');
              errorBox.style.display = 'block';
              return;
            }

            api.showToast('Advance request submitted', 'success');
            location.hash = '#/advance';
          });
        }
      });

      appEl.textContent = '';
      appEl.appendChild(header);
      appEl.appendChild(el('div', { style: { padding: '0' } }, [
        amountLabel,
        amountInput,
        purposeLabel,
        purposeInput,
        errorBox,
        submitBtn
      ]));
    });
  }

  // ─── Screen: Advance Detail ────────────────────────────────────────

  function renderAdvanceDetail(name) {
    var appEl = document.getElementById('app');

    var header = el('div', { className: 'screen-header' }, [
      el('button', { className: 'back-btn', textContent: '\u2190', onClick: function () { location.hash = '#/advance'; } }),
      el('h2', { textContent: 'Advance Detail' })
    ]);

    var contentEl = el('div');
    var loadingEl = el('div', { textContent: 'Loading...', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-grey, #6c757d)' } });
    contentEl.appendChild(loadingEl);

    appEl.textContent = '';
    appEl.appendChild(header);
    appEl.appendChild(contentEl);

    getAdvanceDetail(name).then(function (res) {
      contentEl.textContent = '';

      if (res.error || res.offline) {
        contentEl.appendChild(el('div', { textContent: res.offline ? 'You are offline.' : 'Failed to load advance details.', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-red, #e74c3c)' } }));
        return;
      }

      var adv = (res.data && res.data.data) ? res.data.data : null;
      if (!adv) {
        contentEl.appendChild(el('div', { textContent: 'Advance not found.', style: { textAlign: 'center', padding: '2rem', color: 'var(--field-red, #e74c3c)' } }));
        return;
      }

      // Status pill
      var statusPill = el('div', { style: { marginBottom: '1.5rem' } }, [
        el('span', { className: 'indicator-pill ' + statusColor(adv.status), textContent: adv.status || 'Draft' })
      ]);

      // Amount breakdown
      var amountsHeading = el('div', { className: 'section-heading', textContent: 'Amount Details' });
      var amountsGrid = el('div', { className: 'stats-row' }, [
        el('article', { className: 'stat-card' }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(adv.advance_amount) }),
          el('div', { className: 'stat-label', textContent: 'Requested' })
        ]),
        el('article', { className: 'stat-card' }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(adv.paid_amount) }),
          el('div', { className: 'stat-label', textContent: 'Paid' })
        ]),
        el('article', { className: 'stat-card' }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(adv.claimed_amount) }),
          el('div', { className: 'stat-label', textContent: 'Claimed' })
        ]),
        el('article', { className: 'stat-card' }, [
          el('div', { className: 'stat-value', textContent: formatCurrency(adv.return_amount) }),
          el('div', { className: 'stat-label', textContent: 'Returned' })
        ])
      ]);

      // Purpose
      var purposeHeading = el('div', { className: 'section-heading', textContent: 'Purpose', style: { marginTop: '1.5rem' } });
      var purposeText = el('div', {
        textContent: adv.purpose || 'No purpose specified',
        style: { padding: '0.75rem', backgroundColor: 'var(--field-bg, #f5f5f5)', borderRadius: '8px', fontSize: '0.95rem', lineHeight: '1.5' }
      });

      // Date
      var dateHeading = el('div', { className: 'section-heading', textContent: 'Date', style: { marginTop: '1.5rem' } });
      var dateText = el('div', {
        textContent: formatDate(adv.posting_date),
        style: { fontSize: '0.95rem', color: 'var(--field-dark, #333)' }
      });

      // Advance ID
      var idHeading = el('div', { className: 'section-heading', textContent: 'Advance ID', style: { marginTop: '1.5rem' } });
      var idText = el('div', {
        textContent: adv.name,
        style: { fontSize: '0.85rem', color: 'var(--field-grey, #6c757d)' }
      });

      contentEl.appendChild(statusPill);
      contentEl.appendChild(amountsHeading);
      contentEl.appendChild(amountsGrid);
      contentEl.appendChild(purposeHeading);
      contentEl.appendChild(purposeText);
      contentEl.appendChild(dateHeading);
      contentEl.appendChild(dateText);
      contentEl.appendChild(idHeading);
      contentEl.appendChild(idText);
    });
  }

  // ─── Export ─────────────────────────────────────────────────────────

  window.advanceFeature = {
    renderAdvanceList: renderAdvanceList,
    renderAdvanceNew: renderAdvanceNew,
    renderAdvanceDetail: renderAdvanceDetail,
    getAdvances: getAdvances,
    getAdvanceDetail: getAdvanceDetail,
    requestAdvance: requestAdvance,
    formatCurrency: formatCurrency
  };

})();
