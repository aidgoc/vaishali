/* opportunity.js — Opportunity screens for DSPL Field PWA (List + Detail) */
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

    appEl.appendChild(UI.skeleton(3));

    window.fieldAPI.apiCall('GET', '/api/field/opportunity/' + encodeURIComponent(oppName)).then(function (res) {
      appEl.textContent = '';

      var opp = null;
      if (res && res.data) {
        opp = res.data.data || res.data.message || res.data;
      }
      if (!opp) {
        appEl.appendChild(UI.error('Could not load opportunity.'));
        return;
      }

      var party = opp.party_name || 'Unknown';
      var status = opp.status || 'Open';

      // Header
      appEl.appendChild(el('div', { style: { marginBottom: '12px' } }, [
        el('h3', { textContent: party, style: { margin: '0 0 8px 0' } }),
        UI.pill(status, statusColor(status))
      ]));

      // Detail card
      var details = [
        { label: 'Opportunity', value: opp.name },
        { label: 'Party', value: party },
        { label: 'Type', value: opp.opportunity_type || '\u2014' },
        { label: 'Source', value: opp.source || '\u2014' },
        { label: 'Amount', value: opp.opportunity_amount ? formatCurrency(opp.opportunity_amount) : '\u2014' },
        { label: 'Status', value: status },
        { label: 'Created', value: formatDate(opp.creation) }
      ];
      appEl.appendChild(UI.detailCard(details));

      // Items if any
      if (opp.items && opp.items.length > 0) {
        appEl.appendChild(el('div', { style: { marginTop: '16px' } }));
        appEl.appendChild(UI.sectionHeading('Items'));
        for (var i = 0; i < opp.items.length; i++) {
          var item = opp.items[i];
          appEl.appendChild(UI.listCard({
            title: item.item_name || item.item_code,
            sub: 'Qty: ' + (item.qty || 0) + ' \u00b7 ' + formatCurrency(item.amount || 0)
          }));
        }
      }

      // Notes
      if (opp.notes && opp.notes.length > 0) {
        appEl.appendChild(el('div', { style: { marginTop: '16px' } }));
        appEl.appendChild(UI.sectionHeading('Notes'));
        for (var j = 0; j < opp.notes.length; j++) {
          var note = opp.notes[j];
          appEl.appendChild(UI.card([
            el('div', { textContent: note.note || note, style: { fontSize: '14px' } })
          ]));
        }
      }

      // Action buttons
      if (status === 'Open' || status === 'Replied') {
        var createQuotBtn = UI.btn('Create Quotation', {
          type: 'primary',
          block: true,
          icon: 'plus',
          onClick: function () {
            location.hash = '#/quotations/new?opportunity=' + encodeURIComponent(opp.name) + '&customer=' + encodeURIComponent(party);
          }
        });
        appEl.appendChild(el('div', { style: { marginTop: '16px' } }, [createQuotBtn]));
      }

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load opportunity: ' + (err.message || err)));
    });
  };

})();
