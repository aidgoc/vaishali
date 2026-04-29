/* service-call.js — Service Call list, new, detail screens */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ─────────────────────────────────────────────────────

  function formatDateTime(iso) {
    if (!iso) return '';
    var t = String(iso).replace(' ', 'T');
    if (!/[Z+\-]\d/.test(t)) t += 'Z';
    var d = new Date(t);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ' · ' + h + ':' + (m<10?'0':'') + m + ' ' + ampm;
  }

  function outcomeColor(outcome) {
    switch ((outcome || '').toLowerCase()) {
      case 'resolved on call': return 'green';
      case 'visit needed': return 'red';
      case 'pending': return 'orange';
      case 'customer unreachable': return 'gray';
      default: return 'gray';
    }
  }

  function inputValue(wrapper) {
    var inp = wrapper && (wrapper.querySelector('input') || wrapper.querySelector('textarea'));
    return inp ? (inp.value || '') : '';
  }

  // ─── List screen ─────────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.serviceCallList = function (appEl) {
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/service-calls').then(function (res) {
      appEl.textContent = '';
      var raw = (res.data && (res.data.data || res.data.message)) || res.data || [];
      var calls = Array.isArray(raw) ? raw : (raw.data || []);

      if (!calls.length) {
        appEl.appendChild(UI.empty('phone', 'No service calls yet', {
          text: '+ Log call',
          onClick: function () { location.hash = '#/service-call/new'; }
        }));
        return;
      }

      for (var i = 0; i < calls.length; i++) {
        (function (c) {
          appEl.appendChild(UI.listCard({
            title: c.customer_name || c.customer || 'Unknown',
            sub: (formatDateTime(c.call_datetime) + ' · ' + (c.channel || '') + ' · ' + (c.summary || '')).substring(0, 90),
            right: UI.pill(c.outcome || '', outcomeColor(c.outcome)),
            onClick: function () { location.hash = '#/service-call/' + encodeURIComponent(c.name); }
          }));
        })(calls[i]);
      }

      appEl.appendChild(UI.fab(function () { location.hash = '#/service-call/new'; }));
    });
  };

  // ─── New / form screen ───────────────────────────────────────────

  window.Screens.serviceCallNew = function (appEl) {
    var openedAt = new Date().toISOString();
    var qs = (location.hash.split('?')[1] || '');
    var params = new URLSearchParams(qs);
    var prefilledCustomer = params.get('customer') || '';
    var prefilledWarranty = params.get('warranty_claim') || '';
    var prefilledDevice = params.get('device') || '';

    appEl.textContent = '';

    var customerInput = UI.m3TextField('Customer', { value: prefilledCustomer });
    appEl.appendChild(customerInput);

    var channel = 'Phone';
    var channelSeg = UI.segmented(['Phone', 'WhatsApp', 'Other'], channel, function (v) { channel = v; });
    appEl.appendChild(UI.field('Channel', channelSeg));

    var outcome = '';
    var outcomeSeg = UI.segmented(
      ['Resolved on call', 'Visit needed', 'Pending', 'Customer unreachable'],
      null, function (v) { outcome = v; });
    appEl.appendChild(UI.field('Outcome', outcomeSeg));

    var summaryInput = UI.m3TextField('Summary (one line)', { multiline: true, rows: 2 });
    appEl.appendChild(summaryInput);

    var moreOpen = false;
    var moreToggle = el('button', {
      className: 'btn m3-btn-text',
      textContent: 'More details ▾',
      style: { marginTop: '8px' },
      onClick: function () {
        moreOpen = !moreOpen;
        moreBox.style.display = moreOpen ? 'block' : 'none';
        moreToggle.textContent = moreOpen ? 'More details ▴' : 'More details ▾';
      }
    });
    appEl.appendChild(moreToggle);

    var direction = 'Inbound';
    var moreBox = el('div', { style: { display: 'none', marginTop: '12px' } });
    moreBox.appendChild(UI.field('Direction', UI.segmented(['Inbound', 'Outbound'], direction, function (v) { direction = v; })));
    var durationInput = UI.m3TextField('Duration (min)', { type: 'number' });
    moreBox.appendChild(durationInput);
    var deviceInput = UI.m3TextField('Device (optional)', { value: prefilledDevice });
    moreBox.appendChild(deviceInput);
    var warrantyInput = UI.m3TextField('Warranty Claim (optional)', { value: prefilledWarranty });
    moreBox.appendChild(warrantyInput);
    var contactInput = UI.m3TextField('Contact (optional)', {});
    moreBox.appendChild(contactInput);
    appEl.appendChild(moreBox);

    var saveBtn = UI.btn('Save', {
      type: 'primary',
      block: true,
      onClick: function () {
        var customer = inputValue(customerInput);
        var summary = inputValue(summaryInput);
        if (!customer) { UI.fieldError(customerInput, 'Customer is required'); return; }
        if (!outcome) { UI.toast('Pick an outcome', 'danger'); return; }
        if (!summary.trim()) { UI.fieldError(summaryInput, 'Summary is required'); return; }

        saveBtn._setLoading(true, 'Saving…');
        var body = {
          customer: customer,
          channel: channel,
          outcome: outcome,
          summary: summary.trim(),
          direction: direction,
          duration_minutes: parseInt(inputValue(durationInput) || '0', 10) || null,
          device: inputValue(deviceInput) || null,
          warranty_claim: inputValue(warrantyInput) || null,
          contact: inputValue(contactInput) || null,
          form_opened_at: openedAt,
          form_saved_at: new Date().toISOString()
        };
        api.apiCall('POST', '/api/field/service-calls', body).then(function (res) {
          saveBtn._setLoading(false);
          if (res.error || (res.status && res.status >= 400)) {
            UI.toast('Save failed: ' + api.extractError(res), 'danger');
            return;
          }
          UI.toast('Call logged', 'success');
          var saved = (res.data && (res.data.data || res.data.message)) || res.data || {};
          if (outcome === 'Visit needed') {
            var dcrParams = ['from_service_call=' + encodeURIComponent(saved.name || ''),
                             'customer=' + encodeURIComponent(customer)];
            if (body.device) dcrParams.push('device=' + encodeURIComponent(body.device));
            location.hash = '#/dcr/new?' + dcrParams.join('&');
          } else {
            history.back();
          }
        });
      }
    });
    appEl.appendChild(el('div', { style: { marginTop: '24px', position: 'sticky', bottom: '16px' } }, [saveBtn]));
  };

  // ─── Detail screen ───────────────────────────────────────────────

  window.Screens.serviceCallDetail = function (appEl, ctx) {
    var svcId = ctx && (ctx.id || (ctx.params && ctx.params.id));
    if (!svcId) {
      var hash = location.hash.split('?')[0];
      svcId = decodeURIComponent(hash.replace(/^#\/service-call\//, ''));
    }
    appEl.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/service-call/' + encodeURIComponent(svcId)).then(function (res) {
      appEl.textContent = '';
      if (res.error || (res.status && res.status >= 400)) {
        appEl.appendChild(UI.error(api.extractError(res)));
        return;
      }
      var c = (res.data && (res.data.data || res.data.message)) || res.data || {};

      appEl.appendChild(el('div', { className: 'm3-detail-hero' }, [
        el('h2', { textContent: c.customer_name || c.customer || '—' }),
        el('div', { className: 'ink-tertiary', textContent: formatDateTime(c.call_datetime) + ' · ' + (c.channel || '') }),
        UI.pill(c.outcome || '', outcomeColor(c.outcome))
      ]));

      appEl.appendChild(UI.detailCard([
        { label: 'Direction', value: c.direction || '—' },
        { label: 'Duration', value: c.duration_minutes ? c.duration_minutes + ' min' : '—' },
        { label: 'Engineer', value: c.employee_name || '—' },
        { label: 'Device', value: c.device || '—' },
        { label: 'Warranty Claim', value: c.warranty_claim || '—' },
        { label: 'Follow-up Visit', value: c.follow_up_dcr || '—' }
      ]));

      appEl.appendChild(UI.sectionHeading('Summary'));
      appEl.appendChild(UI.card([el('p', { textContent: c.summary || '—' })]));

      if (c.remarks) {
        appEl.appendChild(UI.sectionHeading('Remarks (desk)'));
        appEl.appendChild(UI.card([el('p', { textContent: c.remarks })]));
      }
    });
  };

})();
