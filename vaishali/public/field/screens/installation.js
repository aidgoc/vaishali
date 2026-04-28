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

    var content = el('div');
    appEl.appendChild(content);
    var skel = UI.skeleton(3);
    content.appendChild(skel);

    api.apiCall('GET', '/api/resource/Maintenance Visit/' + encodeURIComponent(visitId)).then(function (res) {
      skel.remove();

      var mv = null;
      if (res && res.data) {
        mv = res.data.data || res.data.message || res.data;
      }
      if (!mv) {
        content.appendChild(UI.error('Could not load installation details.'));
        return;
      }

      var customer = mv.customer || 'Unknown';
      var status = mv.completion_status || 'Unknown';
      var maintType = mv.maintenance_type || '';

      // M3 hero
      content.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: visitId + ' \u00b7 ' + formatDate(mv.mntc_date) })
          ]),
          maintType ? el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: maintType, style: { font: 'var(--m3-title-large)', letterSpacing: '0' } }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Type' })
          ]) : null
        ].filter(Boolean)),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Quick action \u2014 Mark complete prominent if not done
      var actionBtns = [];
      if (status !== 'Fully Completed') {
        var completeBtn = UI.btn('Mark complete', {
          type: 'primary',
          icon: 'check',
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
              UI.toast('Marked as completed', 'success');
              var currentHash = location.hash;
              location.hash = '#/';
              setTimeout(function () { location.hash = currentHash; }, 0);
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              completeBtn._setLoading(false);
            });
          }
        });
        actionBtns.push(completeBtn);
      }
      if (mv.contact_mobile) {
        actionBtns.push(UI.btn('Call site', { type: 'tonal', icon: 'phone', onClick: function () { location.href = 'tel:' + mv.contact_mobile; } }));
      }
      if (actionBtns.length) {
        content.appendChild(el('div', { className: 'm3-doc-actions' }, actionBtns));
      }

      // Equipment / purposes
      if (mv.purposes && mv.purposes.length > 0) {
        content.appendChild(UI.sectionHeader('Equipment & work done', { support: mv.purposes.length + (mv.purposes.length === 1 ? ' item' : ' items') }));
        var itemsBox = el('div', { className: 'm3-doc-items' });
        for (var i = 0; i < mv.purposes.length; i++) {
          var p = mv.purposes[i];
          var itemName = p.item_name || p.item_code || 'Item';
          var meta = [];
          if (p.serial_no) meta.push('S/N: ' + p.serial_no);
          if (p.work_done) meta.push(p.work_done);
          itemsBox.appendChild(el('div', { className: 'm3-doc-item-row' }, [
            el('div', { className: 'm3-doc-item-content' }, [
              el('div', { className: 'm3-doc-item-name', textContent: itemName }),
              meta.length ? el('div', { className: 'm3-doc-item-meta', textContent: meta.join(' \u00b7 ') }) : null
            ].filter(Boolean))
          ]));
        }
        content.appendChild(itemsBox);
      }

      // Details
      content.appendChild(UI.sectionHeader('Details'));
      content.appendChild(UI.detailCard([
        { label: 'Visit ID', value: mv.name },
        { label: 'Customer', value: customer },
        { label: 'Date', value: formatDate(mv.mntc_date) },
        { label: 'Type', value: maintType || '\u2014' },
        { label: 'Site contact', value: mv.contact_name || '\u2014' },
        { label: 'Site phone', value: mv.contact_mobile || '\u2014' },
        { label: 'Status', value: status }
      ]));

    }).catch(function (err) {
      skel.remove();
      content.appendChild(UI.error('Failed to load installation: ' + (err.message || err)));
    });
  };

})();
