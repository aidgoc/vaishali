/* customer-detail.js — Customer 360 view for DSPL Field App */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  window.Screens.customerDetail = function (appEl, params) {
    var el = UI.el;
    var api = window.fieldAPI;
    var customerId = params.id;

    // Skeleton while loading
    var loader = UI.skeleton(3);
    appEl.appendChild(loader);

    api.apiCall('GET', '/api/field/view/customer_360/' + encodeURIComponent(customerId)).then(function (resp) {
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      if (resp.error || !resp.data) {
        appEl.appendChild(UI.error('Failed to load customer data'));
        return;
      }

      var data = resp.data;
      var allSections = data.sections || data;
      var overview = allSections.overview || {};
      var sections = {};
      // Separate overview from tab sections
      var allKeys = Object.keys(allSections);
      for (var k = 0; k < allKeys.length; k++) {
        if (allKeys[k] !== 'overview') sections[allKeys[k]] = allSections[allKeys[k]];
      }

      // ── Customer header ──────────────────────────────────────
      var customerName = overview.customer_name || customerId;
      var territory = overview.territory || '';
      var customerGroup = overview.customer_group || '';
      var subtitle = [territory, customerGroup].filter(Boolean).join(' \u00B7 ');

      // Update page title
      appEl.textContent = '';
      if (subtitle) {
        appEl.appendChild(el('div', {
          className: 'ink-tertiary',
          textContent: subtitle,
          style: { fontSize: '13px', marginBottom: '16px', marginTop: '-8px' }
        }));
      }

      // ── Overview stats ───────────────────────────────────────
      if (overview.total_revenue != null || overview.outstanding != null) {
        var stats = [];
        if (overview.total_revenue != null) {
          stats.push(UI.statCard(formatCurrency(overview.total_revenue), 'Revenue'));
        }
        if (overview.outstanding != null) {
          stats.push(UI.statCard(formatCurrency(overview.outstanding), 'Outstanding'));
        }
        if (overview.total_orders != null) {
          stats.push(UI.statCard(String(overview.total_orders), 'Orders'));
        }
        if (stats.length > 0) {
          appEl.appendChild(UI.grid(stats, stats.length > 2 ? 3 : 2));
        }
      }

      // ── Build section keys & tab items ───────────────────────
      var sectionKeys = Object.keys(sections);
      if (sectionKeys.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No transaction data found'));
        return;
      }

      var tabItems = [];
      for (var i = 0; i < sectionKeys.length; i++) {
        var key = sectionKeys[i];
        var items = sections[key] || [];
        var label = formatSectionLabel(key) + ' (' + items.length + ')';
        tabItems.push({ label: label, value: key });
      }

      // Section content container
      var contentArea = el('div', { className: 'customer-section' });

      // Active tab state
      var activeTab = sectionKeys[0];

      // Render tabs
      var tabBar = UI.tabs(tabItems, activeTab, function (value) {
        activeTab = value;
        renderSection(contentArea, sections[value] || [], value);
      });
      tabBar.classList.add('customer-tabs');
      appEl.appendChild(tabBar);
      appEl.appendChild(contentArea);

      // Render initial section
      renderSection(contentArea, sections[activeTab] || [], activeTab);

    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load customer data'));
    });

    // ── Helpers ──────────────────────────────────────────────────

    function renderSection(container, items, sectionKey) {
      container.textContent = '';

      if (!items || items.length === 0) {
        container.appendChild(UI.empty('clip', 'No ' + formatSectionLabel(sectionKey).toLowerCase() + ' found'));
        return;
      }

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        container.appendChild(buildRecordCard(item, sectionKey));
      }
    }

    function buildRecordCard(item, sectionKey) {
      var name = item.name || '';
      var date = item.date || item.posting_date || item.transaction_date || '';
      var amt = item.grand_total || item.total || item.amount || 0;
      var status = item.status || item.docstatus_label || '';

      var statusColor = getStatusColor(status);

      var rightContent = el('div', { style: { textAlign: 'right' } }, [
        UI.amount(amt),
        status ? UI.pill(status, statusColor) : null
      ].filter(Boolean));

      var sub = date ? formatDateShort(date) : '';

      return UI.listCard({
        title: name,
        sub: sub,
        right: rightContent,
        onClick: function () {
          // Navigate to ERPNext desk URL if available
          if (item.doctype && item.name) {
            var deskUrl = '/app/' + item.doctype.toLowerCase().replace(/ /g, '-') + '/' + item.name;
            window.open(deskUrl, '_blank');
          }
        }
      });
    }

    function formatSectionLabel(key) {
      // Convert snake_case or lowercase to Title Case
      return key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function formatCurrency(val) {
      var num = Number(val) || 0;
      if (num >= 100000) {
        return '\u20B9' + (num / 100000).toFixed(1) + 'L';
      }
      if (num >= 1000) {
        return '\u20B9' + (num / 1000).toFixed(1) + 'K';
      }
      return '\u20B9' + num.toLocaleString('en-IN');
    }

    function formatDateShort(dateStr) {
      if (!dateStr) return '';
      var parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var m = parseInt(parts[1], 10) - 1;
      return parseInt(parts[2], 10) + ' ' + (months[m] || '') + ' ' + parts[0];
    }

    function getStatusColor(status) {
      if (!status) return '';
      var s = status.toLowerCase();
      if (s === 'paid' || s === 'completed' || s === 'submitted' || s === 'delivered') return 'green';
      if (s === 'overdue' || s === 'cancelled' || s === 'lost') return 'red';
      if (s === 'unpaid' || s === 'pending' || s === 'draft') return 'orange';
      if (s === 'partially paid' || s === 'partly paid') return 'orange';
      return 'blue';
    }
  };
})();
