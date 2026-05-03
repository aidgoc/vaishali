/* sales-invoice.js — Sales Invoice screens for DSPL Field PWA (List + New) */
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

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'paid') return 'green';
    if (s === 'unpaid' || s === 'overdue') return 'red';
    if (s === 'partly paid') return 'orange';
    if (s === 'draft') return 'orange';
    return 'blue';
  }

  function statusLabel(row) {
    if (row.docstatus === 0) return 'Draft';
    if (row.docstatus === 2) return 'Cancelled';
    return row.status || 'Submitted';
  }

  // ── Screen: Sales Invoice List ──────────────────────────────────

  window.Screens.salesInvoiceList = function (appEl) {
    var el = UI.el;
    var activeTab = 'All';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'All', label: 'All' },
      { value: 'Draft', label: 'Draft' },
      { value: 'Unpaid', label: 'Unpaid' }
    ], 'All', function (val) {
      activeTab = val;
      loadInvoices();
    });
    appEl.appendChild(tabBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('New invoice', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/sales-invoices/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadInvoices() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      window.fieldAPI.apiCall('GET', '/api/field/sales-invoices?status=' + encodeURIComponent(activeTab)).then(function (res) {
        listContainer.textContent = '';
        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No invoices'));
          return;
        }
        for (var i = 0; i < items.length; i++) {
          (function (si) {
            var customer = si.customer_name || si.customer || 'Unknown';
            var sub = [si.name, formatDate(si.posting_date)].filter(Boolean).join(' \u00b7 ');
            var rightContent = [
              el('div', { textContent: formatCurrency(si.grand_total), style: { fontWeight: '600', fontSize: '14px', marginBottom: '4px' } }),
              UI.pill(statusLabel(si), statusColor(statusLabel(si)))
            ];
            if (si.outstanding_amount > 0 && si.docstatus === 1) {
              rightContent.push(el('div', { textContent: 'Due: ' + formatCurrency(si.outstanding_amount), style: { fontSize: '11px', color: 'var(--red, #dc3545)', marginTop: '2px' } }));
            }
            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: el('div', { style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, rightContent),
              onClick: function () {
                location.hash = '#/sales-invoice/' + encodeURIComponent(si.name);
              }
            }));
          })(items[i]);
        }
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load: ' + (err.message || err)));
      });
    }

    loadInvoices();
  };

  // ── Screen: New Sales Invoice ───────────────────────────────────

  window.Screens.salesInvoiceNew = function (appEl) {
    var el = UI.el;
    var selectedSource = null;

    appEl.appendChild(UI.skeleton(3));

    window.fieldAPI.apiCall('GET', '/api/field/billable-documents').then(function (res) {
      appEl.textContent = '';
      var data = (res && res.data) ? (res.data.data || res.data.message || res.data) : {};
      var dns = data.delivery_notes || [];
      var sos = data.sales_orders || [];

      if (dns.length === 0 && sos.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No documents available for invoicing'));
        return;
      }

      var selectedDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
      var sourceListEl = el('div');

      function renderSourceList() {
        sourceListEl.textContent = '';

        if (dns.length > 0) {
          sourceListEl.appendChild(UI.sectionHeading('Delivery notes'));
          for (var i = 0; i < dns.length; i++) {
            (function (d) {
              sourceListEl.appendChild(UI.listCard({
                avatar: d.customer_name || 'DN',
                title: d.customer_name || d.customer,
                sub: d.name + ' \u00b7 ' + formatDate(d.posting_date) + ' \u00b7 ' + Math.round(d.per_billed || 0) + '% billed',
                right: el('div', { style: { textAlign: 'right' } }, [
                  el('div', { textContent: formatCurrency(d.grand_total), style: { fontWeight: '600', fontSize: '14px' } })
                ]),
                onClick: function () {
                  selectedSource = { type: 'Delivery Note', name: d.name, display: d.customer_name + ' \u2014 ' + d.name, total: d.grand_total };
                  sourceListEl.style.display = 'none';
                  showSelected();
                }
              }));
            })(dns[i]);
          }
        }

        if (sos.length > 0) {
          sourceListEl.appendChild(UI.sectionHeading('Sales orders (direct invoice)'));
          for (var j = 0; j < sos.length; j++) {
            (function (s) {
              sourceListEl.appendChild(UI.listCard({
                avatar: s.customer_name || 'SO',
                title: s.customer_name || s.customer,
                sub: s.name + ' \u00b7 ' + formatDate(s.transaction_date) + ' \u00b7 ' + Math.round(s.per_billed || 0) + '% billed',
                right: el('div', { style: { textAlign: 'right' } }, [
                  el('div', { textContent: formatCurrency(s.grand_total), style: { fontWeight: '600', fontSize: '14px' } })
                ]),
                onClick: function () {
                  selectedSource = { type: 'Sales Order', name: s.name, display: s.customer_name + ' \u2014 ' + s.name, total: s.grand_total };
                  sourceListEl.style.display = 'none';
                  showSelected();
                }
              }));
            })(sos[j]);
          }
        }
      }

      function showSelected() {
        selectedDisplay.textContent = '';
        selectedDisplay.style.display = 'block';
        var changeBtn = el('button', {
          textContent: 'Change',
          style: { background: 'none', border: 'none', color: 'var(--primary, #E60005)', cursor: 'pointer', fontSize: '13px', marginLeft: '8px' },
          onClick: function () {
            selectedSource = null;
            selectedDisplay.style.display = 'none';
            sourceListEl.style.display = '';
          }
        });
        selectedDisplay.appendChild(UI.card([
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('div', null, [
              el('div', { textContent: selectedSource.display, style: { fontWeight: '600' } }),
              el('div', { textContent: selectedSource.type + ' \u00b7 ' + formatCurrency(selectedSource.total), style: { fontSize: '13px', color: 'var(--text-muted)' } })
            ]),
            changeBtn
          ])
        ]));
      }

      renderSourceList();

      var errorBox = el('div', { style: { display: 'none' } });

      var submitBtn = UI.btn('Create invoice', {
        type: 'primary',
        block: true,
        onClick: function () {
          errorBox.style.display = 'none';
          if (!selectedSource) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error('Please select a source document'));
            return;
          }
          submitBtn._setLoading(true, 'Creating...');

          window.fieldAPI.apiCall('POST', '/api/field/sales-invoices', {
            source_type: selectedSource.type,
            source_name: selectedSource.name
          }).then(function (res) {
            if (res.error) {
              errorBox.textContent = '';
              errorBox.style.display = 'block';
              errorBox.appendChild(UI.error(res.error || 'Failed'));
              submitBtn._setLoading(false);
              return;
            }
            UI.toast('Invoice created!', 'success');
            location.hash = '#/sales-invoices';
          }).catch(function (err) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error(err.message || 'Error'));
            submitBtn._setLoading(false);
          });
        }
      });

      appEl.appendChild(UI.card([
        UI.sectionHeading('Select source document'),
        selectedDisplay,
        sourceListEl,
        errorBox,
        el('div', { style: { marginTop: '12px' } }, [submitBtn])
      ]));

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load: ' + (err.message || err)));
    });
  };

  // ── Screen: Sales Invoice Detail ──────────────────────────────────
  window.Screens.salesInvoiceDetail = function (appEl, params) {
    var el = UI.el;
    var siName = params.id || params.name;

    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Sales Invoice&name=' + encodeURIComponent(siName)
    ).then(function (res) {
      skel.remove();

      var si = null;
      if (res && res.data) si = res.data.message || res.data.data || res.data;
      if (!si) {
        appEl.appendChild(UI.error('Could not load invoice.'));
        return;
      }

      var customer = si.customer_name || si.customer || 'Unknown';
      var status = statusLabel(si);
      var grandTotal = formatCurrency(si.grand_total);
      var outstanding = si.outstanding_amount || 0;
      var paid = (si.grand_total || 0) - outstanding;

      // Hero — show outstanding prominently if unpaid
      var heroAmountValue = grandTotal;
      var heroAmountLabel = 'Grand total';
      if (outstanding > 0 && si.docstatus === 1) {
        heroAmountValue = formatCurrency(outstanding);
        heroAmountLabel = 'Outstanding';
      }
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: si.name + ' · ' + formatDate(si.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: heroAmountValue }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: heroAmountLabel })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Stage path — visual progression
      var siStages = [
        { value: 'Draft', label: 'Draft' },
        { value: 'Unpaid', label: 'Unpaid' },
        { value: 'Partly Paid', label: 'Partly paid' },
        { value: 'Paid', label: 'Paid' }
      ];
      var siCurrent = status;
      // Overdue is just unpaid past due date — collapse for stage matching
      if (siCurrent === 'Overdue') siCurrent = 'Unpaid';
      if (UI.stagePath) {
        appEl.appendChild(UI.stagePath(siStages, siCurrent, { compact: false }));
      }

      // Track in recently viewed
      if (UI.recents) {
        UI.recents.track({
          doctype: 'Sales Invoice', name: si.name, title: customer,
          subtitle: grandTotal,
          hash: '#/sales-invoice/' + si.name
        });
      }

      // Actions
      function extractError(res, fallback) {
        if (res && res.data && res.data._server_messages) {
          try {
            var msgs = JSON.parse(res.data._server_messages);
            return JSON.parse(msgs[0]).message;
          } catch (e) { /* fall through */ }
        }
        return (res && res.error) || fallback;
      }

      var actionBtns = [];

      if (si.docstatus === 0) {
        actionBtns.push(UI.btn('Submit invoice', {
          type: 'primary',
          icon: 'check',
          onClick: function () {
            var btn = this;
            btn._setLoading(true, 'Submitting...');
            window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.submit_sales_invoice', {
              name: si.name
            }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast(extractError(res, 'Submit failed'), 'error');
                btn._setLoading(false);
                return;
              }
              UI.toast('Invoice submitted', 'success');
              location.hash = '#/sales-invoices';
            }).catch(function (err) {
              UI.toast('Failed: ' + (err.message || err), 'error');
              btn._setLoading(false);
            });
          }
        }));
      }

      actionBtns.push(UI.btn('PDF', {
        type: 'tonal',
        icon: 'file',
        onClick: function () {
          window.open('/api/method/frappe.utils.print_format.download_pdf?doctype=Sales Invoice&name=' + encodeURIComponent(si.name) + '&format=Standard', '_blank');
        }
      }));
      if (outstanding > 0 && si.docstatus === 1) {
        actionBtns.push(UI.btn('Record payment', {
          type: 'primary',
          icon: 'plus',
          onClick: function () {
            location.hash = '#/payments/new?invoice=' + encodeURIComponent(si.name);
          }
        }));
      }
      if (si.contact_email) {
        actionBtns.push(UI.btn('Email', {
          type: 'tonal',
          icon: 'send',
          onClick: function () {
            if (UI.emailComposer) {
              var sheet = UI.emailComposer({
                to: si.contact_email,
                subject: 'Invoice ' + si.name + (si.outstanding_amount > 0 ? ' — payment reminder' : ''),
                doctype: 'Sales Invoice',
                name: si.name
              });
              document.body.appendChild(sheet);
            } else {
              location.href = 'mailto:' + si.contact_email + '?subject=Invoice%20' + encodeURIComponent(si.name);
            }
          }
        }));
      }
      appEl.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));

      // Items
      if (si.items && si.items.length > 0) {
        appEl.appendChild(UI.sectionHeader('Items invoiced', { support: si.items.length + (si.items.length === 1 ? ' line' : ' lines') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < si.items.length; i++) {
          var it = si.items[i];
          var qty = it.qty || 0;
          var rate = it.rate || 0;
          var amount = it.amount != null ? it.amount : qty * rate;
          var name = it.item_name || it.item_code || 'Item';
          var meta = qty + (it.uom ? ' ' + it.uom : '') + ' × ' + formatCurrency(rate);
          itemsBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: name }),
              el('div', { className: 'm3-doc-item-meta', textContent: meta })
            ]),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(amount) })
          ]));
        }
        appEl.appendChild(itemsBox);
      }

      // Totals + payment status
      appEl.appendChild(UI.sectionHeader('Totals & payment'));
      var totalsBox = el('div', { className: 'm3-doc-totals' });
      var totalRows = [];
      if (si.total != null && si.total !== si.grand_total) totalRows.push({ label: 'Subtotal', value: formatCurrency(si.total) });
      if (si.discount_amount) totalRows.push({ label: 'Discount', value: '-' + formatCurrency(si.discount_amount) });
      if (si.total_taxes_and_charges) totalRows.push({ label: 'Tax', value: formatCurrency(si.total_taxes_and_charges) });
      for (var t = 0; t < totalRows.length; t++) {
        totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
          el('span', { textContent: totalRows[t].label }),
          el('span', { className: 'm3-doc-totals-value', textContent: totalRows[t].value })
        ]));
      }
      totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row grand' }, [
        el('span', { textContent: 'Grand total' }),
        el('span', { className: 'm3-doc-totals-value', textContent: grandTotal })
      ]));
      if (si.docstatus === 1) {
        totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
          el('span', { textContent: 'Paid' }),
          el('span', { className: 'm3-doc-totals-value', textContent: formatCurrency(paid) })
        ]));
        totalsBox.appendChild(el('div', { className: 'm3-doc-totals-row' }, [
          el('span', {
            textContent: 'Outstanding',
            style: { color: outstanding > 0 ? 'var(--m3-error)' : 'var(--m3-on-surface-variant)', fontWeight: '500' }
          }),
          el('span', {
            className: 'm3-doc-totals-value',
            textContent: formatCurrency(outstanding),
            style: { color: outstanding > 0 ? 'var(--m3-error)' : 'var(--m3-on-surface-variant)', fontWeight: '500' }
          })
        ]));
      }
      appEl.appendChild(totalsBox);

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Invoice', value: si.name },
        { label: 'Customer', value: customer },
        { label: 'Posting date', value: formatDate(si.posting_date) },
        { label: 'Due date', value: formatDate(si.due_date) },
        { label: 'Status', value: status },
        { label: 'Currency', value: si.currency || 'INR' }
      ]));

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load invoice: ' + (err.message || err)));
    });
  };

})();
