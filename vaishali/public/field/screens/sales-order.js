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
      UI.btn('+ New from Quotation', {
        type: 'primary',
        block: true,
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
              right: el('div', { style: { textAlign: 'right' } }, [
                el('div', { textContent: formatCurrency(so.grand_total), style: { fontWeight: '600', fontSize: '14px', marginBottom: '4px' } }),
                UI.pill(statusLabel(so), statusColor(statusLabel(so)))
              ])
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

})();
