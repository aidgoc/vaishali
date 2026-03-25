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

    var reportData = null;
    var annualTarget = 0;

    var reportDone = api.apiCall('GET', '/api/field/monthly-report').then(function (res) {
      reportData = res;
    }).catch(function () { reportData = null; });

    var targetsDone = api.apiCall('GET', '/api/field/sales-targets').then(function (res) {
      var raw = res.data || {};
      var d = raw.message || raw.data || raw;
      annualTarget = d.total_target || 0;
    }).catch(function () { annualTarget = 0; });

    Promise.all([reportDone, targetsDone]).then(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (!reportData || reportData.error || !reportData.data) {
        appEl.appendChild(UI.error('Could not load report data. Please try again.'));
        return;
      }

      var raw = reportData.data;
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

      appEl.appendChild(buildYTDProgress(ytd.revenue || 0, ytd.target || annualTarget));

      // ── Health section ────────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('Health'));

      appEl.appendChild(UI.grid([
        UI.statCard(formatIndianAmount(health.outstanding || 0), 'Outstanding'),
        UI.statCard(health.attendance_days || 0, 'Attendance Days')
      ], 2));

      // ── Conversion Funnel section ──────────────────────────────
      var funnelContainer = el('div');
      appEl.appendChild(funnelContainer);

      api.apiCall('GET', '/api/field/conversion-funnel').then(function (fRes) {
        var fRaw = fRes.data || {};
        var funnel = fRaw.message || fRaw.data || fRaw;

        if (!funnel || !funnel.visits) return;

        funnelContainer.appendChild(UI.sectionHeading('Conversion funnel'));

        funnelContainer.appendChild(UI.kpiRow([
          { value: String(funnel.visits || 0), label: 'Visits' },
          { value: String(funnel.leads || 0), label: 'Leads' },
          { value: String(funnel.opportunities || 0), label: 'Opportunities' },
          { value: String(funnel.quoted || 0), label: 'Quoted' },
          { value: String(funnel.won || 0), label: 'Won' }
        ]));

        // Stage-to-stage rates
        var rates = [];
        if (funnel.visits > 0) rates.push('Visit\u2192Lead: ' + Math.round((funnel.leads / funnel.visits) * 100) + '%');
        if (funnel.leads > 0) rates.push('Lead\u2192Opp: ' + Math.round((funnel.opportunities / funnel.leads) * 100) + '%');
        if (funnel.opportunities > 0) rates.push('Opp\u2192Quote: ' + Math.round((funnel.quoted / funnel.opportunities) * 100) + '%');
        if (funnel.quoted > 0) rates.push('Quote\u2192Won: ' + Math.round((funnel.won / funnel.quoted) * 100) + '%');

        if (rates.length > 0) {
          funnelContainer.appendChild(el('div', {
            style: { fontSize: '12px', color: 'var(--ink-tertiary, #6B6B70)', textAlign: 'center', marginTop: '8px' },
            textContent: rates.join('  \u00B7  ')
          }));
        }

        if (funnel.lost > 0) {
          funnelContainer.appendChild(el('div', {
            style: { fontSize: '12px', color: '#ef4444', textAlign: 'center', marginTop: '4px' },
            textContent: funnel.lost + ' lost'
          }));
        }
      }).catch(function () { /* silently skip funnel on error */ });

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
