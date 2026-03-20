/* customer-search.js — Customer Search screen for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Debounce helper ─────────────────────────────────────────────

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  // ─── Build a single customer card ────────────────────────────────

  function customerCard(item) {
    var children = [];

    var name = item.customer_name || item.name || 'Unnamed';
    children.push(el('div', { className: 'customer-card-name', textContent: name }));

    var territory = item.territory || '';
    if (territory) {
      children.push(el('div', { className: 'customer-card-territory', textContent: territory }));
    }

    var card = el('div', { className: 'card customer-card', onClick: function () {
      location.hash = '#/customer/' + encodeURIComponent(item.name);
    } }, children);

    return card;
  }

  // ─── Render filtered list ────────────────────────────────────────

  function renderList(container, countEl, customers, query) {
    // Clear previous results
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var filtered = customers;
    if (query) {
      var q = query.toLowerCase();
      filtered = [];
      for (var i = 0; i < customers.length; i++) {
        var cname = (customers[i].customer_name || customers[i].name || '').toLowerCase();
        if (cname.indexOf(q) !== -1) {
          filtered.push(customers[i]);
        }
      }
    }

    // Update count
    countEl.textContent = filtered.length + ' customer' + (filtered.length !== 1 ? 's' : '');

    if (filtered.length === 0) {
      container.appendChild(UI.empty('users', 'No customers found'));
      return;
    }

    for (var j = 0; j < filtered.length; j++) {
      container.appendChild(customerCard(filtered[j]));
    }
  }

  // ─── Main render ─────────────────────────────────────────────────

  function renderCustomerSearch(appEl) {
    // Search box
    var searchInput = el('input', {
      type: 'text',
      placeholder: 'Search customers...'
    });
    var searchBox = el('div', { className: 'search-box' }, [searchInput]);
    appEl.appendChild(searchBox);

    // Count label
    var countEl = el('div', { className: 'customer-count', textContent: 'Loading...' });
    appEl.appendChild(countEl);

    // Results container
    var listEl = el('div', { className: 'customer-list' });
    appEl.appendChild(listEl);

    // Show skeleton while loading
    appEl.appendChild(UI.skeleton(3));

    // Fetch all customers
    api.apiCall('GET', '/api/field/customers').then(function (res) {
      // Remove skeleton
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load customers'));
        countEl.textContent = '';
        return;
      }

      // Handle: FastAPI {data: [...]}, Frappe {message: [...]}, nested {data: {data: [...]}}
      var customers = [];
      if (res.data) {
        if (Array.isArray(res.data)) customers = res.data;
        else if (Array.isArray(res.data.data)) customers = res.data.data;
        else if (Array.isArray(res.data.message)) customers = res.data.message;
      }

      // Initial render — show all
      renderList(listEl, countEl, customers, '');

      // Wire up search with debounce
      var onInput = debounce(function () {
        renderList(listEl, countEl, customers, searchInput.value.trim());
      }, 300);

      searchInput.addEventListener('input', onInput);
    }).catch(function () {
      // Remove skeleton
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }
      appEl.appendChild(UI.error('Could not load customers'));
      countEl.textContent = '';
    });
  }

  // ─── Export ──────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.customerSearch = function (appEl) {
    renderCustomerSearch(appEl);
  };

})();
