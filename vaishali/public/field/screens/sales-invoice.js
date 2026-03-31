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
      UI.btn('+ New Invoice', {
        type: 'primary',
        block: true,
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
              right: el('div', { style: { textAlign: 'right' } }, rightContent)
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

})();
