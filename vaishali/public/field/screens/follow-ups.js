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

  function statusColor(status) {
    if (!status) return 'blue';
    var s = status.toLowerCase();
    if (s === 'expired' || s === 'lost') return 'red';
    if (s === 'open' || s === 'submitted') return 'blue';
    if (s === 'ordered' || s === 'converted') return 'green';
    return 'orange';
  }

  // ─── Flat section ─────────────────────────────────────────────────

  function flatSection(appEl, title, items, sublabelFn) {
    appEl.appendChild(UI.sectionHeading(title + ' (' + items.length + ')'));

    if (!items || items.length === 0) {
      appEl.appendChild(UI.empty('clip', 'No ' + title.toLowerCase()));
      return;
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var sub = sublabelFn(item);
      var amountStr = formatIndianAmount(item.grand_total);
      var displaySub = item.name ? item.name : '';
      if (sub) displaySub = displaySub ? displaySub + ' · ' + sub : sub;
      if (amountStr) displaySub = displaySub ? displaySub + ' · ' + amountStr : amountStr;

      appEl.appendChild(UI.listCard({
        title: item.party_name || item.customer_name || item.name || 'Untitled',
        sub: displaySub,
        right: UI.pill(item.status || 'Open', statusColor(item.status)),
        onClick: (function (itm) {
          return function () {
            var partyName = itm.party_name || itm.customer_name || '';
            if (partyName) {
              location.hash = '#/customer/' + encodeURIComponent(partyName);
            }
          };
        })(item)
      }));
    }
  }

  // ─── Main render ──────────────────────────────────────────────────

  function renderFollowUps(appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/follow_ups').then(function (res) {
      appEl.textContent = '';

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load follow-up data'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var expiring = sections.expiring_soon || [];
      var open = sections.open_quotes || [];
      var lost = sections.lost_quotes || [];

      // Summary chips
      appEl.appendChild(el('div', { style: 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap' }, [
        UI.pill(expiring.length + ' Expiring', 'red'),
        UI.pill(open.length + ' Open', 'blue'),
        UI.pill(lost.length + ' Lost', 'gray')
      ]));

      // Expiring Soon
      flatSection(appEl, 'EXPIRING SOON', expiring, function (item) {
        return expiryLabel(item.valid_till);
      });

      // Open Quotations — sorted oldest first
      var sortedOpen = open.slice().sort(function (a, b) {
        var da = new Date(a.transaction_date || 0);
        var db = new Date(b.transaction_date || 0);
        return da.getTime() - db.getTime();
      });
      flatSection(appEl, 'OPEN QUOTATIONS', sortedOpen, function (item) {
        return daysSince(item.transaction_date);
      });

      // Lost
      flatSection(appEl, 'LOST', lost, function () {
        return '';
      });
    }).catch(function () {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Could not load follow-up data'));
    });
  }

  // ─── Export ────────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.followUps = function (appEl) {
    renderFollowUps(appEl);
  };

})();
