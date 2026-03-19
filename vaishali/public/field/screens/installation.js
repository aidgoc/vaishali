/* installation.js — Installation list + detail screens */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'fully completed' || s === 'completed') return 'green';
    if (s === 'partially completed') return 'orange';
    if (s === 'unscheduled' || s === 'overdue') return 'red';
    return 'gray';
  }

  function removeSkeleton(container) {
    var skeletons = container.querySelectorAll('.skeleton');
    for (var i = 0; i < skeletons.length; i++) {
      if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
    }
  }

  // ── Screen: Installation List ───────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.installationList = function (appEl) {
    appEl.appendChild(UI.page('Installations', '#/service'));

    var activeTab = 'pending';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'pending', label: 'Pending' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'completed', label: 'Completed' }
    ], 'pending', function (val) {
      activeTab = val;
      renderList();
    });
    appEl.appendChild(tabBar);
    appEl.appendChild(listContainer);

    var allData = null;

    function renderList() {
      listContainer.textContent = '';

      if (!allData) {
        listContainer.appendChild(UI.skeleton(3));
        return;
      }

      var items = [];
      if (activeTab === 'pending') {
        // Delivered orders pending install
        items = allData.delivered_orders || [];
      } else if (activeTab === 'scheduled') {
        items = allData.scheduled_installs || [];
      } else {
        items = allData.completed_installs || [];
      }

      if (items.length === 0) {
        listContainer.appendChild(UI.empty('settings', 'No ' + activeTab + ' installations'));
        return;
      }

      for (var i = 0; i < items.length; i++) {
        (function (item) {
          var customer = item.customer || 'Unknown';
          var isMV = !!item.mntc_date; // Maintenance Visit vs Sales Order

          if (isMV) {
            var type = item.maintenance_type || '';
            var status = item.completion_status || '';
            var sub = [type, formatDate(item.mntc_date)].filter(Boolean).join(' \u00b7 ');

            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/installation/' + encodeURIComponent(item.name); }
            }));
          } else {
            // Sales Order — show delivered status
            var status2 = item.status || '';
            var sub2 = ['Delivered: ' + (item.per_delivered || 0) + '%', formatDate(item.delivery_date)].filter(Boolean).join(' \u00b7 ');

            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub2,
              right: UI.pill(status2, statusColor(status2)),
              onClick: function () {
                // Sales orders don't have a detail screen; open in desk
                window.open('/app/sales-order/' + encodeURIComponent(item.name), '_blank');
              }
            }));
          }
        })(items[i]);
      }
    }

    // Load data
    api.apiCall('GET', '/api/field/view/installation_tracker').then(function (res) {
      if (res.error || !res.data) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Could not load installations'));
        return;
      }
      allData = res.data.sections || res.data;
      renderList();
    }).catch(function () {
      listContainer.textContent = '';
      listContainer.appendChild(UI.error('Could not load installations'));
    });
  };

  // ── Screen: Installation Detail ──────────────────────────────────

  window.Screens.installationDetail = function (appEl, params) {
    var visitId = params.id || params.name;

    appEl.appendChild(UI.page('Installation', '#/installations'));

    var content = el('div', { style: { padding: '0 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/resource/Maintenance Visit/' + encodeURIComponent(visitId)).then(function (res) {
      content.textContent = '';

      var mv = null;
      if (res && res.data) {
        mv = res.data.data || res.data;
      }
      if (!mv) {
        content.appendChild(UI.error('Could not load installation details.'));
        return;
      }

      var customer = mv.customer || 'Unknown';
      var status = mv.completion_status || 'Unknown';

      // Header
      content.appendChild(el('div', { style: { marginBottom: '12px' } }, [
        el('h3', { textContent: customer, style: { margin: '0 0 12px 0' } }),
        UI.pill(status, statusColor(status))
      ]));

      // Detail card
      var details = [
        { label: 'Customer', value: customer },
        { label: 'Date', value: formatDate(mv.mntc_date) },
        { label: 'Type', value: mv.maintenance_type || '\u2014' },
        { label: 'Status', value: status },
        { label: 'Contact', value: mv.contact_name || '\u2014' }
      ];

      // Purposes table items
      if (mv.purposes && mv.purposes.length > 0) {
        for (var i = 0; i < mv.purposes.length; i++) {
          var p = mv.purposes[i];
          details.push({
            label: 'Item ' + (i + 1),
            value: (p.item_name || p.item_code || '') + (p.serial_no ? ' (S/N: ' + p.serial_no + ')' : '')
          });
          if (p.work_done) {
            details.push({ label: 'Work Done', value: p.work_done });
          }
        }
      }

      content.appendChild(UI.detailCard(details));

      // Mark Complete button (only if not already completed)
      if (status !== 'Fully Completed') {
        var completeBtn = UI.btn('Mark Complete', {
          type: 'primary',
          block: true,
          onClick: function () {
            completeBtn._setLoading(true, 'Updating...');
            api.apiCall('PUT', '/api/resource/Maintenance Visit/' + encodeURIComponent(visitId), {
              completion_status: 'Fully Completed'
            }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                completeBtn._setLoading(false);
                return;
              }
              UI.toast('Marked as completed!', 'success');
              // Reload
              var currentHash = location.hash;
              location.hash = '#/';
              setTimeout(function () { location.hash = currentHash; }, 0);
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              completeBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '16px' } }, [completeBtn]));
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load installation: ' + (err.message || err)));
    });
  };

})();
