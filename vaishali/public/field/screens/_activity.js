/* _activity.js — shared loader/renderer for the activity timeline.
   Used by lead/opportunity/quotation/customer detail to show comments and
   key Frappe Version events for a record, plus an inline composer that
   POSTs to frappe.desk.form.utils.add_comment.

   Usage:
     Activity.attach(containerEl, { doctype: 'Lead', name: 'CRM-LEAD-001' })
*/
(function () {
  'use strict';

  var api = window.fieldAPI;

  // Pull the logged-in user's email from the Frappe session cookie.
  function currentUserEmail() {
    var m = document.cookie.match(/user_id=([^;]+)/);
    if (m) {
      try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
    }
    return null;
  }

  // Server stores naive IST. Browser parses bare ISO as local time, which
  // is IST on user devices. Tz-aware values (with +05:30) are honoured.
  function parseUTC(iso) {
    if (!iso) return null;
    var t = String(iso).replace(' ', 'T');
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  function fetchComments(doctype, name) {
    var filters = JSON.stringify([
      ['reference_doctype', '=', doctype],
      ['reference_name', '=', name]
    ]);
    var fields = JSON.stringify([
      'name', 'content', 'comment_email', 'comment_by', 'comment_type', 'creation'
    ]);
    var path = '/api/resource/Comment?filters=' + encodeURIComponent(filters) +
      '&fields=' + encodeURIComponent(fields) +
      '&order_by=creation desc&limit_page_length=20';
    return api.apiCall('GET', path).then(function (res) {
      if (!res || !res.data) return [];
      var arr = res.data.data || res.data.message || [];
      return Array.isArray(arr) ? arr : [];
    }).catch(function () { return []; });
  }

  function fetchVersions(doctype, name) {
    // Frappe Version captures every doc save with a JSON diff. We surface
    // status changes only — the rest is too noisy for a timeline.
    var filters = JSON.stringify([
      ['ref_doctype', '=', doctype],
      ['docname', '=', name]
    ]);
    var fields = JSON.stringify(['name', 'data', 'owner', 'creation']);
    var path = '/api/resource/Version?filters=' + encodeURIComponent(filters) +
      '&fields=' + encodeURIComponent(fields) +
      '&order_by=creation desc&limit_page_length=20';
    return api.apiCall('GET', path).then(function (res) {
      if (!res || !res.data) return [];
      var arr = res.data.data || res.data.message || [];
      return Array.isArray(arr) ? arr : [];
    }).catch(function () { return []; });
  }

  function parseStatusChange(versionRow) {
    // Frappe stores `data` as a JSON string. We look for `changed: [["status", old, new]]`.
    if (!versionRow || !versionRow.data) return null;
    try {
      var d = JSON.parse(versionRow.data);
      var changes = d && d.changed;
      if (!Array.isArray(changes)) return null;
      for (var i = 0; i < changes.length; i++) {
        var c = changes[i];
        if (Array.isArray(c) && c[0] === 'status') {
          return { from: c[1], to: c[2] };
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function commentToTimelineItem(c) {
    // Frappe content is HTML; we strip tags for safety (no innerHTML use).
    var txt = String(c.content || '').replace(/<[^>]*>/g, '').trim();
    return {
      type: 'comment',
      title: c.comment_by || c.comment_email || 'Comment',
      body: txt,
      user: c.comment_email || '',
      date: c.creation
    };
  }

  function versionToTimelineItem(v) {
    var change = parseStatusChange(v);
    if (!change) return null;
    return {
      type: 'status',
      title: 'Status changed to ' + change.to,
      body: change.from ? 'from ' + change.from : null,
      user: v.owner || '',
      date: v.creation
    };
  }

  function postComment(doctype, name, content) {
    var email = currentUserEmail();
    if (!email) {
      return Promise.reject(new Error('Not signed in'));
    }
    return api.apiCall('POST', '/api/method/frappe.desk.form.utils.add_comment', {
      reference_doctype: doctype,
      reference_name: name,
      content: content,
      comment_email: email,
      comment_by: email
    }).then(function (res) {
      if (res && (res.error || (res.status && res.status >= 400))) {
        throw new Error(res.error || 'Server error');
      }
      return res;
    });
  }

  function attach(containerEl, opts) {
    if (!containerEl) return;
    var doctype = opts.doctype;
    var name = opts.name;
    if (!doctype || !name) return;

    if (!window.UI || !UI.activityTimeline) {
      // Component missing — silently skip
      return;
    }

    // Section header
    var header = document.createElement('div');
    header.className = 'm3-section-header';
    var h2 = document.createElement('h2');
    h2.className = 'm3-section-title';
    h2.textContent = 'Activity';
    header.appendChild(h2);
    containerEl.appendChild(header);

    var wrap = document.createElement('div');
    containerEl.appendChild(wrap);

    function render(items) {
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      var canComment = !!currentUserEmail();
      var tlOpts = {
        emptyText: 'No activity yet' + (canComment ? ' — be the first to comment.' : '.'),
        commentPlaceholder: 'Add a comment…'
      };
      if (canComment) {
        tlOpts.onAddComment = function (text) {
          if (!text) return;
          postComment(doctype, name, text).then(function () {
            load(); // reload to pick up the new comment
            if (UI.toast) UI.toast('Comment posted', 'success');
          }).catch(function (err) {
            if (UI.toast) UI.toast('Failed: ' + (err.message || err), 'danger');
          });
        };
      }
      wrap.appendChild(UI.activityTimeline(items, tlOpts));
    }

    function load() {
      // Skeleton while loading
      while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
      if (UI.skeleton) wrap.appendChild(UI.skeleton(2));

      Promise.all([fetchComments(doctype, name), fetchVersions(doctype, name)]).then(function (out) {
        var comments = out[0].map(commentToTimelineItem);
        var versions = out[1].map(versionToTimelineItem).filter(Boolean);
        var all = comments.concat(versions);
        // Sort by date descending — parseUTC handles the missing-Z bug.
        all.sort(function (a, b) {
          var da = parseUTC(a.date);
          var db = parseUTC(b.date);
          return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });
        render(all);
      });
    }

    load();
  }

  window.Activity = {
    attach: attach,
    fetchComments: fetchComments,
    postComment: postComment
  };
})();
