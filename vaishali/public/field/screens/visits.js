/* visits.js — DCR / Visit screens for DSPL Field PWA (List, New, Detail) */
(function () {
  'use strict';

  var _timers = [];

  // Cleanup on navigation
  window.addEventListener('hashchange', function () {
    for (var i = 0; i < _timers.length; i++) clearInterval(_timers[i]);
    _timers = [];
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function parseUTC(s) {
    if (!s) return null;
    var t = String(s).replace(' ', 'T');
    if (!/[Z+\-]\d/.test(t)) t += 'Z';
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatTime(isoString) {
    var d = parseUTC(isoString);
    if (!d) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDuration(startISO, endISO) {
    var s = parseUTC(startISO);
    var e = parseUTC(endISO);
    if (!s || !e) return '';
    var diff = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function formatDurationLive(startISO) {
    var d = parseUTC(startISO);
    if (!d) return '00:00:00';
    var diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    var s = diff % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getGPS() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, accuracy: null, error: 'Geolocation not supported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy)
          });
        },
        function (err) {
          resolve({ lat: null, lng: null, accuracy: null, error: err.message });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'completed') return 'green';
    if (s === 'ongoing') return 'yellow';
    return 'gray';
  }

  function weekStartISO() {
    var d = new Date();
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    var mon = new Date(d.setDate(diff));
    var mm = mon.getMonth() + 1;
    var dd = mon.getDate();
    return mon.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  // ── Screen: Visits List ───────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.visitsList = function (appEl) {
    var el = UI.el;

    appEl.appendChild(UI.pageHeader(
      'Visits',
      'Daily call reports — log each customer or prospect visit.'
    ));

    var activeTab = 'today';
    var statsContainer = el('div');
    appEl.appendChild(statsContainer);

    var listContainer = el('div', { style: { marginTop: '12px' } });

    // Filter — segmented (3 options, single-select)
    var segLabel = el('div', {
      textContent: 'Show',
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 4px',
        letterSpacing: '0.5px'
      }
    });
    appEl.appendChild(segLabel);
    var segBar = UI.segmented([
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'all', label: 'All' }
    ], { value: 'today', onChange: function (val) {
      activeTab = val;
      loadVisits();
    } });
    appEl.appendChild(segBar);

    appEl.appendChild(el('div', { style: { padding: '16px 0 8px' } }, [
      UI.btn('Log new visit', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/dcr/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadVisits() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/dcr';
      if (activeTab === 'today') {
        path += '?date=' + todayISO();
      } else if (activeTab === 'week') {
        path += '?from_date=' + weekStartISO() + '&to_date=' + todayISO();
      }

      window.fieldAPI.apiCall('GET', path).then(function (res) {
        listContainer.textContent = '';
        statsContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        // Stats
        var ongoing = 0, completed = 0, planned = 0;
        for (var sIdx = 0; sIdx < items.length; sIdx++) {
          var st = items[sIdx].status || 'Planned';
          if (st === 'Completed') completed++;
          else if (st === 'Ongoing' || st === 'In Progress') ongoing++;
          else planned++;
        }
        statsContainer.appendChild(UI.statGrid([
          { value: items.length, label: 'Total visits', support: activeTab === 'today' ? 'today' : (activeTab === 'week' ? 'this week' : 'all-time') },
          { value: completed, label: 'Completed', support: 'closed out' },
          { value: ongoing, label: 'Ongoing', support: 'currently active' }
        ], 3));

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No visits yet'));
          return;
        }

        var listWrap = el('div', { className: 'm3-list' });
        for (var i = 0; i < items.length; i++) {
          (function (dcr) {
            var customer = dcr.customer || dcr.prospect_name || 'Unknown';
            var purpose = dcr.visit_purpose || dcr.service_purpose || '';
            var time = formatTime(dcr.check_in_time);
            var duration = '';
            if (dcr.check_in_time && dcr.check_out_time) {
              duration = formatDuration(dcr.check_in_time, dcr.check_out_time);
            } else if (dcr.check_in_time) {
              duration = 'ongoing';
            }
            var status = dcr.status || 'Planned';
            var sub = [purpose, time, duration].filter(Boolean).join(' \u00b7 ');

            listWrap.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/dcr/' + dcr.name; }
            }));
          })(items[i]);
        }
        listContainer.appendChild(listWrap);
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load visits: ' + (err.message || err)));
      });
    }

    loadVisits();
  };

  // ── Screen: New Visit ─────────────────────────────────────────────────

  window.Screens.visitNew = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'New visit',
      'Capture customer or prospect, purpose and outcome.'
    ));
    var emp = Auth.getEmployee() || {};
    var empDept = (emp.department || '').toLowerCase();
    var empDesig = (emp.designation || '').toLowerCase();

    // GPS state
    var gps = { lat: null, lng: null, accuracy: null };

    // GPS display card
    var gpsBox = UI.card([
      el('div', { className: 'gps-coords', style: { fontFamily: 'monospace' }, textContent: 'Locating...' })
    ], { className: 'gps-display' });
    appEl.appendChild(gpsBox);

    // Capture GPS
    getGPS().then(function (result) {
      if (result.error) {
        gpsBox.textContent = '';
        gpsBox.className = 'card-surface gps-display';
        gpsBox.appendChild(el('div', {
          textContent: 'GPS error: ' + result.error,
          style: { color: 'var(--red, #dc3545)' }
        }));
        return;
      }
      gps.lat = result.lat;
      gps.lng = result.lng;
      gps.accuracy = result.accuracy;

      gpsBox.textContent = '';
      gpsBox.className = 'card-surface gps-display';
      gpsBox.appendChild(el('div', {
        className: 'gps-coords',
        style: { fontFamily: 'monospace' },
        textContent: gps.lat.toFixed(6) + ', ' + gps.lng.toFixed(6)
      }));
      gpsBox.appendChild(el('div', {
        textContent: 'Accuracy: ' + gps.accuracy + 'm',
        style: { marginTop: '4px', fontSize: '13px', color: 'var(--text-muted, #6c757d)' }
      }));
    });

    // Form state
    var selectedCustomer = null;
    var isProspect = false;
    var followUpDoctype = null;
    var followUpName = null;

    // Purpose dropdowns — must match Daily Call Report DocType select options exactly
    var salesPurposes = ['Cold Call / New Enquiry', 'Lead Follow-up', 'Opportunity Follow-up', 'Quotation Follow-up', 'Order Follow-up', 'Recovery', 'Relationship Building'];
    var servicePurposes = ['Installation', 'Breakdown / Repair', 'Preventive Maintenance (AMC)', 'Commissioning', 'Training', 'Warranty Service', 'Inspection'];

    function matchAny(s, needles) {
      for (var i = 0; i < needles.length; i++) { if (s.indexOf(needles[i]) >= 0) return true; }
      return false;
    }
    var salesHints = ['sales', 'marketing'];
    var serviceHints = ['service', 'support', 'maintenance', 'technician', 'installation', 'commissioning', 'field engineer'];
    var isSales = matchAny(empDept, salesHints) || matchAny(empDesig, salesHints);
    var isService = matchAny(empDept, serviceHints) || matchAny(empDesig, serviceHints);
    // Sales wins if both somehow match (e.g. a "Sales & Service" dept)
    if (isSales && isService) isService = false;

    // Pre-select based on detection; user can always override via the picker below
    var visitType = isSales ? 'sales' : isService ? 'service' : null;

    var visitPurposeField = UI.select('Visit Purpose', salesPurposes);
    var visitPurposeSelect = visitPurposeField.querySelector('select');
    var servicePurposeField = UI.select('Service Purpose', servicePurposes);
    var servicePurposeSelect = servicePurposeField.querySelector('select');

    // Visit type picker — always shown so users can override a wrong auto-detection
    var salesBtn = UI.btn('Sales Visit', { type: 'outline', onClick: function () { setVisitType('sales'); } });
    var serviceBtn = UI.btn('Service Visit', { type: 'outline', onClick: function () { setVisitType('service'); } });
    var typePickerEl = el('div', { style: { marginBottom: '16px' } }, [
      el('div', { className: 'section-heading', textContent: 'Visit type' }),
      el('div', { style: { display: 'flex', gap: '8px' } }, [salesBtn, serviceBtn])
    ]);

    function setVisitType(type) {
      visitType = type;
      var active = type === 'sales' ? salesBtn : serviceBtn;
      var inactive = type === 'sales' ? serviceBtn : salesBtn;
      active.classList.add('btn-primary-styled'); active.classList.remove('btn-outline');
      inactive.classList.add('btn-outline'); inactive.classList.remove('btn-primary-styled');
      if (type === 'sales') {
        visitPurposeField.style.display = 'block';
        servicePurposeField.style.display = 'none';
        serviceFields.style.display = 'none';
      } else {
        visitPurposeField.style.display = 'none';
        servicePurposeField.style.display = 'block';
        serviceFields.style.display = 'block';
      }
    }

    // Blur validation on purpose selects
    visitPurposeSelect.addEventListener('blur', function () {
      if (visitType === 'sales' && !visitPurposeSelect.value) {
        UI.fieldError(visitPurposeSelect, 'Required');
      } else {
        UI.fieldError(visitPurposeSelect, null);
      }
    });
    servicePurposeSelect.addEventListener('blur', function () {
      if (visitType === 'service' && !servicePurposeSelect.value) {
        UI.fieldError(servicePurposeSelect, 'Required');
      } else {
        UI.fieldError(servicePurposeSelect, null);
      }
    });

    // Initial visibility — both hidden until a type is chosen (final selection applied
    // after serviceFields is defined below, since setVisitType touches it)
    visitPurposeField.style.display = 'none';
    servicePurposeField.style.display = 'none';

    // Customer search
    var customerDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
    var searchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var customerSearch = UI.searchInput('Search customer...', function (query) {
      if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        searchResults.textContent = '';
        return;
      }
      window.fieldAPI.apiCall('GET', '/api/field/customers?search=' + encodeURIComponent(query)).then(function (res) {
        searchResults.textContent = '';
        var customers = [];
        if (res && res.data) {
          customers = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }
        if (customers.length === 0) {
          searchResults.style.display = 'none';
          return;
        }
        searchResults.style.display = 'block';
        for (var i = 0; i < customers.length; i++) {
          (function (c) {
            var name = c.name || c.customer_name || c;
            var label = typeof c === 'string' ? c : (c.customer_name || c.name);
            var resultItem = el('div', {
              className: 'search-result-item',
              textContent: label,
              onClick: function () {
                selectedCustomer = name;
                searchResults.style.display = 'none';
                showCustomerChip(label);
              }
            });
            searchResults.appendChild(resultItem);
          })(customers[i]);
        }
      });
    });

    var customerField = UI.field('Customer', el('div', null, [customerSearch, searchResults, customerDisplay]));
    var customerSearchInput = customerSearch.querySelector('input');

    // Blur validation on customer search — check if customer selected
    customerSearchInput.addEventListener('blur', function () {
      // Delay slightly so click-to-select can fire first
      setTimeout(function () {
        if (!selectedCustomer && !isProspect) {
          UI.fieldError(customerSearchInput, 'Required');
        } else {
          UI.fieldError(customerSearchInput, null);
        }
      }, 200);
    });

    function showCustomerChip(label) {
      UI.fieldError(customerSearchInput, null);
      customerDisplay.textContent = '';
      customerDisplay.style.display = 'block';
      var removeBtn = el('button', {
        textContent: '\u00d7',
        className: 'chip-remove',
        style: { marginLeft: '8px', background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#666' },
        onClick: function () {
          selectedCustomer = null;
          customerDisplay.style.display = 'none';
          customerSearch.querySelector('input').value = '';
        }
      });
      customerDisplay.appendChild(el('div', { className: 'customer-chip', style: {
        display: 'inline-flex', alignItems: 'center', background: 'var(--control-bg, #f0f0f0)',
        borderRadius: '20px', padding: '6px 12px', fontSize: '14px'
      } }, [
        el('span', { textContent: label }),
        removeBtn
      ]));
      checkFollowUp();
    }

    // Follow-up selector (shown when purpose contains "Follow-up" and customer is selected)
    var followUpContainer = el('div', { style: { display: 'none' } });

    function checkFollowUp() {
      followUpDoctype = null;
      followUpName = null;
      followUpContainer.textContent = '';
      followUpContainer.style.display = 'none';

      var purpose = visitPurposeSelect.value || '';
      if (purpose.indexOf('Follow-up') === -1 || !selectedCustomer || isProspect) return;

      followUpContainer.style.display = 'block';
      followUpContainer.appendChild(UI.skeleton(2));

      window.fieldAPI.apiCall('GET', '/api/field/customer-open-items?customer=' + encodeURIComponent(selectedCustomer)).then(function (res) {
        followUpContainer.textContent = '';
        var data = {};
        if (res && res.data) {
          data = res.data.data || res.data.message || res.data;
        }
        var leads = data.leads || [];
        var quotations = data.quotations || [];
        var opportunities = data.opportunities || [];

        if (leads.length === 0 && quotations.length === 0 && opportunities.length === 0) {
          followUpContainer.style.display = 'none';
          return;
        }

        followUpContainer.appendChild(UI.sectionHeading('Following up on'));

        function makeCard(doctype, name, title, sub, selected) {
          var card = el('div', {
            className: 'card-surface' + (selected ? ' follow-up-selected' : ''),
            style: {
              padding: '10px 12px', marginBottom: '6px', borderRadius: '8px', cursor: 'pointer',
              border: selected ? '2px solid var(--primary, #E60005)' : '2px solid transparent'
            },
            onClick: function () {
              if (followUpName === name) {
                followUpDoctype = null;
                followUpName = null;
              } else {
                followUpDoctype = doctype;
                followUpName = name;
              }
              renderFollowUpCards(leads, quotations, opportunities);
            }
          }, [
            el('div', { textContent: title, style: { fontWeight: '500', fontSize: '14px' } }),
            el('div', { textContent: sub, style: { fontSize: '12px', color: 'var(--text-muted, #6c757d)' } })
          ]);
          return card;
        }

        function renderFollowUpCards(ld, qt, op) {
          followUpContainer.textContent = '';
          followUpContainer.appendChild(UI.sectionHeading('Following up on'));
          for (var i = 0; i < ld.length; i++) {
            var l = ld[i];
            followUpContainer.appendChild(makeCard('Lead', l.name, l.lead_name || l.name, 'Lead \u00b7 ' + (l.status || ''), followUpName === l.name));
          }
          for (var j = 0; j < op.length; j++) {
            var o = op[j];
            var oAmt = o.opportunity_amount ? ' \u00b7 \u20b9' + Number(o.opportunity_amount).toLocaleString('en-IN') : '';
            followUpContainer.appendChild(makeCard('Opportunity', o.name, o.name, 'Opportunity' + oAmt, followUpName === o.name));
          }
          for (var k = 0; k < qt.length; k++) {
            var q = qt[k];
            var qAmt = q.grand_total ? ' \u00b7 \u20b9' + Number(q.grand_total).toLocaleString('en-IN') : '';
            followUpContainer.appendChild(makeCard('Quotation', q.name, q.name, 'Quotation' + qAmt + ' \u00b7 ' + (q.status || ''), followUpName === q.name));
          }
        }

        renderFollowUpCards(leads, quotations, opportunities);
      });
    }

    // Trigger follow-up check when purpose or customer changes
    visitPurposeSelect.addEventListener('change', checkFollowUp);

    // Prospect toggle + fields
    var prospectFields = el('div', { style: { display: 'none' } });
    var prospectNameInput = UI.textInput('Prospect name');
    prospectNameInput.addEventListener('blur', function () {
      if (isProspect && !prospectNameInput.value.trim()) {
        UI.fieldError(prospectNameInput, 'Required');
      } else {
        UI.fieldError(prospectNameInput, null);
      }
    });
    var prospectCompanyInput = UI.textInput('Company');
    var prospectPhoneInput = UI.textInput('Phone', { type: 'tel' });
    var prospectAddressInput = UI.textarea('Address', { rows: 2 });
    prospectFields.appendChild(UI.field('Prospect Name', prospectNameInput));
    prospectFields.appendChild(UI.field('Company', prospectCompanyInput));
    prospectFields.appendChild(UI.field('Phone', prospectPhoneInput));
    prospectFields.appendChild(UI.field('Address', prospectAddressInput));

    var prospectToggle = UI.toggle('New prospect?', false, function (val) {
      isProspect = val;
      prospectFields.style.display = val ? 'block' : 'none';
    });

    // Service-specific fields (only visible for service visits)
    var serviceFields = el('div', { style: { display: 'none' } });
    var equipmentInput = UI.textInput('Equipment name');
    var serialInput = UI.textInput('Serial number');
    var jobCardInput = UI.textInput('Job card number');
    serviceFields.appendChild(UI.field('Equipment', equipmentInput));
    serviceFields.appendChild(UI.field('Serial No', serialInput));
    serviceFields.appendChild(UI.field('Job Card No', jobCardInput));

    // Apply pre-selected visit type now that serviceFields exists
    if (visitType) setVisitType(visitType);

    // Error display
    var errorBox = el('div', { style: { display: 'none' } });

    // Submit button
    var submitBtn = UI.btn('Check in & start', {
      type: 'success',
      block: true,
      icon: 'mapPin',
      onClick: handleSubmit
    });

    // Build form card
    var formChildren = [];
    if (typePickerEl) formChildren.push(typePickerEl);
    formChildren.push(visitPurposeField);
    formChildren.push(servicePurposeField);
    formChildren.push(customerField);
    formChildren.push(followUpContainer);
    formChildren.push(prospectToggle);
    formChildren.push(prospectFields);
    formChildren.push(serviceFields);
    formChildren.push(errorBox);
    formChildren.push(el('div', { style: { marginTop: '12px' } }, [submitBtn]));

    appEl.appendChild(UI.card(formChildren));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      // Must pick visit type
      if (!visitType) {
        showError('Please select a visit type (Sales or Service).');
        return;
      }

      // Validate customer or prospect
      if (!isProspect && !selectedCustomer) {
        UI.fieldError(customerSearchInput, 'Customer is required');
        valid = false;
      } else {
        UI.fieldError(customerSearchInput, null);
      }

      if (isProspect && !prospectNameInput.value.trim()) {
        UI.fieldError(prospectNameInput, 'Prospect name is required');
        valid = false;
      } else if (isProspect) {
        UI.fieldError(prospectNameInput, null);
      }

      // Validate purpose
      if (visitType === 'sales' && !visitPurposeSelect.value) {
        UI.fieldError(visitPurposeSelect, 'Visit purpose is required');
        valid = false;
      } else if (visitType === 'sales') {
        UI.fieldError(visitPurposeSelect, null);
      }
      if (visitType === 'service' && !servicePurposeSelect.value) {
        UI.fieldError(servicePurposeSelect, 'Service purpose is required');
        valid = false;
      } else if (visitType === 'service') {
        UI.fieldError(servicePurposeSelect, null);
      }

      if (!valid) {
        var firstError = appEl.querySelector('.field-error-text');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Checking in...');

      var now = new Date().toISOString();
      var payload = {
        date: todayISO(),
        department: emp.department || '',
        check_in_time: now,
        check_in_gps: (gps.lat != null && gps.lng != null) ? gps.lat + ',' + gps.lng : ''
      };

      if (selectedCustomer && !isProspect) {
        payload.customer = selectedCustomer;
      }
      // Only send the purpose field matching the visit type
      if (visitType === 'sales') {
        payload.visit_purpose = visitPurposeSelect.value;
      } else if (visitType === 'service') {
        payload.service_purpose = servicePurposeSelect.value;
      }
      if (isProspect) {
        payload.prospect_name = prospectNameInput.value.trim();
        payload.prospect_company = prospectCompanyInput.value.trim();
        payload.prospect_phone = prospectPhoneInput.value.trim();
        payload.prospect_address = prospectAddressInput.value.trim();
      }
      if (visitType === 'service') {
        payload.equipment_name = equipmentInput.value.trim();
        payload.serial_no = serialInput.value.trim();
        payload.job_card_no = jobCardInput.value.trim();
      }
      if (followUpDoctype && followUpName) {
        payload.follow_up_doctype = followUpDoctype;
        payload.follow_up_name = followUpName;
      }

      window.fieldAPI.apiCall('POST', '/api/field/dcr', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Visit started!', 'success');
        var newName = (res.data && (res.data.name || (res.data.data && res.data.data.name) || (res.data.message && res.data.message.name))) || '';
        if (newName) {
          location.hash = '#/dcr/' + newName;
        } else {
          location.hash = '#/dcr';
        }
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Visit Detail ──────────────────────────────────────────────

  window.Screens.visitDetail = function (appEl, params) {
    appEl.appendChild(UI.pageHeader('Visit', params.id || ''));
    var el = UI.el;
    var dcrName = params.id || params.name;

    var content = el('div', { style: { padding: '0 16px' } });
    appEl.appendChild(content);
    content.appendChild(UI.skeleton(3));

    window.fieldAPI.apiCall('GET', '/api/field/dcr/' + encodeURIComponent(dcrName)).then(function (res) {
      content.textContent = '';

      var dcr = null;
      if (res && res.data) {
        dcr = res.data.data || res.data.message || res.data;
      }
      if (!dcr) {
        content.appendChild(UI.error('Could not load visit.'));
        return;
      }

      var customer = dcr.customer || dcr.prospect_name || 'Unknown';
      var status = dcr.status || 'Planned';
      var isOngoing = status.toLowerCase() === 'ongoing';

      // Header: customer name + status pill
      content.appendChild(el('div', { style: { marginBottom: '12px' } }, [
        el('h3', { textContent: customer, style: { margin: '0 0 12px 0' } }),
        UI.pill(status, statusColor(status))
      ]));

      // Live duration timer (for ongoing visits)
      if (isOngoing && dcr.check_in_time) {
        var durationEl = el('div', {
          className: 'duration-timer',
          textContent: formatDurationLive(dcr.check_in_time)
        });
        content.appendChild(durationEl);

        var tid = setInterval(function () {
          durationEl.textContent = formatDurationLive(dcr.check_in_time);
        }, 1000);
        _timers.push(tid);
      }

      // Detail card
      var details = [
        { label: 'Customer', value: customer },
        { label: 'Purpose', value: dcr.visit_purpose || dcr.service_purpose || '\u2014' },
        { label: 'Department', value: dcr.department || '\u2014' },
        { label: 'Check In', value: formatTime(dcr.check_in_time) + (dcr.check_in_gps ? ' (' + dcr.check_in_gps + ')' : '') }
      ];

      if (dcr.check_out_time) {
        details.push({ label: 'Check Out', value: formatTime(dcr.check_out_time) + (dcr.check_out_gps ? ' (' + dcr.check_out_gps + ')' : '') });
      }

      if (dcr.check_in_time && dcr.check_out_time) {
        details.push({ label: 'Duration', value: formatDuration(dcr.check_in_time, dcr.check_out_time) });
      }

      if (dcr.remarks) {
        details.push({ label: 'Remarks', value: dcr.remarks });
      }
      if (dcr.discussion_remarks) {
        details.push({ label: 'Discussion', value: dcr.discussion_remarks });
      }
      if (dcr.next_action) {
        details.push({ label: 'Next Action', value: dcr.next_action });
      }
      if (dcr.next_action_date) {
        details.push({ label: 'Next Action Date', value: formatDate(dcr.next_action_date) });
      }
      if (dcr.conversion_status && dcr.conversion_status !== 'Open') {
        details.push({ label: 'Conversion', value: dcr.conversion_status });
      }

      content.appendChild(UI.detailCard(details));

      // Convert to Lead button (for completed visits with prospect data, no customer)
      if (!isOngoing && dcr.prospect_name && !dcr.customer) {
        var convertBtn = UI.btn('Convert to Lead', {
          type: 'outline',
          block: true,
          onClick: function () {
            convertBtn._setLoading(true, 'Creating lead...');
            var leadPayload = {
              lead_name: dcr.prospect_name,
              company_name: dcr.prospect_company || '',
              mobile_no: dcr.prospect_phone || '',
              source: 'Campaign',
              notes: 'Created from visit ' + dcrName + ' on ' + (dcr.date || '') + '. Purpose: ' + (dcr.visit_purpose || dcr.service_purpose || '')
            };
            window.fieldAPI.apiCall('POST', '/api/field/proxy/Lead', leadPayload).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                convertBtn._setLoading(false);
                return;
              }
              UI.toast('Lead created!', 'success');
              convertBtn._setLoading(false);
              convertBtn.style.display = 'none';
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              convertBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [convertBtn]));
      }

      // Editable remarks (for ongoing visits)
      if (isOngoing) {
        var remarksArea = UI.textarea('Add remarks...', { rows: 3, value: dcr.remarks || '' });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [
          UI.field('Remarks', remarksArea)
        ]));

        var saveRemarksBtn = UI.btn('Save Remarks', {
          type: 'outline',
          block: true,
          onClick: function () {
            var text = remarksArea.value.trim();
            if (!text) {
              UI.toast('Please enter remarks', 'danger');
              return;
            }
            saveRemarksBtn._setLoading(true, 'Saving...');
            window.fieldAPI.apiCall('PUT', '/api/field/dcr/' + encodeURIComponent(dcrName), {
              remarks: text
            }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed to save: ' + (r.error || 'Server error'), 'danger');
                saveRemarksBtn._setLoading(false);
                return;
              }
              UI.toast('Remarks saved', 'success');
              saveRemarksBtn._setLoading(false);
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              saveRemarksBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [saveRemarksBtn]));

        // Checkout button — opens outcome bottom sheet
        var checkoutBtn = UI.btn('Check out', {
          type: 'primary',
          block: true,
          icon: 'mapPin',
          onClick: function () {
            var purpose = dcr.visit_purpose || '';
            var sheetContent = el('div', { style: { padding: '0 4px' } });

            // Outcome checkboxes (conditional on visit_purpose)
            var leadToggle = null, oppToggle = null, orderToggle = null;
            var leadVal = false, oppVal = false, orderVal = false;

            var showLead = ['Cold Call / New Enquiry', 'Lead Follow-up'].indexOf(purpose) >= 0;
            var showOpp = ['Cold Call / New Enquiry', 'Lead Follow-up', 'Opportunity Follow-up'].indexOf(purpose) >= 0;
            var showOrder = purpose === 'Quotation Follow-up';

            if (showLead) {
              leadToggle = UI.toggle('Lead generated?', false, function (v) { leadVal = v; });
              sheetContent.appendChild(leadToggle);
            }
            if (showOpp) {
              oppToggle = UI.toggle('Opportunity generated?', false, function (v) { oppVal = v; });
              sheetContent.appendChild(oppToggle);
            }
            if (showOrder) {
              orderToggle = UI.toggle('Order received?', false, function (v) { orderVal = v; });
              sheetContent.appendChild(orderToggle);
            }

            // Discussion / Remark
            var discussionInput = UI.textarea('Discussion / Remark', { rows: 3 });
            sheetContent.appendChild(el('div', { style: { marginTop: '12px' } }, [
              UI.field('Discussion / Remark', discussionInput)
            ]));

            // Next action
            var nextActionInput = UI.textarea('Next action', { rows: 2 });
            sheetContent.appendChild(el('div', { style: { marginTop: '8px' } }, [
              UI.field('Next action', nextActionInput)
            ]));

            // Next action date
            var nextDateInput = UI.dateInput('Next action date', '');
            sheetContent.appendChild(el('div', { style: { marginTop: '8px' } }, [nextDateInput]));

            // Confirm checkout button
            var confirmBtn = UI.btn('Confirm checkout', {
              type: 'success',
              block: true,
              icon: 'mapPin',
              onClick: function () {
                confirmBtn._setLoading(true, 'Checking out...');
                getGPS().then(function (gpsResult) {
                  var now = new Date().toISOString();
                  var gpsStr = (gpsResult.lat != null && gpsResult.lng != null) ? gpsResult.lat + ',' + gpsResult.lng : '';
                  var dateInput = nextDateInput.querySelector('input');
                  var payload = {
                    check_out_time: now,
                    check_out_gps: gpsStr,
                    lead_generated: leadVal ? 1 : 0,
                    opportunity_generated: oppVal ? 1 : 0,
                    order_received: orderVal ? 1 : 0,
                    discussion_remarks: discussionInput.value.trim() || '',
                    next_action: nextActionInput.value.trim() || '',
                    next_action_date: (dateInput && dateInput.value) || ''
                  };
                  window.fieldAPI.apiCall('PUT', '/api/field/dcr/' + encodeURIComponent(dcrName) + '/checkout', payload).then(function (r) {
                    if (r.error || (r.status && r.status >= 400)) {
                      UI.toast('Checkout failed: ' + (r.error || 'Server error'), 'danger');
                      confirmBtn._setLoading(false);
                      return;
                    }
                    for (var j = 0; j < _timers.length; j++) clearInterval(_timers[j]);
                    _timers = [];
                    if (sheet && sheet._close) sheet._close();
                    UI.toast('Checked out!', 'success');
                    var currentHash = location.hash;
                    location.hash = '#/';
                    setTimeout(function () { location.hash = currentHash; }, 0);
                  }).catch(function (err) {
                    UI.toast('Checkout failed: ' + (err.message || err), 'danger');
                    confirmBtn._setLoading(false);
                  });
                });
              }
            });
            sheetContent.appendChild(el('div', { style: { marginTop: '16px' } }, [confirmBtn]));

            var sheet = UI.bottomSheet('Check out', sheetContent);
            document.body.appendChild(sheet);
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [checkoutBtn]));
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load visit: ' + (err.message || err)));
    });
  };

})();
