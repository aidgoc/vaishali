/* sales-order.js — Sales Order screens for DSPL Field PWA (List + New from Quotation) */
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
    if (s === 'completed' || s === 'closed') return 'green';
    if (s === 'to deliver and bill' || s === 'to deliver' || s === 'to bill') return 'blue';
    if (s === 'overdue') return 'red';
    if (s === 'draft') return 'orange';
    return 'gray';
  }

  function statusLabel(row) {
    if (row.docstatus === 0) return 'Draft';
    if (row.docstatus === 2) return 'Cancelled';
    return row.status || 'Submitted';
  }

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function addDays(iso, days) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // ── Screen: Sales Order List ────────────────────────────────────

  window.Screens.salesOrderList = function (appEl) {
    var el = UI.el;
    var activeTab = 'All';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'All', label: 'All' },
      { value: 'Draft', label: 'Draft' },
      { value: 'To Deliver and Bill', label: 'Pending' }
    ], 'All', function (val) {
      activeTab = val;
      loadOrders();
    });
    appEl.appendChild(tabBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('New from quotation', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/sales-orders/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadOrders() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      window.fieldAPI.apiCall('GET', '/api/field/sales-orders?status=' + encodeURIComponent(activeTab)).then(function (res) {
        listContainer.textContent = '';
        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No sales orders'));
          return;
        }
        for (var i = 0; i < items.length; i++) {
          (function (so) {
            var customer = so.customer_name || so.customer || 'Unknown';
            var sub = [so.name, formatDate(so.transaction_date)].filter(Boolean).join(' \u00b7 ');
            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: el('div', { style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
                el('div', { textContent: formatCurrency(so.grand_total), style: { font: 'var(--m3-title-small)', letterSpacing: '0.1px', fontFeatureSettings: '"tnum" 1' } }),
                UI.pill(statusLabel(so), statusColor(statusLabel(so)))
              ]),
              onClick: function () { location.hash = '#/sales-order/' + encodeURIComponent(so.name); }
            }));
          })(items[i]);
        }
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load: ' + (err.message || err)));
      });
    }

    loadOrders();
  };

  // ── Screen: New Sales Order (from Quotation) ───────────────────

  window.Screens.salesOrderNew = function (appEl) {
    var el = UI.el;
    var selectedQuotation = null;

    appEl.appendChild(UI.skeleton(3));

    // Load submitted quotations
    window.fieldAPI.apiCall('GET', '/api/field/submitted-quotations').then(function (res) {
      appEl.textContent = '';
      var quotations = [];
      if (res && res.data) {
        quotations = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }

      if (quotations.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No submitted quotations available'));
        return;
      }

      // Quotation selector
      var selectedDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
      var quotationListEl = el('div');

      function renderQuotationList() {
        quotationListEl.textContent = '';
        for (var i = 0; i < quotations.length; i++) {
          (function (q) {
            var card = UI.listCard({
              avatar: q.party_name || 'Q',
              title: q.party_name || q.name,
              sub: q.name + ' \u00b7 ' + formatDate(q.transaction_date),
              right: el('div', { style: { textAlign: 'right' } }, [
                el('div', { textContent: formatCurrency(q.grand_total), style: { fontWeight: '600', fontSize: '14px' } })
              ]),
              onClick: function () {
                selectedQuotation = q;
                quotationListEl.style.display = 'none';
                showSelected(q);
              }
            });
            quotationListEl.appendChild(card);
          })(quotations[i]);
        }
      }

      function showSelected(q) {
        selectedDisplay.textContent = '';
        selectedDisplay.style.display = 'block';
        var changeBtn = el('button', {
          textContent: 'Change',
          style: { background: 'none', border: 'none', color: 'var(--primary, #E60005)', cursor: 'pointer', fontSize: '13px', marginLeft: '8px' },
          onClick: function () {
            selectedQuotation = null;
            selectedDisplay.style.display = 'none';
            quotationListEl.style.display = '';
          }
        });
        selectedDisplay.appendChild(UI.card([
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('div', null, [
              el('div', { textContent: q.party_name, style: { fontWeight: '600' } }),
              el('div', { textContent: q.name + ' \u00b7 ' + formatCurrency(q.grand_total), style: { fontSize: '13px', color: 'var(--text-muted)' } })
            ]),
            changeBtn
          ])
        ]));
      }

      renderQuotationList();

      // Delivery date
      var deliveryInput = UI.dateInput('Delivery date', addDays(todayISO(), 30));

      // Error box
      var errorBox = el('div', { style: { display: 'none' } });

      // Submit
      var submitBtn = UI.btn('Create sales order', {
        type: 'primary',
        block: true,
        onClick: function () {
          errorBox.style.display = 'none';
          if (!selectedQuotation) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error('Please select a quotation'));
            return;
          }

          submitBtn._setLoading(true, 'Creating...');

          window.fieldAPI.apiCall('POST', '/api/field/sales-orders', {
            quotation: selectedQuotation.name,
            delivery_date: deliveryInput.querySelector('input').value || addDays(todayISO(), 30)
          }).then(function (res) {
            if (res.error) {
              errorBox.textContent = '';
              errorBox.style.display = 'block';
              errorBox.appendChild(UI.error(res.error || 'Failed to create'));
              submitBtn._setLoading(false);
              return;
            }
            UI.toast('Sales order created!', 'success');
            location.hash = '#/sales-orders';
          }).catch(function (err) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error(err.message || 'Error'));
            submitBtn._setLoading(false);
          });
        }
      });

      appEl.appendChild(UI.card([
        UI.sectionHeading('Select quotation'),
        selectedDisplay,
        quotationListEl,
        el('div', { style: { marginTop: '16px' } }),
        UI.field('Delivery date', deliveryInput),
        errorBox,
        el('div', { style: { marginTop: '12px' } }, [submitBtn])
      ]));

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load quotations: ' + (err.message || err)));
    });
  };

  // ── Screen: Sales Order Detail ─────────────────────────────────────
  window.Screens.salesOrderDetail = function (appEl, params) {
    var el = UI.el;
    var soName = params.id || params.name;

    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Sales Order&name=' + encodeURIComponent(soName)
    ).then(function (res) {
      skel.remove();

      var so = null;
      if (res && res.data) so = res.data.message || res.data.data || res.data;
      if (!so) {
        appEl.appendChild(UI.error('Could not load sales order.'));
        return;
      }

      var customer = so.customer_name || so.customer || 'Unknown';
      var status = statusLabel(so);
      var grandTotal = formatCurrency(so.grand_total);

      // Hero
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: so.name + ' · ' + formatDate(so.transaction_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: grandTotal }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Grand total' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Stage path — visual progression
      var soStages = [
        { value: 'Draft', label: 'Draft' },
        { value: 'To Deliver and Bill', label: 'To deliver' },
        { value: 'To Bill', label: 'To bill' },
        { value: 'Completed', label: 'Completed' }
      ];
      var soCurrent;
      if (so.docstatus === 0) soCurrent = 'Draft';
      else if (so.docstatus === 2) soCurrent = 'Cancelled';
      else soCurrent = so.status || 'To Deliver and Bill';
      // Normalize "To Deliver" alias to "To Deliver and Bill" for stage matching
      if (soCurrent === 'To Deliver') soCurrent = 'To Deliver and Bill';
      if (UI.stagePath) {
        appEl.appendChild(UI.stagePath(soStages, soCurrent, { compact: false }));
      }

      // Track in recently viewed
      if (UI.recents) {
        UI.recents.track({
          doctype: 'Sales Order', name: so.name, title: customer,
          subtitle: grandTotal,
          hash: '#/sales-order/' + so.name
        });
      }

      // Actions
      var actionBtns = [];
      actionBtns.push(UI.btn('PDF', {
        type: 'tonal',
        icon: 'file',
        onClick: function () {
          var pdfUrl = '/api/method/frappe.utils.print_format.download_pdf?doctype=Sales Order&name=' + encodeURIComponent(so.name) + '&format=Standard';
          window.open(pdfUrl, '_blank');
        }
      }));
      if (so.docstatus === 1 && so.status !== 'Closed' && so.status !== 'Completed') {
        actionBtns.push(UI.btn('Make delivery', {
          type: 'primary',
          icon: 'plus',
          onClick: function () {
            location.hash = '#/delivery-notes/new?sales_order=' + encodeURIComponent(so.name);
          }
        }));
      }
      appEl.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));

      // Items
      if (so.items && so.items.length > 0) {
        appEl.appendChild(UI.sectionHeader('Items', { support: so.items.length + (so.items.length === 1 ? ' line' : ' lines') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < so.items.length; i++) {
          var it = so.items[i];
          var qty = it.qty || 0;
          var rate = it.rate || 0;
          var amount = it.amount != null ? it.amount : qty * rate;
          var name = it.item_name || it.item_code || 'Item';
          var meta = qty + (it.uom ? ' ' + it.uom : '') + ' × ' + formatCurrency(rate);
          if (it.delivered_qty != null) {
            meta += ' · ' + (it.delivered_qty || 0) + ' delivered';
          }
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

      // Totals
      appEl.appendChild(UI.sectionHeader('Totals'));
      var totalsBox = el('div', { className: 'm3-doc-totals' });
      var totalRows = [];
      if (so.total != null && so.total !== so.grand_total) totalRows.push({ label: 'Subtotal', value: formatCurrency(so.total) });
      if (so.discount_amount) totalRows.push({ label: 'Discount', value: '-' + formatCurrency(so.discount_amount) });
      if (so.total_taxes_and_charges) totalRows.push({ label: 'Tax', value: formatCurrency(so.total_taxes_and_charges) });
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
      appEl.appendChild(totalsBox);

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Sales order', value: so.name },
        { label: 'Customer', value: customer },
        { label: 'Date', value: formatDate(so.transaction_date) },
        { label: 'Delivery date', value: formatDate(so.delivery_date) },
        { label: 'Status', value: status },
        { label: 'Currency', value: so.currency || 'INR' }
      ]));

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load sales order: ' + (err.message || err)));
    });
  };

})();
