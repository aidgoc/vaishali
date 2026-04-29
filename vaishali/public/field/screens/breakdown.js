/* breakdown.js — Breakdown list, new, and detail screens */
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

  function todayISO() {
    var d = new Date();
    var mm = d.getMonth() + 1;
    var dd = d.getDate();
    return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'closed' || s === 'resolved') return 'green';
    if (s === 'work in progress') return 'orange';
    if (s === 'open') return 'red';
    return 'gray';
  }

  function priorityClass(priority) {
    if (!priority) return 'low';
    var p = priority.toLowerCase();
    if (p === 'critical') return 'critical';
    if (p === 'high') return 'high';
    if (p === 'medium') return 'medium';
    return 'low';
  }

  function removeSkeleton(container) {
    var skeletons = container.querySelectorAll('.skeleton');
    for (var i = 0; i < skeletons.length; i++) {
      if (skeletons[i].parentNode) skeletons[i].parentNode.removeChild(skeletons[i]);
    }
  }

  // ── Screen: Breakdown List ──────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.breakdownList = function (appEl) {
    appEl.appendChild(el('div', { style: { padding: '12px 0' } }, [
      UI.btn('Log Breakdown', {
        type: 'primary',
        block: true,
        icon: 'alert',
        onClick: function () { location.hash = '#/breakdown/new'; }
      })
    ]));

    var listContainer = el('div');
    appEl.appendChild(listContainer);
    listContainer.appendChild(UI.skeleton(3));

    api.apiCall('GET', '/api/field/view/breakdown_log').then(function (res) {
      listContainer.textContent = '';

      if (res.error || !res.data) {
        listContainer.appendChild(UI.error('Could not load breakdowns'));
        return;
      }

      var data = res.data;
      var sections = data.sections || data;
      var openClaims = sections.open_claims || [];
      var inProgress = sections.in_progress || [];
      var resolved = sections.resolved_this_month || [];

      var allItems = [];
      for (var a = 0; a < openClaims.length; a++) allItems.push(openClaims[a]);
      for (var b = 0; b < inProgress.length; b++) allItems.push(inProgress[b]);
      for (var c = 0; c < resolved.length; c++) allItems.push(resolved[c]);

      if (allItems.length === 0) {
        listContainer.appendChild(UI.empty('alert', 'No breakdown claims'));
        return;
      }

      // Section headers + cards
      if (openClaims.length > 0) {
        listContainer.appendChild(el('h3', { textContent: 'Open (' + openClaims.length + ')', style: { margin: '16px 0 8px 0' } }));
        renderClaimCards(listContainer, openClaims);
      }
      if (inProgress.length > 0) {
        listContainer.appendChild(el('h3', { textContent: 'In Progress (' + inProgress.length + ')', style: { margin: '16px 0 8px 0' } }));
        renderClaimCards(listContainer, inProgress);
      }
      if (resolved.length > 0) {
        listContainer.appendChild(el('h3', { textContent: 'Resolved This Month (' + resolved.length + ')', style: { margin: '16px 0 8px 0' } }));
        renderClaimCards(listContainer, resolved);
      }

    }).catch(function () {
      listContainer.textContent = '';
      listContainer.appendChild(UI.error('Could not load breakdowns'));
    });

    function renderClaimCards(container, claims) {
      for (var i = 0; i < claims.length; i++) {
        (function (claim) {
          var customer = claim.customer || 'Unknown';
          var complaint = claim.complaint || '';
          var sub = [complaint.substring(0, 60), formatDate(claim.complaint_date)].filter(Boolean).join(' \u00b7 ');

          var rightEl = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' } }, [
            UI.pill(claim.status || 'Open', statusColor(claim.status)),
            el('span', { className: 'priority-pill ' + priorityClass(claim.territory), textContent: claim.territory || '' })
          ]);

          container.appendChild(UI.listCard({
            avatar: customer,
            title: customer,
            sub: sub,
            right: rightEl,
            onClick: function () { location.hash = '#/breakdown/' + encodeURIComponent(claim.name); }
          }));
        })(claims[i]);
      }
    }
  };

  // ── Screen: New Breakdown ───────────────────────────────────────

  window.Screens.breakdownNew = function (appEl) {
    // Customer search
    var selectedCustomer = null;
    var customerDisplay = el('div', { style: { display: 'none', marginTop: '8px' } });
    var searchResults = el('div', { className: 'search-results', style: { display: 'none' } });
    var customerSearch = UI.searchInput('Search customer...', function (query) {
      if (!query || query.length < 2) {
        searchResults.style.display = 'none';
        searchResults.textContent = '';
        return;
      }
      api.apiCall('GET', '/api/field/customers?search=' + encodeURIComponent(query)).then(function (res) {
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
            searchResults.appendChild(el('div', {
              className: 'search-result-item',
              textContent: label,
              onClick: function () {
                selectedCustomer = name;
                searchResults.style.display = 'none';
                showCustomerChip(label);
              }
            }));
          })(customers[i]);
        }
      });
    });

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

    var customerField = UI.field('Customer', el('div', null, [customerSearch, searchResults, customerDisplay]));

    // Form fields
    var serialInput = UI.textInput('Serial number');
    var itemInput = UI.textInput('Item / Equipment name');
    var descArea = UI.textarea('Describe the issue...', { rows: 4 });
    var priorityField = UI.select('Priority', ['Medium', 'Low', 'High', 'Critical']);
    var prioritySelect = priorityField.querySelector('select');

    var errorBox = el('div', { style: { display: 'none' } });

    var submitBtn = UI.btn('SUBMIT BREAKDOWN', {
      type: 'primary',
      block: true,
      icon: 'alert',
      onClick: handleSubmit
    });

    // Build form
    appEl.appendChild(UI.card([
      customerField,
      UI.field('Item / Equipment', itemInput),
      UI.field('Serial No', serialInput),
      UI.field('Description', descArea),
      priorityField,
      errorBox,
      el('div', { style: { marginTop: '12px' } }, [submitBtn])
    ]));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';

      if (!selectedCustomer) {
        showError('Please select a customer.');
        return;
      }
      if (!descArea.value.trim()) {
        showError('Please describe the issue.');
        return;
      }

      submitBtn._setLoading(true, 'Submitting...');

      var payload = {
        customer: selectedCustomer,
        complaint_date: todayISO(),
        complaint: descArea.value.trim(),
        serial_no: serialInput.value.trim(),
        item_name: itemInput.value.trim(),
        territory: prioritySelect.value || 'Medium',
        status: 'Open',
        company: 'Dynamic Servitech Private Limited'
      };

      api.apiCall('POST', '/api/resource/Warranty Claim', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Breakdown logged!', 'success');
        location.hash = '#/breakdowns';
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Breakdown Detail ────────────────────────────────────

  window.Screens.breakdownDetail = function (appEl, params) {
    var claimId = params.id || params.name;

    var content = el('div');
    appEl.appendChild(content);
    var skel = UI.skeleton(3);
    content.appendChild(skel);

    api.apiCall('GET', '/api/resource/Warranty Claim/' + encodeURIComponent(claimId)).then(function (res) {
      skel.remove();

      var claim = null;
      if (res && res.data) {
        claim = res.data.data || res.data.message || res.data;
      }
      if (!claim) {
        content.appendChild(UI.error('Could not load breakdown details.'));
        return;
      }

      var customer = claim.customer || 'Unknown';
      var status = claim.status || 'Open';
      var priority = claim.priority || '';

      // M3 hero \u2014 customer + claim id + priority + status
      var heroSubParts = [claim.name, formatDate(claim.complaint_date)].filter(Boolean);
      content.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name', textContent: customer }),
            el('div', { className: 'm3-doc-hero-customer-sub', textContent: heroSubParts.join(' \u00b7 ') })
          ]),
          priority ? el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value', textContent: priority, style: { font: 'var(--m3-headline-small)' } }),
            el('div', { className: 'm3-doc-hero-amount-label', textContent: 'Priority' })
          ]) : null
        ].filter(Boolean)),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Quick contact actions (if customer phone visible)
      var contactBtns = [];
      if (claim.contact_phone) {
        contactBtns.push(UI.btn('Call', { type: 'tonal', icon: 'phone', onClick: function () { location.href = 'tel:' + claim.contact_phone; } }));
      }
      if (claim.contact_email) {
        contactBtns.push(UI.btn('Email', { type: 'tonal', icon: 'send', onClick: function () {
          if (UI.emailComposer) {
            var sheet = UI.emailComposer({
              to: claim.contact_email,
              subject: 'Re: Service request ' + claim.name,
              doctype: 'Warranty Claim',
              name: claim.name
            });
            document.body.appendChild(sheet);
          } else {
            location.href = 'mailto:' + claim.contact_email;
          }
        } }));
      }
      contactBtns.push(UI.btn('Log call', {
        type: 'tonal',
        icon: 'phone',
        onClick: function () {
          var qs = ['customer=' + encodeURIComponent(claim.customer || '')];
          if (claim.name) qs.push('warranty_claim=' + encodeURIComponent(claim.name));
          if (claim.serial_no) qs.push('device=' + encodeURIComponent(claim.serial_no));
          location.hash = '#/service-call/new?' + qs.join('&');
        }
      }));
      if (contactBtns.length) {
        content.appendChild(el('div', { className: 'm3-doc-actions' }, contactBtns));
      }

      // Complaint section
      content.appendChild(UI.sectionHeader('Complaint'));
      content.appendChild(el('div', {
        className: 'm3-card',
        style: {
          background: 'var(--m3-surface-container-low)',
          borderRadius: 'var(--m3-shape-md)',
          padding: '16px',
          marginBottom: '16px',
          font: 'var(--m3-body-medium)',
          color: 'var(--m3-on-surface)',
          letterSpacing: '0.25px',
          whiteSpace: 'pre-wrap'
        },
        textContent: claim.complaint || '\u2014'
      }));

      // Equipment
      content.appendChild(UI.sectionHeader('Equipment'));
      content.appendChild(UI.detailCard([
        { label: 'Item', value: claim.item_name || claim.item_code || '\u2014' },
        { label: 'Serial no', value: claim.serial_no || '\u2014' },
        { label: 'Site contact', value: claim.contact_person || '\u2014' },
        { label: 'Site phone', value: claim.contact_phone || '\u2014' }
      ]));

      // Details
      content.appendChild(UI.sectionHeader('Tracking'));
      var trackingRows = [
        { label: 'Claim ID', value: claim.name },
        { label: 'Priority', value: priority || '\u2014' },
        { label: 'Reported on', value: formatDate(claim.complaint_date) },
        { label: 'SLA target', value: formatDate(claim.sla_target_date) },
        { label: 'First response', value: formatDate(claim.first_response_date) },
        { label: 'Status', value: status }
      ];
      if (claim.resolution_date) {
        trackingRows.push({ label: 'Resolved on', value: formatDate(claim.resolution_date) });
      }
      content.appendChild(UI.detailCard(trackingRows));

      // Resolution if exists
      if (claim.resolution_details) {
        content.appendChild(UI.sectionHeader('Resolution'));
        content.appendChild(el('div', {
          className: 'm3-card',
          style: {
            background: 'var(--m3-success-container)',
            color: 'var(--m3-on-success-container)',
            borderRadius: 'var(--m3-shape-md)',
            padding: '16px',
            marginBottom: '16px',
            font: 'var(--m3-body-medium)',
            letterSpacing: '0.25px',
            whiteSpace: 'pre-wrap'
          },
          textContent: claim.resolution_details
        }));
      }

      // Action buttons based on status
      if (status === 'Open') {
        var startBtn = UI.btn('Start Work', {
          type: 'primary',
          block: true,
          onClick: function () {
            startBtn._setLoading(true, 'Updating...');
            api.apiCall('PUT', '/api/resource/Warranty Claim/' + encodeURIComponent(claimId), {
              status: 'Work In Progress'
            }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                startBtn._setLoading(false);
                return;
              }
              UI.toast('Status updated!', 'success');
              var currentHash = location.hash;
              location.hash = '#/';
              setTimeout(function () { location.hash = currentHash; }, 0);
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              startBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '16px' } }, [startBtn]));
      }

      if (status === 'Work In Progress') {
        var resolutionArea = UI.textarea('Resolution notes...', { rows: 3 });
        content.appendChild(el('div', { style: { marginTop: '16px' } }, [
          UI.field('Resolution Notes', resolutionArea)
        ]));

        var resolveBtn = UI.btn('Resolve', {
          type: 'primary',
          block: true,
          onClick: function () {
            var notes = resolutionArea.value.trim();
            if (!notes) {
              UI.toast('Please add resolution notes', 'danger');
              return;
            }
            resolveBtn._setLoading(true, 'Resolving...');
            api.apiCall('PUT', '/api/resource/Warranty Claim/' + encodeURIComponent(claimId), {
              status: 'Closed',
              resolution_date: todayISO(),
              resolution_details: notes
            }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                resolveBtn._setLoading(false);
                return;
              }
              UI.toast('Breakdown resolved!', 'success');
              location.hash = '#/breakdowns';
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              resolveBtn._setLoading(false);
            });
          }
        });
        content.appendChild(el('div', { style: { marginTop: '12px' } }, [resolveBtn]));
      }

    }).catch(function (err) {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load breakdown: ' + (err.message || err)));
    });
  };

})();
