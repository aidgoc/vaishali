/* lost-reasons.js — Why are we losing? aggregate dashboard */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  var CATEGORY_ACCENTS = {
    'Price':       '#dc2626',
    'Technical':   '#0891b2',
    'Budget':      '#d97706',
    'Other':       '#6b7280',
    'Unspecified': '#94a3b8'
  };

  function formatINR(value) {
    var num = Number(value) || 0;
    if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000)   return '₹' + (num / 100000).toFixed(1) + ' L';
    if (num >= 1000)     return '₹' + (num / 1000).toFixed(1) + ' K';
    return '₹' + num.toLocaleString('en-IN');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Period chips ─────────────────────────────────────────────
  function buildPeriodChips(active, onChange) {
    var periods = [
      { key: '30',  label: '30 days' },
      { key: '90',  label: '90 days' },
      { key: '365', label: '1 year' },
      { key: 'all', label: 'All time' }
    ];
    var wrap = el('div', { className: 'lost-period-chips' });
    periods.forEach(function (p) {
      var chip = el('button', {
        className: 'lost-chip' + (p.key === active ? ' active' : ''),
        type: 'button',
        textContent: p.label,
        onclick: function () { onChange(p.key); }
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  // ── Summary header ───────────────────────────────────────────
  function buildHero(total, fromDate, period) {
    var sub = period === 'all' ? 'All time'
            : period === '30'  ? 'Last 30 days'
            : period === '365' ? 'Last 12 months'
            : 'Last 90 days';
    if (fromDate) sub += ' · since ' + fmtDate(fromDate);

    return el('div', { className: 'lost-hero' }, [
      el('div', { className: 'lost-hero-amount', textContent: formatINR(total.amount) }),
      el('div', { className: 'lost-hero-count', textContent: total.count + ' lost quotation' + (total.count === 1 ? '' : 's') }),
      el('div', { className: 'lost-hero-sub', textContent: sub })
    ]);
  }

  // ── Category breakdown ───────────────────────────────────────
  function buildCategoryBreakdown(summary, totalAmount) {
    if (!summary || summary.length === 0) {
      return el('div', { className: 'lost-empty', textContent: 'No lost quotations in this period.' });
    }

    var card = el('div', { className: 'lost-category-card' });
    card.appendChild(el('div', { className: 'lost-section-title', textContent: 'By reason' }));

    summary.forEach(function (row) {
      var pct = totalAmount > 0 ? Math.round((row.amount / totalAmount) * 100) : 0;
      var accent = CATEGORY_ACCENTS[row.category] || '#6b7280';

      var head = el('div', { className: 'lost-cat-head' }, [
        el('span', { className: 'lost-cat-dot', style: 'background:' + accent }),
        el('span', { className: 'lost-cat-name', textContent: row.category }),
        el('span', { className: 'lost-cat-stats',
                     textContent: row.count + ' · ' + formatINR(row.amount) + ' · ' + pct + '%' })
      ]);

      var fill = el('div', { className: 'lost-cat-fill' });
      fill.style.width = pct + '%';
      fill.style.background = accent;
      var bar = el('div', { className: 'lost-cat-bar' }, [fill]);

      card.appendChild(el('div', { className: 'lost-cat-row' }, [head, bar]));
    });
    return card;
  }

  // ── By owner table ──────────────────────────────────────────
  function buildByOwner(byOwner) {
    if (!byOwner || byOwner.length === 0) return null;

    var card = el('div', { className: 'lost-owner-card' });
    card.appendChild(el('div', { className: 'lost-section-title', textContent: 'By owner' }));

    byOwner.slice(0, 10).forEach(function (row) {
      card.appendChild(el('div', { className: 'lost-owner-row' }, [
        UI.avatar(row.owner_name || row.owner, 32),
        el('div', { className: 'lost-owner-meta' }, [
          el('div', { className: 'lost-owner-name', textContent: row.owner_name || row.owner }),
          el('div', { className: 'lost-owner-sub',
                      textContent: row.count + ' lost · ' + formatINR(row.amount) })
        ])
      ]));
    });
    return card;
  }

  // ── Recent list ──────────────────────────────────────────────
  function buildRecent(recent) {
    if (!recent || recent.length === 0) return null;

    var wrap = el('div');
    wrap.appendChild(UI.sectionHeading('Recent (' + recent.length + ')'));

    recent.forEach(function (q) {
      var accent = CATEGORY_ACCENTS[q.lost_reason_category] || '#6b7280';
      var sub = fmtDate(q.transaction_date) + ' · ' + formatINR(q.grand_total);
      if (q.owner_name) sub += ' · ' + q.owner_name;

      var card = el('div', { className: 'lost-recent-card' }, [
        el('div', { className: 'lost-recent-edge', style: 'background:' + accent }),
        el('div', { className: 'lost-recent-body' }, [
          el('div', { className: 'lost-recent-head' }, [
            el('span', { className: 'lost-recent-title', textContent: q.customer_name || q.name }),
            el('span', { className: 'lost-recent-pill',
                         style: 'color:' + accent + ';border-color:' + accent + '40',
                         textContent: q.lost_reason_category })
          ]),
          el('div', { className: 'lost-recent-sub', textContent: sub }),
          q.lost_remark
            ? el('div', { className: 'lost-recent-remark', textContent: '“' + q.lost_remark + '”' })
            : null
        ])
      ]);

      card.addEventListener('click', function () {
        location.hash = '#/quotation/' + q.name;
      });
      wrap.appendChild(card);
    });
    return wrap;
  }

  // ── Main render ──────────────────────────────────────────────
  window.Screens = window.Screens || {};
  window.Screens.lostReasons = function (appEl) {
    var period = '90';

    function load() {
      appEl.textContent = '';
      appEl.appendChild(buildPeriodChips(period, function (next) {
        period = next;
        load();
      }));

      var skel = UI.skeleton(4);
      appEl.appendChild(skel);

      api.apiCall('GET', '/api/field/lost-reasons?period=' + encodeURIComponent(period))
        .then(function (res) {
          appEl.textContent = '';
          appEl.appendChild(buildPeriodChips(period, function (next) { period = next; load(); }));

          if (!res || res.error || !res.data) {
            appEl.appendChild(UI.error('Failed to load: ' + ((res && res.error) || 'no response')));
            return;
          }
          var raw = res.data || {};
          var data = raw.message || raw.data || raw;

          var total = data.total_lost || { count: 0, amount: 0 };
          appEl.appendChild(buildHero(total, data.from_date, data.period || period));

          if (total.count === 0) {
            appEl.appendChild(el('div', { className: 'lost-empty',
              textContent: 'No lost quotations in this period — keep it that way.' }));
            return;
          }

          appEl.appendChild(buildCategoryBreakdown(data.summary || [], total.amount || 0));
          var byOwner = buildByOwner(data.by_owner || []);
          if (byOwner) appEl.appendChild(byOwner);
          var recent = buildRecent(data.recent || []);
          if (recent) appEl.appendChild(recent);
        })
        .catch(function (err) {
          appEl.textContent = '';
          appEl.appendChild(buildPeriodChips(period, function (next) { period = next; load(); }));
          appEl.appendChild(UI.error('Failed to load: ' + (err && err.message ? err.message : 'unknown')));
        });
    }

    load();
  };
})();
