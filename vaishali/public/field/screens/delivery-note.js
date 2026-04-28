/* delivery-note.js — Delivery Note screens for DSPL Field PWA (List + New from SO) */
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
    if (s === 'completed') return 'green';
    if (s === 'to bill') return 'blue';
    if (s === 'draft') return 'orange';
    if (s === 'return issued') return 'red';
    return 'gray';
  }

  function statusLabel(row) {
    if (row.docstatus === 0) return 'Draft';
    if (row.docstatus === 2) return 'Cancelled';
    return row.status || 'Submitted';
  }

  // ── Screen: Delivery Note List ──────────────────────────────────

  window.Screens.deliveryNoteList = function (appEl) {
    var el = UI.el;
    var activeTab = 'All';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'All', label: 'All' },
      { value: 'Draft', label: 'Draft' },
      { value: 'To Bill', label: 'To Bill' }
    ], 'All', function (val) {
      activeTab = val;
      loadNotes();
    });
    appEl.appendChild(tabBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('New from sales order', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/delivery-notes/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadNotes() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      window.fieldAPI.apiCall('GET', '/api/field/delivery-notes?status=' + encodeURIComponent(activeTab)).then(function (res) {
        listContainer.textContent = '';
        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No delivery notes'));
          return;
        }
        for (var i = 0; i < items.length; i++) {
          (function (dn) {
            var customer = dn.customer_name || dn.customer || 'Unknown';
            var sub = [dn.name, formatDate(dn.posting_date)].filter(Boolean).join(' \u00b7 ');
            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: el('div', { style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
                el('div', { textContent: formatCurrency(dn.grand_total), style: { font: 'var(--m3-title-small)', letterSpacing: '0.1px', fontFeatureSettings: '"tnum" 1' } }),
                UI.pill(statusLabel(dn), statusColor(statusLabel(dn)))
              ]),
              onClick: function () {
                location.hash = '#/delivery-note/' + encodeURIComponent(dn.name);
              }
            }));
          })(items[i]);
        }
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load: ' + (err.message || err)));
      });
    }

    loadNotes();
  };

  // ── Screen: New Delivery Note (from SO) ─────────────────────────

  window.Screens.deliveryNoteNew = function (appEl) {
    var el = UI.el;
    var selectedSO = null;

    appEl.appendChild(UI.skeleton(3));

    window.fieldAPI.apiCall('GET', '/api/field/pending-delivery-orders').then(function (res) {
      appEl.textContent = '';
      var orders = [];
      if (res && res.data) {
        orders = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }
      if (orders.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No orders pending delivery'));
        return;
      }

      var selectedDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
      var orderListEl = el('div');

      function renderOrderList() {
        orderListEl.textContent = '';
        for (var i = 0; i < orders.length; i++) {
          (function (so) {
            var pct = Math.round(so.per_delivered || 0);
            var card = UI.listCard({
              avatar: so.customer_name || 'SO',
              title: so.customer_name || so.customer,
              sub: so.name + ' \u00b7 Due ' + formatDate(so.delivery_date) + ' \u00b7 ' + pct + '% delivered',
              right: el('div', { style: { textAlign: 'right' } }, [
                el('div', { textContent: formatCurrency(so.grand_total), style: { fontWeight: '600', fontSize: '14px' } })
              ]),
              onClick: function () {
                selectedSO = so;
                orderListEl.style.display = 'none';
                showSelected(so);
              }
            });
            orderListEl.appendChild(card);
          })(orders[i]);
        }
      }

      function showSelected(so) {
        selectedDisplay.textContent = '';
        selectedDisplay.style.display = 'block';
        var changeBtn = el('button', {
          textContent: 'Change',
          style: { background: 'none', border: 'none', color: 'var(--primary, #E60005)', cursor: 'pointer', fontSize: '13px', marginLeft: '8px' },
          onClick: function () {
            selectedSO = null;
            selectedDisplay.style.display = 'none';
            orderListEl.style.display = '';
          }
        });
        selectedDisplay.appendChild(UI.card([
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('div', null, [
              el('div', { textContent: so.customer_name || so.customer, style: { fontWeight: '600' } }),
              el('div', { textContent: so.name + ' \u00b7 ' + formatCurrency(so.grand_total), style: { fontSize: '13px', color: 'var(--text-muted)' } })
            ]),
            changeBtn
          ])
        ]));
      }

      renderOrderList();

      var errorBox = el('div', { style: { display: 'none' } });

      var submitBtn = UI.btn('Create delivery note', {
        type: 'primary',
        block: true,
        onClick: function () {
          errorBox.style.display = 'none';
          if (!selectedSO) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error('Please select a sales order'));
            return;
          }
          submitBtn._setLoading(true, 'Creating...');

          window.fieldAPI.apiCall('POST', '/api/field/delivery-notes', {
            sales_order: selectedSO.name
          }).then(function (res) {
            if (res.error) {
              errorBox.textContent = '';
              errorBox.style.display = 'block';
              errorBox.appendChild(UI.error(res.error || 'Failed'));
              submitBtn._setLoading(false);
              return;
            }
            UI.toast('Delivery note created!', 'success');
            location.hash = '#/delivery-notes';
          }).catch(function (err) {
            errorBox.textContent = '';
            errorBox.style.display = 'block';
            errorBox.appendChild(UI.error(err.message || 'Error'));
            submitBtn._setLoading(false);
          });
        }
      });

      appEl.appendChild(UI.card([
        UI.sectionHeading('Select sales order'),
        selectedDisplay,
        orderListEl,
        errorBox,
        el('div', { style: { marginTop: '12px' } }, [submitBtn])
      ]));

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load orders: ' + (err.message || err)));
    });
  };

  // ── Screen: Delivery Note Detail ──────────────────────────────────
  window.Screens.deliveryNoteDetail = function (appEl, params) {
    var el = UI.el;
    var dnName = params.id || params.name;

    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Delivery Note&name=' + encodeURIComponent(dnName)
    ).then(function (res) {
      skel.remove();

      var dn = null;
      if (res && res.data) dn = res.data.message || res.data.data || res.data;
      if (!dn) {
        appEl.appendChild(UI.error('Could not load delivery note.'));
        return;
      }

      var customer = dn.customer_name || dn.customer || 'Unknown';
      var status = statusLabel(dn);
      var grandTotal = formatCurrency(dn.grand_total);

      // Hero
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: dn.name + ' · ' + formatDate(dn.posting_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: grandTotal }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Goods value' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Actions
      var actionBtns = [];
      actionBtns.push(UI.btn('PDF', {
        type: 'tonal',
        icon: 'file',
        onClick: function () {
          window.open('/api/method/frappe.utils.print_format.download_pdf?doctype=Delivery Note&name=' + encodeURIComponent(dn.name) + '&format=Standard', '_blank');
        }
      }));
      if (dn.docstatus === 1 && dn.status !== 'Completed') {
        actionBtns.push(UI.btn('Make invoice', {
          type: 'primary',
          icon: 'plus',
          onClick: function () {
            location.hash = '#/sales-invoices/new?delivery_note=' + encodeURIComponent(dn.name);
          }
        }));
      }
      appEl.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));

      // Items
      if (dn.items && dn.items.length > 0) {
        appEl.appendChild(UI.sectionHeader('Items shipped', { support: dn.items.length + (dn.items.length === 1 ? ' line' : ' lines') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < dn.items.length; i++) {
          var it = dn.items[i];
          var qty = it.qty || 0;
          var rate = it.rate || 0;
          var amount = it.amount != null ? it.amount : qty * rate;
          var name = it.item_name || it.item_code || 'Item';
          var meta = qty + (it.uom ? ' ' + it.uom : '') + ' × ' + formatCurrency(rate);
          if (it.against_sales_order) meta += ' · SO ' + it.against_sales_order;
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
      if (dn.total != null && dn.total !== dn.grand_total) totalRows.push({ label: 'Subtotal', value: formatCurrency(dn.total) });
      if (dn.total_taxes_and_charges) totalRows.push({ label: 'Tax', value: formatCurrency(dn.total_taxes_and_charges) });
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
        { label: 'Delivery note', value: dn.name },
        { label: 'Customer', value: customer },
        { label: 'Posting date', value: formatDate(dn.posting_date) },
        { label: 'LR / waybill', value: dn.lr_no || '—' },
        { label: 'LR date', value: formatDate(dn.lr_date) },
        { label: 'Vehicle', value: dn.vehicle_no || '—' },
        { label: 'Transporter', value: dn.transporter_name || '—' },
        { label: 'Status', value: status }
      ]));

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load delivery note: ' + (err.message || err)));
    });
  };

})();
