/* inbox.js — Inbox / notifications screen for DSPL Field PWA
   Sections:
     1. Pending approvals (manager only) — /api/field/approvals
     2. Assigned to me — Frappe ToDo (status=Open, allocated_to=current user)
     3. Recent activity — Frappe Comment (owner=current user)

   Tapping a row deep-links to the relevant PWA screen, falling back to
   the Frappe desk in a new tab when no PWA route exists.
*/
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // ─── Helpers ────────────────────────────────────────────────────────

  function currentUserEmail() {
    var m = document.cookie.match(/user_id=([^;]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    return null;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function formatRelative(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    var mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.round(hrs / 24);
    if (days < 7) return days + 'd ago';
    return formatDate(iso);
  }

  function formatCurrency(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function approvalTypeLabel(type) {
    if (!type) return '';
    if (type === 'Leave Application') return 'Leave';
    if (type === 'Expense Claim') return 'Expense';
    if (type === 'Employee Advance') return 'Advance';
    return type;
  }

  function approvalPillColor(type) {
    if (type === 'Leave Application' || type === 'Leave') return 'blue';
    if (type === 'Expense Claim' || type === 'Expense') return 'yellow';
    if (type === 'Employee Advance' || type === 'Advance') return 'green';
    return 'gray';
  }

  function approvalDetailHash(item) {
    var t = approvalTypeLabel(item.type).toLowerCase();
    if (t === 'leave' || t === 'expense' || t === 'advance') {
      return '#/approvals/' + t + '/' + encodeURIComponent(item.name);
    }
    return '#/approvals';
  }

  function approvalSubText(item) {
    var t = approvalTypeLabel(item.type);
    if (t === 'Leave') {
      var range = formatDate(item.from_date);
      if (item.to_date && item.to_date !== item.from_date) {
        range += ' – ' + formatDate(item.to_date);
      }
      if (item.total_leave_days) {
        range += '  ·  ' + item.total_leave_days + (item.total_leave_days === 1 ? ' day' : ' days');
      }
      return range;
    }
    if (t === 'Expense') {
      return formatCurrency(item.total_claimed_amount || item.amount);
    }
    if (t === 'Advance') {
      var s = formatCurrency(item.advance_amount || item.amount);
      if (item.purpose) s += '  ·  ' + item.purpose;
      return s;
    }
    return '';
  }

  // Map a Frappe doctype to its PWA route. Returns null when no route exists
  // — caller should then deep-link to the desk.
  var PWA_ROUTE_MAP = {
    'Lead': '#/lead/',
    'Opportunity': '#/opportunity/',
    'Quotation': '#/quotation/',
    'Sales Order': '#/sales-order/',
    'Sales Invoice': '#/sales-invoice/',
    'Customer': '#/customer/',
    'Leave Application': '#/leave/',
    'Expense Claim': '#/expense/'
  };

  function deskSlug(doctype) {
    return String(doctype || '').toLowerCase().replace(/\s+/g, '-');
  }

  function openReference(doctype, name) {
    if (!doctype || !name) return;
    var prefix = PWA_ROUTE_MAP[doctype];
    if (prefix) {
      location.hash = prefix + encodeURIComponent(name);
      return;
    }
    window.open('/app/' + deskSlug(doctype) + '/' + encodeURIComponent(name), '_blank');
  }

  // Strip HTML tags without parsing the markup as DOM. Frappe stores
  // comment content as HTML; we only ever use the result as textContent
  // so a regex strip is safe and avoids touching innerHTML.
  function stripHTML(html) {
    if (!html) return '';
    var s = String(html);
    s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/g, ' ')
         .replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'");
    return s.replace(/\s+/g, ' ').trim();
  }

  function priorityPillColor(p) {
    if (!p) return 'gray';
    var s = String(p).toLowerCase();
    if (s === 'high') return 'red';
    if (s === 'medium') return 'yellow';
    if (s === 'low') return 'blue';
    return 'gray';
  }

  // ─── Section renderers ──────────────────────────────────────────────

  function renderApprovalsSection(container, items) {
    if (!items || items.length === 0) return 0;

    var section = el('div', { className: 'inbox-section' });
    section.appendChild(UI.sectionHeader('Pending approvals', {
      support: 'Awaiting your action.'
    }));

    var listWrap = el('div', { className: 'inbox-list' });
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        listWrap.appendChild(UI.listCard({
          avatar: item.employee_name || 'Approval',
          title: item.employee_name || item.name,
          sub: approvalSubText(item),
          right: UI.pill(approvalTypeLabel(item.type), approvalPillColor(item.type)),
          onClick: function () { location.hash = approvalDetailHash(item); }
        }));
      })(items[i]);
    }
    section.appendChild(listWrap);
    container.appendChild(section);
    return items.length;
  }

  function renderTodosSection(container, items) {
    var section = el('div', { className: 'inbox-section' });
    section.appendChild(UI.sectionHeader('Assigned to me', {
      support: 'Open tasks assigned to you.'
    }));

    if (!items || items.length === 0) {
      section.appendChild(UI.empty('check', 'Nothing assigned right now.'));
      container.appendChild(section);
      return 0;
    }

    var listWrap = el('div', { className: 'inbox-list' });
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var title = stripHTML(item.description) || item.reference_name || item.name;
        if (title.length > 80) title = title.substring(0, 77) + '…';

        var subParts = [];
        if (item.reference_doctype) subParts.push(item.reference_doctype);
        if (item.reference_name) subParts.push(item.reference_name);
        if (item.date) subParts.push('due ' + formatDate(item.date));

        var rightEl = item.priority
          ? UI.pill(item.priority, priorityPillColor(item.priority))
          : null;

        listWrap.appendChild(UI.listCard({
          title: title,
          sub: subParts.join('  ·  '),
          right: rightEl,
          onClick: function () {
            if (item.reference_doctype && item.reference_name) {
              openReference(item.reference_doctype, item.reference_name);
            } else {
              window.open('/app/todo/' + encodeURIComponent(item.name), '_blank');
            }
          }
        }));
      })(items[i]);
    }
    section.appendChild(listWrap);
    container.appendChild(section);
    return items.length;
  }

  function renderActivitySection(container, items) {
    var section = el('div', { className: 'inbox-section' });
    section.appendChild(UI.sectionHeader('Recent activity', {
      support: 'Comments you have written or that mention you.'
    }));

    if (!items || items.length === 0) {
      section.appendChild(UI.empty('clock', 'No recent activity.'));
      container.appendChild(section);
      return;
    }

    var listWrap = el('div', { className: 'inbox-list' });
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var content = stripHTML(item.content) || '(empty comment)';
        if (content.length > 100) content = content.substring(0, 97) + '…';

        var subParts = [];
        if (item.reference_doctype) subParts.push(item.reference_doctype);
        if (item.reference_name) subParts.push(item.reference_name);
        subParts.push(formatRelative(item.creation));

        listWrap.appendChild(UI.listCard({
          title: content,
          sub: subParts.join('  ·  '),
          onClick: function () {
            if (item.reference_doctype && item.reference_name) {
              openReference(item.reference_doctype, item.reference_name);
            }
          }
        }));
      })(items[i]);
    }
    section.appendChild(listWrap);
    container.appendChild(section);
  }

  // ─── Main screen ────────────────────────────────────────────────────

  window.Screens = window.Screens || {};

  window.Screens.inbox = function (appEl) {
    var content = el('div', { className: 'inbox-screen' });
    appEl.appendChild(content);

    var loadingArea = el('div');
    loadingArea.appendChild(UI.skeleton(4));
    content.appendChild(loadingArea);

    var userEmail = currentUserEmail();
    var isManager = window.Auth && Auth.isManager && Auth.isManager();

    // Build the list of fetches to run in parallel.
    var fetches = [];

    // 1. Pending approvals (manager only)
    if (isManager) {
      fetches.push(api.apiCall('GET', '/api/field/approvals'));
    } else {
      fetches.push(Promise.resolve({ data: [] }));
    }

    // 2. ToDos assigned to me
    if (userEmail) {
      var todoFilters = JSON.stringify([
        ['allocated_to', '=', userEmail],
        ['status', '=', 'Open']
      ]);
      var todoFields = JSON.stringify([
        'name', 'description', 'reference_type', 'reference_name',
        'priority', 'date', 'status'
      ]);
      var todoPath = '/api/resource/ToDo?filters=' + encodeURIComponent(todoFilters) +
        '&fields=' + encodeURIComponent(todoFields) +
        '&limit_page_length=20&order_by=modified desc';
      fetches.push(api.apiCall('GET', todoPath));
    } else {
      fetches.push(Promise.resolve({ data: { data: [] } }));
    }

    // 3. Recent comments by me (best-effort, last)
    if (userEmail) {
      var commentFilters = JSON.stringify([
        ['owner', '=', userEmail]
      ]);
      var commentFields = JSON.stringify([
        'name', 'content', 'reference_doctype', 'reference_name', 'creation'
      ]);
      var commentPath = '/api/resource/Comment?filters=' + encodeURIComponent(commentFilters) +
        '&fields=' + encodeURIComponent(commentFields) +
        '&limit_page_length=10&order_by=creation desc';
      fetches.push(api.apiCall('GET', commentPath));
    } else {
      fetches.push(Promise.resolve({ data: { data: [] } }));
    }

    Promise.all(fetches).then(function (results) {
      content.textContent = '';

      // Approvals — payload is either array or { data: [...] } / { message: [...] }
      var approvalsRes = results[0] || {};
      var approvals = [];
      if (!approvalsRes.error) {
        var ad = approvalsRes.data;
        if (Array.isArray(ad)) approvals = ad;
        else if (ad && Array.isArray(ad.data)) approvals = ad.data;
        else if (ad && Array.isArray(ad.message)) approvals = ad.message;
      }

      // ToDos — Frappe /api/resource returns { data: [...] }
      var todosRes = results[1] || {};
      var todos = [];
      if (!todosRes.error && todosRes.data && Array.isArray(todosRes.data.data)) {
        todos = todosRes.data.data;
      }

      // Comments
      var commentsRes = results[2] || {};
      var comments = [];
      if (!commentsRes.error && commentsRes.data && Array.isArray(commentsRes.data.data)) {
        comments = commentsRes.data.data;
      }

      var totalUnread = 0;
      if (isManager) {
        totalUnread += renderApprovalsSection(content, approvals);
      }
      totalUnread += renderTodosSection(content, todos);
      renderActivitySection(content, comments);

      // Persist unread count for the bottom-nav badge.
      try {
        localStorage.setItem('inbox_unread_count', String(totalUnread));
      } catch (e) {}

      // Refresh the badge on the nav now that the count changed.
      _refreshInboxBadge();

      // If everything is empty, show one consolidated empty state instead.
      if (approvals.length === 0 && todos.length === 0 && comments.length === 0) {
        content.textContent = '';
        content.appendChild(UI.empty('bell', 'Inbox is empty — you are all caught up.'));
      }
    }).catch(function () {
      content.textContent = '';
      content.appendChild(UI.error('Could not load inbox'));
    });
  };

  // Update the .has-badge class on the inbox nav tab from the cached count.
  function _refreshInboxBadge() {
    var navEl = document.getElementById('bottom-nav');
    if (!navEl) return;
    var tab = navEl.querySelector('.nav-item[data-tab="inbox"]');
    if (!tab) return;
    var count = 0;
    try { count = parseInt(localStorage.getItem('inbox_unread_count') || '0', 10) || 0; } catch (e) {}
    if (count > 0) tab.classList.add('has-badge');
    else tab.classList.remove('has-badge');
  }

  // Expose for app.js to call after buildBottomNav().
  window.Screens._refreshInboxBadge = _refreshInboxBadge;

})();
