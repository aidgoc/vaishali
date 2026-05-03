/* pipeline.js — SPANCO Sales Kanban for DSPL Field App
 *
 * 6-stage mobile kanban: Suspect → Prospect → Approach → Negotiation → Closing → Order.
 * Tap a stage chip or swipe horizontally to switch columns.
 * Tap a card to open the underlying doc's detail screen.
 * Server: vaishali.api.field.get_spanco_kanban
 */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Currency ─────────────────────────────────────────────────────

  function formatINR(val) {
    var n = Number(val) || 0;
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function formatShortINR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function relativeAge(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    var days = Math.floor(diff / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1d';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.floor(days / 30) + 'mo';
    return Math.floor(days / 365) + 'y';
  }

  // ─── Stages ───────────────────────────────────────────────────────

  var STAGES = [
    { key: 'suspect',     label: 'Suspect',     hint: 'Fresh leads, not yet qualified',     accent: '#7c3aed', amountField: null },
    { key: 'prospect',    label: 'Prospect',    hint: 'Qualified — leads & open opps',      accent: '#2563eb', amountField: 'opportunity_amount' },
    { key: 'approach',    label: 'Approach',    hint: 'Customer engaged',                   accent: '#0891b2', amountField: 'opportunity_amount' },
    { key: 'negotiation', label: 'Negotiation', hint: 'Quotation sent, awaiting decision',  accent: '#d97706', amountField: 'grand_total' },
    { key: 'closing',     label: 'Closing',     hint: 'Hot quotes — push to win',           accent: '#dc2626', amountField: 'grand_total' },
    { key: 'order',       label: 'Order',       hint: 'Won — last 90 days',                 accent: '#059669', amountField: 'grand_total' }
  ];

  // ─── Cards ────────────────────────────────────────────────────────

  function cardTitle(item) {
    return item.customer_name || item.party_name || item.lead_name || item.company_name || item.customer || item.name || 'Untitled';
  }

  function cardAmount(item, amountField) {
    if (amountField && item[amountField] != null) return Number(item[amountField]) || 0;
    if (item.opportunity_amount != null) return Number(item.opportunity_amount) || 0;
    if (item.grand_total != null) return Number(item.grand_total) || 0;
    return 0;
  }

  function cardSubBits(item, stage) {
    var bits = [];
    if (stage.key === 'suspect' || stage.key === 'prospect') {
      if (item.source) bits.push(item.source);
    }
    if (item.name) bits.push(item.name);
    var d = item.transaction_date || item.creation;
    var age = relativeAge(d);
    if (age) bits.push(age);
    if (stage.key === 'negotiation' && item.quotation_temperature && item.quotation_temperature !== 'Hot') {
      bits.push(item.quotation_temperature);
    }
    return bits;
  }

  function detailHashFor(item) {
    if (!item || !item.name) return null;
    if (item.doctype === 'Lead') return '#/lead/' + encodeURIComponent(item.name);
    if (item.doctype === 'Opportunity') return '#/opportunity/' + encodeURIComponent(item.name);
    if (item.doctype === 'Quotation') return '#/quotation/' + encodeURIComponent(item.name);
    if (item.doctype === 'Sales Order') return '#/sales-order/' + encodeURIComponent(item.name);
    return null;
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = String(status).toLowerCase();
    if (s === 'open' || s === 'lead' || s === 'draft') return 'blue';
    if (s === 'won' || s === 'completed' || s === 'ordered' || s === 'converted' || s === 'to deliver and bill' || s === 'to bill' || s === 'to deliver') return 'green';
    if (s === 'lost' || s === 'cancelled' || s === 'closed') return 'red';
    if (s === 'replied' || s === 'quoted' || s === 'opportunity' || s === 'interested' || s === 'hot') return 'orange';
    return 'gray';
  }

  function buildCard(item, stage) {
    var amt = cardAmount(item, stage.amountField);
    var subBits = cardSubBits(item, stage);

    var rightChildren = [];
    if (amt > 0) {
      rightChildren.push(el('div', { className: 'spanco-card-amount', textContent: formatINR(amt) }));
    }
    var statusText = item.status || stage.label;
    if (stage.key === 'closing' && item.quotation_temperature) {
      statusText = item.quotation_temperature;
    }
    rightChildren.push(UI.pill(statusText, statusColor(statusText)));

    var textChildren = [el('div', { className: 'spanco-card-title', textContent: cardTitle(item) })];
    if (subBits.length) {
      textChildren.push(el('div', { className: 'spanco-card-sub', textContent: subBits.join(' · ') }));
    }

    var card = el('div', {
      className: 'spanco-card',
      style: { borderLeftColor: stage.accent },
      role: 'button',
      tabIndex: '0',
      onClick: function () {
        var hash = detailHashFor(item);
        if (hash) location.hash = hash;
      }
    }, [
      el('div', { className: 'spanco-card-main' }, [
        UI.avatar ? UI.avatar(cardTitle(item), 40) : null,
        el('div', { className: 'spanco-card-text' }, textChildren)
      ]),
      el('div', { className: 'spanco-card-right' }, rightChildren)
    ]);

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    return card;
  }

  function buildEmpty(stage) {
    var msg = {
      suspect:     'No fresh leads yet. Add one to start the funnel.',
      prospect:    'No qualified prospects.',
      approach:    'No opportunities the customer has replied to yet.',
      negotiation: 'No quotations awaiting a decision.',
      closing:     'No hot quotes. Mark a Quotation as Hot from desk to flag it here.',
      order:       'No orders won in the last 90 days.'
    };
    return el('div', { className: 'spanco-empty' }, [
      el('div', { className: 'spanco-empty-text', textContent: msg[stage.key] || 'Nothing here.' })
    ]);
  }

  // ─── Render ───────────────────────────────────────────────────────

  function renderPipeline(appEl) {
    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    api.apiCall('GET', '/api/method/vaishali.api.field.get_spanco_kanban').then(function (res) {
      appEl.textContent = '';

      if (!res || res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load pipeline'));
        return;
      }

      var data = res.data;
      var sections = (data.message && data.message.sections) || data.sections || {};

      var stageData = STAGES.map(function (stg) {
        var items = sections[stg.key] || [];
        var total = 0;
        for (var i = 0; i < items.length; i++) total += cardAmount(items[i], stg.amountField);
        return { stage: stg, items: items, total: total };
      });

      // Hero KPIs — pipeline value (approach+negotiation+closing) and won (order)
      var pipelineValue = 0, wonValue = 0;
      var pipelineCount = 0, wonCount = 0;
      stageData.forEach(function (sd) {
        if (sd.stage.key === 'order') {
          wonValue += sd.total;
          wonCount += sd.items.length;
        } else if (['approach', 'negotiation', 'closing'].indexOf(sd.stage.key) !== -1) {
          pipelineValue += sd.total;
          pipelineCount += sd.items.length;
        }
      });

      appEl.appendChild(el('div', { className: 'spanco-hero' }, [
        el('div', { className: 'spanco-hero-row' }, [
          el('div', { className: 'spanco-hero-block' }, [
            el('div', { className: 'spanco-hero-label', textContent: 'Pipeline value' }),
            el('div', { className: 'spanco-hero-value', textContent: formatShortINR(pipelineValue) }),
            el('div', { className: 'spanco-hero-meta', textContent: pipelineCount + (pipelineCount === 1 ? ' deal' : ' deals') })
          ]),
          el('div', { className: 'spanco-hero-divider' }),
          el('div', { className: 'spanco-hero-block' }, [
            el('div', { className: 'spanco-hero-label', textContent: 'Won (90d)' }),
            el('div', { className: 'spanco-hero-value won', textContent: formatShortINR(wonValue) }),
            el('div', { className: 'spanco-hero-meta', textContent: wonCount + (wonCount === 1 ? ' order' : ' orders') })
          ])
        ])
      ]));

      var chips = el('div', { className: 'spanco-chips', role: 'tablist', 'aria-label': 'Pipeline stages' });
      var chipEls = {};
      var columns = el('div', { className: 'spanco-columns', role: 'tabpanel' });
      var columnEls = {};

      function setActiveStage(key) {
        for (var k in chipEls) {
          if (chipEls.hasOwnProperty(k)) {
            var on = (k === key);
            chipEls[k].classList.toggle('active', on);
            chipEls[k].setAttribute('aria-selected', on ? 'true' : 'false');
          }
        }
        var active = chipEls[key];
        if (active && active.scrollIntoView) {
          try { active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
        }
      }

      function scrollToColumn(key) {
        var idx = -1;
        for (var i = 0; i < STAGES.length; i++) {
          if (STAGES[i].key === key) { idx = i; break; }
        }
        if (idx < 0) return;
        var w = columns.clientWidth;
        try { columns.scrollTo({ left: idx * w, behavior: 'smooth' }); }
        catch (_) { columns.scrollLeft = idx * w; }
        setActiveStage(key);
      }

      stageData.forEach(function (sd) {
        var amountLabel = sd.total > 0 ? formatShortINR(sd.total) : '';
        var chipChildren = [
          el('span', { className: 'spanco-chip-dot', style: { background: sd.stage.accent } }),
          el('span', { className: 'spanco-chip-name', textContent: sd.stage.label }),
          el('span', { className: 'spanco-chip-count', textContent: String(sd.items.length) })
        ];
        if (amountLabel) {
          chipChildren.push(el('span', { className: 'spanco-chip-amount', textContent: amountLabel }));
        }

        var chip = el('button', {
          type: 'button',
          className: 'spanco-chip',
          role: 'tab',
          'data-stage': sd.stage.key,
          'aria-selected': 'false',
          onClick: function () { scrollToColumn(sd.stage.key); }
        }, chipChildren);
        chipEls[sd.stage.key] = chip;
        chips.appendChild(chip);

        var colHeader = el('div', { className: 'spanco-col-header' }, [
          el('div', { className: 'spanco-col-titlerow' }, [
            el('span', { className: 'spanco-col-dot', style: { background: sd.stage.accent } }),
            el('span', { className: 'spanco-col-title', textContent: sd.stage.label })
          ]),
          el('div', { className: 'spanco-col-hint', textContent: sd.stage.hint })
        ]);

        var colBody = el('div', { className: 'spanco-col-body' });
        if (sd.items.length === 0) {
          colBody.appendChild(buildEmpty(sd.stage));
        } else {
          for (var c = 0; c < sd.items.length; c++) {
            colBody.appendChild(buildCard(sd.items[c], sd.stage));
          }
        }

        var col = el('div', {
          className: 'spanco-column',
          'data-stage': sd.stage.key,
          role: 'region',
          'aria-label': sd.stage.label
        }, [colHeader, colBody]);

        columnEls[sd.stage.key] = col;
        columns.appendChild(col);
      });

      appEl.appendChild(chips);
      appEl.appendChild(columns);

      setActiveStage(STAGES[0].key);

      // Sync chip ↔ column on manual swipe
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          var best = null;
          for (var e = 0; e < entries.length; e++) {
            if (!entries[e].isIntersecting) continue;
            if (!best || entries[e].intersectionRatio > best.intersectionRatio) best = entries[e];
          }
          if (best) {
            var key = best.target.getAttribute('data-stage');
            if (key) setActiveStage(key);
          }
        }, { root: columns, threshold: [0.5, 0.75] });
        for (var ck in columnEls) {
          if (columnEls.hasOwnProperty(ck)) io.observe(columnEls[ck]);
        }
      }
    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Could not load pipeline: ' + (err.message || err)));
    });
  }

  // ─── Export ──────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.pipeline = function (appEl) { renderPipeline(appEl); };
})();
