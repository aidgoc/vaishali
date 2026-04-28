/* search.js — Global search across customers, leads, opportunities,
   quotations, sales orders, and items.

   Uses Frappe REST resource API (/api/resource/<DocType>) with `like` filters.
   Fires 6 parallel queries on each debounced input and renders sections as
   results arrive. Each row navigates to the entity's detail screen.
*/
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

  // ─── Fetch helper for Frappe REST resource ───────────────────────

  function fetchResource(doctype, filters, fields, limit) {
    var qs = '?filters=' + encodeURIComponent(JSON.stringify(filters)) +
             '&fields=' + encodeURIComponent(JSON.stringify(fields)) +
             '&limit_page_length=' + (limit || 10);
    var path = '/api/resource/' + encodeURIComponent(doctype) + qs;
    return api.apiCall('GET', path).then(function (res) {
      if (res.error) return [];
      var data = res.data;
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.message)) return data.message;
      return [];
    }).catch(function () { return []; });
  }

  // ─── Section renderer ────────────────────────────────────────────

  function buildSection(title, rows) {
    if (!rows || rows.length === 0) return null;
    var section = el('section', { className: 'gs-section' });
    section.appendChild(el('div', { className: 'gs-section-heading', textContent: title }));
    var listWrap = el('div', { className: 'gs-list' });
    for (var i = 0; i < rows.length; i++) listWrap.appendChild(rows[i]);
    section.appendChild(listWrap);
    return section;
  }

  function customerRow(item) {
    var name = item.customer_name || item.name;
    var sub = [item.territory, item.mobile_no].filter(Boolean).join(' · ');
    return UI.listCard({
      avatar: name,
      title: name,
      sub: sub || item.name,
      onClick: function () { location.hash = '#/customer/' + encodeURIComponent(item.name); }
    });
  }

  function leadRow(item) {
    var name = item.lead_name || item.name;
    var sub = [item.company_name, item.status].filter(Boolean).join(' · ');
    return UI.listCard({
      avatar: name,
      title: name,
      sub: sub,
      right: item.status ? UI.pill(item.status, 'blue') : null,
      onClick: function () { location.hash = '#/lead/' + encodeURIComponent(item.name); }
    });
  }

  function opportunityRow(item) {
    var name = item.party_name || item.name;
    var sub = [item.opportunity_type, item.status].filter(Boolean).join(' · ');
    return UI.listCard({
      avatar: name,
      title: name,
      sub: sub || item.name,
      right: item.status ? UI.pill(item.status, 'blue') : null,
      onClick: function () { location.hash = '#/opportunity/' + encodeURIComponent(item.name); }
    });
  }

  function quotationRow(item) {
    var party = item.party_name || item.customer_name || item.name;
    var statusColor = 'blue';
    if (item.status === 'Lost') statusColor = 'red';
    else if (item.status === 'Ordered') statusColor = 'green';
    else if (item.status === 'Open') statusColor = 'orange';
    var sub = [item.name, item.transaction_date].filter(Boolean).join(' · ');
    return UI.listCard({
      title: party,
      sub: sub,
      right: item.status ? UI.pill(item.status, statusColor) : null,
      onClick: function () { location.hash = '#/quotation/' + encodeURIComponent(item.name); }
    });
  }

  function salesOrderRow(item) {
    var party = item.customer_name || item.customer || item.name;
    var statusColor = 'blue';
    if (item.status === 'Completed' || item.status === 'Closed') statusColor = 'green';
    else if (item.status === 'On Hold' || item.status === 'Cancelled') statusColor = 'red';
    var sub = [item.name, item.transaction_date].filter(Boolean).join(' · ');
    return UI.listCard({
      title: party,
      sub: sub,
      right: item.status ? UI.pill(item.status, statusColor) : null,
      onClick: function () { location.hash = '#/sales-order/' + encodeURIComponent(item.name); }
    });
  }

  function itemRow(item) {
    var name = item.item_name || item.name;
    var sub = [item.item_code, item.item_group].filter(Boolean).join(' · ');
    return UI.listCard({
      title: name,
      sub: sub,
      onClick: function () { location.hash = '#/stock?item=' + encodeURIComponent(item.name); }
    });
  }

  // ─── Run a global search ─────────────────────────────────────────

  function runSearch(query, resultsEl, statusEl) {
    var q = (query || '').trim();
    if (q.length < 2) {
      resultsEl.textContent = '';
      statusEl.textContent = '';
      resultsEl.appendChild(UI.empty('search', 'Type at least 2 characters to search'));
      return;
    }

    var like = '%' + q + '%';
    statusEl.textContent = 'Searching…';
    resultsEl.textContent = '';
    resultsEl.appendChild(UI.skeleton(4));

    // Fire all 6 in parallel. Each section renders independently
    // when its query resolves so users see incremental results.
    var queries = [
      {
        title: 'Customers',
        promise: fetchResource('Customer',
          [['customer_name', 'like', like]],
          ['name', 'customer_name', 'territory', 'mobile_no'],
          10),
        builder: customerRow
      },
      {
        title: 'Leads',
        promise: Promise.all([
          fetchResource('Lead',
            [['lead_name', 'like', like]],
            ['name', 'lead_name', 'company_name', 'status'],
            10),
          fetchResource('Lead',
            [['company_name', 'like', like]],
            ['name', 'lead_name', 'company_name', 'status'],
            10)
        ]).then(function (parts) {
          // Merge + dedupe by name
          var seen = {};
          var merged = [];
          for (var i = 0; i < parts.length; i++) {
            for (var j = 0; j < parts[i].length; j++) {
              var row = parts[i][j];
              if (!seen[row.name]) { seen[row.name] = true; merged.push(row); }
              if (merged.length >= 10) break;
            }
            if (merged.length >= 10) break;
          }
          return merged;
        }),
        builder: leadRow
      },
      {
        title: 'Opportunities',
        promise: fetchResource('Opportunity',
          [['party_name', 'like', like]],
          ['name', 'party_name', 'opportunity_type', 'status'],
          10),
        builder: opportunityRow
      },
      {
        title: 'Quotations',
        promise: fetchResource('Quotation',
          [['party_name', 'like', like]],
          ['name', 'party_name', 'customer_name', 'status', 'transaction_date'],
          10),
        builder: quotationRow
      },
      {
        title: 'Sales Orders',
        promise: fetchResource('Sales Order',
          [['customer_name', 'like', like]],
          ['name', 'customer_name', 'customer', 'status', 'transaction_date'],
          10),
        builder: salesOrderRow
      },
      {
        title: 'Items',
        promise: fetchResource('Item',
          [['item_name', 'like', like]],
          ['name', 'item_name', 'item_code', 'item_group'],
          10),
        builder: itemRow
      }
    ];

    // Reserve a slot per section so order is stable even if responses race
    var slots = [];
    var pending = queries.length;
    var totalCount = 0;

    // Replace skeleton with empty container ready to receive sections in order
    resultsEl.textContent = '';
    for (var s = 0; s < queries.length; s++) {
      var slot = el('div', { className: 'gs-slot' });
      slots.push(slot);
      resultsEl.appendChild(slot);
    }

    function finalise() {
      pending--;
      if (pending > 0) return;
      if (totalCount === 0) {
        resultsEl.textContent = '';
        resultsEl.appendChild(UI.empty('search', 'No results for "' + q + '"'));
        statusEl.textContent = '';
      } else {
        statusEl.textContent = totalCount + ' result' + (totalCount === 1 ? '' : 's');
      }
    }

    queries.forEach(function (qd, idx) {
      qd.promise.then(function (rows) {
        if (rows && rows.length) {
          totalCount += rows.length;
          var built = [];
          for (var i = 0; i < rows.length; i++) {
            built.push(qd.builder(rows[i]));
          }
          var sec = buildSection(qd.title, built);
          if (sec) {
            slots[idx].textContent = '';
            slots[idx].appendChild(sec);
          }
        }
        finalise();
      }).catch(function () { finalise(); });
    });
  }

  // ─── Main render ─────────────────────────────────────────────────

  function renderSearch(appEl) {
    // Reset transitions reset hides any leftover container styles
    var wrap = el('div', { className: 'global-search' });

    // Search bar (auto-focused). Reuse UI.searchInput for the M3 pill look,
    // but wire our own debounced handler with a 300ms debounce.
    var resultsEl = el('div', { className: 'gs-results' });
    var statusEl = el('div', { className: 'gs-status', 'aria-live': 'polite' });

    var debounced = debounce(function (val) {
      runSearch(val, resultsEl, statusEl);
    }, 300);

    var searchWrapper = UI.searchInput('Search customers, leads, items…', function (val) {
      debounced(val);
    });
    var inputEl = searchWrapper.querySelector('input');

    wrap.appendChild(searchWrapper);
    wrap.appendChild(statusEl);
    wrap.appendChild(resultsEl);

    appEl.appendChild(wrap);

    // Initial empty state — prompt the user
    resultsEl.appendChild(UI.empty('search', 'Type to search across the org'));

    // Auto-focus shortly after mount (after route transition settles)
    setTimeout(function () {
      try { inputEl.focus(); } catch (e) {}
    }, 100);
  }

  // ─── Export ──────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.search = function (appEl) {
    renderSearch(appEl);
  };

})();
