/* revenue.js — Revenue Dashboard for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ──────────────────────────────────────────────────────

  function formatIndianAmount(value) {
    var num = Number(value) || 0;
    if (num >= 10000000) {
      return '\u20B9' + (num / 10000000).toFixed(2) + 'Cr';
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
    var parts = isoString.split('-');
    if (parts.length < 3) return isoString;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(parts[1], 10) - 1;
    return parseInt(parts[2], 10) + ' ' + (months[m] || '') + ' ' + parts[0];
  }

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function calcDaysOverdue(dueDateStr) {
    if (!dueDateStr) return 0;
    var parts = dueDateStr.split('-');
    if (parts.length < 3) return 0;
    var due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }

  function agingColor(days) {
    if (days > 90) return 'red';
    if (days > 60) return 'orange';
    if (days > 30) return 'yellow';
    return 'green';
  }

  // ─── Progress gauge ──────────────────────────────────────────────

  var ANNUAL_TARGET = 85000000; // ₹8.5Cr

  function buildCollectionGauge(collected) {
    // Monthly target = annual / 12
    var now = new Date();
    var monthsElapsed = now.getMonth() + 1; // months into FY (approx, assumes Apr start)
    var fyMonth = now.getMonth() >= 3 ? now.getMonth() - 3 + 1 : now.getMonth() + 9 + 1;
    var proRataTarget = (ANNUAL_TARGET / 12) * fyMonth;
    var pct = proRataTarget > 0 ? Math.min((collected / proRataTarget) * 100, 100) : 0;
    var colorClass = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';

    var monthlyTarget = ANNUAL_TARGET / 12;
    var targetLabel = formatIndianAmount(monthlyTarget) + '/mo';

    var label = el('div', { className: 'target-gauge-label' }, [
      el('span', { textContent: formatIndianAmount(collected) + ' collected' }),
      el('span', { textContent: 'Target: ' + targetLabel })
    ]);

    var fill = el('div', { className: 'target-gauge-fill ' + colorClass });
    fill.style.width = pct.toFixed(1) + '%';

    var bar = el('div', { className: 'target-gauge' }, [fill]);

    return el('div', {}, [label, bar]);
  }

  // ─── Top customers builder ────────────────────────────────────────

  function buildTopCustomers(invoices) {
    var customerMap = {};
    for (var i = 0; i < invoices.length; i++) {
      var inv = invoices[i];
      var cust = inv.customer || inv.customer_name || 'Unknown';
      var amt = Number(inv.grand_total || 0);
      if (!customerMap[cust]) {
        customerMap[cust] = 0;
      }
      customerMap[cust] += amt;
    }

    // Sort by amount descending
    var customers = [];
    var keys = Object.keys(customerMap);
    for (var k = 0; k < keys.length; k++) {
      customers.push({ name: keys[k], amount: customerMap[keys[k]] });
    }
    customers.sort(function (a, b) { return b.amount - a.amount; });

    var top10 = customers.slice(0, 10);
    var cards = [];
    for (var j = 0; j < top10.length; j++) {
      var c = top10[j];
      cards.push(UI.listCard({
        title: c.name,
        right: el('span', { className: 'amount', textContent: formatIndianAmount(c.amount) })
      }));
    }
    return cards;
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderRevenueDashboard(appEl) {
    var loader = UI.skeleton(3);
    appEl.appendChild(loader);

    api.apiCall('GET', '/api/field/view/revenue_dashboard').then(function (res) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Failed to load revenue data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var invoicedList = sections.invoiced_this_fy || [];
      var collectedList = sections.collected_this_fy || [];
      var outstandingList = sections.outstanding || [];
      var monthlyTrend = sections.monthly_trend || [];

      // Compute totals
      var totalInvoiced = 0;
      for (var a = 0; a < invoicedList.length; a++) {
        totalInvoiced += Number(invoicedList[a].grand_total || 0);
      }

      var totalCollected = 0;
      for (var b = 0; b < collectedList.length; b++) {
        totalCollected += Number(collectedList[b].paid_amount || 0);
      }

      var totalOutstanding = 0;
      for (var c = 0; c < outstandingList.length; c++) {
        totalOutstanding += Number(outstandingList[c].outstanding_amount || 0);
      }

      var collectionRate = totalInvoiced > 0
        ? Math.round((totalCollected / totalInvoiced) * 100)
        : 0;

      // ── 2x2 stat cards ──────────────────────────────────────────
      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(totalInvoiced), 'Total Invoiced'),
        UI.statCard(formatIndianAmount(totalCollected), 'Total Collected'),
        UI.statCard(formatIndianAmount(totalOutstanding), 'Outstanding'),
        UI.statCard(collectionRate + '%', 'Collection Rate')
      ], 2));

      // ── Collection gauge ─────────────────────────────────────────
      appEl.appendChild(buildCollectionGauge(totalCollected));

      // ── Top Customers by Revenue ─────────────────────────────────
      // Use monthly_trend (all submitted invoices this FY) for grouping
      var invoicesForGrouping = monthlyTrend.length > 0 ? monthlyTrend : invoicedList;
      appEl.appendChild(UI.sectionHeading('Top customers by revenue'));
      var topCards = buildTopCustomers(invoicesForGrouping);
      if (topCards.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No invoice data'));
      } else {
        for (var t = 0; t < topCards.length; t++) {
          appEl.appendChild(topCards[t]);
        }
      }

      // ── Recent Payments ──────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('Recent payments'));
      var recentPayments = collectedList.slice(0, 10);
      if (recentPayments.length === 0) {
        appEl.appendChild(UI.empty('wallet', 'No payments received'));
      } else {
        for (var p = 0; p < recentPayments.length; p++) {
          var pmt = recentPayments[p];
          appEl.appendChild(UI.listCard({
            title: pmt.party || pmt.party_name || pmt.name || '',
            sub: formatDate(pmt.posting_date),
            right: el('span', { className: 'amount', textContent: formatIndianAmount(pmt.paid_amount) })
          }));
        }
      }

      // ── Overdue Invoices ─────────────────────────────────────────
      var today = todayISO();
      var overdueInvoices = [];
      for (var d = 0; d < outstandingList.length; d++) {
        var oinv = outstandingList[d];
        if (oinv.due_date && oinv.due_date < today) {
          overdueInvoices.push(oinv);
        }
      }

      // Sort by due_date ascending (oldest first)
      overdueInvoices.sort(function (x, y) {
        var dA = x.due_date || '';
        var dB = y.due_date || '';
        return dA < dB ? -1 : dA > dB ? 1 : 0;
      });

      appEl.appendChild(UI.sectionHeading('Overdue invoices'));
      if (overdueInvoices.length === 0) {
        appEl.appendChild(UI.empty('check', 'No overdue invoices'));
      } else {
        for (var e = 0; e < overdueInvoices.length; e++) {
          var ov = overdueInvoices[e];
          var daysOver = calcDaysOverdue(ov.due_date);
          var pillColor = agingColor(daysOver);
          appEl.appendChild(UI.listCard({
            title: ov.customer || ov.name || '',
            sub: ov.name + ' \u00b7 Due: ' + formatDate(ov.due_date),
            right: el('span', {}, [
              UI.pill(daysOver + 'd', pillColor),
              el('span', { className: 'amount', textContent: ' ' + formatIndianAmount(ov.outstanding_amount), style: { marginLeft: '8px' } })
            ])
          }));
        }
      }

    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load revenue data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.revenueDashboard = function (appEl) {
    renderRevenueDashboard(appEl);
  };

})();
