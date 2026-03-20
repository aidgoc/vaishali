/* my-targets.js — My Targets screen for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ──────────────────────────────────────────────────────

  function formatIndianAmount(value) {
    var num = Number(value) || 0;
    if (num >= 10000000) {
      return '\u20B9' + (num / 10000000).toFixed(1) + 'Cr';
    }
    if (num >= 100000) {
      return '\u20B9' + (num / 100000).toFixed(1) + 'L';
    }
    if (num >= 1000) {
      return '\u20B9' + (num / 1000).toFixed(1) + 'K';
    }
    return '\u20B9' + num.toLocaleString('en-IN');
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'open' || s === 'draft') return 'blue';
    if (s === 'submitted' || s === 'completed' || s === 'ordered') return 'green';
    if (s === 'lost' || s === 'cancelled' || s === 'closed') return 'red';
    if (s === 'expired') return 'orange';
    return 'gray';
  }

  // ─── Progress gauge ──────────────────────────────────────────────

  var MONTHLY_TARGET = 8500000 / 12 * 12; // ₹8.5Cr annual = ₹71L/month
  var MONTHLY_TARGET_AMOUNT = 7100000; // ₹71L

  function buildGauge(orderedAmount) {
    var pct = MONTHLY_TARGET_AMOUNT > 0 ? Math.min((orderedAmount / MONTHLY_TARGET_AMOUNT) * 100, 100) : 0;
    var colorClass = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';

    var label = el('div', { className: 'target-gauge-label' }, [
      el('span', { textContent: formatIndianAmount(orderedAmount) + ' ordered' }),
      el('span', { textContent: 'Target: \u20B971L/mo' })
    ]);

    var fill = el('div', { className: 'target-gauge-fill ' + colorClass });
    fill.style.width = pct.toFixed(1) + '%';

    var bar = el('div', { className: 'target-gauge' }, [fill]);

    return el('div', {}, [label, bar]);
  }

  // ─── Quotation / Order card ──────────────────────────────────────

  function quoteCard(item) {
    var title = item.party_name || item.customer || item.name || 'Untitled';
    var children = [
      el('div', { className: 'pipeline-card-title', textContent: title }),
      el('div', { className: 'pipeline-card-sub', textContent: item.name || '' }),
      el('div', { className: 'pipeline-card-meta' }, [
        el('span', { className: 'pipeline-card-amount', textContent: formatIndianAmount(item.grand_total) }),
        el('span', { className: 'pipeline-card-date', textContent: formatDate(item.transaction_date) })
      ])
    ];
    if (item.status) {
      children.push(el('div', { className: 'pipeline-card-status' }, [UI.pill(item.status, statusColor(item.status))]));
    }
    return el('div', { className: 'pipeline-card' }, children);
  }

  // ─── Visit card ──────────────────────────────────────────────────

  function visitCard(item) {
    var title = item.customer_name || item.name || 'Visit';
    var children = [
      el('div', { className: 'pipeline-card-title', textContent: title }),
      el('div', { className: 'pipeline-card-meta' }, [
        el('span', { className: 'pipeline-card-date', textContent: formatDate(item.date) }),
        el('span', { textContent: item.visit_purpose || '' })
      ])
    ];
    if (item.status) {
      children.push(el('div', { className: 'pipeline-card-status' }, [UI.pill(item.status, statusColor(item.status))]));
    }
    return el('div', { className: 'pipeline-card' }, children);
  }

  // ─── Section builder ─────────────────────────────────────────────

  function buildSection(title, items, cardFn, maxItems) {
    var heading = el('div', { className: 'section-label', textContent: title });
    var container = el('div', {}, [heading]);

    if (!items || items.length === 0) {
      container.appendChild(UI.empty('clip', 'No ' + title.toLowerCase()));
      return container;
    }

    var limit = maxItems || items.length;
    for (var i = 0; i < Math.min(items.length, limit); i++) {
      container.appendChild(cardFn(items[i]));
    }
    return container;
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderMyTargets(appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/my_targets').then(function (res) {
      // Remove skeletons
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load targets data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var quotations = sections.quotation_summary || [];
      var orders = sections.order_summary || [];
      var visits = sections.visit_stats || [];

      // Totals
      var totalQuoted = 0;
      for (var q = 0; q < quotations.length; q++) {
        totalQuoted += Number(quotations[q].grand_total || 0);
      }
      var totalOrdered = 0;
      for (var o = 0; o < orders.length; o++) {
        totalOrdered += Number(orders[o].grand_total || 0);
      }

      // Stat cards
      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(totalQuoted), 'Total Quoted'),
        UI.statCard(formatIndianAmount(totalOrdered), 'Total Ordered'),
        UI.statCard(String(visits.length), 'Visits This Month')
      ], 3));

      // Target gauge
      appEl.appendChild(buildGauge(totalOrdered));

      // Recent Quotations
      appEl.appendChild(buildSection('RECENT QUOTATIONS', quotations, quoteCard, 10));

      // Recent Orders
      appEl.appendChild(buildSection('RECENT ORDERS', orders, quoteCard, 5));
    }).catch(function () {
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }
      appEl.appendChild(UI.error('Could not load targets data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.myTargets = function (appEl) {
    renderMyTargets(appEl);
  };

})();
