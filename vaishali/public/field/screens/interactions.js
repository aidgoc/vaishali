/* interactions.js — Sales Interaction screens for Field PWA (List, New, Detail) */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function channelIcon(ch) {
    if (!ch) return 'phone';
    var c = ch.toLowerCase();
    if (c.indexOf('phone') !== -1) return 'phone';
    if (c.indexOf('email') !== -1) return 'mail';
    if (c.indexOf('whatsapp') !== -1) return 'message-circle';
    if (c.indexOf('video') !== -1) return 'video';
    if (c.indexOf('person') !== -1) return 'map-pin';
    return 'phone';
  }

  function outcomeColor(outcome) {
    if (!outcome) return 'gray';
    var o = outcome.toLowerCase();
    if (o === 'positive') return 'green';
    if (o === 'neutral') return 'blue';
    if (o === 'negative') return 'red';
    return 'gray';
  }

  function stageColor(stage) {
    if (!stage) return 'gray';
    var s = stage.toLowerCase();
    if (s === 'won') return 'green';
    if (s === 'lost' || s === 'stalled') return 'red';
    if (s === 'verbal commitment' || s === 'negotiation') return 'orange';
    if (s === 'opportunity' || s === 'proposal sent' || s === 'quoted') return 'blue';
    return 'gray';
  }

  // ── Screen: Interaction List ──────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.interactionList = function (appEl) {
    var listContainer = el('div');
    var searchQuery = '';

    // UI.searchInput is now pass-through; debounce here.
    var _intSearchTimer = null;
    var searchBar = UI.searchInput('Search interactions...', function (query) {
      if (_intSearchTimer) clearTimeout(_intSearchTimer);
      _intSearchTimer = setTimeout(function () {
        searchQuery = query;
        loadList();
      }, 250);
    });
    appEl.appendChild(searchBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('Log interaction', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/interactions/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadList() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/interactions';
      if (searchQuery) path += '?search=' + encodeURIComponent(searchQuery);

      api.apiCall('GET', path).then(function (res) {
        listContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('phone', 'No interactions yet', {
            text: '+ Log interaction',
            onClick: function () { location.hash = '#/interactions/new'; }
          }));
          return;
        }

        for (var i = 0; i < items.length; i++) {
          (function (item) {
            var name = item.customer_name || item.lead_name || 'Unknown';
            var date = formatDate(item.date);
            var channel = item.channel || '';
            var purpose = item.purpose || '';
            var summary = (item.summary || '').substring(0, 60);
            var sub = [channel, purpose, date].filter(Boolean).join(' \u00b7 ');

            var rightEl = el('div', { style: { textAlign: 'right' } });
            if (item.outcome) {
              rightEl.appendChild(UI.pill(item.outcome, outcomeColor(item.outcome)));
            }
            if (item.next_action_date) {
              var nDate = el('div', {
                style: { fontSize: '11px', color: 'var(--ink-tertiary)', marginTop: '4px' },
                textContent: 'Next: ' + formatDate(item.next_action_date)
              });
              rightEl.appendChild(nDate);
            }

            listContainer.appendChild(UI.listCard({
              avatar: name,
              title: name,
              sub: sub + (summary ? '\n' + summary : ''),
              right: rightEl,
              onClick: function () { location.hash = '#/interaction/' + item.name; }
            }));
          })(items[i]);
        }
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load: ' + (err.message || err)));
      });
    }

    loadList();
  };

  // ── Screen: New Interaction ───────────────────────────────────────

  window.Screens.interactionNew = function (appEl) {
    // Pre-fill from query params
    var hash = location.hash || '';
    var qIdx = hash.indexOf('?');
    var params = {};
    if (qIdx !== -1) {
      hash.substring(qIdx + 1).split('&').forEach(function (p) {
        var kv = p.split('=');
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      });
    }

    // Form fields
    var channelSelect = UI.select('Channel', ['Phone Call', 'Email', 'WhatsApp', 'Video Call', 'In Person']);
    var channelEl = channelSelect.querySelector('select');
    if (params.channel) channelEl.value = params.channel;

    var directionSelect = UI.select('Direction', ['Outgoing', 'Incoming']);
    var directionEl = directionSelect.querySelector('select');

    var customerInput = UI.textInput('Customer name or ID');
    if (params.customer) customerInput.value = params.customer;

    var leadInput = UI.textInput('Lead name or ID');
    if (params.lead) leadInput.value = params.lead;

    var purposeSelect = UI.select('Purpose', [
      'Follow-up', 'New Enquiry', 'Quotation Discussion', 'Negotiation',
      'Order Confirmation', 'Payment Follow-up', 'Relationship', 'Complaint', 'Other'
    ]);
    var purposeEl = purposeSelect.querySelector('select');

    var summaryArea = UI.textarea('What was discussed?', { rows: 3 });

    var outcomeSelect = UI.select('Outcome', ['', 'Positive', 'Neutral', 'Negative', 'No Response']);
    var outcomeEl = outcomeSelect.querySelector('select');

    var stageSelect = UI.select('Conversion Stage', [
      'Open', 'Lead Created', 'Opportunity', 'Proposal Sent',
      'Negotiation', 'Verbal Commitment', 'Quoted', 'Won', 'Lost', 'Stalled'
    ]);
    var stageEl = stageSelect.querySelector('select');

    var nextActionArea = UI.textarea('Next steps', { rows: 2 });
    var nextDateInput = UI.dateInput('Next action date');
    var nextDateEl = nextDateInput.querySelector('input');

    var durationInput = UI.textInput('Duration in minutes', { type: 'number' });

    var errorBox = el('div', { style: { display: 'none' } });

    var submitBtn = UI.btn('Log Interaction', {
      type: 'success',
      block: true,
      onClick: handleSubmit
    });

    appEl.appendChild(UI.card([
      channelSelect,
      directionSelect,
      UI.sectionHeading('Who'),
      UI.field('Customer', customerInput),
      UI.field('Lead (if no customer)', leadInput),
      UI.sectionHeading('What happened'),
      purposeSelect,
      UI.field('Summary *', summaryArea),
      outcomeSelect,
      UI.field('Duration (min)', durationInput),
      UI.sectionHeading('Pipeline'),
      stageSelect,
      UI.sectionHeading('Next steps'),
      UI.field('Next Action', nextActionArea),
      nextDateInput,
      errorBox,
      el('div', { style: { marginTop: '16px' } }, [submitBtn])
    ]));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      if (!summaryArea.value.trim()) {
        UI.fieldError(summaryArea, 'Summary is required');
        valid = false;
      } else {
        UI.fieldError(summaryArea, null);
      }

      if (!customerInput.value.trim() && !leadInput.value.trim()) {
        UI.fieldError(customerInput, 'Customer or Lead is required');
        valid = false;
      } else {
        UI.fieldError(customerInput, null);
      }

      if (!valid) {
        var firstErr = appEl.querySelector('.field-error-text');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Saving...');

      var payload = {
        channel: channelEl.value,
        direction: directionEl.value,
        purpose: purposeEl.value,
        summary: summaryArea.value.trim(),
        outcome: outcomeEl.value || null,
        conversion_stage: stageEl.value,
        next_action: nextActionArea.value.trim() || null,
        next_action_date: nextDateEl.value || null,
        duration_minutes: durationInput.value ? parseInt(durationInput.value) : null
      };

      if (customerInput.value.trim()) payload.customer = customerInput.value.trim();
      if (leadInput.value.trim()) payload.lead = leadInput.value.trim();

      api.apiCall('POST', '/api/field/interactions', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Interaction logged!', 'success');
        location.hash = '#/interactions';
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Interaction Detail ────────────────────────────────────

  window.Screens.interactionDetail = function (appEl, params) {
    var itemId = params.id;
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);

    api.apiCall('GET', '/api/field/interaction/' + encodeURIComponent(itemId)).then(function (res) {
      skel.remove();

      var item = null;
      if (res && res.data) {
        item = res.data.data || res.data.message || res.data;
      }
      if (!item) {
        appEl.appendChild(UI.error('Could not load interaction.'));
        return;
      }

      var who = item.customer_name || item.lead_name || 'Unknown';
      var winPct = (item.win_probability || 0) + '%';

      // M3 hero \u2014 who + win probability
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: who }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: (item.channel || 'Interaction') + ' \u00b7 ' + formatDate(item.date) + (item.duration_minutes ? ' \u00b7 ' + item.duration_minutes + ' min' : '') })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: winPct }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Win probability' })
          ])
        ]),
        el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
          UI.pill(item.channel || 'Unknown', 'blue'),
          item.direction ? UI.pill(item.direction, 'gray') : null,
          item.outcome ? UI.pill(item.outcome, outcomeColor(item.outcome)) : null,
          item.conversion_stage ? UI.pill(item.conversion_stage, stageColor(item.conversion_stage)) : null
        ].filter(Boolean))
      ]));

      // Quick contact
      var contactBtns = [];
      if (item.contact_phone) {
        contactBtns.push(UI.btn('Call', { type: 'tonal', icon: 'phone', onClick: function () { location.href = 'tel:' + item.contact_phone; } }));
      }
      if (contactBtns.length) {
        appEl.appendChild(el('div', { className: 'm3-doc-actions' }, contactBtns));
      }

      // Summary
      if (item.summary) {
        appEl.appendChild(UI.sectionHeader('Summary'));
        appEl.appendChild(el('div', {
          className: 'm3-card',
          style: {
            background: 'var(--m3-surface-container-low)',
            borderRadius: 'var(--m3-shape-md)',
            padding: '16px',
            marginBottom: '16px',
            font: 'var(--m3-body-medium)',
            color: 'var(--m3-on-surface)',
            letterSpacing: '0.25px',
            whiteSpace: 'pre-wrap'
          },
          textContent: item.summary
        }));
      }

      // Sales pipeline links
      appEl.appendChild(UI.sectionHeader('Pipeline'));
      appEl.appendChild(UI.detailCard([
        { label: 'Customer / Lead', value: who },
        { label: 'Contact', value: item.contact_phone || '\u2014' },
        { label: 'Employee', value: item.employee_name || '\u2014' },
        { label: 'Purpose', value: item.purpose || '\u2014' },
        { label: 'Conversion stage', value: item.conversion_stage || '\u2014' },
        { label: 'Win probability', value: winPct },
        { label: 'Opportunity', value: item.opportunity || '\u2014' },
        { label: 'Quotation', value: item.quotation || '\u2014' },
        { label: 'Sales order', value: item.sales_order || '\u2014' }
      ]));

      // Next steps
      if (item.next_action || item.next_action_date) {
        appEl.appendChild(UI.sectionHeader('Next steps'));
        appEl.appendChild(UI.detailCard([
          { label: 'Next action', value: item.next_action || '\u2014' },
          { label: 'Due date', value: formatDate(item.next_action_date) || '\u2014' }
        ]));
      }

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed: ' + (err.message || err)));
    });
  };

})();
