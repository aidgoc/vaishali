/* customer-detail.js — Customer 360 view for DSPL Field App */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  window.Screens.customerDetail = function (appEl, params) {
    var el = UI.el;
    var api = window.fieldAPI;
    var customerId = params.id;

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
      var allKeys = Object.keys(allSections);
      for (var k = 0; k < allKeys.length; k++) {
        if (allKeys[k] !== 'overview') sections[allKeys[k]] = allSections[allKeys[k]];
      }

      appEl.textContent = '';

      // ── Customer info card ───────────────────────────────────
      var infoRows = [];

      // Type & industry
      var typeParts = [overview.customer_type, overview.industry].filter(Boolean);
      if (typeParts.length) infoRows.push({ label: 'Type', value: typeParts.join(' \u00B7 ') });

      // Territory & group
      var geoParts = [overview.territory, overview.customer_group].filter(Boolean);
      if (geoParts.length) infoRows.push({ label: 'Segment', value: geoParts.join(' \u00B7 ') });

      // GSTIN
      if (overview.gstin) infoRows.push({ label: 'GSTIN', value: overview.gstin });
      else if (overview.tax_id) infoRows.push({ label: 'Tax ID', value: overview.tax_id });

      // Website
      if (overview.website) infoRows.push({ label: 'Website', value: overview.website });

      if (infoRows.length) {
        appEl.appendChild(UI.detailCard(infoRows));
      }

      // ── Primary contact ──────────────────────────────────────
      var contactName = overview.customer_primary_contact || '';
      var mobile = overview.mobile_no || '';
      var email = overview.email_id || '';

      if (contactName || mobile || email) {
        appEl.appendChild(UI.sectionHeading('PRIMARY CONTACT'));
        var contactCard = el('div', { className: 'card-surface' });
        if (contactName) {
          contactCard.appendChild(el('div', {
            style: { fontSize: '15px', fontWeight: '600', color: 'var(--ink-primary)', marginBottom: '4px' },
            textContent: contactName
          }));
        }
        var contactActions = el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } });
        if (mobile) {
          contactActions.appendChild(UI.btn(mobile, {
            type: 'outline',
            icon: 'phone',
            onClick: function () { window.open('tel:' + mobile); }
          }));
        }
        if (email) {
          contactActions.appendChild(UI.btn('Email', {
            type: 'outline',
            icon: 'mail',
            onClick: function () { window.open('mailto:' + email); }
          }));
        }
        contactCard.appendChild(contactActions);
        appEl.appendChild(contactCard);
      }

      // ── Address ──────────────────────────────────────────────
      var addresses = overview.addresses || [];
      if (addresses.length > 0) {
        appEl.appendChild(UI.sectionHeading('ADDRESS' + (addresses.length > 1 ? 'ES' : '')));
        for (var ai = 0; ai < addresses.length; ai++) {
          var addr = addresses[ai];
          var addrParts = [addr.address_line1, addr.address_line2,
            [addr.city, addr.state].filter(Boolean).join(', '),
            addr.pincode ? 'PIN ' + addr.pincode : ''].filter(Boolean);
          var addrRows = [
            { label: addr.address_type || 'Address', value: addrParts.join('\n') }
          ];
          if (addr.gstin) addrRows.push({ label: 'GSTIN', value: addr.gstin });
          if (addr.phone) addrRows.push({ label: 'Phone', value: addr.phone });
          appEl.appendChild(UI.detailCard(addrRows));
        }
      }

      // ── All contacts ─────────────────────────────────────────
      var contacts = overview.contacts || [];
      if (contacts.length > 1) {
        appEl.appendChild(UI.sectionHeading('CONTACTS (' + contacts.length + ')'));
        for (var ci = 0; ci < contacts.length; ci++) {
          var c = contacts[ci];
          var cName = [c.first_name, c.last_name].filter(Boolean).join(' ');
          var cSub = [c.designation, c.department].filter(Boolean).join(' \u00B7 ');
          var cRight = null;
          if (c.mobile_no) {
            cRight = el('a', {
              href: 'tel:' + c.mobile_no,
              textContent: c.mobile_no,
              style: { fontSize: '13px', color: 'var(--ink-secondary)', textDecoration: 'none' }
            });
          }
          appEl.appendChild(UI.listCard({
            title: cName || c.name,
            sub: cSub || (c.email_id || ''),
            right: cRight,
            onClick: c.mobile_no ? function (num) { return function () { window.open('tel:' + num); }; }(c.mobile_no) : null
          }));
        }
      }

      // ── Overview stats ───────────────────────────────────────
      if (overview.total_revenue != null || overview.outstanding != null) {
        var kpiItems = [];
        if (overview.total_revenue != null) kpiItems.push({ value: formatCurrency(overview.total_revenue), label: 'Revenue' });
        if (overview.outstanding != null) kpiItems.push({ value: formatCurrency(overview.outstanding), label: 'Outstanding' });
        if (overview.total_orders != null) kpiItems.push({ value: String(overview.total_orders), label: 'Orders' });
        if (kpiItems.length > 0) {
          appEl.appendChild(UI.kpiRow(kpiItems));
        }
      }

      // ── Transaction tabs ─────────────────────────────────────
      var sectionKeys = Object.keys(sections);
      if (sectionKeys.length === 0) return;

      var tabItems = [];
      for (var i = 0; i < sectionKeys.length; i++) {
        var key = sectionKeys[i];
        var items = sections[key] || [];
        var label = formatSectionLabel(key) + ' (' + items.length + ')';
        tabItems.push({ label: label, value: key });
      }

      var contentArea = el('div', { className: 'customer-section' });
      var activeTab = sectionKeys[0];

      var tabBar = UI.tabs(tabItems, activeTab, function (value) {
        activeTab = value;
        renderSection(contentArea, sections[value] || [], value);
      });
      appEl.appendChild(tabBar);
      appEl.appendChild(contentArea);

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
        container.appendChild(buildRecordCard(items[i], sectionKey));
      }
    }

    function buildRecordCard(item, sectionKey) {
      var name = item.name || '';
      var date = item.date || item.posting_date || item.transaction_date || '';
      var amt = item.grand_total || item.total || item.amount || item.paid_amount || 0;
      var status = item.status || '';

      var rightChildren = [];
      if (amt) rightChildren.push(UI.amount(amt));
      if (status) rightChildren.push(UI.pill(status, getStatusColor(status)));
      var rightContent = rightChildren.length ? el('div', { style: { textAlign: 'right' } }, rightChildren) : null;

      return UI.listCard({
        title: name,
        sub: date ? formatDateShort(date) : (item.visit_purpose || item.service_purpose || ''),
        right: rightContent
      });
    }

    function formatSectionLabel(key) {
      return key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function formatCurrency(val) {
      var num = Number(val) || 0;
      if (num >= 10000000) return '\u20B9' + (num / 10000000).toFixed(1) + 'Cr';
      if (num >= 100000) return '\u20B9' + (num / 100000).toFixed(1) + 'L';
      if (num >= 1000) return '\u20B9' + (num / 1000).toFixed(1) + 'K';
      return '\u20B9' + num.toLocaleString('en-IN');
    }

    function formatDateShort(dateStr) {
      if (!dateStr) return '';
      var parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return parseInt(parts[2], 10) + ' ' + (months[parseInt(parts[1], 10) - 1] || '') + ' ' + parts[0];
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
