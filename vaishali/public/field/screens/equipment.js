/* equipment.js — Equipment Tracker for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      var ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'active') return 'green';
    if (s === 'delivered') return 'blue';
    if (s === 'in maintenance' || s === 'maintenance') return 'yellow';
    if (s === 'inactive' || s === 'expired') return 'red';
    return 'gray';
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var parts = dateStr.split('-');
    if (parts.length < 3) return null;
    var target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '--';
    var parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return parseInt(parts[2], 10) + ' ' + (months[parseInt(parts[1], 10) - 1] || '') + ' ' + parts[0];
  }

  function warrantyPill(dateStr) {
    var days = daysUntil(dateStr);
    if (days === null) return el('span', { textContent: '--', style: { color: 'var(--ink-tertiary)', fontSize: '13px' } });
    var color, text;
    if (days < 0) {
      color = 'red';
      text = 'Expired ' + Math.abs(days) + 'd ago';
    } else if (days <= 30) {
      color = 'orange';
      text = days + 'd remaining';
    } else if (days <= 90) {
      color = 'yellow';
      text = days + 'd remaining';
    } else {
      color = 'green';
      text = days + 'd remaining';
    }
    return UI.pill(text, color);
  }

  function duePill(dateStr, label) {
    var days = daysUntil(dateStr);
    if (days === null) return el('span', { textContent: 'Not scheduled', style: { color: 'var(--ink-tertiary)', fontSize: '13px' } });
    var color, text;
    if (days < 0) {
      color = 'red';
      text = 'Overdue by ' + Math.abs(days) + 'd';
    } else if (days <= 7) {
      color = 'orange';
      text = 'Due in ' + days + 'd';
    } else if (days <= 30) {
      color = 'yellow';
      text = 'Due in ' + days + 'd';
    } else {
      color = 'green';
      text = formatDateShort(dateStr);
    }
    return UI.pill(text, color);
  }

  // ── Equipment List ──────────────────────────────────────────────

  function renderEquipmentList(appEl) {
    var currentSearch = '';
    var currentStatus = '';

    // Search bar
    var searchInput = UI.searchInput('Search serial, item, customer...', debounce(function (val) {
      currentSearch = val;
      fetchAndRender();
    }, 400));
    appEl.appendChild(searchInput);

    // Status filter tabs
    var statusFilter = el('div', { style: { margin: '8px 0' } });
    appEl.appendChild(statusFilter);

    // KPI row placeholder
    var kpiContainer = el('div');
    appEl.appendChild(kpiContainer);

    // List container
    var listContainer = el('div');
    appEl.appendChild(listContainer);

    // Initial load
    appEl.appendChild(UI.skeleton(3));
    fetchAndRender();

    function fetchAndRender() {
      var qs = [];
      if (currentSearch) qs.push('search=' + encodeURIComponent(currentSearch));
      if (currentStatus) qs.push('status=' + encodeURIComponent(currentStatus));
      var path = '/api/field/equipment' + (qs.length ? '?' + qs.join('&') : '');

      api.apiCall('GET', path).then(function (res) {
        // Remove skeletons
        var skels = appEl.querySelectorAll('.skeleton');
        for (var i = 0; i < skels.length; i++) {
          if (skels[i].parentNode) skels[i].parentNode.removeChild(skels[i]);
        }

        if (res.error || !res.data) {
          listContainer.textContent = '';
          listContainer.appendChild(UI.error('Could not load equipment'));
          return;
        }

        var data = res.data.data || res.data.message || res.data;
        var total = data.total || 0;
        var byStatus = data.by_status || {};
        var equipment = data.equipment || [];

        // KPI row
        var activeCount = byStatus['Active'] || 0;
        var maintenanceCount = byStatus['In Maintenance'] || 0;

        // Count warranty expiring soon (within 90 days)
        var warrantyExpiring = 0;
        for (var wi = 0; wi < equipment.length; wi++) {
          var wDays = daysUntil(equipment[wi].warranty_expiry);
          if (wDays !== null && wDays >= 0 && wDays <= 90) warrantyExpiring++;
        }

        kpiContainer.textContent = '';
        kpiContainer.appendChild(UI.kpiRow([
          { value: String(total), label: 'Total' },
          { value: String(activeCount), label: 'Active' },
          { value: String(maintenanceCount), label: 'In maintenance' },
          { value: String(warrantyExpiring), label: 'Warranty expiring' }
        ]));

        // Status filter pills
        statusFilter.textContent = '';
        var statuses = ['', 'Active', 'Delivered', 'In Maintenance', 'Inactive'];
        var statusLabels = ['All', 'Active', 'Delivered', 'In Maintenance', 'Inactive'];
        for (var si = 0; si < statuses.length; si++) {
          (function (s, label) {
            var isActive = currentStatus === s;
            var pill = el('button', {
              textContent: label,
              className: 'filter-pill' + (isActive ? ' filter-pill-active' : ''),
              style: {
                display: 'inline-block',
                padding: '6px 12px',
                marginRight: '6px',
                marginBottom: '4px',
                borderRadius: '8px',
                border: isActive ? '1.5px solid var(--ink-primary)' : '1px solid rgba(0,0,0,0.08)',
                background: isActive ? 'rgba(230,0,5,0.06)' : 'var(--surface-1, #F8F8F8)',
                color: isActive ? 'var(--ink-primary)' : 'var(--ink-secondary, #6B6B70)',
                fontSize: '13px',
                fontWeight: isActive ? '600' : '500',
                cursor: 'pointer'
              },
              onClick: function () {
                currentStatus = s;
                fetchAndRender();
              }
            });
            statusFilter.appendChild(pill);
          })(statuses[si], statusLabels[si]);
        }

        // Equipment list
        listContainer.textContent = '';

        if (equipment.length === 0) {
          listContainer.appendChild(UI.empty('settings', 'No equipment found'));
          return;
        }

        for (var ei = 0; ei < equipment.length; ei++) {
          var eq = equipment[ei];
          var subParts = [eq.serial_no];
          if (eq.customer) subParts.push(eq.customer);
          if (eq.customer_site) subParts.push(eq.customer_site);

          listContainer.appendChild(UI.listCard({
            title: eq.item_name || eq.item_code || eq.serial_no,
            sub: subParts.join(' \u00B7 '),
            right: UI.pill(eq.status || 'Unknown', statusColor(eq.status)),
            onClick: (function (sn) {
              return function () { location.hash = '#/equipment/' + encodeURIComponent(sn); };
            })(eq.serial_no)
          }));
        }
      }).catch(function () {
        var skels = appEl.querySelectorAll('.skeleton');
        for (var i = 0; i < skels.length; i++) {
          if (skels[i].parentNode) skels[i].parentNode.removeChild(skels[i]);
        }
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Could not load equipment'));
      });
    }
  }

  // ── Equipment Detail ────────────────────────────────────────────

  function renderEquipmentDetail(appEl, params) {
    var serialNo = params.id;

    var loader = UI.skeleton(3);
    appEl.appendChild(loader);

    api.apiCall('GET', '/api/field/equipment?search=' + encodeURIComponent(serialNo)).then(function (res) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (res.error || !res.data) {
        appEl.appendChild(UI.error('Failed to load equipment data'));
        return;
      }

      var data = res.data.data || res.data.message || res.data;
      var equipment = data.equipment || [];

      // Find exact match
      var eq = null;
      for (var i = 0; i < equipment.length; i++) {
        if (equipment[i].serial_no === serialNo) {
          eq = equipment[i];
          break;
        }
      }
      if (!eq && equipment.length > 0) eq = equipment[0];

      if (!eq) {
        appEl.appendChild(UI.empty('settings', 'Equipment not found'));
        return;
      }

      appEl.textContent = '';

      // Header: item name + serial no + status
      var headerCard = el('div', { className: 'card-surface', style: { padding: '16px', marginBottom: '12px' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
          el('div', null, [
            el('div', { style: { fontSize: '17px', fontWeight: '600', color: 'var(--ink-primary)', letterSpacing: '-0.04em' }, textContent: eq.item_name || eq.item_code }),
            el('div', { style: { fontSize: '13px', color: 'var(--ink-secondary, #6B6B70)', marginTop: '2px' }, textContent: eq.serial_no })
          ]),
          UI.pill(eq.status || 'Unknown', statusColor(eq.status))
        ])
      ]);
      appEl.appendChild(headerCard);

      // Detail card: core info
      var detailRows = [];
      if (eq.customer) detailRows.push({ label: 'Customer', value: eq.customer });
      if (eq.customer_site) detailRows.push({ label: 'Site', value: eq.customer_site });
      if (eq.dc_number) detailRows.push({ label: 'DC Number', value: eq.dc_number });
      if (eq.krisp_id) detailRows.push({ label: 'Krisp ID', value: eq.krisp_id });
      if (eq.delivery_date) detailRows.push({ label: 'Delivery date', value: formatDateShort(eq.delivery_date) });
      if (eq.item_code) detailRows.push({ label: 'Item code', value: eq.item_code });

      // Asset types
      var assetTypes = [eq.asset_type_1, eq.asset_type_2, eq.asset_type_3].filter(Boolean);
      if (assetTypes.length) detailRows.push({ label: 'Asset type', value: assetTypes.join(', ') });

      if (detailRows.length) {
        appEl.appendChild(UI.detailCard(detailRows));
      }

      // Warranty section
      appEl.appendChild(UI.sectionHeading('Warranty'));
      var warrantyCard = el('div', { className: 'card-surface', style: { padding: '16px', marginBottom: '12px' } });

      var warrantyRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', null, [
          el('div', { style: { fontSize: '12px', fontWeight: '500', color: 'var(--ink-tertiary, #6B6B70)' }, textContent: 'Warranty expiry' }),
          el('div', { style: { fontSize: '15px', color: 'var(--ink-primary)', marginTop: '2px' }, textContent: eq.warranty_expiry ? formatDateShort(eq.warranty_expiry) : 'Not set' })
        ]),
        warrantyPill(eq.warranty_expiry)
      ]);
      warrantyCard.appendChild(warrantyRow);
      appEl.appendChild(warrantyCard);

      // Maintenance section
      appEl.appendChild(UI.sectionHeading('Maintenance'));
      var maintCard = el('div', { className: 'card-surface', style: { padding: '16px', marginBottom: '12px' } });

      // Next calibration
      var calRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
        el('div', null, [
          el('div', { style: { fontSize: '12px', fontWeight: '500', color: 'var(--ink-tertiary, #6B6B70)' }, textContent: 'Next calibration' }),
          el('div', { style: { fontSize: '15px', color: 'var(--ink-primary)', marginTop: '2px' }, textContent: eq.next_calibration ? formatDateShort(eq.next_calibration) : 'Not scheduled' })
        ]),
        duePill(eq.next_calibration, 'Calibration')
      ]);
      maintCard.appendChild(calRow);

      // Next maintenance
      var maintRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', null, [
          el('div', { style: { fontSize: '12px', fontWeight: '500', color: 'var(--ink-tertiary, #6B6B70)' }, textContent: 'Next maintenance' }),
          el('div', { style: { fontSize: '15px', color: 'var(--ink-primary)', marginTop: '2px' }, textContent: eq.next_maintenance ? formatDateShort(eq.next_maintenance) : 'Not scheduled' })
        ]),
        duePill(eq.next_maintenance, 'Maintenance')
      ]);
      maintCard.appendChild(maintRow);

      appEl.appendChild(maintCard);

      // Service history (future — empty state)
      appEl.appendChild(UI.sectionHeading('Service history'));
      appEl.appendChild(UI.empty('clip', 'No service history yet'));

    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load equipment data'));
    });
  }

  // ── Export ──────────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.equipmentList = function (appEl) {
    renderEquipmentList(appEl);
  };
  window.Screens.equipmentDetail = function (appEl, params) {
    renderEquipmentDetail(appEl, params);
  };

})();
