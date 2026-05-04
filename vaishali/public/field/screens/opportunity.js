/* opportunity.js — Opportunity screens for Field PWA (List + Detail) */
(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(val) {
    if (val == null || isNaN(val)) return '\u20b90';
    return '\u20b9' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'open') return 'blue';
    if (s === 'converted' || s === 'quotation') return 'green';
    if (s === 'replied') return 'orange';
    if (s === 'lost' || s === 'closed') return 'red';
    return 'gray';
  }

  // ── Screen: Opportunity List ─────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.opportunityList = function (appEl) {
    var el = UI.el;
    var activeTab = 'Open';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'Open', label: 'Open' },
      { value: 'Replied', label: 'Replied' },
      { value: 'All', label: 'All' }
    ], 'Open', function (val) {
      activeTab = val;
      loadOpportunities();
    });
    appEl.appendChild(tabBar);
    appEl.appendChild(listContainer);

    function loadOpportunities() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/opportunities?status=' + encodeURIComponent(activeTab);

      window.fieldAPI.apiCall('GET', path).then(function (res) {
        listContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No opportunities'));
          return;
        }

        for (var i = 0; i < items.length; i++) {
          (function (opp) {
            var party = opp.party_name || 'Unknown';
            var amount = opp.opportunity_amount ? formatCurrency(opp.opportunity_amount) : '';
            var status = opp.status || 'Open';
            var date = formatDate(opp.creation);
            var sub = [opp.name, opp.source, date].filter(Boolean).join(' \u00b7 ');

            listContainer.appendChild(UI.listCard({
              avatar: party,
              title: party,
              sub: sub,
              right: el('div', { style: { textAlign: 'right' } }, [
                amount ? el('div', { textContent: amount, style: { fontWeight: '600', fontSize: '14px', marginBottom: '4px' } }) : null,
                UI.pill(status, statusColor(status))
              ].filter(Boolean)),
              onClick: function () { location.hash = '#/opportunity/' + opp.name; }
            }));
          })(items[i]);
        }
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load opportunities: ' + (err.message || err)));
      });
    }

    loadOpportunities();
  };

  // ── Screen: Opportunity Detail ───────────────────────────────────────

  window.Screens.opportunityDetail = function (appEl, params) {
    var el = UI.el;
    var oppName = params.id || params.name;

    var skel = UI.skeleton(4);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET',
      '/api/method/frappe.client.get?doctype=Opportunity&name=' + encodeURIComponent(oppName)
    ).then(function (res) {
      skel.remove();

      var opp = null;
      if (res && res.data) opp = res.data.message || res.data.data || res.data;
      if (!opp) {
        appEl.appendChild(UI.error('Could not load opportunity.'));
        return;
      }

      var party = opp.party_name || opp.customer_name || 'Unknown';
      var status = opp.status || 'Open';
      var amount = opp.opportunity_amount || 0;
      var probability = opp.probability != null ? opp.probability : null;

      // \u2500\u2500 Hero: party + ID + amount \u2500\u2500
      var hero = el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: party }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: opp.name + (opp.opportunity_type ? ' \u00b7 ' + opp.opportunity_type : '') })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: amount ? formatCurrency(amount) : '\u2014' }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: probability != null ? probability + '% probability' : 'Estimated value' })
          ])
        ]),
        el('div', {}, [(function () {
          // Tappable status pill — opens status picker
          var pill = UI.pill(status, statusColor(status));
          pill.style.cursor = 'pointer';
          pill.addEventListener('click', function () {
            var picker = UI.statusPicker({
              title: 'Change status',
              current: status,
              options: [
                { value: 'Open', label: 'Open', color: 'blue', icon: 'clock', description: 'Just received' },
                { value: 'Replied', label: 'Replied', color: 'orange', icon: 'send', description: 'Conversation started' },
                { value: 'Quotation', label: 'Quoted', color: 'green', icon: 'file', description: 'Quotation sent' },
                { value: 'Converted', label: 'Converted', color: 'green', icon: 'check', description: 'Won — sales order placed' },
                { value: 'Lost', label: 'Lost', color: 'red', icon: 'x', description: 'Customer chose elsewhere' },
                { value: 'Closed', label: 'Closed', color: 'gray', icon: 'check', description: 'No longer active' }
              ],
              onSelect: function (value) {
                return window.fieldAPI.apiCall('PUT',
                  '/api/resource/Opportunity/' + encodeURIComponent(opp.name),
                  { status: value }
                ).then(function (res) {
                  if (res.error || (res.status && res.status >= 400)) {
                    throw new Error(res.error || 'Server error');
                  }
                  UI.toast('Status updated to ' + value, 'success');
                  // Re-render the screen to reflect change
                  setTimeout(function () { window.Screens.opportunityDetail(appEl, params); }, 100);
                });
              }
            });
            document.body.appendChild(picker);
          });
          return pill;
        })()])
      ]);
      appEl.appendChild(hero);

      // Stage path — visual progression
      var pipelineStages = [
        { value: 'Open', label: 'Open' },
        { value: 'Replied', label: 'Replied' },
        { value: 'Quotation', label: 'Quoted' },
        { value: 'Converted', label: 'Won' }
      ];
      // If status is Lost or Closed, show alternative final stage
      if (status === 'Lost') {
        pipelineStages[3] = { value: 'Lost', label: 'Lost' };
      } else if (status === 'Closed') {
        pipelineStages[3] = { value: 'Closed', label: 'Closed' };
      }
      if (UI.stagePath) {
        appEl.appendChild(UI.stagePath(pipelineStages, status, { compact: false }));
      }

      // Track in recently viewed
      if (UI.recents) {
        UI.recents.track({
          doctype: 'Opportunity', name: opp.name, title: party,
          subtitle: amount ? formatCurrency(amount) : opp.opportunity_type || '',
          hash: '#/opportunity/' + opp.name
        });
      }

      // \u2500\u2500 Quick action row \u2500\u2500
      var actionBtns = [];
      if (status === 'Open' || status === 'Replied') {
        actionBtns.push(UI.btn('Create quotation', {
          type: 'primary',
          icon: 'plus',
          onClick: function () {
            location.hash = '#/quotations/new?opportunity=' + encodeURIComponent(opp.name) + '&customer=' + encodeURIComponent(party);
          }
        }));
      }
      if (opp.contact_email) {
        actionBtns.push(UI.btn('Email', {
          type: 'tonal',
          icon: 'send',
          onClick: function () {
            if (UI.emailComposer) {
              var sheet = UI.emailComposer({
                to: opp.contact_email,
                subject: 'Re: ' + (opp.party_name || opp.name),
                doctype: 'Opportunity',
                name: opp.name
              });
              document.body.appendChild(sheet);
            } else {
              location.href = 'mailto:' + opp.contact_email;
            }
          }
        }));
      }
      if (opp.contact_mobile || opp.contact_no) {
        var phone = opp.contact_mobile || opp.contact_no;
        actionBtns.push(UI.btn('Call', {
          type: 'tonal',
          icon: 'phone',
          onClick: function () { location.href = 'tel:' + phone; }
        }));
      }
      if (actionBtns.length) {
        appEl.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));
      }

      // \u2500\u2500 Items \u2500\u2500
      if (opp.items && opp.items.length > 0) {
        appEl.appendChild(UI.sectionHeader('Items', { support: opp.items.length + (opp.items.length === 1 ? ' line' : ' lines') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < opp.items.length; i++) {
          var it = opp.items[i];
          var qty = it.qty || 0;
          var rate = it.rate || 0;
          var lineAmt = it.amount != null ? it.amount : qty * rate;
          var iname = it.item_name || it.item_code || 'Item';
          var meta = qty + (it.uom ? ' ' + it.uom : '') + ' \u00d7 ' + formatCurrency(rate);
          itemsBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: iname }),
              el('div', { className: 'm3-doc-item-meta', textContent: meta })
            ]),
            el('div', { className: 'm3-doc-item-amount', textContent: formatCurrency(lineAmt) })
          ]));
        }
        appEl.appendChild(itemsBox);
      }

      // \u2500\u2500 Details \u2500\u2500
      appEl.appendChild(UI.sectionHeader('Details'));
      var detailRows = [
        { label: 'Opportunity', value: opp.name },
        { label: 'Customer / lead', value: party },
        { label: 'Type', value: opp.opportunity_type || '\u2014' },
        { label: 'Source', value: opp.source || '\u2014' },
        { label: 'Sales stage', value: opp.sales_stage || '\u2014' },
        { label: 'Probability', value: probability != null ? probability + '%' : '\u2014' },
        { label: 'Expected close', value: formatDate(opp.expected_closing) },
        { label: 'Status', value: status },
        { label: 'Created', value: formatDate(opp.creation) }
      ];
      if (opp.contact_no) detailRows.push({ label: 'Phone', value: opp.contact_no });
      if (opp.contact_email) detailRows.push({ label: 'Email', value: opp.contact_email });
      appEl.appendChild(UI.detailCard(detailRows));

      // \u2500\u2500 Notes (child table) \u2500\u2500
      if (opp.notes && opp.notes.length > 0) {
        appEl.appendChild(UI.sectionHeader('Notes', { support: opp.notes.length + ' entries' }));
        var notesBox = el('div', { className: 'm3-doc-timeline' });
        for (var j = 0; j < opp.notes.length; j++) {
          var note = opp.notes[j];
          var noteText = (typeof note === 'string') ? note : (note.note || '');
          var noteDate = (typeof note === 'object') ? formatDate(note.added_on || note.creation) : '';
          notesBox.appendChild(el('div', { className: 'm3-doc-timeline-row' }, [
            el('div', { className: 'm3-doc-timeline-dot' }),
            el('div', { className: 'm3-doc-timeline-content' }, [
              el('p', { className: 'm3-doc-timeline-title', textContent: noteText }),
              noteDate ? el('p', { className: 'm3-doc-timeline-date', textContent: noteDate }) : null
            ].filter(Boolean))
          ]));
        }
        appEl.appendChild(notesBox);
      }

      // Activity timeline + comment composer
      if (window.Activity) {
        Activity.attach(appEl, { doctype: 'Opportunity', name: opp.name });
      }

    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load opportunity: ' + (err.message || err)));
    });
  };

})();
