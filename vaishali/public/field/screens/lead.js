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

            var card = UI.listCard({
              avatar: name,
              title: name,
              sub: sub,
              right: UI.pill(status, statusColor(status)),
              onClick: function () { location.hash = '#/lead/' + lead.name; }
            });
            // Swipe-row: leading=Call (if mobile), trailing=Convert
            if (UI.swipeRow) {
              var leading = [];
              var trailing = [];
              if (lead.mobile_no) {
                leading.push({ icon: 'phone', label: 'Call', color: 'success', onClick: function () { location.href = 'tel:' + lead.mobile_no; } });
              }
              trailing.push({ icon: 'plus', label: 'Convert', color: 'primary', onClick: function () { location.hash = '#/lead/' + lead.name; } });
              listWrap.appendChild(UI.swipeRow(card, { leadingActions: leading, trailingActions: trailing }));
            } else {
              listWrap.appendChild(card);
            }
          })(items[i]);
        }
        listContainer.appendChild(listWrap);
      }).catch(function (err) {
        listContainer.textContent = '';
        listContainer.appendChild(UI.error('Failed to load leads: ' + (err.message || err)));
      });
    }

    loadLeads();

    // Quick-add FAB
    if (UI.fab) {
      var fab = UI.fab({
        icon: 'plus',
        ariaLabel: 'New lead',
        onClick: function () { location.hash = '#/lead/new'; }
      });
      // Track to remove on hashchange (FAB is fixed-positioned outside #app)
      document.body.appendChild(fab);
      var removeFab = function () {
        if (fab.parentNode) fab.parentNode.removeChild(fab);
        window.removeEventListener('hashchange', removeFab);
      };
      window.addEventListener('hashchange', removeFab);
    }
  };

  // ── Screen: New Lead ────────────────────────────────────────────────

  window.Screens.leadNew = function (appEl) {
    var el = UI.el;

    appEl.appendChild(UI.pageHeader(
      'New lead',
      'Capture a prospect — name, company and contact details.'
    ));

    // M3 floating-label fields
    var leadNameField = UI.m3TextField('Lead name', { required: true });
    var companyNameField = UI.m3TextField('Company name', { required: true });
    var mobileField = UI.m3TextField('Mobile number', { type: 'tel' });
    var emailField = UI.m3TextField('Email address', { type: 'email' });
    var sourceField = UI.m3SelectField('Source', ['Loading...']);
    var sourceSelect = sourceField._getSelect();
    sourceSelect.disabled = true;

    window.fieldAPI.apiCall('GET', '/api/field/lead-sources').then(function (res) {
      var sources = [];
      if (res && res.data) {
        sources = Array.isArray(res.data) ? res.data : (res.data.data || res.data.message || []);
      }
      if (!sources.length) sources = ['Campaign', 'Cold Calling', 'Advertisement', 'Reference'];
      sourceSelect.textContent = '';
      // Empty placeholder option for floating label
      var ph = document.createElement('option');
      ph.value = ''; ph.textContent = ''; ph.disabled = true; ph.selected = true;
      sourceSelect.appendChild(ph);
      for (var i = 0; i < sources.length; i++) {
        var opt = document.createElement('option');
        opt.value = sources[i];
        opt.textContent = sources[i];
        sourceSelect.appendChild(opt);
      }
      sourceSelect.disabled = false;
    });

    var territoryField = UI.m3TextField('Territory');
    var notesField = UI.m3TextField('Notes', {
      multiline: true,
      rows: 3,
      support: 'Optional — context for whoever picks this up.'
    });

    var errorBox = el('div', { style: { display: 'none' } });

    var submitBtn = UI.btn('Create lead', {
      type: 'primary',
      block: true,
      icon: 'plus',
      onClick: handleSubmit
    });
    var cancelBtn = UI.btn('Cancel', {
      type: 'outline',
      block: true,
      onClick: function () { location.hash = '#/leads'; }
    });

    appEl.appendChild(leadNameField);
    appEl.appendChild(companyNameField);
    appEl.appendChild(mobileField);
    appEl.appendChild(emailField);
    appEl.appendChild(sourceField);
    appEl.appendChild(territoryField);
    appEl.appendChild(notesField);
    appEl.appendChild(errorBox);
    appEl.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' } }, [
      cancelBtn,
      submitBtn
    ]));

    function showError(msg) {
      errorBox.textContent = '';
      errorBox.style.display = 'block';
      errorBox.appendChild(UI.error(msg));
    }

    function handleSubmit() {
      errorBox.style.display = 'none';
      var valid = true;

      if (!leadNameField._getValue().trim()) {
        leadNameField._setError('Lead name is required');
        valid = false;
      } else {
        leadNameField._setError(null);
      }

      if (!companyNameField._getValue().trim()) {
        companyNameField._setError('Company name is required');
        valid = false;
      } else {
        companyNameField._setError(null);
      }

      if (!valid) {
        var firstError = appEl.querySelector('.m3-textfield-input.field-error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn._setLoading(true, 'Creating...');

      var payload = {
        lead_name: leadNameField._getValue().trim(),
        company_name: companyNameField._getValue().trim(),
        mobile_no: mobileField._getValue().trim(),
        email_id: emailField._getValue().trim(),
        source: sourceField._getValue(),
        territory: territoryField._getValue().trim(),
        notes: notesField._getValue().trim()
      };

      window.fieldAPI.apiCall('POST', '/api/field/lead', payload).then(function (res) {
        if (res.error || (res.status && res.status >= 400)) {
          showError('Failed: ' + (res.error || 'Server error'));
          submitBtn._setLoading(false);
          return;
        }
        UI.toast('Lead created', 'success');
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

    var skel = UI.skeleton(3);
    appEl.appendChild(skel);

    window.fieldAPI.apiCall('GET', '/api/method/frappe.client.get?doctype=Lead&name=' + encodeURIComponent(leadName)).then(function (res) {
      skel.remove();

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

      // M3 detail hero \u2014 avatar + name + company + status pill
      var company = lead.company_name || '';
      var hero = el('div', { className: 'profile-hero', style: { paddingTop: '8px', paddingBottom: '16px' } });
      hero.appendChild(UI.avatar(name, 80));
      hero.appendChild(el('h2', { textContent: name }));
      if (company) {
        hero.appendChild(el('p', { className: 'profile-subtitle', textContent: company }));
      }
      // Tappable status pill — opens status picker
      var pill = UI.pill(status, statusColor(status));
      pill.style.cursor = 'pointer';
      pill.addEventListener('click', function () {
        var picker = UI.statusPicker({
          title: 'Change lead status',
          current: status,
          options: [
            { value: 'Lead', label: 'Lead', color: 'blue', icon: 'clock', description: 'Just received' },
            { value: 'Open', label: 'Open', color: 'blue', icon: 'clock', description: 'Active prospect' },
            { value: 'Replied', label: 'Replied', color: 'orange', icon: 'send', description: 'Customer responded' },
            { value: 'Opportunity', label: 'Opportunity', color: 'green', icon: 'plus', description: 'Promoted to pipeline' },
            { value: 'Quotation', label: 'Quoted', color: 'green', icon: 'file', description: 'Quote sent' },
            { value: 'Converted', label: 'Converted', color: 'green', icon: 'check', description: 'Won — sale closed' },
            { value: 'Do Not Contact', label: 'Do Not Contact', color: 'red', icon: 'x', description: 'No further outreach' }
          ],
          onSelect: function (value) {
            return window.fieldAPI.apiCall('PUT',
              '/api/resource/Lead/' + encodeURIComponent(lead.name),
              { status: value }
            ).then(function (res) {
              if (res.error || (res.status && res.status >= 400)) {
                throw new Error(res.error || 'Server error');
              }
              UI.toast('Status updated to ' + value, 'success');
              setTimeout(function () { window.Screens.leadDetail(appEl, params); }, 100);
            });
          }
        });
        document.body.appendChild(picker);
      });
      hero.appendChild(el('div', { style: { marginTop: '4px' } }, [pill]));
      appEl.appendChild(hero);

      // Stage path — lead progression
      if (UI.stagePath) {
        var leadStages = [
          { value: 'Lead', label: 'Lead' },
          { value: 'Open', label: 'Open' },
          { value: 'Replied', label: 'Replied' },
          { value: 'Opportunity', label: 'Opportunity' },
          { value: 'Converted', label: 'Won' }
        ];
        if (status === 'Do Not Contact') {
          leadStages[4] = { value: 'Do Not Contact', label: 'Lost' };
        }
        appEl.appendChild(UI.stagePath(leadStages, status, { compact: false }));
      }

      // Track in recently viewed
      if (UI.recents) {
        UI.recents.track({
          doctype: 'Lead', name: lead.name, title: name,
          subtitle: company || lead.mobile_no || '',
          hash: '#/lead/' + lead.name
        });
      }

      // Quick contact actions \u2014 call + email as outlined buttons
      var contactBtns = [];
      if (lead.mobile_no) {
        contactBtns.push(UI.btn('Call', {
          type: 'tonal',
          icon: 'phone',
          onClick: function () { location.href = 'tel:' + lead.mobile_no; }
        }));
      }
      if (lead.email_id) {
        contactBtns.push(UI.btn('Email', {
          type: 'tonal',
          icon: 'send',
          onClick: function () { location.href = 'mailto:' + lead.email_id; }
        }));
      }
      if (contactBtns.length > 0) {
        appEl.appendChild(el('div', {
          style: { display: 'grid', gridTemplateColumns: 'repeat(' + contactBtns.length + ', 1fr)', gap: '8px', marginBottom: '24px' }
        }, contactBtns));
      }

      // Details
      appEl.appendChild(UI.sectionHeader('Details'));
      appEl.appendChild(UI.detailCard([
        { label: 'Lead ID', value: lead.name },
        { label: 'Company', value: lead.company_name || '\u2014' },
        { label: 'Mobile', value: lead.mobile_no || '\u2014' },
        { label: 'Email', value: lead.email_id || '\u2014' },
        { label: 'Source', value: lead.source || '\u2014' },
        { label: 'Territory', value: lead.territory || '\u2014' },
        { label: 'Created', value: formatDate(lead.creation) }
      ]));

      // Conversion actions \u2014 only for active leads
      if (status !== 'Converted' && status !== 'Do Not Contact') {
        appEl.appendChild(UI.sectionHeader('Convert', { support: 'Move this lead forward in the sales cycle' }));

        var createOppBtn = UI.btn('Create opportunity', {
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
              UI.toast('Opportunity created', 'success');
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
        var createQuotBtn = UI.btn('Create quotation', {
          type: 'outline',
          block: true,
          icon: 'plus',
          onClick: function () {
            location.hash = '#/quotations/new?lead=' + encodeURIComponent(lead.name) + '&lead_name=' + encodeURIComponent(name);
          }
        });
        appEl.appendChild(el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } }, [
          createOppBtn, createQuotBtn
        ]));
      }

      // Activity timeline + comment composer
      if (window.Activity) {
        Activity.attach(appEl, { doctype: 'Lead', name: lead.name });
      }
    }).catch(function (err) {
      skel.remove();
      appEl.appendChild(UI.error('Failed to load lead: ' + (err.message || err)));
    });
  };

})();
