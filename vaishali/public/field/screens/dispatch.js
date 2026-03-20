/* dispatch.js — Dispatch Tracker screen */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // -- Helpers --

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function formatCurrency(val) {
    if (!val && val !== 0) return '';
    var n = parseFloat(val);
    if (isNaN(n)) return '';
    return '\u20B9' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'completed' || s === 'closed') return 'green';
    if (s === 'to deliver and bill' || s === 'to deliver' || s === 'to bill') return 'orange';
    if (s === 'overdue') return 'red';
    return 'blue';
  }

  function removeSkeleton(container) {
    var skeletons = container.querySelectorAll('.skeleton');
    for (var i = 0; i < skeletons.length; i++) {
      if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
    }
  }

  // -- Main Screen --

  window.Screens = window.Screens || {};

  window.Screens.dispatchTracker = function (appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/dispatch_tracker').then(function (res) {
      removeSkeleton(appEl);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load dispatch tracker'));
        return;
      }

      var data = res.data;
      var pendingDelivery = data.pending_delivery || [];
      var recentDeliveries = data.recent_deliveries || [];

      // -- Stat Cards --
      appEl.appendChild(UI.grid([
        UI.statCard(pendingDelivery.length, 'Pending Deliveries'),
        UI.statCard(recentDeliveries.length, 'Delivered This Month')
      ], 2));

      // -- Pending Delivery --
      appEl.appendChild(UI.sectionHeading('PENDING DELIVERY'));
      if (pendingDelivery.length === 0) {
        appEl.appendChild(UI.empty('check', 'All orders delivered'));
      } else {
        for (var i = 0; i < pendingDelivery.length; i++) {
          (function (o) {
            var customer = o.customer || 'Unknown';
            var amount = formatCurrency(o.grand_total);
            var delivered = Math.round(o.per_delivered || 0) + '% delivered';
            var deliveryDate = o.delivery_date ? 'Due ' + formatDate(o.delivery_date) : '';
            var sub = [amount, delivered, deliveryDate].filter(Boolean).join(' \u00b7 ');

            appEl.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(o.status || 'Open', statusColor(o.status))
            }));
          })(pendingDelivery[i]);
        }
      }

      // -- Recent Deliveries --
      appEl.appendChild(UI.sectionHeading('RECENT DELIVERIES'));
      if (recentDeliveries.length === 0) {
        appEl.appendChild(UI.empty('empty', 'No deliveries this month'));
      } else {
        for (var j = 0; j < recentDeliveries.length; j++) {
          (function (d) {
            var customer = d.customer || 'Unknown';
            var amount = formatCurrency(d.grand_total);
            var dateStr = formatDate(d.posting_date);
            var sub = [amount, dateStr].filter(Boolean).join(' \u00b7 ');

            appEl.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill('Delivered', 'green')
            }));
          })(recentDeliveries[j]);
        }
      }

    }).catch(function () {
      removeSkeleton(appEl);
      appEl.appendChild(UI.error('Could not load dispatch tracker'));
    });
  };

})();
