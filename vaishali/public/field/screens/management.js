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

  // Module-level state so the switcher persists across re-renders
  var _companies = null;
  var _selected = null;  // null = use server default, "ALL" = consolidated

  function unwrap(raw) {
    if (!raw) return null;
    var d = raw.data || {};
    return d.message || d.data || d || null;
  }

  function rebuildContent(content, sel) {
    // Wipe the dashboard portion (keep nothing — caller re-adds header + switcher)
    content.textContent = '';
  }

  window.Screens.management = function (appEl) {
    var root = el('div');
    appEl.appendChild(root);
    if (UI.pageHeader) {
      root.appendChild(UI.pageHeader('Management', 'Live KPIs — cash, sales, purchase, people, service, ops.'));
    }
    // Company switcher row — populated after fetch
    var switcherBar = el('div', { style: { marginTop: '8px', marginBottom: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } });
    root.appendChild(switcherBar);
    var body = el('div');
    root.appendChild(body);

    function renderSwitcher() {
      switcherBar.textContent = '';
      switcherBar.appendChild(el('span', {
        textContent: 'Company:',
        style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginRight: '4px' }
      }));
      var opts = [{ key: 'ALL', label: 'All' }].concat((_companies || []).map(function (c) {
        return { key: c.name, label: c.abbr || c.name };
      }));
      for (var i = 0; i < opts.length; i++) {
        (function (opt) {
          var active = (_selected === null && opt.key === 'ALL') || _selected === opt.key
                     || (_selected === '' && opt.key === 'ALL');
          var pill = el('button', {
            textContent: opt.label,
            onClick: function () { setCompany(opt.key); },
            style: {
              padding: '6px 12px', borderRadius: '999px', border: 'none',
              background: active ? '#1F2937' : 'var(--surface-1, #F8F8F8)',
              color: active ? '#fff' : 'var(--ink-secondary, #5B5B61)',
              font: '500 12px/1.2 system-ui', cursor: 'pointer'
            }
          });
          switcherBar.appendChild(pill);
        })(opts[i]);
      }
    }

    function setCompany(companyKey) {
      _selected = (companyKey === 'ALL') ? null : companyKey;
      renderSwitcher();
      // Persist to user-default so the desk dashboards reflect the same choice
      api.apiCall('POST', '/api/field/default-company', { company: companyKey })
        .catch(function () { /* non-fatal; the dashboard already refreshes below */ });
      load();
    }

    function load() {
      body.textContent = '';
      var skel = UI.skeleton(6);
      body.appendChild(skel);
      var qs = _selected === null ? '' : '?company=' + encodeURIComponent(_selected);
      api.apiCall('GET', '/api/field/management-dashboard' + qs).then(function (res) {
        body.textContent = '';
        if (res.error || (res.status && res.status >= 400)) {
          body.appendChild(UI.error((res.data && res.data.message) || 'Could not load dashboard'));
          return;
        }
        var d = unwrap(res);
        if (!d || !d.cash) {
          body.appendChild(UI.empty('alert', 'No data returned.'));
          return;
        }
        renderDashboard(body, d);
      }).catch(function (err) {
        body.textContent = '';
        body.appendChild(UI.error('Network error: ' + (err.message || err)));
      });
    }

    // Load companies once, then load the dashboard
    if (_companies === null) {
      api.apiCall('GET', '/api/field/companies').then(function (res) {
        _companies = unwrap(res) || [];
        renderSwitcher();
        load();
      });
    } else {
      renderSwitcher();
      load();
    }
  };

  function renderDashboard(content, d) {

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
      var quotTotal = (d.sales.mtd_won_quotations || 0) + (d.sales.mtd_lost_quotations || 0);
      var winRate = quotTotal > 0 ? Math.round((d.sales.mtd_won_quotations || 0) / quotTotal * 100) : null;
      content.appendChild(section('Sales & pipeline', [
        tile('Sales MTD', rupees(d.sales.mtd_so_amount), { color: '#388E3C' }),
        tile('Sales orders MTD', d.sales.mtd_so_count || 0, { color: '#2E7D32' }),
        tile('Quotations MTD ₹', rupees(d.sales.mtd_quotation_amount), { color: '#1565C0' }),
        tile('Quotations MTD', d.sales.mtd_quotations, { color: '#1976D2' }),
        tile('New leads MTD', d.sales.mtd_new_leads, { color: '#0097A7' }),
        tile('Open opportunities', d.sales.open_opportunities, { color: '#7B1FA2' }),
        tile('Quotation win-rate', winRate != null ? winRate + '%' : '—', { color: '#33691E' }),
        tile('Won / Lost MTD', (d.sales.mtd_won_quotations || 0) + ' / ' + (d.sales.mtd_lost_quotations || 0), { color: '#37474F' })
      ]));

      // Sparkline for sales
      var sparkWrap = el('div', { style: { marginTop: '12px', padding: '12px', background: 'var(--surface-1, #F8F8F8)', borderRadius: '12px' } });
      sparkWrap.appendChild(el('div', { textContent: 'Sales — last 30 days', style: { font: '500 12px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', marginBottom: '6px' } }));
      sparkWrap.appendChild(sparkline(d.sales_30d || [], 60));
      content.appendChild(sparkWrap);

      // Purchase
      if (d.purchase) {
        content.appendChild(section('Purchase & payables', [
          tile('PO MTD', rupees(d.purchase.mtd_po_amount), { color: '#4527A0' }),
          tile('Pending POs', d.purchase.pending_pos, { color: '#5E35B1' }),
          tile('Outstanding AP', rupees(d.purchase.outstanding_ap), { color: '#6A1B9A' }),
          tile('Unpaid bills', d.purchase.unpaid_pinvoices, { color: '#8E24AA' }),
          tile('Draft P. invoices', d.purchase.draft_pinvoices, { color: '#FFA000' }),
          tile('Material requests', d.purchase.open_material_requests, { color: '#7B1FA2' })
        ]));
      }

      // Payments
      if (d.payments) {
        content.appendChild(section('Payments MTD', [
          tile('Received', rupees(d.payments.mtd_pe_in), { color: '#2E7D32' }),
          tile('Paid out', rupees(d.payments.mtd_pe_out), { color: '#C62828' })
        ]));
      }

      // People & HR
      content.appendChild(section('People & HR', [
        tile('Active employees', d.people.active_employees || 0, { color: '#1565C0' }),
        tile('On leave today', d.people.on_leave_today || 0, { color: '#FBC02D' }),
        tile('Late marks today', d.people.late_marks_today || 0, { color: '#FB8C00' }),
        tile('Visits today', d.people.visits_today, { color: '#00838F' })
      ]));
      content.appendChild(section('Approvals queue', [
        tile('Pending advances', d.people.pending_advances, { color: '#F57C00', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Pending leaves', d.people.pending_leaves, { color: '#FBC02D', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Pending expenses', d.people.pending_expenses, { color: '#F9A825', onClick: function () { location.hash = '#/approvals'; } }),
        tile('Advances paid MTD', rupees(d.people.advances_approved_mtd), { color: '#388E3C' })
      ]));

      // Service
      content.appendChild(section('Service & maintenance', [
        tile('Open breakdowns', d.service.open_breakdowns, { color: '#C62828' }),
        tile('Open complaints', d.service.open_complaints, { color: '#AD1457' }),
        tile('Open service calls', d.service.open_service_calls || 0, { color: '#6D4C41' }),
        tile('Warranty expiring 30d', d.service.amc_expiring_30d || 0, { color: '#BF360C' })
      ]));

      // Operations
      if (d.operations) {
        content.appendChild(section('Operations', [
          tile('SOs to deliver', d.operations.active_sales_orders, { color: '#283593' }),
          tile('SO value to deliver', rupees(d.operations.active_so_amount), { color: '#1A237E' }),
          tile('Draft delivery notes', d.operations.pending_delivery_notes, { color: '#3949AB' }),
          tile('Active work orders', d.operations.active_work_orders, { color: '#303F9F' }),
          tile('Work orders done MTD', d.operations.completed_work_orders_mtd, { color: '#388E3C' })
        ]));
      }

      // As-of footer
      content.appendChild(el('div', {
        textContent: 'As of ' + (d.as_of || 'now') + (d.company ? ' · ' + d.company : ' · All companies'),
        style: { marginTop: '16px', font: '400 11px/1 system-ui', color: 'var(--ink-tertiary, #6B6B70)', textAlign: 'center' }
      }));
  }
})();
