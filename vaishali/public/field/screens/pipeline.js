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

  // ─── Staleness ────────────────────────────────────────────────────
  // Days a card can sit in a stage before it counts as stale.
  // Closing is tightest because Hot quotes should close fast.

  var STALE_DAYS = {
    suspect:     30,
    prospect:    30,
    approach:    14,
    negotiation: 14,
    closing:     7,
    order:       null
  };

  function staleDays(item, stage) {
    var threshold = STALE_DAYS[stage.key];
    if (!threshold) return null;
    var ref = item.modified || item.creation || item.transaction_date;
    if (!ref) return null;
    var d = new Date(ref);
    if (isNaN(d.getTime())) return null;
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= threshold) return null;
    return days;
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

  // ─── Stage transitions ────────────────────────────────────────────

  // Which target stages each item type can move to. Order matters:
  // forward moves first, then sideways, then "lost" at the end.
  var ALLOWED_TARGETS = {
    'Lead':         ['suspect', 'prospect', 'approach', 'lost'],
    'Opportunity':  ['prospect', 'approach', 'negotiation', 'lost'],
    'Quotation':    ['negotiation', 'closing', 'order', 'lost'],
    'Sales Order':  []
  };

  var ALL_TARGETS = [
    { key: 'suspect',     label: 'Suspect',     hint: 'Fresh, not yet qualified',   accent: '#7c3aed' },
    { key: 'prospect',    label: 'Prospect',    hint: 'Qualified — keep nurturing', accent: '#2563eb' },
    { key: 'approach',    label: 'Approach',    hint: 'Customer engaged',           accent: '#0891b2' },
    { key: 'negotiation', label: 'Negotiation', hint: 'Quote sent, mark Warm',      accent: '#d97706' },
    { key: 'closing',     label: 'Closing',     hint: 'Hot — about to win',         accent: '#dc2626' },
    { key: 'order',       label: 'Order',       hint: 'Create the Sales Order',     accent: '#059669' },
    { key: 'lost',        label: 'Lost',        hint: 'Dead deal',                  accent: '#6b7280' }
  ];

  function getMoveTargets(item, currentStageKey) {
    var allowed = ALLOWED_TARGETS[item.doctype] || [];
    return ALL_TARGETS.filter(function (t) {
      return allowed.indexOf(t.key) !== -1 && t.key !== currentStageKey;
    });
  }

  function openMoveStageSheet(item, currentStage, onMoved) {
    var targets = getMoveTargets(item, currentStage.key);
    if (!targets.length) {
      UI.toast('No moves available for this card', 'info');
      return;
    }

    var selected = null;
    var rows = [];
    var lostFields;
    var moveBtn;

    var optionsBox = el('div', { className: 'spanco-move-options', role: 'radiogroup' });
    targets.forEach(function (t) {
      var row = el('div', {
        className: 'spanco-move-option',
        role: 'radio',
        tabIndex: '0',
        'aria-checked': 'false',
        'data-target': t.key,
        onClick: function () {
          for (var i = 0; i < rows.length; i++) {
            rows[i].classList.remove('selected');
            rows[i].setAttribute('aria-checked', 'false');
          }
          row.classList.add('selected');
          row.setAttribute('aria-checked', 'true');
          selected = t.key;
          if (lostFields) lostFields.style.display = (t.key === 'lost') ? '' : 'none';
        }
      }, [
        el('span', { className: 'spanco-move-radio' }, [
          el('span', { className: 'spanco-move-radio-inner', style: { background: t.accent } })
        ]),
        el('span', { className: 'spanco-move-dot', style: { background: t.accent } }),
        el('div', { className: 'spanco-move-text' }, [
          el('div', { className: 'spanco-move-label', textContent: t.label }),
          el('div', { className: 'spanco-move-hint', textContent: t.hint })
        ])
      ]);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
      rows.push(row);
      optionsBox.appendChild(row);
    });

    // Lost-reason fields, hidden until "Lost" is selected
    var reasonSelect = UI.select(null, [
      { value: 'Price', label: 'Price' },
      { value: 'Technical', label: 'Technical' },
      { value: 'Budget', label: 'Budget' },
      { value: 'Other', label: 'Other' }
    ], 'Other');
    var remarkArea = UI.textarea('What killed it? (optional)', { rows: 2 });
    lostFields = el('div', {
      className: 'spanco-move-lost-fields',
      style: { display: 'none' }
    }, [
      UI.field('Lost reason', reasonSelect),
      el('div', { style: { marginTop: '8px' } }),
      UI.field('Remark', remarkArea)
    ]);

    var summary = el('div', { className: 'spanco-move-summary' }, [
      el('div', { className: 'spanco-move-summary-name', textContent: cardTitle(item) }),
      el('div', { className: 'spanco-move-summary-meta',
        textContent: item.name + ' · ' + (item.doctype || '') + ' · currently ' + currentStage.label })
    ]);

    var content = el('div', null, [
      summary,
      optionsBox,
      lostFields
    ]);

    var sheet = UI.bottomSheet('Move to', content);
    document.body.appendChild(sheet);

    // Action buttons sit inside the sheet content (below the radios)
    var cancelBtn = UI.btn('Cancel', {
      type: 'tonal',
      block: false,
      onClick: function () { if (sheet._close) sheet._close(); }
    });
    moveBtn = UI.btn('Move stage', {
      type: 'primary',
      block: false,
      onClick: function () {
        if (!selected) {
          UI.toast('Pick a stage first', 'error');
          return;
        }
        moveBtn._setLoading(true, 'Moving...');

        var payload = { doctype: item.doctype, name: item.name, target_stage: selected };
        if (selected === 'lost') {
          var sel = reasonSelect.querySelector ? reasonSelect.querySelector('select') : null;
          payload.lost_reason = sel ? (sel.value || 'Other') : 'Other';
          var ta = remarkArea.tagName === 'TEXTAREA' ? remarkArea : (remarkArea.querySelector ? remarkArea.querySelector('textarea') : null);
          payload.lost_remark = ta ? (ta.value || '') : '';
        }

        window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.move_kanban_stage', payload).then(function (res) {
          if (res.error || (res.status && res.status >= 400)) {
            var msg = res.error || 'Move failed';
            if (res.data && res.data._server_messages) {
              try { msg = JSON.parse(JSON.parse(res.data._server_messages)[0]).message; } catch (e) {}
            }
            UI.toast(msg, 'error');
            moveBtn._setLoading(false);
            return;
          }
          var result = (res.data && res.data.message) || res.data || {};
          UI.toast(result.message || 'Moved', 'success');
          if (sheet._close) sheet._close();
          if (result.action === 'navigate' && result.url) {
            location.hash = result.url;
            return;
          }
          if (typeof onMoved === 'function') onMoved(result);
        }).catch(function (err) {
          UI.toast('Failed: ' + (err.message || err), 'error');
          moveBtn._setLoading(false);
        });
      }
    });

    content.appendChild(el('div', { className: 'spanco-move-actions' }, [cancelBtn, moveBtn]));
  }

  function buildCard(item, stage, onMoved) {
    var amt = cardAmount(item, stage.amountField);
    var subBits = cardSubBits(item, stage);
    var canMove = (ALLOWED_TARGETS[item.doctype] || []).length > 0;
    var stale = staleDays(item, stage);

    var rightChildren = [];
    if (amt > 0) {
      rightChildren.push(el('div', { className: 'spanco-card-amount', textContent: formatINR(amt) }));
    }
    if (stale !== null) {
      rightChildren.push(el('div', {
        className: 'spanco-card-stale',
        title: 'No movement in ' + stale + ' days'
      }, [
        el('span', { className: 'spanco-card-stale-label', textContent: 'Stale ' + stale + 'd' })
      ]));
    }

    // Stage chip — shows current SPANCO stage (matches column), tappable to move.
    // Falls back to a static UI.pill when no moves are available (e.g. Sales Order).
    if (canMove) {
      var chip = el('button', {
        type: 'button',
        className: 'spanco-card-stage',
        style: { borderColor: stage.accent, color: stage.accent },
        'aria-label': 'Move ' + cardTitle(item) + ' to a different stage',
        onClick: function (e) {
          e.stopPropagation();
          openMoveStageSheet(item, stage, onMoved);
        }
      }, [
        el('span', { className: 'spanco-card-stage-dot', style: { background: stage.accent } }),
        el('span', { className: 'spanco-card-stage-label', textContent: stage.label }),
        el('span', { className: 'spanco-card-stage-chev', textContent: '▾' })
      ]);
      rightChildren.push(chip);
    } else {
      var staticText = item.status || stage.label;
      rightChildren.push(UI.pill(staticText, statusColor(staticText)));
    }

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
    // Track which stage the user was viewing so a refresh after a move
    // doesn't snap them back to Suspect.
    var lastStageKey = STAGES[0].key;

    function load() {
      appEl.textContent = '';
      appEl.appendChild(UI.skeleton(4));

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
            colBody.appendChild(buildCard(sd.items[c], sd.stage, load));
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

      // Restore the user's last-viewed stage on refresh after a move,
      // otherwise default to the first stage.
      var initialStage = (chipEls[lastStageKey] && lastStageKey) || STAGES[0].key;
      setActiveStage(initialStage);
      // Defer the column scroll so layout has measured the columns wrapper.
      setTimeout(function () { scrollToColumn(initialStage); }, 0);

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
            if (key) {
              setActiveStage(key);
              lastStageKey = key;
            }
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

    load();
  }

  // ─── Export ──────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.pipeline = function (appEl) { renderPipeline(appEl); };
})();
