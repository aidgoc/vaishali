/* pipeline.js — Sales Pipeline KANBAN screen for DSPL Field App
 *
 * Mobile-first horizontal kanban: each stage is a full-width column.
 * Tabs strip at top scrolls active column into view (and follows manual swipes
 * via IntersectionObserver). Sticky column headers show count + total value.
 */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Currency formatting ──────────────────────────────────────────

  function formatINR(val) {
    var n = Number(val) || 0;
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function formatShortINR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  // ─── Stage configuration ──────────────────────────────────────────
  // Maps section keys returned by the sales_pipeline view → display label
  // and which doc field carries the monetary value.

  var STAGES = [
    { key: 'leads',         label: 'Leads',         doctype: 'Lead',         amountField: null,                  status: 'Open' },
    { key: 'opportunities', label: 'Opportunities', doctype: 'Opportunity',  amountField: 'opportunity_amount',  status: 'Open' },
    { key: 'quotations',    label: 'Quotations',    doctype: 'Quotation',    amountField: 'grand_total',         status: 'Quoted' },
    { key: 'orders',        label: 'Orders',        doctype: 'Sales Order',  amountField: 'grand_total',         status: 'Won' }
  ];

  function stageColor(status) {
    if (!status) return 'gray';
    var s = String(status).toLowerCase();
    if (s === 'open' || s === 'lead' || s === 'draft') return 'blue';
    if (s === 'won' || s === 'submitted' || s === 'completed' || s === 'ordered' || s === 'converted') return 'green';
    if (s === 'lost' || s === 'cancelled' || s === 'closed') return 'red';
    if (s === 'replied' || s === 'quotation' || s === 'quoted' || s === 'opportunity' || s === 'interested') return 'orange';
    return 'gray';
  }

  function itemTitle(item) {
    return item.customer_name
        || item.party_name
        || item.lead_name
        || item.company_name
        || item.customer
        || item.name
        || 'Untitled';
  }

  function itemAmount(item, amountField) {
    if (amountField && item[amountField] != null) return Number(item[amountField]) || 0;
    if (item.opportunity_amount != null) return Number(item.opportunity_amount) || 0;
    if (item.grand_total != null) return Number(item.grand_total) || 0;
    return 0;
  }

  // ─── Card ─────────────────────────────────────────────────────────

  function buildCard(item, stage) {
    var children = [];

    children.push(el('div', { className: 'm3-kanban-card-name', textContent: itemTitle(item) }));

    var amt = itemAmount(item, stage.amountField);
    if (amt > 0) {
      children.push(el('div', { className: 'm3-kanban-card-amount', textContent: formatINR(amt) }));
    }

    var metaBits = [];
    if (item.probability != null && item.probability !== '') {
      metaBits.push(el('span', { textContent: item.probability + '% probability' }));
    }
    if (item.status) {
      metaBits.push(UI.pill(item.status, stageColor(item.status)));
    } else {
      metaBits.push(UI.pill(stage.label, stageColor(stage.status || stage.label)));
    }
    children.push(el('div', { className: 'm3-kanban-card-meta' }, metaBits));

    var subBits = [];
    if (item.name) subBits.push(item.name);
    if (item.expected_closing) subBits.push('Closing ' + item.expected_closing);
    else if (item.valid_till) subBits.push('Valid till ' + item.valid_till);
    else if (item.delivery_date) subBits.push('Delivery ' + item.delivery_date);
    else if (item.transaction_date) subBits.push(item.transaction_date);
    if (subBits.length) {
      children.push(el('div', { className: 'm3-kanban-card-meta', textContent: subBits.join(' · ') }));
    }

    var card = el('div', {
      className: 'm3-kanban-card',
      role: 'button',
      tabIndex: '0',
      onClick: function () {
        // Opportunity has a native PWA detail screen
        if (stage.doctype === 'Opportunity' && item.name) {
          window.location.hash = '#/opportunity/' + encodeURIComponent(item.name);
          return;
        }
        // Others fall back to ERPNext desk
        if (item.name) {
          var slug = stage.doctype.toLowerCase().replace(/ /g, '-');
          window.open('/app/' + slug + '/' + encodeURIComponent(item.name), '_blank');
        }
      }
    }, children);

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });

    return card;
  }

  // ─── Column ───────────────────────────────────────────────────────

  function buildColumn(stage, items) {
    items = items || [];
    var total = 0;
    for (var i = 0; i < items.length; i++) total += itemAmount(items[i], stage.amountField);

    var headerMeta = items.length + (items.length === 1 ? ' item' : ' items');
    if (total > 0) headerMeta += ' · ' + formatShortINR(total);

    var header = el('div', { className: 'm3-kanban-col-header' }, [
      el('span', { className: 'm3-kanban-col-title', textContent: stage.label }),
      el('span', { className: 'm3-kanban-col-meta', textContent: headerMeta })
    ]);

    var body = el('div', { className: 'm3-kanban-col-body' });
    if (items.length === 0) {
      body.appendChild(el('div', { className: 'm3-kanban-empty', textContent: 'No opportunities in this stage' }));
    } else {
      for (var k = 0; k < items.length; k++) {
        body.appendChild(buildCard(items[k], stage));
      }
    }

    var col = el('div', {
      className: 'm3-kanban-column',
      'data-stage': stage.key,
      role: 'region',
      'aria-label': stage.label
    }, [header, body]);

    return { el: col, total: total, count: items.length };
  }

  // ─── Tab strip ────────────────────────────────────────────────────

  function buildTab(stage, count, total, onTap) {
    var label = stage.label + ' · ' + count;
    if (total > 0) label += ' · ' + formatShortINR(total);
    var tab = el('button', {
      type: 'button',
      className: 'm3-kanban-tab',
      'data-stage': stage.key,
      onClick: function () { onTap(stage.key); }
    }, [document.createTextNode(label)]);
    return tab;
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderPipeline(appEl) {
    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    api.apiCall('GET', '/api/field/view/sales_pipeline').then(function (res) {
      // Clear skeletons
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }

      if (!res || res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load pipeline data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data.message || data || {};
      // Some view envelopes nest under .data
      if (sections.sections) sections = sections.sections;

      // Container — bleeds past page padding for full-width columns
      var kanban = el('div', { className: 'm3-kanban' });

      // Header (total + label)
      var grandTotal = 0;
      var stageData = [];
      for (var s = 0; s < STAGES.length; s++) {
        var stg = STAGES[s];
        var items = Array.isArray(sections[stg.key]) ? sections[stg.key] : [];
        var t = 0;
        for (var ii = 0; ii < items.length; ii++) t += itemAmount(items[ii], stg.amountField);
        stageData.push({ stage: stg, items: items, total: t });
        grandTotal += t;
      }

      var header = el('div', { className: 'm3-kanban-header' }, [
        el('div', { className: 'm3-kanban-total-label', textContent: 'Total pipeline value' }),
        el('div', { className: 'm3-kanban-total', textContent: formatShortINR(grandTotal) })
      ]);
      kanban.appendChild(header);

      // Columns area (built first so we can pass references to tabs)
      var columnsWrap = el('div', { className: 'm3-kanban-columns', role: 'tabpanel' });
      var columnEls = {};

      // Tabs strip (built second; needs scroll handler that targets columnsWrap)
      var tabsWrap = el('div', { className: 'm3-kanban-tabs', role: 'tablist' });
      var tabEls = {};

      function setActiveTab(key) {
        for (var k in tabEls) {
          if (tabEls.hasOwnProperty(k)) {
            if (k === key) tabEls[k].classList.add('active');
            else tabEls[k].classList.remove('active');
          }
        }
        // Keep active tab visible in the strip
        var activeTab = tabEls[key];
        if (activeTab && activeTab.scrollIntoView) {
          try { activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
        }
      }

      function scrollToColumn(key) {
        var col = columnEls[key];
        if (!col) return;
        // Use scrollLeft on the columns wrapper directly (more reliable on mobile than scrollIntoView)
        var idx = STAGES.findIndex(function (s) { return s.key === key; });
        if (idx < 0) return;
        var width = columnsWrap.clientWidth;
        try {
          columnsWrap.scrollTo({ left: idx * width, behavior: 'smooth' });
        } catch (_) {
          columnsWrap.scrollLeft = idx * width;
        }
        setActiveTab(key);
      }

      for (var t = 0; t < stageData.length; t++) {
        var sd = stageData[t];
        var col = buildColumn(sd.stage, sd.items);
        columnEls[sd.stage.key] = col.el;
        columnsWrap.appendChild(col.el);

        var tab = buildTab(sd.stage, sd.items.length, sd.total, scrollToColumn);
        tabEls[sd.stage.key] = tab;
        tabsWrap.appendChild(tab);
      }

      kanban.appendChild(tabsWrap);
      kanban.appendChild(columnsWrap);
      appEl.appendChild(kanban);

      // Initial active tab — first stage
      setActiveTab(STAGES[0].key);

      // Sync tabs with manual swipes via IntersectionObserver
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          // Pick the entry with the largest intersection ratio
          var best = null;
          for (var e = 0; e < entries.length; e++) {
            if (!entries[e].isIntersecting) continue;
            if (!best || entries[e].intersectionRatio > best.intersectionRatio) {
              best = entries[e];
            }
          }
          if (best) {
            var key = best.target.getAttribute('data-stage');
            if (key) setActiveTab(key);
          }
        }, {
          root: columnsWrap,
          threshold: [0.5, 0.75]
        });
        for (var ck in columnEls) {
          if (columnEls.hasOwnProperty(ck)) io.observe(columnEls[ck]);
        }
      }
    }).catch(function () {
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }
      appEl.appendChild(UI.error('Could not load pipeline data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.pipeline = function (appEl) {
    renderPipeline(appEl);
  };

})();
