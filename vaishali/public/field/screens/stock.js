/* stock.js — Stock list + Stock update screens for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function formatQty(val) {
    var num = Number(val) || 0;
    if (num === Math.floor(num)) return String(num);
    return num.toFixed(2);
  }

  function removeSkeleton(container) {
    var skeletons = container.querySelectorAll('.skeleton');
    for (var i = 0; i < skeletons.length; i++) {
      if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
    }
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  // ── Screen: Stock List ────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.stockList = function (appEl) {
    // Add Stock button
    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('Add Stock', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/stock/update'; }
      })
    ]));

    // Warehouse selector
    var warehouseSelect = el('select', { className: 'form-control' }, [
      el('option', { value: '', textContent: 'All Warehouses' })
    ]);
    var warehouseField = UI.field('Warehouse', warehouseSelect);
    appEl.appendChild(warehouseField);

    // Search box
    var searchQuery = '';
    var searchBox = UI.searchInput('Search items...', debounce(function (val) {
      searchQuery = val;
      loadItems();
    }, 400));
    appEl.appendChild(searchBox);

    // Count label
    var countEl = el('div', { className: 'customer-count', textContent: 'Loading...',
      style: { padding: '8px 0', fontSize: '13px', color: 'var(--text-muted, #888)' }
    });
    appEl.appendChild(countEl);

    // List container
    var listContainer = el('div');
    appEl.appendChild(listContainer);
    listContainer.appendChild(UI.skeleton(3));

    // Load warehouses
    api.apiCall('GET', '/api/field/warehouses').then(function (res) {
      var warehouses = [];
      if (res && res.data) {
        warehouses = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }
      for (var i = 0; i < warehouses.length; i++) {
        var w = warehouses[i];
        var wName = typeof w === 'string' ? w : (w.name || w.warehouse_name || '');
        if (wName) {
          warehouseSelect.appendChild(el('option', { value: wName, textContent: wName }));
        }
      }
    });

    warehouseSelect.addEventListener('change', function () {
      loadItems();
    });

    function loadItems() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var params = [];
      if (searchQuery) params.push('search=' + encodeURIComponent(searchQuery));
      if (warehouseSelect.value) params.push('warehouse=' + encodeURIComponent(warehouseSelect.value));
      var qs = params.length ? '?' + params.join('&') : '';

      api.apiCall('GET', '/api/field/stock/items' + qs).then(function (res) {
        listContainer.textContent = '';

        if (res.error || !res.data) {
          listContainer.appendChild(UI.error('Could not load stock items'));
          countEl.textContent = '';
          return;
        }

        var items = [];
        if (res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        countEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('search', 'No stock items found'));
          return;
        }

        for (var i = 0; i < items.length; i++) {
          (function (item) {
            var qty = formatQty(item.actual_qty);
            var qtyColor = Number(item.actual_qty) > 0 ? 'green' : 'red';

            listContainer.appendChild(UI.listCard({
              title: item.item_name || item.item_code,
              sub: item.item_code + (item.warehouse ? ' \u00b7 ' + item.warehouse : ''),
              right: UI.pill(qty + ' qty', qtyColor)
            }));
          })(items[i]);
        }
      }).catch(function () {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Could not load stock items'));
        countEl.textContent = '';
      });
    }

    // Initial load
    loadItems();
  };

  // ── Screen: Stock Update ──────────────────────────────────────────

  window.Screens.stockUpdate = function (appEl) {
    // Warehouse selector
    var warehouseSelect = el('select', { className: 'form-control' }, [
      el('option', { value: '', textContent: '-- Select Warehouse --' })
    ]);

    // Load warehouses
    api.apiCall('GET', '/api/field/warehouses').then(function (res) {
      var warehouses = [];
      if (res && res.data) {
        warehouses = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }
      for (var i = 0; i < warehouses.length; i++) {
        var w = warehouses[i];
        var wName = typeof w === 'string' ? w : (w.name || w.warehouse_name || '');
        if (wName) {
          warehouseSelect.appendChild(el('option', { value: wName, textContent: wName }));
        }
      }
    });

    // Item search
    var selectedItem = null;
    var itemDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
    var searchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var itemSearch = UI.searchInput('Search item...', function (query) {
      if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        searchResults.textContent = '';
        return;
      }
      api.apiCall('GET', '/api/field/stock/items?search=' + encodeURIComponent(query)).then(function (res) {
        searchResults.textContent = '';
        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (items.length === 0) {
          searchResults.style.display = 'none';
          return;
        }
        searchResults.style.display = 'block';
        for (var i = 0; i < items.length; i++) {
          (function (item) {
            var label = (item.item_name || item.item_code) + ' (' + item.item_code + ')';
            searchResults.appendChild(el('div', {
              className: 'search-result-item',
              textContent: label,
              onClick: function () {
                selectedItem = { item_code: item.item_code, item_name: item.item_name || item.item_code };
                searchResults.style.display = 'none';
                showItemChip(label);
              }
            }));
          })(items[i]);
        }
      });
    });

    function showItemChip(label) {
      itemDisplay.textContent = '';
      itemDisplay.style.display = 'block';
      var removeBtn = el('button', {
        textContent: '\u00d7',
        className: 'chip-remove',
        style: { marginLeft: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#666' },
        onClick: function () {
          selectedItem = null;
          itemDisplay.style.display = 'none';
          itemSearch.querySelector('input').value = '';
        }
      });
      itemDisplay.appendChild(el('div', { className: 'customer-chip', style: {
        display: 'inline-flex', alignItems: 'center', background: 'var(--control-bg, #f0f0f0)',
        borderRadius: '20px', padding: '6px 12px', fontSize: '14px'
      } }, [
        el('span', { textContent: label }),
        removeBtn
      ]));
    }

    var itemField = UI.field('Item', el('div', null, [itemSearch, searchResults, itemDisplay]));

    // Quantity input
    var qtyInput = el('input', { className: 'form-control', type: 'number', placeholder: '0', min: '0.01', step: 'any' });

    // Camera / Image upload
    var fileInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment',
      style: { display: 'none' }
    });
    var previewImg = el('img', {
      style: { display: 'none', width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', marginTop: '8px' }
    });
    var selectedFile = null;

    var cameraBtn = UI.btn('Take Photo', {
      type: 'outline',
      icon: 'camera',
      onClick: function () { fileInput.click(); }
    });

    fileInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      selectedFile = file;
      var reader = new FileReader();
      reader.onload = function (ev) {
        previewImg.src = ev.target.result;
        previewImg.style.display = 'block';
        cameraBtn.querySelector('.btn-text').textContent = 'Change Photo';
      };
      reader.readAsDataURL(file);
    });

    var imageSection = el('div', null, [fileInput, cameraBtn, previewImg]);

    // Remarks
    var remarksArea = UI.textarea('Remarks (optional)', { rows: 3 });

    // Error box
    var errorBox = el('div', { style: { display: 'none' } });

    // Submit button
    var submitBtn = UI.btn('SUBMIT STOCK ENTRY', {
      type: 'primary',
      block: true,
      icon: 'check',
      onClick: handleSubmit
    });

    // Build form
    appEl.appendChild(UI.card([
      UI.field('Warehouse', warehouseSelect),
      itemField,
      UI.field('Quantity', qtyInput),
      UI.field('Photo', imageSection),
      UI.field('Remarks', remarksArea),
      errorBox,
      el('div', { style: { marginTop: '12px' } }, [submitBtn])
    ]));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';

      if (!warehouseSelect.value) {
        showError('Please select a warehouse.');
        return;
      }
      if (!selectedItem) {
        showError('Please select an item.');
        return;
      }
      var qty = parseFloat(qtyInput.value);
      if (!qty || qty <= 0) {
        showError('Please enter a valid quantity.');
        return;
      }

      submitBtn._setLoading(true, 'Submitting...');

      var payload = {
        items: JSON.stringify([{
          item_code: selectedItem.item_code,
          qty: qty,
          warehouse: warehouseSelect.value
        }]),
        remarks: remarksArea.value.trim()
      };

      api.apiCall('POST', '/api/field/stock/entry', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          var errMsg = 'Failed to create stock entry';
          if (res.data && res.data.message) errMsg = res.data.message;
          else if (res.data && res.data._server_messages) {
            try {
              var msgs = JSON.parse(res.data._server_messages);
              errMsg = JSON.parse(msgs[0]).message || errMsg;
            } catch (e) { /* ignore */ }
          }
          else if (res.error) errMsg = res.error;
          showError(errMsg);
          submitBtn._setLoading(false);
          return;
        }

        var entryData = res.data;
        var entryName = '';
        if (entryData) {
          if (entryData.name) entryName = entryData.name;
          else if (entryData.data && entryData.data.name) entryName = entryData.data.name;
          else if (entryData.message && entryData.message.name) entryName = entryData.message.name;
        }

        // Upload image if selected
        if (selectedFile && entryName) {
          uploadImage(entryName, selectedFile).then(function () {
            UI.toast('Stock entry created!', 'success');
            location.hash = '#/stock';
          }).catch(function () {
            // Stock entry created but image failed
            UI.toast('Stock entry created (photo upload failed)', 'success');
            location.hash = '#/stock';
          });
        } else {
          UI.toast('Stock entry created!', 'success');
          location.hash = '#/stock';
        }
      }).catch(function () {
        showError('Network error. Please try again.');
        submitBtn._setLoading(false);
      });
    }

    function uploadImage(stockEntryName, file) {
      var formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('doctype', 'Stock Entry');
      formData.append('docname', stockEntryName);
      formData.append('is_private', '0');

      return api.getSession().then(function (session) {
        var headers = {};

        // Auth header for tunnel mode
        var auth = api.getAuthHeader(session);
        if (auth) {
          headers['Authorization'] = auth;
        } else {
          // Frappe cookie auth — add CSRF token
          var csrf = null;
          if (typeof frappe !== 'undefined' && frappe.csrf_token) {
            csrf = frappe.csrf_token;
          } else {
            var match = document.cookie.match(/csrf_token=([^;]+)/);
            if (match) csrf = decodeURIComponent(match[1]);
          }
          if (csrf) headers['X-Frappe-CSRF-Token'] = csrf;
        }

        return fetch('/api/method/upload_file', {
          method: 'POST',
          headers: headers,
          credentials: 'same-origin',
          body: formData
        }).then(function (resp) {
          return resp.json();
        });
      });
    }
  };

})();
