/* project-hub.js — Project List + Project Detail screens for DSPL Field PWA */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ── Helpers ──────────────────────────────────────────────────────

  function statusColor(status) {
    if (!status) return 'gray';
    var s = status.toLowerCase();
    if (s === 'open' || s === 'active') return 'green';
    if (s === 'completed') return 'blue';
    if (s === 'cancelled' || s === 'canceled') return 'red';
    if (s === 'overdue') return 'red';
    return 'gray';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatAmount(val) {
    var num = Number(val) || 0;
    return '\u20B9' + num.toLocaleString('en-IN');
  }

  function buildProgressBar(percent) {
    var pct = Math.max(0, Math.min(100, Number(percent) || 0));
    var fill = el('div', {
      className: 'progress-bar-fill',
      style: { width: pct + '%' }
    });
    var bar = el('div', { className: 'progress-bar' }, [fill]);
    return bar;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROJECT LIST — #/projects
  // ═══════════════════════════════════════════════════════════════════

  function projectList(appEl) {
    appEl.textContent = '';
    appEl.appendChild(UI.page('Projects', '#/home'));

    var content = el('div');
    content.appendChild(UI.skeleton(3));
    appEl.appendChild(content);

    var url = '/api/resource/Project?filters=[["company","=","Dynamic Servitech Private Limited"]]&fields=["name","project_name","status","percent_complete"]&limit_page_length=0';

    api.apiCall('GET', url).then(function (res) {
      content.textContent = '';

      if (res.error) {
        content.appendChild(UI.error('Failed to load projects: ' + (res.error || 'Unknown error')));
        return;
      }

      var projects = (res.data && (res.data.data || res.data.message)) || res.data || [];
      if (!Array.isArray(projects)) projects = [];

      if (projects.length === 0) {
        content.appendChild(UI.empty('briefcase', 'No projects found for DSPL'));
        return;
      }

      for (var i = 0; i < projects.length; i++) {
        (function (proj) {
          var pct = Math.round(Number(proj.percent_complete) || 0);
          var cardContent = el('div', null, [
            el('div', { className: 'list-title', textContent: proj.project_name || proj.name }),
            el('div', {
              className: 'list-sub',
              style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }
            }, [
              UI.pill(proj.status || 'Open', statusColor(proj.status)),
              el('span', { textContent: pct + '% complete' })
            ]),
            buildProgressBar(pct)
          ]);

          var card = el('div', {
            className: 'list-card',
            style: { flexDirection: 'column', alignItems: 'stretch' },
            onClick: function () { location.hash = '#/project/' + encodeURIComponent(proj.name); }
          }, [cardContent]);

          content.appendChild(card);
        })(projects[i]);
      }
    }).catch(function () {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load projects'));
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROJECT DETAIL — #/project/:id
  // ═══════════════════════════════════════════════════════════════════

  function projectDetail(appEl, params) {
    appEl.textContent = '';
    var projectId = params.id;

    var header = UI.page('Project', '#/projects');
    appEl.appendChild(header);

    var content = el('div');
    content.appendChild(UI.skeleton(4));
    appEl.appendChild(content);

    api.apiCall('GET', '/api/field/view/project_hub/' + encodeURIComponent(projectId)).then(function (res) {
      content.textContent = '';

      if (res.error) {
        content.appendChild(UI.error('Failed to load project: ' + (res.error || 'Unknown error')));
        return;
      }

      var data = res.data || {};
      var allSections = data.sections || data;
      var project = allSections.overview || data.project || data;

      // Update header with project name
      var titleEl = header.querySelector('h2');
      if (titleEl) titleEl.textContent = project.project_name || project.name || projectId;

      // Project info card
      var pct = Math.round(Number(project.percent_complete) || 0);
      var infoCard = el('div', { className: 'detail-card' }, [
        el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } }, [
          UI.pill(project.status || 'Open', statusColor(project.status)),
          el('span', { className: 'list-sub', textContent: pct + '% complete' })
        ]),
        buildProgressBar(pct)
      ]);
      content.appendChild(infoCard);

      // Sections from view engine (role-dependent tabs)
      // Convert sections dict {key: records} to array [{name, label, records}]
      var rawSections = allSections || {};
      var sections = [];
      var sectionKeys = Object.keys(rawSections);
      for (var sk = 0; sk < sectionKeys.length; sk++) {
        var sKey = sectionKeys[sk];
        if (sKey === 'overview') continue; // already used above
        var sRecords = rawSections[sKey];
        if (!Array.isArray(sRecords)) continue; // skip non-array sections
        sections.push({ name: sKey, label: sKey.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }), records: sRecords });
      }
      if (sections.length === 0) {
        // Fallback: show basic detail if no sections
        if (project.expected_start_date || project.expected_end_date || project.estimated_costing) {
          var rows = [];
          if (project.expected_start_date) rows.push({ label: 'Start Date', value: formatDate(project.expected_start_date) });
          if (project.expected_end_date) rows.push({ label: 'End Date', value: formatDate(project.expected_end_date) });
          if (project.estimated_costing) rows.push({ label: 'Est. Cost', value: formatAmount(project.estimated_costing) });
          if (project.total_costing_amount) rows.push({ label: 'Actual Cost', value: formatAmount(project.total_costing_amount) });
          if (rows.length > 0) content.appendChild(UI.detailCard(rows));
        }
        return;
      }

      // Build tab bar
      var tabBar = el('div', { className: 'tab-bar view-tabs' });
      var tabContent = el('div', { className: 'tab-content' });

      for (var t = 0; t < sections.length; t++) {
        (function (idx, section) {
          var tabBtn = el('button', {
            className: 'tab-item' + (idx === 0 ? ' active' : ''),
            textContent: section.label || section.name || ('Tab ' + (idx + 1)),
            onClick: function () {
              // Toggle active tab
              var allTabs = tabBar.querySelectorAll('.tab-item');
              for (var j = 0; j < allTabs.length; j++) allTabs[j].classList.remove('active');
              tabBtn.classList.add('active');
              renderSection(tabContent, section);
            }
          });
          tabBar.appendChild(tabBtn);
        })(t, sections[t]);
      }

      content.appendChild(tabBar);
      content.appendChild(tabContent);

      // Render first tab
      if (sections.length > 0) {
        renderSection(tabContent, sections[0]);
      }
    }).catch(function () {
      content.textContent = '';
      content.appendChild(UI.error('Failed to load project details'));
    });
  }

  function renderSection(container, section) {
    container.textContent = '';
    var records = section.records || section.data || [];

    if (records.length === 0) {
      container.appendChild(UI.empty('briefcase', 'No ' + (section.label || 'records') + ' found'));
      return;
    }

    for (var i = 0; i < records.length; i++) {
      (function (rec) {
        var sub = '';
        if (rec.date) sub += formatDate(rec.date);
        if (rec.amount) sub += (sub ? ' \u00B7 ' : '') + formatAmount(rec.amount);

        var rightEl = null;
        if (rec.status) {
          rightEl = UI.pill(rec.status, statusColor(rec.status));
        }

        var card = UI.listCard({
          title: rec.name || rec.title || rec.label || '',
          sub: sub,
          right: rightEl,
          onClick: rec.route ? function () { location.hash = rec.route; } : null
        });

        container.appendChild(card);
      })(records[i]);
    }
  }

  // ── Register screens ──────────────────────────────────────────────

  window.Screens = window.Screens || {};
  window.Screens.projectList = projectList;
  window.Screens.projectDetail = projectDetail;
})();
