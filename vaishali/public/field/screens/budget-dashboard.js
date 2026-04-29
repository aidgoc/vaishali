/* budget-dashboard.js — Expense Budget Dashboard for DSPL Field PWA
   Three role-based views: field staff (personal), manager (team), admin (all verticals).
*/
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  window.Screens = window.Screens || {};

  // ── Helpers ──────────────────────────────────────────────────────

  function formatCurrency(amount) {
    if (!amount) return '₹0';
    if (amount >= 10000000) return '₹' + (amount / 10000000).toFixed(2) + 'Cr';
    if (amount >= 100000) return '₹' + (amount / 100000).toFixed(1) + 'L';
    return '₹' + Number(amount).toLocaleString('en-IN');
  }

  function pctColor(pct) {
    if (pct >= 100) return '#dc2626';
    if (pct >= 80) return '#d97706';
    return '#059669';
  }

  function statusPill(status) {
    var colors = { exceeded: 'red', warning: 'yellow', ok: 'green' };
    return UI.pill(status, colors[status] || 'gray');
  }

  function progressBar(pct, color) {
    var width = Math.min(pct, 100);
    return el('div', { style: { height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginTop: '6px' } }, [
      el('div', { style: { height: '100%', width: width + '%', background: color || pctColor(pct), borderRadius: '4px' } })
    ]);
  }

  // ── Main Entry Point ────────────────────────────────────────────

  window.Screens.budgetDashboard = function (appEl) {
    var tier = Auth.getNavTier();
    appEl.appendChild(UI.skeleton(4));

    api.apiCall('GET', '/api/field/budget-summary').then(function (res) {
      appEl.textContent = '';

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load budget data.'));
        return;
      }

      var data = res.data.message || res.data;

      if (tier === 'admin' && data.verticals) {
        renderAdminView(appEl, data);
      } else if (tier === 'manager' && data.vertical) {
        renderManagerView(appEl, data);
      } else {
        renderFieldView(appEl, data);
      }
    }).catch(function () {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Could not load budget data.'));
    });
  };

  // ── Field Staff View ────────────────────────────────────────────

  function renderFieldView(appEl, data) {
    var b = data.my_budget || {};

    if (!b.monthly_cap) {
      appEl.appendChild(UI.empty('receipt', 'No budget cap set for your division.'));
      appEl.appendChild(UI.btn('New expense', {
        type: 'primary', block: true, icon: 'plus',
        onClick: function () { location.hash = '#/expense/new'; }
      }));
      return;
    }

    // Monthly progress card
    var color = pctColor(b.pct_month);
    var monthCard = UI.card([
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
        el('div', { style: { fontSize: '22px', fontWeight: '700', letterSpacing: '-0.04em', color: color } },
          [document.createTextNode(formatCurrency(b.spent_this_month))]),
        el('div', { style: { fontSize: '13px', color: '#64748b' } },
          [document.createTextNode('/ ' + formatCurrency(b.monthly_cap))])
      ]),
      progressBar(b.pct_month, color),
      el('div', { style: { fontSize: '12px', color: color, marginTop: '4px', fontWeight: '500' } },
        [document.createTextNode(
          b.status === 'exceeded' ? 'Monthly cap exceeded' :
          b.status === 'warning' ? 'Approaching monthly limit' :
          Math.round(b.pct_month) + '% of monthly budget used'
        )])
    ]);
    appEl.appendChild(monthCard);

    // Expense type breakdown
    if (b.by_type && b.by_type.length > 0) {
      appEl.appendChild(UI.sectionHeading('This month by type'));
      for (var i = 0; i < b.by_type.length; i++) {
        appEl.appendChild(UI.listCard({
          title: b.by_type[i].type || 'Other',
          right: el('span', { style: { fontWeight: '600', fontVariantNumeric: 'tabular-nums' } },
            [document.createTextNode(formatCurrency(b.by_type[i].amount))])
        }));
      }
    }

    // YTD progress
    if (b.annual_budget) {
      appEl.appendChild(UI.sectionHeading('Year to date'));
      var ytdColor = pctColor(b.pct_ytd);
      appEl.appendChild(UI.card([
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '14px' } }, [
          el('span', { style: { fontWeight: '600' } }, [document.createTextNode(formatCurrency(b.spent_ytd))]),
          el('span', { style: { color: '#64748b' } }, [document.createTextNode('/ ' + formatCurrency(b.annual_budget))])
        ]),
        progressBar(b.pct_ytd, ytdColor),
        el('div', { style: { fontSize: '11px', color: '#94a3b8', marginTop: '4px' } },
          [document.createTextNode(Math.round(b.pct_ytd) + '% of annual budget')])
      ]));
    }

    // New expense button
    appEl.appendChild(el('div', { style: { marginTop: '16px' } }, [
      UI.btn('New Expense', {
        type: 'primary', block: true,
        onClick: function () { location.hash = '#/expense/new'; }
      })
    ]));
  }

  // ── Manager View ────────────────────────────────────────────────

  function renderManagerView(appEl, data) {
    var v = data.vertical || {};
    var b = data.my_budget || {};

    // KPI row
    appEl.appendChild(UI.kpiRow([
      { value: formatCurrency(v.spent_ytd), label: 'YTD Spend' },
      { value: String(v.employee_count || 0), label: 'Team Size' },
      { value: String(v.over_cap_count || 0), label: 'Over Cap' },
      { value: v.pct ? Math.round(v.pct) + '%' : '--', label: 'Budget Used' }
    ]));

    // Vertical budget bar
    if (v.annual_budget) {
      var vColor = pctColor(v.pct || 0);
      appEl.appendChild(UI.card([
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, [
          el('span', { style: { fontWeight: '600', color: vColor } }, [document.createTextNode(v.name + ' — ' + formatCurrency(v.spent_ytd))]),
          el('span', { style: { color: '#64748b' } }, [document.createTextNode('Budget: ' + formatCurrency(v.annual_budget))])
        ]),
        progressBar(v.pct || 0, vColor)
      ]));
    }

    // Team members
    appEl.appendChild(UI.sectionHeading('Team — this month'));
    var emps = v.employees || [];
    if (emps.length === 0) {
      appEl.appendChild(UI.empty('user', 'No expense data for this month.'));
    } else {
      for (var i = 0; i < emps.length; i++) {
        (function (emp) {
          var warnIcon = emp.status === 'exceeded' ? '⚠ ' : emp.status === 'warning' ? '⚡ ' : '';
          appEl.appendChild(UI.listCard({
            title: warnIcon + emp.name,
            sub: formatCurrency(emp.spent_month) + ' / ' + formatCurrency(emp.cap),
            right: statusPill(emp.status),
            onClick: function () {
              location.hash = '#/expense';  // TODO: deep link to employee detail
            }
          }));
        })(emps[i]);
      }
    }

    // Monthly trend
    if (data.trend && data.trend.length > 0) {
      appEl.appendChild(UI.sectionHeading('Monthly trend'));
      var maxActual = 0;
      for (var t = 0; t < data.trend.length; t++) {
        if (data.trend[t].actual > maxActual) maxActual = data.trend[t].actual;
      }
      var trendCard = UI.card([]);
      for (var t = 0; t < data.trend.length; t++) {
        var pct = maxActual ? (data.trend[t].actual / maxActual * 100) : 0;
        trendCard.firstChild.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } }, [
          el('div', { style: { width: '50px', fontSize: '11px', color: '#64748b', textAlign: 'right' } },
            [document.createTextNode(data.trend[t].month)]),
          el('div', { style: { flex: '1', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' } }, [
            el('div', { style: { height: '100%', width: pct + '%', background: '#2563eb', borderRadius: '4px' } })
          ]),
          el('div', { style: { width: '55px', fontSize: '11px', fontWeight: '500', textAlign: 'right' } },
            [document.createTextNode(formatCurrency(data.trend[t].actual))])
        ]));
      }
      appEl.appendChild(trendCard);
    }

    // Link to personal view
    appEl.appendChild(el('div', { style: { marginTop: '16px', textAlign: 'center' } }, [
      el('a', {
        href: '#',
        style: { fontSize: '13px', color: '#2563eb', textDecoration: 'none' },
        onClick: function (e) {
          e.preventDefault();
          appEl.textContent = '';
          renderFieldView(appEl, data);
        }
      }, [document.createTextNode('View my personal budget →')])
    ]));
  }

  // ── Admin View ──────────────────────────────────────────────────

  function renderAdminView(appEl, data) {
    var er = data.expense_to_revenue || {};
    var verts = data.verticals || [];

    // KPI row
    appEl.appendChild(UI.kpiRow([
      { value: formatCurrency(er.total_expenses), label: 'Total Expenses' },
      { value: formatCurrency(er.total_revenue), label: 'Revenue Target' },
      { value: er.ratio_pct ? er.ratio_pct + '%' : '--', label: 'Expense/Rev' },
      { value: String(verts.reduce(function (s, v) { return s + v.employee_count; }, 0)), label: 'Employees' }
    ]));

    // Vertical cards
    appEl.appendChild(UI.sectionHeading('By vertical'));
    var vertColors = { EPS: '#2563eb' };

    for (var i = 0; i < verts.length; i++) {
      (function (v) {
        var color = vertColors[v.name] || '#6b7280';
        appEl.appendChild(UI.card([
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('div', {}, [
              UI.pill(v.name, color),
              el('span', { style: { marginLeft: '8px', fontSize: '12px', color: '#64748b' } },
                [document.createTextNode(v.employee_count + ' employees')])
            ]),
            el('div', { style: { fontWeight: '700', fontSize: '15px', color: color } },
              [document.createTextNode(formatCurrency(v.spent_ytd))])
          ]),
          progressBar(v.pct || 0, color),
          el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' } }, [
            document.createTextNode('Budget: ' + formatCurrency(v.annual_budget)),
            document.createTextNode(Math.round(v.pct || 0) + '% used · ' + v.over_cap_count + ' over cap')
          ])
        ]));
      })(verts[i]);
    }

    // Tabs: Trend | Top Spenders
    var activeTab = 'trend';

    function renderTabContent(container) {
      container.textContent = '';
      if (activeTab === 'trend') {
        renderTrend(container, data.trend || []);
      } else {
        renderTopSpenders(container, data.top_spenders || []);
      }
    }

    var tabContent = el('div', {});
    appEl.appendChild(UI.tabs(
      [{ label: 'Trend', value: 'trend' }, { label: 'Top Spenders', value: 'spenders' }],
      activeTab,
      function (val) { activeTab = val; renderTabContent(tabContent); }
    ));
    appEl.appendChild(tabContent);
    renderTabContent(tabContent);

    // Set Budgets button (admin only)
    appEl.appendChild(el('div', { style: { marginTop: '16px' } }, [
      UI.btn('Set Budgets', {
        type: 'outline', block: true,
        onClick: function () { showBudgetSheet(appEl); }
      })
    ]));
  }

  // ── Trend sub-view ──────────────────────────────────────────────

  function renderTrend(container, trend) {
    if (!trend || trend.length === 0) {
      container.appendChild(UI.empty('bar-chart', 'No expense data yet.'));
      return;
    }
    var maxVal = 0;
    for (var i = 0; i < trend.length; i++) {
      if (trend[i].actual > maxVal) maxVal = trend[i].actual;
    }
    for (var i = 0; i < trend.length; i++) {
      var pct = maxVal ? (trend[i].actual / maxVal * 100) : 0;
      container.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } }, [
        el('div', { style: { width: '50px', fontSize: '11px', color: '#64748b', textAlign: 'right' } },
          [document.createTextNode(trend[i].month)]),
        el('div', { style: { flex: '1', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' } }, [
          el('div', { style: { height: '100%', width: pct + '%', background: '#2563eb', borderRadius: '4px' } })
        ]),
        el('div', { style: { width: '55px', fontSize: '11px', fontWeight: '500', textAlign: 'right' } },
          [document.createTextNode(formatCurrency(trend[i].actual))])
      ]));
    }
  }

  // ── Top Spenders sub-view ───────────────────────────────────────

  function renderTopSpenders(container, spenders) {
    if (!spenders || spenders.length === 0) {
      container.appendChild(UI.empty('user', 'No expense data yet.'));
      return;
    }
    for (var i = 0; i < spenders.length; i++) {
      var s = spenders[i];
      container.appendChild(UI.listCard({
        title: (i + 1) + '. ' + s.name,
        sub: s.vertical || '',
        right: el('span', { style: { fontWeight: '700', fontVariantNumeric: 'tabular-nums' } },
          [document.createTextNode(formatCurrency(s.spent_ytd))])
      }));
    }
  }

  // ── Budget CRUD Bottom Sheet (Admin) ────────────────────────────

  function showBudgetSheet(appEl) {
    var fyInput = UI.textInput('e.g. 2026-2027');
    fyInput.value = '2026-2027';

    var vertOptions = [
      { value: '', text: 'Select vertical...' },
      { value: 'EPS', text: 'EPS' }
    ];
    var vertSelect = UI.select('Vertical', vertOptions, '');

    var empInput = UI.textInput('Leave blank for vertical-level budget');
    var capInput = UI.textInput('Monthly cap (₹)');
    capInput.type = 'number';
    capInput.min = '0';

    var saveBtn = UI.btn('Save Budget', {
      type: 'primary', block: true,
      onClick: function () {
        var fy = fyInput.value.trim();
        var vert = vertSelect.value;
        var cap = parseFloat(capInput.value);
        var emp = empInput.value.trim();

        if (!fy || !vert || !cap || cap <= 0) {
          UI.toast('Please fill all required fields.', 'danger');
          return;
        }

        saveBtn._setLoading(true, 'Saving...');
        api.apiCall('POST', '/api/field/budget', {
          fiscal_year: fy,
          vertical: vert,
          monthly_cap: cap,
          employee: emp || undefined
        }).then(function (res) {
          saveBtn._setLoading(false);
          if (res.error) {
            UI.toast('Failed: ' + (res.error || 'Unknown'), 'danger');
          } else {
            var result = res.data.message || res.data;
            UI.toast('Budget ' + (result.action || 'saved') + '!', 'success');
          }
        }).catch(function () {
          saveBtn._setLoading(false);
          UI.toast('Failed to save budget.', 'danger');
        });
      }
    });

    var content = el('div', {}, [
      UI.field('Fiscal Year', fyInput),
      UI.field('Vertical', vertSelect),
      UI.field('Employee (optional)', empInput),
      UI.field('Monthly Cap (₹)', capInput),
      el('div', { style: { marginTop: '12px' } }, [saveBtn])
    ]);

    document.body.appendChild(UI.bottomSheet('Set Budget', content));
  }

})();
