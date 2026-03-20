/* sales-target.js — DSPL Sales Target Dashboard */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Target gauge bar ─────────────────────────────────────────────

  function targetBar(label, target, actual) {
    var pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
    var color = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'red';
    return el('div', { style: { marginBottom: '16px' } }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, [
        el('span', { style: { fontSize: '14px', fontWeight: '600' }, textContent: label }),
        el('span', { style: { fontSize: '13px', color: 'var(--ink-tertiary)' }, textContent: pct + '%' })
      ]),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: 'var(--ink-tertiary)' } }, [
        el('span', { textContent: '\u20b9' + (actual / 100000).toFixed(1) + 'L actual' }),
        el('span', { textContent: '\u20b9' + (target / 100000).toFixed(1) + 'L target' })
      ]),
      el('div', { className: 'target-gauge' }, [
        el('div', { className: 'target-gauge-fill ' + color, style: { width: pct + '%' } })
      ])
    ]);
  }

  // ─── Funnel stat row ──────────────────────────────────────────────

  function funnelRow(label, value, sub) {
    return el('div', { style: { textAlign: 'center', flex: '1' } }, [
      el('div', { style: { fontSize: '24px', fontWeight: '700', color: 'var(--ink-primary)' }, textContent: String(value) }),
      el('div', { style: { fontSize: '12px', fontWeight: '600', color: 'var(--ink-secondary)', marginTop: '2px' }, textContent: label }),
      sub ? el('div', { style: { fontSize: '11px', color: 'var(--ink-tertiary)', marginTop: '2px' }, textContent: sub }) : null
    ].filter(Boolean));
  }

  // ─── Format currency ──────────────────────────────────────────────

  function fmtCr(amount) {
    var cr = amount / 10000000;
    return '\u20b9' + cr.toFixed(2) + ' Cr';
  }

  // ─── Screen ───────────────────────────────────────────────────────

  // ─── My Performance section ───────────────────────────────────────

  function renderMyPerformance(appEl, perf) {
    appEl.appendChild(UI.sectionHeading('MY PERFORMANCE'));

    var convPct = perf.conversion ? perf.conversion.quote_to_order : 0;
    var convTarget = perf.conversion ? perf.conversion.target_qo : 75;
    var convColor = convPct >= convTarget ? 'var(--green)' : convPct >= convTarget * 0.7 ? 'var(--amber)' : 'var(--red)';

    var statsRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 16px' } }, [
      UI.statCard(perf.orders ? perf.orders.count : 0, 'Orders this FY'),
      UI.statCard(perf.orders ? ('\u20b9' + ((perf.orders.total || 0) / 100000).toFixed(1) + 'L') : '\u20b90', 'Order Value'),
      UI.statCard(perf.quotations ? perf.quotations.count : 0, 'Quotes this FY'),
      UI.statCard(perf.quotations ? ('\u20b9' + ((perf.quotations.total || 0) / 100000).toFixed(1) + 'L') : '\u20b90', 'Quote Value'),
    ]);
    appEl.appendChild(statsRow);

    var statsRow2 = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '8px 16px 0' } }, [
      UI.statCard(perf.visits_this_month || 0, 'Visits this Month'),
      UI.statCard(perf.leads_this_fy || 0, 'Leads this FY'),
      el('div', { style: { flex: '1', background: 'var(--surface-card)', borderRadius: '10px', padding: '12px', minWidth: '80px', textAlign: 'center' } }, [
        el('div', { style: { fontSize: '20px', fontWeight: '700', color: convColor } }, [
          el('span', { textContent: convPct + '%' })
        ]),
        el('div', { style: { fontSize: '11px', color: 'var(--ink-tertiary)', marginTop: '4px' } }, [
          el('span', { textContent: 'Conv. Rate' })
        ]),
        el('div', { style: { fontSize: '10px', color: 'var(--ink-tertiary)' } }, [
          el('span', { textContent: 'target: ' + convTarget + '%' })
        ])
      ])
    ]);
    appEl.appendChild(statsRow2);
  }

  window.Screens = window.Screens || {};
  window.Screens.salesTargets = function (appEl) {
    appEl.textContent = '';
    var skels = UI.skeleton(4);
    appEl.appendChild(skels);

    var perfData = null;
    var targetsData = null;

    var perfDone = api.apiCall('GET', '/api/field/my-performance').then(function (res) {
      var raw = res.data || {};
      perfData = raw.message || raw.data || raw;
    }).catch(function () { perfData = {}; });

    var targetsDone = api.apiCall('GET', '/api/field/sales-targets').then(function (res) {
      var raw = res.data || {};
      targetsData = raw.message || raw.data || raw;
    }).catch(function (err) {
      console.error('[salesTargets]', err);
    });

    Promise.all([perfDone, targetsDone]).then(function () {
      appEl.removeChild(skels);

      if (!targetsData) {
        appEl.appendChild(UI.error('Could not load sales targets'));
        return;
      }

      var d = targetsData;

      // ── My Performance ──────────────────────────────────────────
      if (perfData && (perfData.employee || perfData.orders)) {
        renderMyPerformance(appEl, perfData);
      }

      var totalTarget = d.total_target || 62800000;
      var totalActual = d.total_actual || 0;
      var totalQuotes = d.total_quotes || 0;
      var products = d.products || [];

      // ── Overall KPI ─────────────────────────────────────────────
      var overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalActual / totalTarget) * 100)) : 0;
      var overallColor = overallPct >= 75 ? 'green' : overallPct >= 50 ? 'amber' : 'red';

      var kpiSection = el('div', { style: { padding: '16px', background: 'var(--surface-card)', borderRadius: '12px', margin: '12px 16px 0' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--ink-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }, textContent: 'Annual Target' }),
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' } }, [
          el('div', { style: { fontSize: '28px', fontWeight: '800', color: 'var(--ink-primary)' }, textContent: fmtCr(totalActual) }),
          el('div', { style: { fontSize: '14px', color: 'var(--ink-tertiary)' }, textContent: 'of ' + fmtCr(totalTarget) })
        ]),
        el('div', { className: 'target-gauge', style: { height: '10px', marginBottom: '6px' } }, [
          el('div', { className: 'target-gauge-fill ' + overallColor, style: { width: overallPct + '%' } })
        ]),
        el('div', { style: { fontSize: '12px', color: 'var(--ink-tertiary)', textAlign: 'right' }, textContent: overallPct + '% achieved' })
      ]);
      appEl.appendChild(kpiSection);

      // ── Funnel ───────────────────────────────────────────────────
      // Derive funnel estimates from ABP ratios: 50% V→I, 50% I→Q, 75% Q→O
      var estOrders = totalActual > 0 ? Math.round(totalActual / ((totalTarget / 372)) ) : 0;
      // Show quotes from DB, estimate visits using funnel ratios (inverse)
      var estVisits = totalQuotes > 0 ? totalQuotes * 4 : 0; // Q→V: ×4 (50%×50% = 25%)

      appEl.appendChild(UI.sectionHeading('SALES FUNNEL'));
      var funnelCard = el('div', { style: { display: 'flex', padding: '16px', background: 'var(--surface-card)', borderRadius: '12px', margin: '0 16px', gap: '8px' } }, [
        funnelRow('Visits (est.)', estVisits, '@ 50% conv.'),
        el('div', { style: { display: 'flex', alignItems: 'center', color: 'var(--ink-tertiary)', fontSize: '16px' }, textContent: '\u203a' }),
        funnelRow('Quotes', totalQuotes, '@ 75% conv.'),
        el('div', { style: { display: 'flex', alignItems: 'center', color: 'var(--ink-tertiary)', fontSize: '16px' }, textContent: '\u203a' }),
        funnelRow('Orders', estOrders, 'this FY')
      ]);
      appEl.appendChild(funnelCard);

      // ── Product breakdown ─────────────────────────────────────────
      appEl.appendChild(UI.sectionHeading('PRODUCT-WISE TARGETS'));
      var prodSection = el('div', { style: { padding: '16px', background: 'var(--surface-card)', borderRadius: '12px', margin: '0 16px 24px' } });

      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        // Actual per-product not available yet (no SO item breakdown), show 0
        prodSection.appendChild(targetBar(p.product, p.target_amount, 0));
      }

      appEl.appendChild(prodSection);

    }).catch(function (err) {
      if (skels.parentNode) appEl.removeChild(skels);
      appEl.appendChild(UI.error('Could not load sales targets'));
      console.error('[salesTargets]', err);
    });
  };
})();
