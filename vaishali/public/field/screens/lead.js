/* lead.js — Lead screens for DSPL Field PWA (List, New) */
(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'converted') return 'green';
    if (s === 'lead' || s === 'open') return 'blue';
    if (s === 'opportunity') return 'orange';
    if (s === 'interested') return 'orange';
    if (s === 'do not contact') return 'red';
    return 'gray';
  }

  // ── Screen: Lead List ───────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.leadList = function (appEl) {
    var el = UI.el;

    var listContainer = el('div');
    var searchQuery = '';

    // Search bar
    var searchBar = UI.searchInput('Search leads...', function (query) {
      searchQuery = query;
      loadLeads();
    });
    appEl.appendChild(searchBar);

    appEl.appendChild(el('div', { style: { padding: '8px 0 16px' } }, [
      UI.btn('Add new lead', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/lead/new'; }
      })
    ]));

    appEl.appendChild(listContainer);

    function loadLeads() {
      listContainer.textContent = '';
      listContainer.appendChild(UI.skeleton(3));

      var path = '/api/field/leads';
      if (searchQuery) {
        path += '?search=' + encodeURIComponent(searchQuery);
      }

      window.fieldAPI.apiCall('GET', path).then(function (res) {
        listContainer.textContent = '';

        var items = [];
        if (res && res.data) {
          items = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
        }

        if (items.length === 0) {
          listContainer.appendChild(UI.empty('user', 'No leads found', { text: 'Add new lead', onClick: function() { location.hash = '#/lead/new'; } }));
          return;
        }

        var listWrap = el('div', { className: 'm3-list' });
        for (var i = 0; i < items.length; i++) {
          (function (lead) {
            var name = lead.lead_name || 'Unknown';
            var company = lead.company_name || '';
            var source = lead.source || '';
            var date = formatDate(lead.creation);
            var status = lead.status || 'Lead';
            var sub = [company, source, date].filter(Boolean).join(' \u00b7 ');

            listWrap.appendChild(UI.listCard({
              avatar: name,
              title: name,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/lead/' + lead.name; }
            }));
          })(items[i]);
        }
        listContainer.appendChild(listWrap);
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load leads: ' + (err.message || err)));
      });
    }

    loadLeads();
  };

  // ── Screen: New Lead ────────────────────────────────────────────────

  window.Screens.leadNew = function (appEl) {
    var el = UI.el;
    // Form fields
    var leadNameInput = UI.textInput('Lead name');
    leadNameInput.addEventListener('blur', function () {
      if (!leadNameInput.value.trim()) {
        UI.fieldError(leadNameInput, 'Required');
      } else {
        UI.fieldError(leadNameInput, null);
      }
    });
    var companyNameInput = UI.textInput('Company name');
    companyNameInput.addEventListener('blur', function () {
      if (!companyNameInput.value.trim()) {
        UI.fieldError(companyNameInput, 'Required');
      } else {
        UI.fieldError(companyNameInput, null);
      }
    });
    var mobileInput = UI.textInput('Mobile number', { type: 'tel' });
    var emailInput = UI.textInput('Email address', { type: 'email' });

    var sourceField = UI.select('Source', ['Loading...']);
    var sourceSelect = sourceField.querySelector('select');
    sourceSelect.disabled = true;
    window.fieldAPI.apiCall('GET', '/api/field/lead-sources').then(function (res) {
      var sources = [];
      if (res && res.data) {
        sources = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }
      if (!sources.length) sources = ['Campaign', 'Cold Calling', 'Advertisement', 'Reference'];
      sourceSelect.textContent = '';
      for (var i = 0; i < sources.length; i++) {
        var opt = document.createElement('option');
        opt.value = sources[i];
        opt.textContent = sources[i];
        sourceSelect.appendChild(opt);
      }
      sourceSelect.disabled = false;
    });

    var territoryInput = UI.textInput('Territory');
    var notesArea = UI.textarea('Notes', { rows: 3 });

    // Error display
    var errorBox = el('div', { style: { display: 'none' } });

    // Submit button
    var submitBtn = UI.btn('Create lead', {
      type: 'success',
      block: true,
      icon: 'plus',
      onClick: handleSubmit
    });

    // Build form card
    var formChildren = [
      UI.field('Lead Name *', leadNameInput),
      UI.field('Company Name', companyNameInput),
      UI.field('Mobile No', mobileInput),
      UI.field('Email', emailInput),
      sourceField,
      UI.field('Territory', territoryInput),
      UI.field('Notes', notesArea),
      errorBox,
      el('div', { style: { marginTop: '12px' } }, [submitBtn])
    ];

    appEl.appendChild(UI.card(formChildren));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      if (!leadNameInput.value.trim()) {
        UI.fieldError(leadNameInput, 'Lead name is required');
        valid = false;
      } else {
        UI.fieldError(leadNameInput, null);
      }

      if (!companyNameInput.value.trim()) {
        UI.fieldError(companyNameInput, 'Company name is required');
        valid = false;
      } else {
        UI.fieldError(companyNameInput, null);
      }

      if (!valid) {
        var firstError = appEl.querySelector('.field-error-text');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Creating...');

      var payload = {
        lead_name: leadNameInput.value.trim(),
        company_name: companyNameInput.value.trim(),
        mobile_no: mobileInput.value.trim(),
        email_id: emailInput.value.trim(),
        source: sourceSelect.value,
        territory: territoryInput.value.trim(),
        notes: notesArea.value.trim()
      };

      window.fieldAPI.apiCall('POST', '/api/field/lead', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Lead created!', 'success');
        location.hash = '#/leads';
      }).catch(function (err) {
        showError('Error: ' + (err.message || err));
        submitBtn._setLoading(false);
      });
    }
  };

  // ── Screen: Lead Detail ────────────────────────────────────────────

  window.Screens.leadDetail = function (appEl, params) {
    var el = UI.el;
    var leadName = params.id || params.name;

    appEl.appendChild(UI.skeleton(3));

    // Fetch lead via Frappe API directly
    window.fieldAPI.apiCall('GET', '/api/method/frappe.client.get?doctype=Lead&name=' + encodeURIComponent(leadName)).then(function (res) {
      appEl.textContent = '';

      var lead = null;
      if (res && res.data) {
        lead = res.data.data || res.data.message || res.data;
      }
      if (!lead) {
        appEl.appendChild(UI.error('Could not load lead.'));
        return;
      }

      var name = lead.lead_name || 'Unknown';
      var status = lead.status || 'Lead';

      // Header
      appEl.appendChild(el('div', { style: { marginBottom: '12px' } }, [
        el('h3', { textContent: name, style: { margin: '0 0 8px 0' } }),
        UI.pill(status, statusColor(status))
      ]));

      // Detail card
      var details = [
        { label: 'Lead', value: lead.name },
        { label: 'Company', value: lead.company_name || '\u2014' },
        { label: 'Source', value: lead.source || '\u2014' },
        { label: 'Territory', value: lead.territory || '\u2014' },
        { label: 'Status', value: status },
        { label: 'Created', value: formatDate(lead.creation) }
      ];
      appEl.appendChild(UI.detailCard(details));

      // Contact info with tap-to-call/email
      var contactItems = [];
      if (lead.mobile_no) {
        contactItems.push(el('a', {
          href: 'tel:' + lead.mobile_no,
          textContent: lead.mobile_no,
          style: { display: 'block', color: 'var(--primary, #E60005)', fontSize: '15px', padding: '8px 0', textDecoration: 'none' }
        }));
      }
      if (lead.email_id) {
        contactItems.push(el('a', {
          href: 'mailto:' + lead.email_id,
          textContent: lead.email_id,
          style: { display: 'block', color: 'var(--primary, #E60005)', fontSize: '15px', padding: '8px 0', textDecoration: 'none' }
        }));
      }
      if (contactItems.length > 0) {
        appEl.appendChild(el('div', { style: { marginTop: '16px' } }));
        appEl.appendChild(UI.sectionHeading('Contact'));
        appEl.appendChild(UI.card(contactItems));
      }

      // Action buttons (only for non-converted leads)
      if (status !== 'Converted' && status !== 'Do Not Contact') {
        var btnContainer = el('div', { style: { marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' } });

        // Create Opportunity
        var createOppBtn = UI.btn('Create Opportunity', {
          type: 'primary',
          block: true,
          icon: 'plus',
          onClick: function () {
            createOppBtn._setLoading(true, 'Creating...');
            window.fieldAPI.apiCall('POST', '/api/field/opportunities', { lead_name: lead.name }).then(function (r) {
              if (r.error || (r.status && r.status >= 400)) {
                UI.toast('Failed: ' + (r.error || 'Server error'), 'danger');
                createOppBtn._setLoading(false);
                return;
              }
              var oppName = '';
              if (r.data) {
                var d = r.data.data || r.data.message || r.data;
                oppName = d.name || '';
              }
              UI.toast('Opportunity created!', 'success');
              if (oppName) {
                location.hash = '#/opportunity/' + oppName;
              } else {
                location.hash = '#/opportunities';
              }
            }).catch(function (err) {
              UI.toast('Error: ' + (err.message || err), 'danger');
              createOppBtn._setLoading(false);
            });
          }
        });
        btnContainer.appendChild(createOppBtn);

        // Create Quotation directly from lead
        var createQuotBtn = UI.btn('Create Quotation', {
          type: 'outline',
          block: true,
          icon: 'plus',
          onClick: function () {
            location.hash = '#/quotations/new?lead=' + encodeURIComponent(lead.name) + '&lead_name=' + encodeURIComponent(name);
          }
        });
        btnContainer.appendChild(createQuotBtn);

        appEl.appendChild(btnContainer);
      }

    }).catch(function (err) {
      appEl.textContent = '';
      appEl.appendChild(UI.error('Failed to load lead: ' + (err.message || err)));
    });
  };

})();
