/* quotation.js — Quotation screens for Field PWA (List + New) */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  // ── Helpers ──────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

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
    if (s === 'submitted' || s === 'open') return 'blue';
    if (s === 'ordered' || s === 'closed') return 'green';
    if (s === 'lost' || s === 'cancelled') return 'red';
    if (s === 'draft') return 'orange';
    return 'gray';
  }

  function statusLabel(row) {
    if (row.docstatus === 0) return 'Draft';
    if (row.docstatus === 2) return 'Cancelled';
    return row.status || 'Submitted';
  }

  // ── Screen: Quotation List ────────────────────────────────────────

  window.Screens.quotationList = function (appEl) {
    var el = UI.el;

    var activeTab = 'Draft';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'Draft', label: 'Draft' },
      { value: 'Open', label: 'Open' },
      { value: 'All', label: 'All' }
    ], 'Draft', function (val) {
      activeTab = val;
      loadQuotations();
    });
    appEl.appendChild(tabBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('New Quotation', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/quotations/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadQuotations() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/quotations?status=' + encodeURIComponent(activeTab);

      window.fieldAPI.apiCall('GET', path).then(function (res) {
        listContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No quotations yet'));
          return;
        }

        var listWrap = el('div', { className: 'm3-list' });
        for (var i = 0; i < items.length; i++) {
          (function (q) {
            var customer = q.party_name || 'Unknown';
            var dateStr = formatDate(q.transaction_date);
            var total = formatCurrency(q.grand_total);
            var status = statusLabel(q);
            var sub = [q.name, dateStr].filter(Boolean).join(' \u00b7 ');

            var card = UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: el('div', { style: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, [
                el('div', { textContent: total, style: { font: 'var(--m3-title-small)', letterSpacing: '0.1px', fontFeatureSettings: '"tnum" 1' } }),
                UI.pill(status, statusColor(status))
              ]),
              onClick: function () { location.hash = '#/quotation/' + encodeURIComponent(q.name); }
            });
            // Swipe: trailing = Convert to Sales Order. Only on submitted, non-terminal quotes.
            var canConvert = q.docstatus === 1 && ['Lost', 'Ordered', 'Cancelled'].indexOf(status) === -1;
            if (UI.swipeRow && canConvert) {
              var trailing = [{
                icon: 'plus', label: 'Make SO', color: 'primary',
                onClick: function () {
                  UI.toast('Creating sales order...', 'info');
                  window.fieldAPI.apiCall('POST', '/api/field/sales-orders', { quotation: q.name }).then(function (res) {
                    if (res.error || (res.status && res.status >= 400)) {
                      var msg = res.error || 'Failed';
                      if (res.data && res.data._server_messages) {
                        try { msg = JSON.parse(JSON.parse(res.data._server_messages)[0]).message; } catch (e) {}
                      }
                      UI.toast(msg, 'error');
                      return;
                    }
                    var newSo = (res.data && res.data.message) || res.data || {};
                    UI.toast('Sales order created', 'success');
                    location.hash = '#/sales-order/' + encodeURIComponent(newSo.name);
                  }).catch(function (err) {
                    UI.toast('Failed: ' + (err.message || err), 'error');
                  });
                }
              }];
              listWrap.appendChild(UI.swipeRow(card, { trailingActions: trailing }));
            } else {
              listWrap.appendChild(card);
            }
          })(items[i]);
        }
        listContainer.appendChild(listWrap);
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load quotations: ' + (err.message || err)));
      });
    }

    loadQuotations();

    // Quick-add FAB
    if (UI.fab) {
      var fab = UI.fab({
        icon: 'plus', ariaLabel: 'New quotation',
        onClick: function () { location.hash = '#/quotations/new'; }
      });
      document.body.appendChild(fab);
      var removeFab = function () {
        if (fab.parentNode) fab.parentNode.removeChild(fab);
        window.removeEventListener('hashchange', removeFab);
      };
      window.addEventListener('hashchange', removeFab);
    }
  };

  // ── Screen: New Quotation ─────────────────────────────────────────

  window.Screens.quotationNew = function (appEl) {
    var el = UI.el;

    // ── Read URL params ──
    var hashParts = (location.hash || '').split('?');
    var urlParams = {};
    if (hashParts[1]) {
      var pairs = hashParts[1].split('&');
      for (var p = 0; p < pairs.length; p++) {
        var kv = pairs[p].split('=');
        urlParams[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      }
    }
    var prefillOpportunity = urlParams.opportunity || null;
    var prefillCustomer = urlParams.customer || null;
    var prefillLead = urlParams.lead || null;
    var prefillLeadName = urlParams.lead_name || null;

    // ── State ──
    var selectedCustomer = prefillCustomer || prefillLead || null;
    var itemRows = []; // {item_code, item_name, qty, rate, stock_uom}

    // ── Customer Search ──
    var customerDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
    var searchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var customerSearch = UI.searchInput('Search customer...', function (query) {
      if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        searchResults.textContent = '';
        return;
      }
      window.fieldAPI.apiCall('GET', '/api/field/customers?search=' + encodeURIComponent(query)).then(function (res) {
        searchResults.textContent = '';
        var customers = [];
        if (res && res.data) {
          customers = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (customers.length === 0) {
          searchResults.style.display = 'none';
          return;
        }
        searchResults.style.display = 'block';
        for (var i = 0; i < customers.length; i++) {
          (function (c) {
            var name = c.name || c.customer_name || c;
            var label = typeof c === 'string' ? c : (c.customer_name || c.name);
            var resultItem = el('div', {
              className: 'search-result-item',
              textContent: label,
              onClick: function () {
                selectedCustomer = name;
                searchResults.style.display = 'none';
                showCustomerChip(label);
              }
            });
            searchResults.appendChild(resultItem);
          })(customers[i]);
        }
      });
    });

    var customerField = UI.field('Customer', el('div', null, [customerSearch, searchResults, customerDisplay]));
    var customerSearchInput = customerSearch.querySelector('input');

    // Blur validation on customer search
    customerSearchInput.addEventListener('blur', function () {
      setTimeout(function () {
        if (!selectedCustomer) {
          UI.fieldError(customerSearchInput, 'Required');
        } else {
          UI.fieldError(customerSearchInput, null);
        }
      }, 200);
    });

    function showCustomerChip(label) {
      UI.fieldError(customerSearchInput, null);
      customerDisplay.textContent = '';
      customerDisplay.style.display = 'block';
      var removeBtn = el('button', {
        textContent: '\u00d7',
        className: 'chip-remove',
        style: { marginLeft: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#666' },
        onClick: function () {
          selectedCustomer = null;
          customerDisplay.style.display = 'none';
          customerSearch.querySelector('input').value = '';
        }
      });
      customerDisplay.appendChild(el('div', { className: 'customer-chip', style: {
        display: 'inline-flex', alignItems: 'center', background: 'var(--control-bg, #f0f0f0)',
        borderRadius: '20px', padding: '6px 12px', fontSize: '14px'
      } }, [
        el('span', { textContent: label }),
        removeBtn
      ]));
    }

    // ── Pre-fill customer from URL params ──
    if (selectedCustomer) {
      showCustomerChip(prefillLeadName || prefillCustomer || selectedCustomer);
    }

    // ── Item Picker ──
    var itemSearchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var itemSearch = UI.searchInput('Search items...', function (query) {
      if (!query || query.length < 2) {
        itemSearchResults.style.display = 'none';
        itemSearchResults.textContent = '';
        return;
      }
      window.fieldAPI.apiCall('GET', '/api/field/items?search=' + encodeURIComponent(query)).then(function (res) {
        itemSearchResults.textContent = '';
        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (items.length === 0) {
          itemSearchResults.style.display = 'none';
          return;
        }
        itemSearchResults.style.display = 'block';
        for (var i = 0; i < items.length; i++) {
          (function (item) {
            var label = item.item_name || item.name;
            var rate = item.standard_rate || 0;
            var resultItem = el('div', {
              className: 'search-result-item',
              onClick: function () {
                addItemRow(item);
                itemSearchResults.style.display = 'none';
                itemSearch.querySelector('input').value = '';
              }
            }, [
              el('div', { textContent: label, style: { fontWeight: '500' } }),
              el('div', { textContent: item.name + ' \u00b7 ' + formatCurrency(rate) + ' / ' + (item.stock_uom || 'Nos'),
                style: { fontSize: '12px', color: 'var(--text-muted, #6c757d)' } })
            ]);
            itemSearchResults.appendChild(resultItem);
          })(items[i]);
        }
      });
    });

    var itemPickerField = UI.field('Add Item', el('div', null, [itemSearch, itemSearchResults]));

    // ── Items Table ──
    var itemsTableBody = el('div', { className: 'quotation-items' });
    var grandTotalEl = el('div', {
      style: { textAlign: 'right', fontWeight: '700', fontSize: '18px', padding: '12px 0' },
      textContent: 'Total: ' + formatCurrency(0)
    });

    function recalcTotal() {
      var total = 0;
      for (var i = 0; i < itemRows.length; i++) {
        total += (itemRows[i].qty || 0) * (itemRows[i].rate || 0);
      }
      grandTotalEl.textContent = 'Total: ' + formatCurrency(total);
    }

    function renderItemsTable() {
      itemsTableBody.textContent = '';

      if (itemRows.length === 0) {
        itemsTableBody.appendChild(el('div', {
          textContent: 'No items added yet',
          style: { color: 'var(--text-muted, #6c757d)', padding: '16px 0', textAlign: 'center', fontSize: '14px' }
        }));
        recalcTotal();
        return;
      }

      for (var i = 0; i < itemRows.length; i++) {
        (function (idx) {
          var row = itemRows[idx];
          var amount = (row.qty || 0) * (row.rate || 0);

          var qtyInput = el('input', {
            className: 'form-control',
            type: 'number',
            value: row.qty,
            min: '0.01',
            step: 'any',
            style: { width: '70px', textAlign: 'center' },
            onInput: function (e) {
              row.qty = parseFloat(e.target.value) || 0;
              amountEl.textContent = formatCurrency(row.qty * row.rate);
              recalcTotal();
            }
          });

          var rateInput = el('input', {
            className: 'form-control',
            type: 'number',
            value: row.rate,
            min: '0',
            step: 'any',
            style: { width: '90px', textAlign: 'right' },
            onInput: function (e) {
              row.rate = parseFloat(e.target.value) || 0;
              amountEl.textContent = formatCurrency(row.qty * row.rate);
              recalcTotal();
            }
          });

          var amountEl = el('div', {
            textContent: formatCurrency(amount),
            style: { fontWeight: '600', fontSize: '14px', textAlign: 'right', minWidth: '80px' }
          });

          var removeBtn = el('button', {
            textContent: '\u00d7',
            style: { background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--red, #dc3545)', padding: '4px 8px' },
            onClick: function () {
              itemRows.splice(idx, 1);
              renderItemsTable();
            }
          });

          var itemCard = el('div', {
            className: 'card-surface',
            style: { padding: '12px', marginBottom: '8px', borderRadius: '8px' }
          }, [
            el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' } }, [
              el('div', null, [
                el('div', { textContent: row.item_name, style: { fontWeight: '500', fontSize: '14px' } }),
                el('div', { textContent: row.item_code + ' \u00b7 ' + (row.stock_uom || 'Nos'),
                  style: { fontSize: '12px', color: 'var(--text-muted, #6c757d)' } })
              ]),
              removeBtn
            ]),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [
              el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                el('span', { textContent: 'Qty:', style: { fontSize: '13px', color: 'var(--text-muted, #6c757d)' } }),
                qtyInput
              ]),
              el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
                el('span', { textContent: 'Rate:', style: { fontSize: '13px', color: 'var(--text-muted, #6c757d)' } }),
                rateInput
              ]),
              el('div', { style: { marginLeft: 'auto' } }, [
                el('div', { textContent: 'Amount', style: { fontSize: '11px', color: 'var(--text-muted, #6c757d)' } }),
                amountEl
              ])
            ])
          ]);

          itemsTableBody.appendChild(itemCard);
        })(i);
      }

      recalcTotal();
    }

    function addItemRow(item) {
      // Check if already added
      for (var i = 0; i < itemRows.length; i++) {
        if (itemRows[i].item_code === item.name) {
          itemRows[i].qty += 1;
          renderItemsTable();
          return;
        }
      }
      itemRows.push({
        item_code: item.name,
        item_name: item.item_name || item.name,
        qty: 1,
        rate: item.standard_rate || 0,
        stock_uom: item.stock_uom || 'Nos'
      });
      renderItemsTable();
    }

    renderItemsTable();

    // ── Remarks ──
    var remarksArea = UI.textarea('Notes / remarks...', { rows: 3 });

    // ── Error box ──
    var errorBox = el('div', { style: { display: 'none' } });

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    // ── Submit ──
    var submitBtn = UI.btn('Create quotation', {
      type: 'primary',
      block: true,
      icon: 'plus',
      onClick: handleSubmit
    });

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      if (!selectedCustomer) {
        UI.fieldError(customerSearchInput, 'Customer is required');
        valid = false;
      } else {
        UI.fieldError(customerSearchInput, null);
      }

      if (itemRows.length === 0) {
        showError('Please add at least one item.');
        valid = false;
      }

      // Validate all rows have qty > 0
      for (var i = 0; i < itemRows.length; i++) {
        if (!itemRows[i].qty || itemRows[i].qty <= 0) {
          showError('Item "' + itemRows[i].item_name + '" must have a quantity greater than 0.');
          valid = false;
          break;
        }
      }

      if (!valid) {
        var firstError = appEl.querySelector('.field-error-text');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Creating...');

      var payload = {
        customer: prefillLead || selectedCustomer,
        items: itemRows.map(function (r) {
          return { item_code: r.item_code, qty: r.qty, rate: r.rate };
        }),
        remarks: remarksArea.value.trim() || ''
      };
      if (prefillOpportunity) {
        payload.opportunity = prefillOpportunity;
      }
      if (prefillLead) {
        payload.quotation_to = 'Lead';
        payload.customer = prefillLead;
      }

      window.fieldAPI.apiCall('POST', '/api/field/quotations', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          var msg = 'Failed to create quotation';
          if (res.data && res.data._server_messages) {
            try {
              var msgs = JSON.parse(res.data._server_messages);
              msg = JSON.parse(msgs[0]).message || msg;
            } catch (e) { /* ignore */ }
          } else if (res.data && res.data.exc_type) {
            msg = res.data.exc_type + ': ' + (res.data.exception || '');
          } else if (res.error) {
            msg = res.error;
          }
          showError(msg);
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Quotation created!', 'success');
        location.hash = '#/quotations';
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }

    // ── Build Form ──
    var formChildren = [
      customerField,
      el('div', { style: { marginTop: '16px' } }),
      UI.sectionHeading('Items'),
      itemPickerField,
      itemsTableBody,
      grandTotalEl,
      el('div', { style: { marginTop: '16px' } }),
      UI.field('Remarks', remarksArea),
      errorBox,
      el('div', { style: { marginTop: '12px' } }, [submitBtn])
    ];

    appEl.appendChild(UI.card(formChildren));
  };

  // ── Screen: Quotation Detail ────────────────────────────────────────
  // ERP mobile pattern (Zoho/Odoo): hero with customer + amount + status,
  // quick actions, items table, totals breakdown, terms, activity.

  window.Screens.quotationDetail = function (appEl, params) {
    var el = UI.el;
    var quotName = params.id || params.name;

    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Quotation&name=' + encodeURIComponent(quotName)
    ).then(function (res) {
      skel.remove();

      var q = null;
      if (res && res.data) q = res.data.message || res.data.data || res.data;
      if (!q) {
        appEl.appendChild(UI.error('Could not load quotation.'));
        return;
      }

      var customer = q.party_name || q.customer_name || 'Unknown';
      var status = statusLabel(q);
      var grandTotal = formatCurrency(q.grand_total);

      // ── Hero: customer + status pill + grand total ──
      var hero = el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: q.name + ' · ' + formatDate(q.transaction_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: grandTotal }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Grand total' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]);
      appEl.appendChild(hero);

      // ── Quick action row ──
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
      var statusLower = (q.status || '').toLowerCase();
      var canConvert = q.docstatus === 1 && ['lost', 'ordered', 'cancelled'].indexOf(statusLower) === -1;

      if (q.docstatus === 0) {
        actionBtns.push(UI.btn('Submit & convert to SO', {
          type: 'primary',
          icon: 'check',
          onClick: function () {
            var btn = this;
            btn._setLoading(true, 'Submitting...');
            window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.submit_quotation', {
              name: q.name
            }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast(extractError(res, 'Submit failed'), 'error');
                btn._setLoading(false);
                return null;
              }
              btn._setLoading(true, 'Creating SO...');
              return window.fieldAPI.apiCall('POST', '/api/field/sales-orders', { quotation: q.name });
            }).then(function (res) {
              if (!res) return;
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast('Submitted, but SO creation failed: ' + extractError(res, ''), 'error');
                btn._setLoading(false);
                location.hash = '#/quotations';
                return;
              }
              var newSo = (res.data && res.data.message) || res.data || {};
              UI.toast('Sales order ' + (newSo.name || '') + ' created', 'success');
              location.hash = '#/sales-order/' + encodeURIComponent(newSo.name);
            }).catch(function (err) {
              UI.toast('Failed: ' + (err.message || err), 'error');
              btn._setLoading(false);
            });
          }
        }));

        actionBtns.push(UI.btn('Submit only', {
          type: 'tonal',
          icon: 'check',
          onClick: function () {
            var btn = this;
            btn._setLoading(true, 'Submitting...');
            window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.submit_quotation', {
              name: q.name
            }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast(extractError(res, 'Submit failed'), 'error');
                btn._setLoading(false);
                return;
              }
              UI.toast('Quotation submitted', 'success');
              location.hash = '#/quotations';
            }).catch(function (err) {
              UI.toast('Failed: ' + (err.message || err), 'error');
              btn._setLoading(false);
            });
          }
        }));
      }

      if (canConvert) {
        actionBtns.push(UI.btn('Convert to SO', {
          type: 'primary',
          icon: 'plus',
          onClick: function () {
            var btn = this;
            btn._setLoading(true, 'Creating SO...');
            window.fieldAPI.apiCall('POST', '/api/field/sales-orders', { quotation: q.name }).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                UI.toast(extractError(res, 'Convert failed'), 'error');
                btn._setLoading(false);
                return;
              }
              var newSo = (res.data && res.data.message) || res.data || {};
              UI.toast('Sales order created', 'success');
              location.hash = '#/sales-order/' + encodeURIComponent(newSo.name);
            }).catch(function (err) {
              UI.toast('Failed: ' + (err.message || err), 'error');
              btn._setLoading(false);
            });
          }
        }));
      }

      if (q.contact_email) {
        actionBtns.push(UI.btn('Email', {
          type: 'tonal',
          icon: 'send',
          onClick: function () {
            if (UI.emailComposer) {
              var sheet = UI.emailComposer({
                to: q.contact_email,
                subject: 'Quotation ' + q.name + ' — ' + (q.party_name || ''),
                doctype: 'Quotation',
                name: q.name
              });
              document.body.appendChild(sheet);
            } else {
              location.href = 'mailto:' + q.contact_email + '?subject=Quotation%20' + encodeURIComponent(q.name);
            }
          }
        }));
      }
      actionBtns.push(UI.btn('PDF', {
        type: 'tonal',
        icon: 'file',
        onClick: function () {
          var pdfUrl = '/api/method/frappe.utils.print_format.download_pdf?doctype=Quotation&name=' + encodeURIComponent(q.name) + '&format=Standard';
          window.open(pdfUrl, '_blank');
        }
      }));
      if (actionBtns.length) {
        appEl.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));
      }

      // ── Items ──
      if (q.items && q.items.length > 0) {
        appEl.appendChild(UI.sectionHeader('Items', { support: q.items.length + (q.items.length === 1 ? ' line' : ' lines') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < q.items.length; i++) {
          var it = q.items[i];
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

      // ── Totals ──
      appEl.appendChild(UI.sectionHeader('Totals'));
      var totalRows = [];
      if (q.total != null && q.total !== q.grand_total) {
        totalRows.push({ label: 'Subtotal', value: formatCurrency(q.total) });
      }
      if (q.discount_amount) {
        totalRows.push({ label: 'Discount', value: '-' + formatCurrency(q.discount_amount) });
      }
      if (q.total_taxes_and_charges) {
        totalRows.push({ label: 'Tax', value: formatCurrency(q.total_taxes_and_charges) });
      }
      var totalsBox = el('div', { className: 'm3-doc-totals' });
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

      // ── Document details ──
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Quotation', value: q.name },
        { label: 'Customer', value: customer },
        { label: 'Date', value: formatDate(q.transaction_date) },
        { label: 'Valid till', value: formatDate(q.valid_till) },
        { label: 'Status', value: status },
        { label: 'Currency', value: q.currency || 'INR' },
        { label: 'Order type', value: q.order_type || '—' }
      ]));

      // ── Terms / remarks ──
      if (q.terms) {
        appEl.appendChild(UI.sectionHeader('Terms & conditions'));
        var termsCard = el('div', {
          className: 'm3-card',
          style: {
            background: 'var(--m3-surface-container-low)',
            borderRadius: 'var(--m3-shape-md)',
            padding: '16px',
            font: 'var(--m3-body-medium)',
            color: 'var(--m3-on-surface)',
            letterSpacing: '0.25px',
            whiteSpace: 'pre-wrap',
            marginBottom: '16px'
          },
          textContent: q.terms
        });
        appEl.appendChild(termsCard);
      }

      // Track in recently viewed
      if (UI.recents) {
        UI.recents.track({
          doctype: 'Quotation', name: q.name, title: customer,
          subtitle: grandTotal,
          hash: '#/quotation/' + q.name
        });
      }

      // Activity timeline + comment composer
      if (window.Activity) {
        Activity.attach(appEl, { doctype: 'Quotation', name: q.name });
      }

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load quotation: ' + (err.message || err)));
    });
  };

})();
