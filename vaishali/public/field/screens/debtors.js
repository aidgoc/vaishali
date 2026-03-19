/* debtors.js — Debtor Dashboard for DSPL Field App */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  window.Screens.debtors = function (appEl) {
    var el = UI.el;
    var api = window.fieldAPI;

    // Page header
    appEl.appendChild(UI.page('Receivables', '#/home'));

    // Skeleton while loading
    var loader = UI.skeleton(3);
    appEl.appendChild(loader);

    api.apiCall('GET', '/api/field/view/debtor_dashboard').then(function (resp) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (resp.error || !resp.data) {
        appEl.appendChild(UI.error('Failed to load receivables data'));
        return;
      }

      var data = resp.data;
      var sections = data.sections || data;
      var invoices = sections.overdue_invoices || [];

      // Build summary from invoices
      var totalOutstanding = 0;
      var totalOverdue = 0;
      var overdueCount = 0;
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      for (var s = 0; s < invoices.length; s++) {
        var inv = invoices[s];
        var amt = Number(inv.outstanding_amount || 0);
        totalOutstanding += amt;
        if (inv.due_date) {
          var dp = inv.due_date.split('-');
          if (dp.length === 3) {
            var dd = new Date(parseInt(dp[0], 10), parseInt(dp[1], 10) - 1, parseInt(dp[2], 10));
            if (dd < today) { totalOverdue += amt; overdueCount++; }
          }
        }
      }
      var summary = { total_outstanding: totalOutstanding, total_overdue: totalOverdue, overdue_count: overdueCount };

      // ── Summary row ──────────────────────────────────────────
      var summaryRow = el('div', { className: 'debtor-summary' }, [
        buildSummaryCard(formatCurrency(summary.total_outstanding || 0), 'Outstanding'),
        buildSummaryCard(String(summary.overdue_count || 0), 'Overdue'),
        buildSummaryCard(formatCurrency(summary.total_overdue || 0), 'Overdue Amt')
      ]);
      appEl.appendChild(summaryRow);

      // ── Section heading ──────────────────────────────────────
      if (invoices.length > 0) {
        appEl.appendChild(UI.sectionHeading('Overdue Invoices'));
      }

      // ── Sort invoices by due date ascending (oldest first) ───
      invoices.sort(function (a, b) {
        var dA = a.due_date || '';
        var dB = b.due_date || '';
        return dA < dB ? -1 : dA > dB ? 1 : 0;
      });

      // ── Invoice cards ────────────────────────────────────────
      if (invoices.length === 0) {
        appEl.appendChild(UI.empty('check', 'No overdue invoices'));
        return;
      }

      for (var i = 0; i < invoices.length; i++) {
        appEl.appendChild(buildDebtorCard(invoices[i]));
      }

    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load receivables data'));
    });

    // ── Helpers ──────────────────────────────────────────────────

    function buildSummaryCard(value, label) {
      return el('div', { className: 'debtor-stat' }, [
        el('div', { className: 'debtor-stat-value', textContent: value }),
        el('div', { className: 'debtor-stat-label', textContent: label })
      ]);
    }

    function buildDebtorCard(inv) {
      var customerName = inv.customer_name || inv.customer || '';
      var invoiceName = inv.name || '';
      var outstanding = inv.outstanding_amount || inv.outstanding || 0;
      var grandTotal = inv.grand_total || inv.total || 0;
      var dueDate = inv.due_date || '';
      var daysOverdue = calcDaysOverdue(dueDate);

      var agingBucket = getAgingBucket(daysOverdue);
      var agingPill = el('span', { className: 'aging-pill aging-' + agingBucket.cls, textContent: daysOverdue + 'd' });

      var cardContent = el('div', { className: 'debtor-card' }, [
        el('div', { className: 'debtor-card-top' }, [
          el('div', { className: 'debtor-card-customer', textContent: customerName }),
          agingPill
        ]),
        el('div', { className: 'debtor-card-mid' }, [
          el('span', { className: 'debtor-card-invoice', textContent: invoiceName }),
          el('span', { className: 'debtor-card-due', textContent: dueDate ? 'Due: ' + formatDateShort(dueDate) : '' })
        ]),
        el('div', { className: 'debtor-card-bottom' }, [
          el('div', null, [
            el('span', { className: 'ink-tertiary', textContent: 'Total ', style: { fontSize: '12px' } }),
            UI.amount(grandTotal)
          ]),
          el('div', null, [
            el('span', { className: 'ink-tertiary', textContent: 'Due ', style: { fontSize: '12px' } }),
            UI.amount(outstanding)
          ])
        ])
      ]);

      // Wrap in a tappable container
      var wrapper = el('div', {
        className: 'debtor-card-wrapper',
        onClick: function () {
          var custId = inv.customer || customerName;
          location.hash = '#/customer/' + encodeURIComponent(custId);
        }
      }, [cardContent]);

      return wrapper;
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

    function getAgingBucket(days) {
      if (days > 90) return { cls: 'red', label: '>90d' };
      if (days > 60) return { cls: 'amber', label: '60-90d' };
      if (days > 30) return { cls: 'yellow', label: '30-60d' };
      return { cls: 'green', label: '<30d' };
    }

    function formatCurrency(val) {
      var num = Number(val) || 0;
      if (num >= 100000) {
        return '\u20B9' + (num / 100000).toFixed(1) + 'L';
      }
      if (num >= 1000) {
        return '\u20B9' + (num / 1000).toFixed(1) + 'K';
      }
      return '\u20B9' + num.toLocaleString('en-IN');
    }

    function formatDateShort(dateStr) {
      if (!dateStr) return '';
      var parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var m = parseInt(parts[1], 10) - 1;
      return parseInt(parts[2], 10) + ' ' + (months[m] || '') + ' ' + parts[0];
    }
  };
})();
