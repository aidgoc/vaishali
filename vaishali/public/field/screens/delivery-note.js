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
      UI.btn('+ New from Sales Order', {
        type: 'primary',
        block: true,
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
              right: el('div', { style: { textAlign: 'right' } }, [
                el('div', { textContent: formatCurrency(dn.grand_total), style: { fontWeight: '600', fontSize: '14px', marginBottom: '4px' } }),
                UI.pill(statusLabel(dn), statusColor(statusLabel(dn)))
              ])
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

})();
