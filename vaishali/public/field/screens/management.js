/* management.js — Director-only KPI dashboard for the Field PWA */
(function () {
  'use strict';
  var api = window.fieldAPI;
  var el = UI.el;
  window.Screens = window.Screens || {};

  function rupees(n) {
    n = Number(n || 0);
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function tile(label, value, opts) {
    opts = opts || {};
    return el('div', {
      className: 'mgmt-tile',
      onClick: opts.onClick || null,
      style: {
        padding: '14px',
        background: 'var(--surface-1, #F8F8F8)',
        borderRadius: '12px',
        cursor: opts.onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: '4px'
      }
    }, [
      el('div', {
        textContent: value,
        style: { font: '600 22px/1.1 system-ui', letterSpacing: '-0.02em', color: opts.color || 'var(--ink-primary)' }
      }),
      el('div', {
        textContent: label,
        style: { font: '500 12px/1.3 system-ui', color: 'var(--ink-tertiary, #6B6B70)' }
      })
    ]);
  }

  function section(title, rows) {
    var wrap = el('div', { style: { marginTop: '18px' } });
    wrap.appendChild(el('div', {
      textContent: title,
      style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', textTransform: 'none', margin: '0 0 8px 4px' }
    }));
    var grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
    for (var i = 0; i < rows.length; i++) grid.appendChild(rows[i]);
    wrap.appendChild(grid);
    return wrap;
  }

  function sparkline(points, height) {
    height = height || 56;
    var width = 320;
    if (!points || points.length < 2) {
      return el('div', {
        textContent: 'No data',
        style: { color: 'var(--ink-tertiary, #6B6B70)', font: '500 12px/1 system-ui', padding: '12px' }
      });
    }
    var values = points.map(function (p) { return p.v; });
    var max = Math.max.apply(null, values);
    var min = 0;
    var stepX = width / (points.length - 1);
    var path = points.map(function (p, i) {
      var x = i * stepX;
      var y = height - ((p.v - min) / (max - min || 1)) * (height - 4) - 2;
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.style.display = 'block';
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#388E3C');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    return svg;
  }

  window.Screens.management = function (appEl) {
    var content = el('div');
    appEl.appendChild(content);
    if (UI.pageHeader) {
      content.appendChild(UI.pageHeader('Management', 'Live KPIs across cash, sales, people and service.'));
    }
    var skel = UI.skeleton(6);
    content.appendChild(skel);

    api.apiCall('GET', '/api/field/management-dashboard').then(function (res) {
      skel.remove();
      if (res.error || (res.status && res.status >= 400)) {
        var msg = (res.data && res.data.message) || 'Could not load dashboard';
        content.appendChild(UI.error(msg));
        return;
      }
      var raw = res.data || {};
      var d = raw.message || raw.data || raw;
      if (!d || !d.cash) {
        content.appendChild(UI.empty('alert', 'No data returned.'));
        return;
      }

      // Cash position
      if (d.cash_position) {
        var cashTotalTile = tile('Cash & bank balance', rupees(d.cash_position.total),
          { color: '#1B5E20' });
        cashTotalTile.style.gridColumn = '1 / -1';
        var cashSection = el('div', { style: { marginTop: '18px' } });
        cashSection.appendChild(el('div', {
          textContent: 'Cash position',
          style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', margin: '0 0 8px 4px' }
        }));
        var cashGrid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
        cashGrid.appendChild(cashTotalTile);
        cashSection.appendChild(cashGrid);
        if (d.cash_position.by_account && d.cash_position.by_account.length) {
          var bdWrap = el('div', { style: {
            marginTop: '8px', padding: '12px', background: 'var(--surface-1, #F8F8F8)',
            borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px'
          }});
          for (var bi = 0; bi < d.cash_position.by_account.length; bi++) {
            var acc = d.cash_position.by_account[bi];
            bdWrap.appendChild(el('div', { style: {
              display: 'flex', justifyContent: 'space-between', font: '400 13px/1.3 system-ui'
            }}, [
              el('span', { textContent: acc.name + ' · ' + acc.type,
                style: { color: 'var(--ink-secondary, #5B5B61)' }}),
              el('span', { textContent: rupees(acc.balance),
                style: { color: acc.balance < 0 ? '#D32F2F' : 'var(--ink-primary)', fontWeight: '500' }})
            ]));
          }
          cashSection.appendChild(bdWrap);
        }
        content.appendChild(cashSection);
      }

      // Cash & Receivables
      content.appendChild(section('Cash & receivables', [
        tile('Outstanding AR', rupees(d.cash.outstanding_ar), { color: '#C2185B', onClick: function () { location.hash = '#/billing'; } }),
        tile('AR overdue 30d+', rupees(d.cash.ar_over_30d), { color: '#D32F2F' }),
        tile('Unpaid invoices', d.cash.unpaid_invoices, {}),
        tile('Draft invoices', d.cash.draft_invoices, { color: '#FFA000' })
      ]));

      // Receivables aging chart
      if (d.ar_aging && d.ar_aging.length) {
        var totalAR = 0;
        for (var ai = 0; ai < d.ar_aging.length; ai++) totalAR += d.ar_aging[ai].amount;
        if (totalAR > 0) {
          var agingWrap = el('div', { style: {
            marginTop: '12px', padding: '14px', background: 'var(--surface-1, #F8F8F8)', borderRadius: '12px'
          }});
          agingWrap.appendChild(el('div', { textContent: 'Receivables aging',
            style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginBottom: '10px' }}));
          var palette = ['#43A047', '#FBC02D', '#FB8C00', '#E64A19', '#C62828'];
          for (var pi = 0; pi < d.ar_aging.length; pi++) {
            var bucket = d.ar_aging[pi];
            var pct = totalAR > 0 ? (bucket.amount / totalAR * 100) : 0;
            agingWrap.appendChild(el('div', { style: { marginBottom: '6px' }}, [
              el('div', { style: { display: 'flex', justifyContent: 'space-between', font: '400 12px/1.3 system-ui', marginBottom: '3px' }}, [
                el('span', { textContent: bucket.bucket + (bucket.count ? ' (' + bucket.count + ')' : ''),
                  style: { color: 'var(--ink-secondary, #5B5B61)' }}),
                el('span', { textContent: rupees(bucket.amount), style: { color: 'var(--ink-primary)', fontWeight: '500' }})
              ]),
              el('div', { style: { height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '3px', overflow: 'hidden' }}, [
                el('div', { style: { height: '100%', width: pct.toFixed(1) + '%', background: palette[pi % palette.length] }})
              ])
            ]));
          }
          content.appendChild(agingWrap);
        }
      }

      // Top 5 overdue invoices — actionable, drill-down opens desk SI
      if (d.top_overdue && d.top_overdue.length) {
        var ovWrap = el('div', { style: {
          marginTop: '12px', padding: '14px', background: 'var(--surface-1, #F8F8F8)', borderRadius: '12px'
        }});
        ovWrap.appendChild(el('div', { textContent: 'Top overdue invoices',
          style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginBottom: '8px' }}));
        for (var oi = 0; oi < d.top_overdue.length; oi++) {
          var inv = d.top_overdue[oi];
          (function (invl) {
            var sevColor = invl.days_overdue >= 90 ? '#C62828' : invl.days_overdue >= 60 ? '#E64A19' : '#FB8C00';
            ovWrap.appendChild(el('div', {
              onClick: function () { window.open('/app/sales-invoice/' + invl.name, '_blank'); },
              style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer'
              }
            }, [
              el('div', null, [
                el('div', { textContent: invl.customer_name,
                  style: { font: '500 13px/1.3 system-ui', color: 'var(--ink-primary)' }}),
                el('div', { textContent: invl.name + ' · ' + invl.days_overdue + 'd overdue',
                  style: { font: '400 11px/1.3 system-ui', color: sevColor }})
              ]),
              el('div', { textContent: rupees(invl.outstanding),
                style: { font: '600 14px/1 system-ui', color: 'var(--ink-primary)', letterSpacing: '-0.01em' }})
            ]));
          })(inv);
        }
        content.appendChild(ovWrap);
      }

      // Sales & Pipeline
      content.appendChild(section('Sales & pipeline', [
        tile('Sales MTD', rupees(d.sales.mtd_so_amount), { color: '#388E3C' }),
        tile('Quotations MTD', d.sales.mtd_quotations, { color: '#1976D2' }),
        tile('New leads MTD', d.sales.mtd_new_leads, { color: '#0097A7' }),
        tile('Open opportunities', d.sales.open_opportunities, { color: '#7B1FA2' })
      ]));

      // Sparkline for sales
      var sparkWrap = el('div', { style: { marginTop: '12px', padding: '12px', background: 'var(--surface-1, #F8F8F8)', borderRadius: '12px' } });
      sparkWrap.appendChild(el('div', { textContent: 'Sales — last 30 days', style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginBottom: '6px' } }));
      sparkWrap.appendChild(sparkline(d.sales_30d || [], 60));
      content.appendChild(sparkWrap);

      // People & Approvals
      content.appendChild(section('People & approvals', [
        tile('Pending advances', d.people.pending_advances, { color: '#F57C00', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Pending leaves', d.people.pending_leaves, { color: '#FBC02D', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Pending expenses', d.people.pending_expenses, { color: '#F9A825', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Visits today', d.people.visits_today, { color: '#00838F' })
      ]));
      content.appendChild(section('Advances paid out MTD', [
        tile('Advances approved (₹) MTD', rupees(d.people.advances_approved_mtd), { color: '#388E3C' })
      ]));

      // Service & Operations
      content.appendChild(section('Service & operations', [
        tile('Open breakdowns', d.service.open_breakdowns, { color: '#C62828' }),
        tile('Open complaints', d.service.open_complaints, { color: '#AD1457' }),
        tile('Open material requests', d.service.open_material_requests, { color: '#5E35B1' }),
        tile('Active SOs (to deliver)', d.service.active_sales_orders, { color: '#283593' })
      ]));

      // As-of footer
      content.appendChild(el('div', {
        textContent: 'As of ' + (d.as_of || 'now'),
        style: { marginTop: '16px', font: '400 11px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', textAlign: 'center' }
      }));
    }).catch(function (err) {
      skel.remove();
      content.appendChild(UI.error('Network error: ' + (err.message || err)));
    });
  };
})();
