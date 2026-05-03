/* logsheet-verify.js — Manager verification queue for paper-signed Operator Logsheets.
 *
 * Phase 2.5 of the rental-billing pipeline. Most logsheets get client
 * self-approval via the public URL (Phase 2.2). The remainder are paper-based:
 * the operator uploaded a photo of the signed paper. A manager glances at
 * the photo and either Verifies (→ billable) or Disputes (→ operator notified).
 *
 * Routes:
 *   #/logsheet-verify       — list of pending verifications
 */
(function () {
  'use strict';

  window.Screens = window.Screens || {};
  var api = window.fieldAPI;

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(v) {
    return '₹' + Number(v || 0).toLocaleString('en-IN');
  }

  function formatHours(h) {
    var n = Number(h || 0);
    if (n === Math.floor(n)) return n + ' h';
    return n.toFixed(2) + ' h';
  }

  function formatAge(hours) {
    var h = Number(hours || 0);
    if (h < 1) return 'just now';
    if (h < 24) return h + 'h waiting';
    var days = Math.floor(h / 24);
    return days + (days === 1 ? 'd waiting' : 'd waiting');
  }

  function pillForAge(hours) {
    var h = Number(hours || 0);
    if (h >= 48) return 'red';
    if (h >= 24) return 'yellow';
    return 'blue';
  }

  // ── List screen ──────────────────────────────────────────────────────

  window.Screens.logsheetVerifyList = function (appEl) {
    var el = UI.el;
    var allItems = [];

    var content = el('div');
    appEl.appendChild(content);

    content.appendChild(UI.pageHeader(
      'Verify logsheets',
      'Paper-signed entries awaiting your review before billing.'
    ));

    var statsArea = el('div');
    content.appendChild(statsArea);

    var bulkArea = el('div', { style: { margin: '8px 0 16px' } });
    content.appendChild(bulkArea);

    var listArea = el('div', { style: { marginTop: '8px' } });
    listArea.appendChild(UI.skeleton(3));
    content.appendChild(listArea);

    function renderStats() {
      statsArea.textContent = '';
      var totalHours = 0, totalAmount = 0;
      for (var i = 0; i < allItems.length; i++) {
        totalHours += Number(allItems[i].total_hours || 0);
        totalAmount += Number(allItems[i].amount || 0);
      }
      statsArea.appendChild(UI.statGrid([
        { value: allItems.length, label: 'Pending', support: 'awaiting your check' },
        { value: formatHours(totalHours), label: 'Hours', support: 'across all entries' },
        { value: formatCurrency(totalAmount), label: 'Billable', support: 'once verified' }
      ], 3));
    }

    function renderBulkAction() {
      bulkArea.textContent = '';
      if (allItems.length < 5) return;

      bulkArea.appendChild(UI.btn('Verify all visible (' + allItems.length + ')', {
        type: 'outline',
        block: true,
        icon: 'check',
        onClick: function () {
          UI.confirmDialog(
            'Verify all ' + allItems.length + ' logsheets?',
            'They’ll move to Verified and become billable. You can’t undo this from here.',
            { confirmText: 'Verify all', icon: 'check' }
          ).then(function (ok) {
            if (!ok) return;
            var names = [];
            for (var i = 0; i < allItems.length; i++) names.push(allItems[i].name);

            api.apiCall('POST', '/api/field/logsheet-verify/bulk', { names: JSON.stringify(names) })
              .then(function (res) {
                if (res.error || (res.status && res.status >= 400)) {
                  UI.toast('Bulk verify failed', 'danger');
                  return;
                }
                var data = (res.data && (res.data.message || res.data.data)) || {};
                var n = data.verified_count != null ? data.verified_count : names.length;
                UI.toast(n + ' verified', 'success');
                load();
              }).catch(function () {
                UI.toast('Network error. Try again.', 'danger');
              });
          });
        }
      }));
    }

    function showDisputeSheet(item) {
      var inner = el('div');

      var label = el('div', {
        textContent: 'Why dispute this logsheet?',
        style: {
          font: 'var(--m3-body-medium)',
          color: 'var(--m3-on-surface-variant)',
          margin: '0 0 8px'
        }
      });
      inner.appendChild(label);

      var ta = el('textarea', {
        rows: 4,
        placeholder: 'e.g. hours don’t match site report; signature illegible; wrong equipment label',
        style: {
          width: '100%',
          minHeight: '96px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid rgba(0,0,0,0.12)',
          font: 'var(--m3-body-medium)',
          resize: 'vertical',
          boxSizing: 'border-box'
        }
      });
      inner.appendChild(ta);

      var hint = el('div', {
        textContent: 'The operator will see this reason on the logsheet.',
        style: {
          font: 'var(--m3-body-small)',
          color: 'var(--m3-on-surface-variant)',
          margin: '6px 0 16px'
        }
      });
      inner.appendChild(hint);

      var btnRow = el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } });

      var cancelBtn = UI.btn('Cancel', {
        type: 'text',
        onClick: function () { if (sheet._close) sheet._close(); }
      });
      btnRow.appendChild(cancelBtn);

      var submitBtn = UI.btn('Send dispute', {
        type: 'danger',
        onClick: function () {
          var reason = (ta.value || '').trim();
          if (reason.length < 5) {
            UI.fieldError(ta, 'Please give at least a short reason.');
            return;
          }
          submitBtn.disabled = true;
          api.apiCall('POST', '/api/field/logsheet-verify/' + encodeURIComponent(item.name) + '/dispute',
            { dispute_reason: reason }
          ).then(function (res) {
            submitBtn.disabled = false;
            if (res.error || (res.status && res.status >= 400)) {
              var msg = 'Dispute failed';
              if (res.data && res.data.message) msg = res.data.message;
              UI.toast(msg, 'danger');
              return;
            }
            UI.toast('Disputed', 'success');
            if (sheet._close) sheet._close();
            load();
          }).catch(function () {
            submitBtn.disabled = false;
            UI.toast('Network error. Try again.', 'danger');
          });
        }
      });
      btnRow.appendChild(submitBtn);

      inner.appendChild(btnRow);

      var sheet = UI.bottomSheet('Dispute logsheet', inner);
      document.body.appendChild(sheet);
    }

    function doVerify(item) {
      UI.confirmDialog(
        'Verify this logsheet?',
        item.operator_name + ' · ' + (item.customer_name || '') +
          '\n' + formatHours(item.total_hours) + ' · ' + formatCurrency(item.amount),
        { confirmText: 'Verify', icon: 'check' }
      ).then(function (ok) {
        if (!ok) return;
        api.apiCall('POST', '/api/field/logsheet-verify/' + encodeURIComponent(item.name) + '/verify', {})
          .then(function (res) {
            if (res.error || (res.status && res.status >= 400)) {
              var msg = 'Verify failed';
              if (res.data && res.data.message) msg = res.data.message;
              UI.toast(msg, 'danger');
              return;
            }
            UI.toast('Verified', 'success');
            load();
          }).catch(function () {
            UI.toast('Network error. Try again.', 'danger');
          });
      });
    }

    function buildCard(item) {
      var hoursText = formatHours(item.total_hours);
      var subParts = [];
      if (item.customer_name) subParts.push(item.customer_name);
      if (item.site_name) subParts.push(item.site_name);
      var subLine = subParts.join(' · ');

      var equipLine = '';
      if (item.equipment_label) equipLine = item.equipment_label;
      if (item.shift) equipLine += (equipLine ? ' · ' : '') + item.shift;
      if (item.log_date) equipLine += (equipLine ? ' · ' : '') + formatDate(item.log_date);

      var sub = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, [
        el('div', { textContent: subLine, style: { font: 'var(--m3-body-small)', color: 'var(--m3-on-surface)' } }),
        el('div', { textContent: equipLine, style: { font: 'var(--m3-label-small)', color: 'var(--m3-on-surface-variant)' } })
      ]);

      var rightStack = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } }, [
        el('div', { textContent: hoursText, style: { font: 'var(--m3-title-small)', fontWeight: '600' } }),
        UI.pill(formatAge(item.operator_age_hours), pillForAge(item.operator_age_hours))
      ]);

      return UI.listCard({
        avatar: item.operator_name,
        title: item.operator_name,
        sub: sub,
        right: rightStack,
        onClick: function () { doVerify(item); }
      });
    }

    function renderList() {
      listArea.textContent = '';

      if (allItems.length === 0) {
        listArea.appendChild(UI.empty('check', 'All caught up — no logsheets pending verification.'));
        return;
      }

      var listWrap = el('div', { className: 'm3-list' });

      for (var j = 0; j < allItems.length; j++) {
        (function (item) {
          var card = buildCard(item);

          if (UI.swipeRow) {
            var leading = [{
              icon: 'check', label: 'Verify', color: 'success',
              onClick: function () { doVerify(item); }
            }];
            var trailing = [{
              icon: 'x', label: 'Dispute', color: 'danger',
              onClick: function () { showDisputeSheet(item); }
            }];
            listWrap.appendChild(UI.swipeRow(card, {
              leadingActions: leading,
              trailingActions: trailing
            }));
          } else {
            listWrap.appendChild(card);
          }
        })(allItems[j]);
      }

      listArea.appendChild(listWrap);
    }

    function load() {
      listArea.textContent = '';
      listArea.appendChild(UI.skeleton(3));

      api.apiCall('GET', '/api/field/logsheets-pending-verification').then(function (res) {
        if (res.error) {
          listArea.textContent = '';
          listArea.appendChild(UI.error('Could not load verification queue'));
          return;
        }
        var data = (res.data && (res.data.message || res.data.data)) || [];
        if (!Array.isArray(data)) data = [];
        allItems = data;
        renderStats();
        renderBulkAction();
        renderList();
      }).catch(function () {
        listArea.textContent = '';
        listArea.appendChild(UI.error('Could not load verification queue'));
      });
    }

    load();
  };

})();
