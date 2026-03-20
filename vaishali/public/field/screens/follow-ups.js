/* follow-ups.js — Follow Ups screen for DSPL Field App */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ──────────────────────────────────────────────────────

  function formatIndianAmount(value) {
    var num = Number(value) || 0;
    if (num >= 10000000) {
      return '\u20B9' + (num / 10000000).toFixed(1) + 'Cr';
    }
    if (num >= 100000) {
      return '\u20B9' + (num / 100000).toFixed(1) + 'L';
    }
    if (num >= 1000) {
      return '\u20B9' + (num / 1000).toFixed(1) + 'K';
    }
    return '\u20B9' + num.toLocaleString('en-IN');
  }

  function daysDiff(isoString) {
    if (!isoString) return null;
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  function daysSince(isoString) {
    var diff = daysDiff(isoString);
    if (diff === null) return '';
    return Math.abs(diff) + ' days since quoted';
  }

  function expiryLabel(validTill) {
    var diff = daysDiff(validTill);
    if (diff === null) return '';
    if (diff > 0) return diff + ' days left';
    if (diff === 0) return 'Expires today';
    return 'Expired ' + Math.abs(diff) + ' days ago';
  }

  // ─── Follow-up card ──────────────────────────────────────────────

  function followUpCard(item, cssClass, sublabel) {
    var title = item.party_name || item.customer_name || item.name || 'Untitled';
    var children = [
      el('div', { className: 'pipeline-card-title', textContent: title }),
      el('div', { className: 'pipeline-card-sub', textContent: item.name || '' }),
      el('div', { className: 'pipeline-card-meta' }, [
        el('span', { className: 'pipeline-card-amount', textContent: formatIndianAmount(item.grand_total) }),
        el('span', { className: 'pipeline-card-date', textContent: sublabel })
      ])
    ];

    var card = el('div', { className: 'pipeline-card ' + cssClass, onClick: function () {
      var partyName = item.party_name || item.customer_name || '';
      if (partyName) {
        location.hash = '#/customer/' + encodeURIComponent(partyName);
      }
    } }, children);

    return card;
  }

  // ─── Collapsible section ─────────────────────────────────────────

  function collapsibleSection(title, items, cardFn, startCollapsed) {
    var heading = el('div', { className: 'section-label', textContent: title });
    var container = el('div', {});
    var body = el('div', {});

    if (!items || items.length === 0) {
      body.appendChild(UI.empty('clip', 'No ' + title.toLowerCase()));
    } else {
      for (var i = 0; i < items.length; i++) {
        body.appendChild(cardFn(items[i]));
      }
    }

    if (startCollapsed && items && items.length > 0) {
      body.style.display = 'none';
      heading.style.cursor = 'pointer';
      var arrow = el('span', { textContent: ' \u25B6', className: 'collapse-arrow' });
      heading.appendChild(arrow);
      heading.addEventListener('click', function () {
        if (body.style.display === 'none') {
          body.style.display = '';
          arrow.textContent = ' \u25BC';
        } else {
          body.style.display = 'none';
          arrow.textContent = ' \u25B6';
        }
      });
    }

    container.appendChild(heading);
    container.appendChild(body);
    return container;
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderFollowUps(appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/follow_ups').then(function (res) {
      // Remove skeletons
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load follow-up data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var expiring = sections.expiring_soon || [];
      var open = sections.open_quotes || [];
      var lost = sections.lost_quotes || [];

      // Count badges
      var badges = el('div', { className: 'count-badges' }, [
        el('span', { className: 'count-badge red', textContent: expiring.length + ' Expiring' }),
        el('span', { className: 'count-badge blue', textContent: open.length + ' Open' }),
        el('span', { className: 'count-badge gray', textContent: lost.length + ' Lost' })
      ]);
      appEl.appendChild(badges);

      // Expiring Soon
      appEl.appendChild(collapsibleSection('EXPIRING SOON', expiring, function (item) {
        return followUpCard(item, 'followup-card-urgent', expiryLabel(item.valid_till));
      }, false));

      // Open Quotations — sorted oldest first
      var sortedOpen = open.slice().sort(function (a, b) {
        var da = new Date(a.transaction_date || 0);
        var db = new Date(b.transaction_date || 0);
        return da.getTime() - db.getTime();
      });
      appEl.appendChild(collapsibleSection('OPEN QUOTATIONS', sortedOpen, function (item) {
        return followUpCard(item, 'followup-card-open', daysSince(item.transaction_date));
      }, false));

      // Lost — collapsed by default
      appEl.appendChild(collapsibleSection('LOST', lost, function (item) {
        return followUpCard(item, 'followup-card-lost', '');
      }, true));
    }).catch(function () {
      var skeletons = appEl.querySelectorAll('.skeleton');
      for (var i = 0; i < skeletons.length; i++) {
        if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
      }
      appEl.appendChild(UI.error('Could not load follow-up data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.followUps = function (appEl) {
    renderFollowUps(appEl);
  };

})();
