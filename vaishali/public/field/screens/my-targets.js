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

  // ─── Progress bar ──────────────────────────────────────────────

  var MONTHLY_TARGET_AMOUNT = 7100000; // ₹71L

  function progressBar(percent) {
    var pct = Math.min(100, Math.max(0, percent));
    return el('div', { className: 'progress-bar-track' }, [
      el('div', { className: 'progress-bar-fill', style: { width: pct + '%' } })
    ]);
  }

  function buildTargetProgress(orderedAmount) {
    var pct = MONTHLY_TARGET_AMOUNT > 0 ? (orderedAmount / MONTHLY_TARGET_AMOUNT) * 100 : 0;

    var label = el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-tertiary)', marginBottom: '4px' } }, [
      el('span', { textContent: formatIndianAmount(orderedAmount) + ' ordered' }),
      el('span', { textContent: 'Target: \u20B971L/mo' })
    ]);

    return el('div', { style: { margin: '16px 0' } }, [label, progressBar(pct)]);
  }

  // ─── Section builder ─────────────────────────────────────────────

  function buildQuoteList(title, items, maxItems) {
    var heading = UI.sectionHeading(title);
    var container = el('div', {}, [heading]);

    if (!items || items.length === 0) {
      container.appendChild(UI.empty('clip', 'No ' + title.toLowerCase()));
      return container;
    }

    var limit = maxItems || items.length;
    for (var i = 0; i < Math.min(items.length, limit); i++) {
      var item = items[i];
      var rightContent = el('div', { style: { textAlign: 'right' } }, [
        el('div', { style: { fontWeight: '600' }, textContent: formatIndianAmount(item.grand_total) }),
        el('div', { style: { fontSize: '12px', color: 'var(--ink-tertiary)' }, textContent: formatDate(item.transaction_date) })
      ]);
      if (item.status) {
        rightContent.appendChild(UI.pill(item.status, statusColor(item.status)));
      }
      container.appendChild(UI.listCard({
        title: item.party_name || item.customer || item.name || 'Untitled',
        sub: item.name || '',
        right: rightContent
      }));
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

      // KPI row
      appEl.appendChild(UI.kpiRow([
        { value: formatIndianAmount(totalQuoted), label: 'QUOTED' },
        { value: formatIndianAmount(totalOrdered), label: 'ORDERED' },
        { value: String(visits.length), label: 'VISITS' }
      ]));

      // Target progress bar
      appEl.appendChild(buildTargetProgress(totalOrdered));

      // Recent Quotations
      appEl.appendChild(buildQuoteList('Recent Quotations', quotations, 10));

      // Recent Orders
      appEl.appendChild(buildQuoteList('Recent Orders', orders, 5));
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
