/* monthly-report.js — Monthly Report Card for DSPL Field App */
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

  // ─── YTD Progress Bar ────────────────────────────────────────────

  function buildYTDProgress(revenue, target) {
    var pct = target > 0 ? Math.min((revenue / target) * 100, 100) : 0;
    var colorClass = pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red';

    var label = el('div', { className: 'target-gauge-label' }, [
      el('span', { textContent: formatIndianAmount(revenue) + ' YTD' }),
      el('span', { textContent: 'Target: ' + formatIndianAmount(target) })
    ]);

    var fill = el('div', { className: 'target-gauge-fill ' + colorClass });
    fill.style.width = pct.toFixed(1) + '%';

    var bar = el('div', { className: 'target-gauge' }, [fill]);

    var pctLabel = el('div', {
      style: { textAlign: 'center', fontSize: '13px', color: 'var(--dspl-text-2)', marginTop: '4px' }
    }, [pct.toFixed(1) + '% of annual target']);

    return el('div', {}, [label, bar, pctLabel]);
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderMonthlyReport(appEl) {

    if (!Auth.isManager()) {
      appEl.appendChild(UI.error('Manager access required to view this report.'));
      return;
    }

    var loader = UI.skeleton(4);
    appEl.appendChild(loader);

    api.apiCall('GET', '/api/field/monthly-report').then(function (res) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load report data. Please try again.'));
        return;
      }

      var raw = res.data;
      var data = raw.message || raw.data || raw;

      var month = data.month || '';
      var tm = data.this_month || {};
      var ytd = data.ytd || {};
      var health = data.health || {};

      // ── Header badge ─────────────────────────────────────────────
      appEl.appendChild(el('div', {
        style: { textAlign: 'center', padding: '8px 0 4px' }
      }, [
        el('div', {
          style: {
            display: 'inline-block',
            background: 'var(--dspl-red)',
            color: '#fff',
            borderRadius: '20px',
            padding: '4px 18px',
            fontWeight: '600',
            fontSize: '15px',
            letterSpacing: '0.5px'
          },
          textContent: month + ' Report Card'
        })
      ]));

      // ── This Month section ────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('This month'));

      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(tm.revenue || 0), 'Revenue'),
        UI.statCard(tm.orders || 0, 'Orders'),
        UI.statCard(tm.visits || 0, 'Visits'),
        UI.statCard(tm.leads || 0, 'Leads')
      ], 2));

      appEl.appendChild(UI.grid([
        UI.statCard(tm.quotations || 0, 'Quotations'),
        UI.statCard(formatIndianAmount(tm.quote_value || 0), 'Quote Value')
      ], 2));

      // ── YTD section ───────────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('Year to date'));

      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(ytd.revenue || 0), 'YTD Revenue'),
        UI.statCard(ytd.orders || 0, 'YTD Orders')
      ], 2));

      appEl.appendChild(buildYTDProgress(ytd.revenue || 0, ytd.target || 100900000));

      // ── Health section ────────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('Health'));

      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(health.outstanding || 0), 'Outstanding'),
        UI.statCard(health.attendance_days || 0, 'Attendance Days')
      ], 2));

    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Could not load report data. Please try again.'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.monthlyReport = function (appEl) {
    renderMonthlyReport(appEl);
  };

})();
