/* pipeline.js — Sales Pipeline screen for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ──────────────────────────────────────────────────────

  function formatAmount(value) {
    var num = Number(value) || 0;
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
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'open' || s === 'lead' || s === 'draft') return 'blue';
    if (s === 'converted' || s === 'won' || s === 'submitted' || s === 'completed' || s === 'ordered') return 'green';
    if (s === 'lost' || s === 'cancelled' || s === 'closed') return 'red';
    if (s === 'replied' || s === 'quotation' || s === 'opportunity' || s === 'interested') return 'orange';
    return 'gray';
  }

  // ─── Build a single pipeline card ─────────────────────────────────

  function pipelineCard(item) {
    var children = [];

    // Title line: name or company
    var title = item.customer_name || item.company_name || item.lead_name || item.party_name || item.name || 'Untitled';
    children.push(el('div', { className: 'pipeline-card-title', textContent: title }));

    // Subtitle: document name or source
    var sub = item.name || '';
    if (sub) {
      children.push(el('div', { className: 'pipeline-card-sub', textContent: sub }));
    }

    // Amount + date row
    var metaParts = [];
    if (item.grand_total || item.opportunity_amount) {
      metaParts.push(el('span', { className: 'pipeline-card-amount', textContent: formatAmount(item.grand_total || item.opportunity_amount) }));
    }
    if (item.transaction_date || item.creation) {
      metaParts.push(el('span', { className: 'pipeline-card-date', textContent: formatDate(item.transaction_date || item.creation) }));
    }
    if (metaParts.length > 0) {
      children.push(el('div', { className: 'pipeline-card-meta' }, metaParts));
    }

    // Status pill
    var st = item.status || '';
    if (st) {
      children.push(el('div', { className: 'pipeline-card-status' }, [UI.pill(st, statusColor(st))]));
    }

    var cardEl = el('div', { className: 'pipeline-card', onClick: function () {
      // Navigate to ERPNext detail
      var doctype = item._doctype || '';
      var name = item.name || '';
      if (doctype && name) {
        var slug = doctype.toLowerCase().replace(/ /g, '-');
        window.open('/app/' + slug + '/' + encodeURIComponent(name), '_blank');
      }
    } }, children);

    return cardEl;
  }

  // ─── Build a kanban column ────────────────────────────────────────

  function pipelineColumn(title, items, doctype) {
    var count = items ? items.length : 0;

    var headerChildren = [
      el('span', { className: 'pipeline-col-title', textContent: title }),
      el('span', { className: 'pipeline-col-count', textContent: String(count) })
    ];
    var header = el('div', { className: 'pipeline-col-header' }, headerChildren);

    var cardList = el('div', { className: 'pipeline-col-cards' });

    if (!items || items.length === 0) {
      cardList.appendChild(el('div', { className: 'pipeline-col-empty', textContent: 'No ' + title.toLowerCase() }));
    } else {
      for (var i = 0; i < items.length; i++) {
        items[i]._doctype = doctype;
        cardList.appendChild(pipelineCard(items[i]));
      }
    }

    return el('div', { className: 'pipeline-col' }, [header, cardList]);
  }

  // ─── Funnel bar ───────────────────────────────────────────────────

  function funnelBar(data) {
    var fy = data.fy || {};
    var ratios = data.ratios || {};

    var stages = [
      { label: 'Visits', count: fy.visits || 0 },
      { label: 'Leads',  count: fy.leads || 0 },
      { label: 'Quotes', count: fy.quotations || 0 },
      { label: 'Orders', count: fy.orders || 0 }
    ];

    var convs = [
      { pct: ratios.visit_to_lead || 0, tgt: ratios.target_vi || 50 },
      { pct: ratios.lead_to_quote  || 0, tgt: ratios.target_iq || 50 },
      { pct: ratios.quote_to_order || 0, tgt: ratios.target_qo || 75 }
    ];

    // Stage cards
    var stageEls = [];
    for (var i = 0; i < stages.length; i++) {
      stageEls.push(el('div', { className: 'funnel-stage' }, [
        el('div', { className: 'funnel-stage-count', textContent: String(stages[i].count) }),
        el('div', { className: 'funnel-stage-label', textContent: stages[i].label })
      ]));

      if (i < convs.length) {
        var conv = convs[i];
        var onTarget = conv.pct >= conv.tgt;
        stageEls.push(el('div', { className: 'funnel-arrow' }, [
          el('div', { className: 'funnel-arrow-icon', textContent: '\u2192' }),
          el('div', {
            className: 'funnel-conv-pct' + (onTarget ? ' on-target' : ' below-target'),
            textContent: conv.pct + '%'
          }),
          el('div', { className: 'funnel-conv-tgt', textContent: 'tgt ' + conv.tgt + '%' })
        ]));
      }
    }

    var heading = el('div', { className: 'funnel-heading', textContent: 'Sales funnel \u2014 This FY' });
    var row = el('div', { className: 'funnel-row' }, stageEls);

    // Revenue sub-line
    var orderVal = fy.order_value || 0;
    var quoteVal = fy.quote_value || 0;
    var revenueEl = el('div', { className: 'funnel-revenue' }, [
      el('span', { textContent: 'Pipeline: ' + formatAmount(quoteVal) }),
      el('span', { className: 'funnel-revenue-sep', textContent: '\u00A0\u00A0|\u00A0\u00A0' }),
      el('span', { textContent: 'Booked: ' + formatAmount(orderVal) })
    ]);

    return el('div', { className: 'funnel-section' }, [heading, row, revenueEl]);
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderPipeline(appEl) {
    appEl.appendChild(UI.skeleton(3));

    // Load funnel data in parallel with pipeline board
    var funnelPromise = api.apiCall('GET', '/api/field/sales-funnel');

    api.apiCall('GET', '/api/field/view/sales_pipeline').then(function (res) {
      // Remove skeleton
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load pipeline data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var leads = sections.leads || [];
      var opportunities = sections.opportunities || [];
      var quotations = sections.quotations || [];
      var orders = sections.orders || sections.sales_orders || [];

      // Summary stats
      var totalValue = 0;
      for (var q = 0; q < quotations.length; q++) {
        totalValue += Number(quotations[q].grand_total || 0);
      }
      for (var o = 0; o < orders.length; o++) {
        totalValue += Number(orders[o].grand_total || 0);
      }

      // Insert funnel bar (resolves independently — graceful if it fails)
      funnelPromise.then(function (fr) {
        if (fr && fr.data && fr.data.data) {
          var funnelEl = funnelBar(fr.data.data);
          // Insert before the pipeline board (which hasn't been appended yet at this point)
          appEl.appendChild(funnelEl);
        }
      }).catch(function () { /* funnel is best-effort */ });

      var totalItems = leads.length + opportunities.length + quotations.length + orders.length;
      appEl.appendChild(UI.grid([
        UI.statCard(totalItems, 'Total Items'),
        UI.statCard(formatAmount(totalValue), 'Pipeline Value')
      ], 2));

      // Kanban board
      var board = el('div', { className: 'pipeline-board' }, [
        pipelineColumn('Leads', leads, 'Lead'),
        pipelineColumn('Opportunities', opportunities, 'Opportunity'),
        pipelineColumn('Quotations', quotations, 'Quotation'),
        pipelineColumn('Orders', orders, 'Sales Order')
      ]);

      appEl.appendChild(board);
    }).catch(function () {
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }
      appEl.appendChild(UI.error('Could not load pipeline data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.pipeline = function (appEl) {
    renderPipeline(appEl);
  };

})();
