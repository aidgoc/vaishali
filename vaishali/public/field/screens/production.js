/* production.js — Production Dashboard screen */
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
    if (s === 'in process' || s === 'to deliver and bill' || s === 'to deliver' || s === 'to bill') return 'orange';
    if (s === 'not started' || s === 'draft' || s === 'overdue') return 'red';
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

  window.Screens.productionDashboard = function (appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/production_dashboard').then(function (res) {
      removeSkeleton(appEl);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Could not load production dashboard'));
        return;
      }

      var data = res.data;
      var pendingOrders = data.pending_orders || [];
      var workOrders = data.work_orders || [];
      var stockLevels = data.stock_levels || [];
      var bomStatus = data.bom_status || [];

      // -- Stat Cards --
      appEl.appendChild(UI.grid([
        UI.statCard(pendingOrders.length, 'Pending Orders'),
        UI.statCard(workOrders.length, 'Work Orders'),
        UI.statCard(stockLevels.length, 'Items in Stock'),
        UI.statCard(bomStatus.length, 'Draft BOMs')
      ], 2));

      // -- Quick Action: Dispatch --
      appEl.appendChild(el('div', { style: { textAlign: 'center', padding: '8px 0' } }, [
        UI.btn('View Dispatch', {
          type: 'outline',
          onClick: function () { location.hash = '#/dispatch'; }
        })
      ]));

      // -- Pending Orders --
      appEl.appendChild(UI.sectionHeading('PENDING ORDERS'));
      if (pendingOrders.length === 0) {
        appEl.appendChild(UI.empty('empty', 'No pending orders'));
      } else {
        for (var i = 0; i < pendingOrders.length; i++) {
          (function (o) {
            var customer = o.customer || 'Unknown';
            var amount = formatCurrency(o.grand_total);
            var deliveryDate = o.delivery_date ? 'Due ' + formatDate(o.delivery_date) : '';
            var sub = [amount, deliveryDate].filter(Boolean).join(' \u00b7 ');

            appEl.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(o.status || 'Open', statusColor(o.status))
            }));
          })(pendingOrders[i]);
        }
      }

      // -- Work Orders --
      if (workOrders.length > 0) {
        appEl.appendChild(UI.sectionHeading('WORK ORDERS'));
        for (var j = 0; j < workOrders.length; j++) {
          (function (w) {
            var item = w.production_item || w.name || '';
            var qtyText = (w.produced_qty || 0) + ' / ' + (w.qty || 0);
            var sub = 'Produced: ' + qtyText;

            appEl.appendChild(UI.listCard({
              title: item,
              sub: sub,
              right: UI.pill(w.status || 'Draft', statusColor(w.status))
            }));
          })(workOrders[j]);
        }
      }

      // -- Stock Levels --
      if (stockLevels.length > 0) {
        appEl.appendChild(UI.sectionHeading('STOCK LEVELS'));
        for (var k = 0; k < stockLevels.length; k++) {
          (function (s) {
            var itemCode = s.item_code || '';
            var qty = s.actual_qty || 0;
            var warehouse = s.warehouse || '';
            var whShort = warehouse.replace(' - DSPL', '');
            var sub = 'Qty: ' + qty + ' \u00b7 ' + whShort;

            appEl.appendChild(UI.listCard({
              title: itemCode,
              sub: sub
            }));
          })(stockLevels[k]);
        }
      }

      // -- Draft BOMs --
      if (bomStatus.length > 0) {
        appEl.appendChild(UI.sectionHeading('DRAFT BOMs'));
        var showBoms = Math.min(bomStatus.length, 20);
        for (var m = 0; m < showBoms; m++) {
          (function (b) {
            var itemName = b.item_name || b.item || b.name || '';
            var cost = b.total_cost ? formatCurrency(b.total_cost) : '';
            var sub = cost ? 'Cost: ' + cost : 'No cost estimate';

            appEl.appendChild(UI.listCard({
              title: itemName,
              sub: sub,
              right: UI.pill('Draft', 'red')
            }));
          })(bomStatus[m]);
        }
        if (bomStatus.length > 20) {
          appEl.appendChild(el('div', { className: 'text-muted', style: { textAlign: 'center', padding: '8px 0' } }, [
            '+ ' + (bomStatus.length - 20) + ' more draft BOMs'
          ]));
        }
      }

    }).catch(function () {
      removeSkeleton(appEl);
      appEl.appendChild(UI.error('Could not load production dashboard'));
    });
  };

})();
