/* payment.js — Payment Entry screen for DSPL Field PWA */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(val) {
    if (val == null || isNaN(val)) return '\u20b90';
    return '\u20b9' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // ── Screen: New Payment ─────────────────────────────────────────

  window.Screens.paymentNew = function (appEl) {
    var el = UI.el;
    var selectedInvoice = null;

    appEl.appendChild(UI.skeleton(3));

    window.fieldAPI.apiCall('GET', '/api/field/unpaid-invoices').then(function (res) {
      appEl.textContent = '';
      var invoices = [];
      if (res && res.data) {
        invoices = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }

      if (invoices.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No unpaid invoices'));
        return;
      }

      var selectedDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
      var invoiceListEl = el('div');
      var formFields = el('div', { style: { display: 'none', marginTop: '16px' } });

      function renderInvoiceList() {
        invoiceListEl.textContent = '';
        for (var i = 0; i < invoices.length; i++) {
          (function (inv) {
            var isOverdue = false;
            if (inv.due_date) {
              var dd = new Date(inv.due_date + 'T00:00:00');
              isOverdue = dd < new Date(todayISO() + 'T00:00:00');
            }
            var sub = inv.name + ' \u00b7 Due ' + formatDate(inv.due_date);
            invoiceListEl.appendChild(UI.listCard({
              avatar: inv.customer_name || 'SI',
              title: inv.customer_name || inv.customer,
              sub: sub,
              right: el('div', { style: { textAlign: 'right' } }, [
                el('div', { textContent: formatCurrency(inv.outstanding_amount), style: { fontWeight: '600', fontSize: '14px', color: isOverdue ? 'var(--red, #dc3545)' : '' } }),
                isOverdue ? UI.pill('Overdue', 'red') : UI.pill('Unpaid', 'orange')
              ]),
              onClick: function () {
                selectedInvoice = inv;
                invoiceListEl.style.display = 'none';
                showSelected(inv);
                showForm(inv);
              }
            }));
          })(invoices[i]);
        }
      }

      function showSelected(inv) {
        selectedDisplay.textContent = '';
        selectedDisplay.style.display = 'block';
        var changeBtn = el('button', {
          textContent: 'Change',
          style: { background: 'none', border: 'none', color: 'var(--primary, #E60005)', cursor: 'pointer', fontSize: '13px', marginLeft: '8px' },
          onClick: function () {
            selectedInvoice = null;
            selectedDisplay.style.display = 'none';
            invoiceListEl.style.display = '';
            formFields.style.display = 'none';
          }
        });
        selectedDisplay.appendChild(UI.card([
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('div', null, [
              el('div', { textContent: inv.customer_name || inv.customer, style: { fontWeight: '600' } }),
              el('div', { textContent: inv.name + ' \u00b7 Outstanding: ' + formatCurrency(inv.outstanding_amount), style: { fontSize: '13px', color: 'var(--text-muted)' } })
            ]),
            changeBtn
          ])
        ]));
      }

      // Amount
      var amountInput = el('input', {
        className: 'form-control',
        type: 'number',
        step: 'any',
        min: '0',
        placeholder: '0.00'
      });

      // Mode of payment
      var modeSelect = UI.select('Mode of payment', [
        { value: '', label: 'Select...' },
        { value: 'Cash', label: 'Cash' },
        { value: 'Bank Transfer', label: 'Bank Transfer' },
        { value: 'Cheque', label: 'Cheque' },
        { value: 'Credit Card', label: 'Credit Card' },
        { value: 'Wire Transfer', label: 'Wire Transfer' }
      ], '');

      // Reference
      var referenceInput = UI.textInput('Reference / cheque number');
      var referenceDateInput = UI.dateInput('Reference date', todayISO());

      function showForm(inv) {
        amountInput.value = inv.outstanding_amount;
        formFields.style.display = '';
      }

      var errorBox = el('div', { style: { display: 'none' } });

      var submitBtn = UI.btn('Record payment', {
        type: 'success',
        block: true,
        onClick: function () {
          errorBox.style.display = 'none';
          if (!selectedInvoice) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error('Please select an invoice'));
            return;
          }
          var amt = parseFloat(amountInput.value);
          if (!amt || amt <= 0) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error('Enter a valid amount'));
            return;
          }

          submitBtn._setLoading(true, 'Recording...');

          var payload = {
            sales_invoice: selectedInvoice.name,
            amount: amt
          };
          var modeVal = modeSelect.querySelector('select').value;
          if (modeVal) payload.mode_of_payment = modeVal;
          var refVal = referenceInput.querySelector('input').value.trim();
          if (refVal) payload.reference_no = refVal;
          var refDate = referenceDateInput.querySelector('input').value;
          if (refDate) payload.reference_date = refDate;

          window.fieldAPI.apiCall('POST', '/api/field/payments', payload).then(function (res) {
            if (res.error) {
              errorBox.textContent = '';
              errorBox.style.display = 'block';
              errorBox.appendChild(UI.error(res.error || 'Failed'));
              submitBtn._setLoading(false);
              return;
            }
            UI.toast('Payment recorded!', 'success');
            location.hash = '#/debtors';
          }).catch(function (err) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error(err.message || 'Error'));
            submitBtn._setLoading(false);
          });
        }
      });

      formFields.appendChild(UI.field('Amount', amountInput));
      formFields.appendChild(el('div', { style: { marginTop: '12px' } }));
      formFields.appendChild(UI.field('Mode of payment', modeSelect));
      formFields.appendChild(el('div', { style: { marginTop: '12px' } }));
      formFields.appendChild(UI.field('Reference number', referenceInput));
      formFields.appendChild(el('div', { style: { marginTop: '12px' } }));
      formFields.appendChild(UI.field('Reference date', referenceDateInput));

      renderInvoiceList();

      appEl.appendChild(UI.card([
        UI.sectionHeading('Select invoice'),
        selectedDisplay,
        invoiceListEl,
        formFields,
        errorBox,
        el('div', { style: { marginTop: '12px' } }, [submitBtn])
      ]));

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load invoices: ' + (err.message || err)));
    });
  };

  // ── Screen: Payment Detail ──────────────────────────────────────
  window.Screens.paymentDetail = function (appEl, params) {
    var el = UI.el;
    var pName = params.id || params.name;
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Payment Entry&name=' + encodeURIComponent(pName)
    ).then(function (res) {
      skel.remove();

      var pay = null;
      if (res && res.data) pay = res.data.message || res.data.data || res.data;
      if (!pay) {
        appEl.appendChild(UI.error('Could not load payment.'));
        return;
      }

      var party = pay.party_name || pay.party || 'Unknown';
      var status = pay.docstatus === 1 ? (pay.status || 'Submitted') : (pay.docstatus === 2 ? 'Cancelled' : 'Draft');
      var statusCol = pay.docstatus === 1 ? 'green' : (pay.docstatus === 2 ? 'red' : 'orange');

      // M3 hero — party + amount
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: party }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: pay.name + ' · ' + formatDate(pay.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: formatCurrency(pay.paid_amount || pay.received_amount) }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: pay.payment_type === 'Receive' ? 'Received' : 'Paid' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusCol)])
      ]));

      // PDF action
      appEl.appendChild(el('div', { className: 'm3-doc-actions' }, [
        UI.btn('PDF', { type: 'tonal', icon: 'file', onClick: function () {
          window.open('/api/method/frappe.utils.print_format.download_pdf?doctype=Payment Entry&name=' + encodeURIComponent(pay.name) + '&format=Standard', '_blank');
        } })
      ]));

      // Allocations
      var allocs = pay.references || [];
      if (allocs.length > 0) {
        appEl.appendChild(UI.sectionHeader('Applied to', { support: allocs.length + (allocs.length === 1 ? ' invoice' : ' invoices') }));
        var box = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < allocs.length; i++) {
          var a = allocs[i];
          box.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: a.reference_name }),
              el('div', { className: 'm3-doc-item-meta', textContent: a.reference_doctype + (a.due_date ? ' · due ' + formatDate(a.due_date) : '') })
            ]),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(a.allocated_amount) })
          ]));
        }
        appEl.appendChild(box);
      }

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Payment ID', value: pay.name },
        { label: 'Payment type', value: pay.payment_type || '—' },
        { label: 'Mode of payment', value: pay.mode_of_payment || '—' },
        { label: 'Posting date', value: formatDate(pay.posting_date) },
        { label: 'Reference no', value: pay.reference_no || '—' },
        { label: 'Reference date', value: formatDate(pay.reference_date) },
        { label: 'Party', value: party },
        { label: 'Status', value: status }
      ]));
    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load payment: ' + (err.message || err)));
    });
  };

})();
