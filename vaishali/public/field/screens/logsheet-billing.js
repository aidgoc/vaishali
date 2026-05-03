/* logsheet-billing.js — Month-end Sales Invoice generator for Operator Logsheets.
 *
 * Manager-only screen: see this-month and last-month pending totals, preview the
 * (customer x equipment x month) groups that would be invoiced, then generate
 * draft Sales Invoices in one click. One SI per (customer x equipment x month),
 * one line per logsheet day.
 */
(function () {
  'use strict';

  window.Screens = window.Screens || {};
  var api = window.fieldAPI;
  var el = UI.el;
  var icon = window.icon;

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function formatHours(h) {
    return Number(h || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }) + ' h';
  }

  function formatMonthLabel(monthStr) {
    if (!monthStr) return '';
    var parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    var year = parts[0];
    var monthIdx = parseInt(parts[1], 10) - 1;
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
    if (monthIdx < 0 || monthIdx > 11) return monthStr;
    return months[monthIdx] + ' ' + year;
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function previousMonthStr() {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    var mm = d.getMonth() + 1;
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm;
  }

  // ── Main screen ──────────────────────────────────────────────────────

  window.Screens.logsheetBilling = function (appEl) {
    appEl.appendChild(UI.pageHeader(
      'Logsheet billing',
      'Generate month-end Sales Invoices from approved operator logsheets. ' +
      'One invoice per customer per equipment per month.'
    ));

    // Tiles: this-month + last-month pending
    var tilesArea = el('div');
    tilesArea.appendChild(UI.skeleton(2));
    appEl.appendChild(tilesArea);

    // Month selector + actions
    var actionsCard = el('div');
    appEl.appendChild(actionsCard);

    // Preview output
    appEl.appendChild(UI.sectionHeader('Preview', { support: 'Pick a month and run preview' }));
    var previewArea = el('div');
    previewArea.appendChild(UI.empty(
      'wallet',
      'Run a preview to see what would be invoiced'
    ));
    appEl.appendChild(previewArea);

    // Selected month state — defaults to last month
    var selectedMonth = previousMonthStr();
    var lastPreview = null;

    // ── Render tiles ────────────────────────────────────────────────

    function renderTiles(summary) {
      tilesArea.textContent = '';
      if (!summary) {
        tilesArea.appendChild(UI.error('Could not load billing summary.'));
        return;
      }
      var thisM = summary.this_month || {};
      var lastM = summary.last_month || {};

      tilesArea.appendChild(UI.statGrid([
        {
          value: formatCurrency(thisM.total_amount),
          label: formatMonthLabel(thisM.month) + ' (open)',
          support: (thisM.logsheet_count || 0) + ' logsheets · ' +
                   (thisM.group_count || 0) + ' invoice groups'
        },
        {
          value: formatCurrency(lastM.total_amount),
          label: formatMonthLabel(lastM.month) + ' (ready to bill)',
          support: (lastM.logsheet_count || 0) + ' logsheets · ' +
                   (lastM.group_count || 0) + ' invoice groups'
        }
      ], 2));
    }

    // ── Render actions ──────────────────────────────────────────────

    function renderActions() {
      actionsCard.textContent = '';

      var monthInput = UI.m3TextField('Billing month', {
        type: 'month',
        value: selectedMonth,
        onInput: function (e) {
          selectedMonth = (e && e.target && e.target.value) || selectedMonth;
        }
      });

      var previewBtn = UI.btn('Preview', {
        type: 'outline',
        block: true,
        icon: 'eye',
        onClick: function () { runPreview(previewBtn); }
      });

      var generateBtn = UI.btn('Generate invoices', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { runGenerate(generateBtn); }
      });

      actionsCard.appendChild(monthInput);
      actionsCard.appendChild(el('div', { style: { height: '8px' } }));
      actionsCard.appendChild(previewBtn);
      actionsCard.appendChild(el('div', { style: { height: '8px' } }));
      actionsCard.appendChild(generateBtn);
    }

    // ── Render preview ──────────────────────────────────────────────

    function renderPreview(payload) {
      previewArea.textContent = '';

      if (!payload || !payload.groups || payload.groups.length === 0) {
        previewArea.appendChild(UI.empty(
          'wallet',
          'Nothing to invoice for ' + formatMonthLabel(payload && payload.month)
        ));
        return;
      }

      // Summary line
      previewArea.appendChild(el('div', {
        style: {
          padding: '12px 16px',
          background: 'var(--m3-surface-container-low)',
          borderRadius: 'var(--m3-shape-md)',
          marginBottom: '12px'
        }
      }, [
        el('div', {
          textContent: formatMonthLabel(payload.month),
          style: { font: 'var(--m3-title-medium)', marginBottom: '4px' }
        }),
        el('div', {
          textContent: payload.total_groups + ' invoice groups · ' +
                       payload.total_logsheets + ' logsheets · ' +
                       formatCurrency(payload.total_amount),
          style: { font: 'var(--m3-body-medium)', color: 'var(--m3-on-surface-variant)' }
        })
      ]));

      var listWrap = el('div', { className: 'm3-list' });
      for (var i = 0; i < payload.groups.length; i++) {
        (function (g) {
          var rightLabel = el('div', { style: { textAlign: 'right' } }, [
            el('div', {
              textContent: formatCurrency(g.total_amount),
              style: { font: 'var(--m3-title-small)' }
            }),
            el('div', {
              textContent: formatHours(g.total_hours),
              style: {
                font: 'var(--m3-label-small)',
                color: 'var(--m3-on-surface-variant)'
              }
            })
          ]);

          var dateSummary = '';
          if (g.log_dates && g.log_dates.length) {
            if (g.log_dates.length <= 3) {
              dateSummary = g.log_dates.map(formatDateShort).join(', ');
            } else {
              dateSummary = formatDateShort(g.log_dates[0]) +
                            ' – ' + formatDateShort(g.log_dates[g.log_dates.length - 1]) +
                            ' (' + g.log_dates.length + ' days)';
            }
          }

          listWrap.appendChild(UI.listCard({
            title: g.customer_name || g.customer,
            sub: g.equipment_label + ' · ' + g.line_count + ' lines · ' + dateSummary,
            right: rightLabel
          }));
        })(payload.groups[i]);
      }
      previewArea.appendChild(listWrap);
    }

    // ── Actions ─────────────────────────────────────────────────────

    function loadSummary() {
      return api.apiCall('GET', '/api/field/logsheet-billing/summary').then(function (res) {
        if (res.error) {
          renderTiles(null);
          return;
        }
        var data = (res.data && (res.data.message || res.data.data)) || null;
        renderTiles(data);
      }).catch(function () {
        renderTiles(null);
      });
    }

    function runPreview(btn) {
      if (btn && btn._setLoading) btn._setLoading(true, 'Loading…');
      previewArea.textContent = '';
      previewArea.appendChild(UI.skeleton(3));

      var qs = '?month=' + encodeURIComponent(selectedMonth);
      api.apiCall('GET', '/api/field/logsheet-billing/preview' + qs).then(function (res) {
        if (btn && btn._setLoading) btn._setLoading(false);
        if (res.error) {
          previewArea.textContent = '';
          previewArea.appendChild(UI.error('Could not load preview: ' + res.error));
          return;
        }
        var data = (res.data && (res.data.message || res.data.data)) || null;
        lastPreview = data;
        renderPreview(data);
      }).catch(function (err) {
        if (btn && btn._setLoading) btn._setLoading(false);
        previewArea.textContent = '';
        previewArea.appendChild(UI.error('Network error: ' + (err && err.message)));
      });
    }

    function runGenerate(btn) {
      var monthLabel = formatMonthLabel(selectedMonth);
      var groupCount = (lastPreview && lastPreview.total_groups) || '?';
      var amount = (lastPreview && lastPreview.total_amount) || 0;

      var bodyLines = [
        'Create draft Sales Invoices for ' + monthLabel + '.',
        '',
        'Groups: ' + groupCount,
        'Total: ' + formatCurrency(amount),
        '',
        'Invoices save as Draft — accounts must review and submit. ' +
        'Each linked logsheet flips to "Billed".'
      ];
      if (!lastPreview) {
        bodyLines = [
          'No preview run yet for ' + monthLabel + '.',
          '',
          'Generate will still create invoices for every approved logsheet ' +
          'in this month. Continue?'
        ];
      }

      UI.confirmDialog(
        'Generate invoices for ' + monthLabel + '?',
        bodyLines.join('\n'),
        { confirmText: 'Generate', cancelText: 'Cancel' }
      ).then(function (ok) {
        if (!ok) return;

        if (btn && btn._setLoading) btn._setLoading(true, 'Generating…');

        api.apiCall('POST', '/api/field/logsheet-billing/generate', {
          month: selectedMonth
        }).then(function (res) {
          if (btn && btn._setLoading) btn._setLoading(false);

          if (res.error) {
            var msg = res.error;
            if (res.data && res.data._server_messages) {
              try {
                var arr = JSON.parse(res.data._server_messages);
                msg = JSON.parse(arr[0]).message || msg;
              } catch (e) { /* keep raw */ }
            }
            UI.toast('Failed: ' + msg, 'danger');
            return;
          }

          var data = (res.data && (res.data.message || res.data.data)) || {};
          var created = data.created || 0;
          var skipped = data.skipped || 0;
          var errs = (data.errors || []).length;

          var toastType = 'success';
          var toastMsg = 'Created ' + created + ' invoice' + (created === 1 ? '' : 's');
          if (skipped) toastMsg += ' · skipped ' + skipped;
          if (errs) {
            toastType = 'danger';
            toastMsg += ' · ' + errs + ' error' + (errs === 1 ? '' : 's');
          }
          UI.toast(toastMsg, toastType);

          // Refresh
          loadSummary();
          runPreview(null);
        }).catch(function (err) {
          if (btn && btn._setLoading) btn._setLoading(false);
          UI.toast('Network error: ' + (err && err.message), 'danger');
        });
      });
    }

    // Boot
    renderActions();
    loadSummary();
  };

  // ── Optional: explicit alias for direct preview route ────────────────

  window.Screens.logsheetBillingPreview = window.Screens.logsheetBilling;

})();
