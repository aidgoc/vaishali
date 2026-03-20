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

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatDuration(startISO, endISO) {
    var start = new Date(startISO).getTime();
    var end = new Date(endISO).getTime();
    var diff = Math.max(0, Math.floor((end - start) / 1000));
    var h = Math.floor(diff / 3600);
    var m = Math.floor((diff % 3600) / 60);
    return h + 'h ' + m + 'm';
  }

  function formatDurationLive(startISO) {
    var start = new Date(startISO).getTime();
    var diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
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

    var activeTab = 'today';
    var listContainer = el('div');

    var tabBar = UI.tabs([
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This Week' },
      { value: 'all', label: 'All' }
    ], 'today', function (val) {
      activeTab = val;
      loadVisits();
    });
    appEl.appendChild(tabBar);

    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('+ New Visit', {
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

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('clip', 'No visits yet'));
          return;
        }

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

            listContainer.appendChild(UI.listCard({
              avatar: customer,
              title: customer,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/dcr/' + dcr.name; }
            }));
          })(items[i]);
        }
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
    var emp = Auth.getEmployee() || {};
    var empDept = (emp.department || '').toLowerCase();

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

    // Purpose dropdowns — must match Daily Call Report DocType select options exactly
    var salesPurposes = ['Cold Call / New Enquiry', 'Lead Follow-up', 'Quotation Follow-up', 'Order Follow-up', 'Recovery', 'Relationship Building'];
    var servicePurposes = ['Installation', 'Breakdown / Repair', 'Preventive Maintenance (AMC)', 'Commissioning', 'Training', 'Warranty Service', 'Inspection'];

    var isSales = empDept.indexOf('sales') >= 0 || empDept.indexOf('marketing') >= 0;
    var isService = empDept.indexOf('service') >= 0 || empDept.indexOf('support') >= 0;
    var isOther = !isSales && !isService;

    // Visit type — auto-detected for sales/service, choosable for others
    var visitType = isSales ? 'sales' : isService ? 'service' : null;

    var visitPurposeField = UI.select('Visit Purpose', salesPurposes);
    var visitPurposeSelect = visitPurposeField.querySelector('select');
    var servicePurposeField = UI.select('Service Purpose', servicePurposes);
    var servicePurposeSelect = servicePurposeField.querySelector('select');

    // Visit type picker (only shown if department is neither sales nor service)
    var typePickerEl = null;
    if (isOther) {
      var salesBtn = UI.btn('Sales Visit', { type: 'outline', onClick: function () { setVisitType('sales'); } });
      var serviceBtn = UI.btn('Service Visit', { type: 'outline', onClick: function () { setVisitType('service'); } });
      typePickerEl = el('div', { style: { marginBottom: '16px' } }, [
        el('div', { className: 'section-heading', textContent: 'VISIT TYPE' }),
        el('div', { style: { display: 'flex', gap: '8px' } }, [salesBtn, serviceBtn])
      ]);
    }

    function setVisitType(type) {
      visitType = type;
      if (type === 'sales') {
        visitPurposeField.style.display = 'block';
        servicePurposeField.style.display = 'none';
        serviceFields.style.display = 'none';
        if (typePickerEl) {
          typePickerEl.querySelector('.section-heading').textContent = 'SALES VISIT';
        }
      } else {
        visitPurposeField.style.display = 'none';
        servicePurposeField.style.display = 'block';
        serviceFields.style.display = 'block';
        if (typePickerEl) {
          typePickerEl.querySelector('.section-heading').textContent = 'SERVICE VISIT';
        }
      }
    }

    // Auto-hide based on detected department
    if (isSales) {
      servicePurposeField.style.display = 'none';
    } else if (isService) {
      visitPurposeField.style.display = 'none';
    } else {
      // Other departments — hide both until type is chosen
      visitPurposeField.style.display = 'none';
      servicePurposeField.style.display = 'none';
    }

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

    function showCustomerChip(label) {
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
    }

    // Prospect toggle + fields
    var prospectFields = el('div', { style: { display: 'none' } });
    var prospectNameInput = UI.textInput('Prospect name');
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
    var serviceFields = el('div', { style: { display: isService ? 'block' : 'none' } });
    var equipmentInput = UI.textInput('Equipment name');
    var serialInput = UI.textInput('Serial number');
    var jobCardInput = UI.textInput('Job card number');
    serviceFields.appendChild(UI.field('Equipment', equipmentInput));
    serviceFields.appendChild(UI.field('Serial No', serialInput));
    serviceFields.appendChild(UI.field('Job Card No', jobCardInput));

    // Error display
    var errorBox = el('div', { style: { display: 'none' } });

    // Submit button
    var submitBtn = UI.btn('CHECK IN & START', {
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

      // For other departments, must pick visit type first
      if (isOther && !visitType) {
        showError('Please select a visit type (Sales or Service).');
        return;
      }

      if (!isProspect && !selectedCustomer) {
        showError('Please select a customer or add a prospect.');
        return;
      }
      if (isProspect && !prospectNameInput.value.trim()) {
        showError('Please enter a prospect name.');
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

        // Checkout button
        var checkoutBtn = UI.btn('CHECK OUT', {
          type: 'primary',
          block: true,
          icon: 'mapPin',
          onClick: function () {
            checkoutBtn._setLoading(true, 'Checking out...');
            getGPS().then(function (gpsResult) {
              var now = new Date().toISOString();
              var gpsStr = (gpsResult.lat != null && gpsResult.lng != null) ? gpsResult.lat + ',' + gpsResult.lng : '';
              window.fieldAPI.apiCall('PUT', '/api/field/dcr/' + encodeURIComponent(dcrName) + '/checkout', {
                check_out_time: now,
                check_out_gps: gpsStr
              }).then(function (r) {
                if (r.error || (r.status && r.status >= 400)) {
                  UI.toast('Checkout failed: ' + (r.error || 'Server error'), 'danger');
                  checkoutBtn._setLoading(false);
                  return;
                }
                // Clear timers
                for (var j = 0; j < _timers.length; j++) clearInterval(_timers[j]);
                _timers = [];
                UI.toast('Checked out!', 'success');
                // Reload by re-navigating to same hash
                var currentHash = location.hash;
                location.hash = '#/';
                setTimeout(function () { location.hash = currentHash; }, 0);
              }).catch(function (err) {
                UI.toast('Checkout failed: ' + (err.message || err), 'danger');
                checkoutBtn._setLoading(false);
              });
            });
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
