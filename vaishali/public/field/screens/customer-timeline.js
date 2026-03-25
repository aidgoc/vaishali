/* customer-timeline.js — Sales Timeline for a customer in DSPL Field App */
(function () {
  'use strict';

  window.Screens = window.Screens || {};

  window.Screens.customerTimeline = function (appEl, params) {
    var el = UI.el;
    var api = window.fieldAPI;
    var customerId = params.id;

    appEl.appendChild(UI.skeleton(4));

    api.apiCall('GET', '/api/field/customer-timeline/' + encodeURIComponent(customerId)).then(function (resp) {
      appEl.textContent = '';

      var events = [];
      if (resp && resp.data) {
        events = Array.isArray(resp.data) ? resp.data : (resp.data.data || resp.data.message || []);
      }

      if (events.length === 0) {
        appEl.appendChild(UI.empty('clip', 'No sales activity for this customer'));
        return;
      }

      for (var i = 0; i < events.length; i++) {
        (function (ev) {
          var type = ev.type || '';
          var data = ev.data || {};
          var date = ev.date || '';

          var iconMap = { visit: 'user', opportunity: 'target', quotation: 'file', order: 'check' };
          var colorMap = { visit: '#3b82f6', opportunity: '#eab308', quotation: '#f97316', order: '#22c55e' };
          var labelMap = { visit: 'Visit', opportunity: 'Opportunity', quotation: 'Quotation', order: 'Sales Order' };

          var title = (labelMap[type] || type) + (data.name ? ' \u00B7 ' + data.name : '');
          var subParts = [];

          if (type === 'visit') {
            if (data.visit_purpose) subParts.push(data.visit_purpose);
            if (data.employee_name) subParts.push(data.employee_name);
            if (data.conversion_status && data.conversion_status !== 'Open') subParts.push(data.conversion_status);
          } else if (type === 'opportunity') {
            if (data.status) subParts.push(data.status);
            if (data.opportunity_amount) subParts.push('\u20B9' + Number(data.opportunity_amount).toLocaleString('en-IN'));
          } else if (type === 'quotation') {
            if (data.status) subParts.push(data.status);
            if (data.quotation_temperature) subParts.push(data.quotation_temperature);
            if (data.grand_total) subParts.push('\u20B9' + Number(data.grand_total).toLocaleString('en-IN'));
          } else if (type === 'order') {
            if (data.status) subParts.push(data.status);
            if (data.grand_total) subParts.push('\u20B9' + Number(data.grand_total).toLocaleString('en-IN'));
          }

          var sub = subParts.join(' \u00B7 ');

          // Status pill
          var statusText = '';
          var pillColor = 'gray';
          if (type === 'visit' && data.conversion_status) {
            statusText = data.conversion_status;
            var cm = { 'Open': 'gray', 'Lead Created': 'blue', 'Opportunity': 'yellow', 'Quoted': 'orange', 'Won': 'green', 'Lost': 'red' };
            pillColor = cm[statusText] || 'gray';
          } else if (type === 'quotation') {
            statusText = data.quotation_temperature || data.status || '';
            pillColor = statusText === 'Hot' ? 'red' : statusText === 'Warm' ? 'orange' : statusText === 'Won' ? 'green' : statusText === 'Lost' ? 'red' : 'blue';
          } else if (type === 'order') {
            statusText = data.status || '';
            pillColor = 'green';
          }

          var rightEl = el('div', { style: { textAlign: 'right' } }, [
            el('div', { style: { fontSize: '12px', color: 'var(--ink-tertiary, #6B6B70)', whiteSpace: 'nowrap' }, textContent: formatDateShort(date) })
          ]);
          if (statusText) {
            rightEl.appendChild(el('div', { style: { marginTop: '4px' } }, [UI.pill(statusText, pillColor)]));
          }

          // Dot indicator
          var dot = el('div', { style: {
            width: '8px', height: '8px', borderRadius: '50%',
            background: colorMap[type] || '#94a3b8',
            marginTop: '6px', flexShrink: '0'
          } });

          var card = el('div', {
            style: { display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer' },
            onClick: function () {
              // Expand inline details
              var detailEl = card.querySelector('.timeline-detail');
              if (detailEl) {
                detailEl.style.display = detailEl.style.display === 'none' ? 'block' : 'none';
              }
            }
          }, [
            dot,
            el('div', { style: { flex: '1', minWidth: '0' } }, [
              el('div', { style: { fontSize: '14px', fontWeight: '500', color: 'var(--ink-primary)' }, textContent: title }),
              el('div', { style: { fontSize: '13px', color: 'var(--ink-secondary, #6B6B70)', marginTop: '2px' }, textContent: sub }),
              buildDetailSection(type, data)
            ]),
            rightEl
          ]);

          appEl.appendChild(card);
        })(events[i]);
      }
    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load timeline: ' + (err.message || err)));
    });

    function buildDetailSection(type, data) {
      var el2 = UI.el;
      var details = el2('div', { className: 'timeline-detail', style: { display: 'none', marginTop: '6px', fontSize: '12px', color: 'var(--ink-tertiary, #6B6B70)' } });

      if (type === 'visit') {
        if (data.discussion_remarks) details.appendChild(el2('div', { textContent: 'Discussion: ' + data.discussion_remarks, style: { marginBottom: '2px' } }));
        if (data.next_action) details.appendChild(el2('div', { textContent: 'Next: ' + data.next_action, style: { marginBottom: '2px' } }));
        if (data.check_in_time) details.appendChild(el2('div', { textContent: 'Check-in: ' + formatTime(data.check_in_time) }));
      }
      return details;
    }

    function formatDateShort(dateStr) {
      if (!dateStr) return '';
      var parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return parseInt(parts[2], 10) + ' ' + (months[parseInt(parts[1], 10) - 1] || '') + ' ' + parts[0];
    }

    function formatTime(isoString) {
      if (!isoString) return '';
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }
  };
})();
