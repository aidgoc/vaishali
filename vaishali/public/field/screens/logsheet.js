/* logsheet.js — Operator Logsheet screens for DSPL Field PWA
 *
 * The paper logsheet that on-site operators have filled in for years
 * lives here digitally:
 *   - Daily entry while at the customer site
 *   - Photo of the signed paper attached as proof
 *   - Site supervisor name captured as the signer
 *   - Hours / shift / equipment / customer captured for billing
 *
 * Operators are field-mode (no geofence). Manager verifies, then the
 * month-end Sales Invoice generator (TODO) reads from this DocType.
 */
(function () {
  'use strict';

  window.Screens = window.Screens || {};
  var api = window.fieldAPI;

  var WORK_TYPES = ['Lifting', 'Shifting', 'Idle / Standby', 'Maintenance', 'Movement', 'Other'];
  var SHIFTS = ['Day', 'Night', 'Full (24h)'];

  // ── Helpers ──────────────────────────────────────────────────────────

  function todayISO() {
    var d = new Date();
    var m = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCurrency(v) {
    return '₹' + Number(v || 0).toLocaleString('en-IN');
  }

  function deriveStatus(row) {
    if (!row) return 'Draft';
    if (row.docstatus === 2) return 'Cancelled';
    if (row.docstatus === 0) return 'Draft';
    if (row.status === 'Billed') return 'Billed';
    if (row.status === 'Verified') return 'Verified';
    if (row.status === 'Disputed') return 'Disputed';
    return 'Submitted';
  }

  function statusColor(s) {
    s = (s || '').toLowerCase();
    if (s === 'billed') return 'green';
    if (s === 'verified') return 'blue';
    if (s === 'submitted' || s === 'open') return 'yellow';
    if (s === 'disputed' || s === 'cancelled') return 'red';
    return 'gray';
  }

  // ── List screen ─────────────────────────────────────────────────────

  window.Screens.logsheetList = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'Logsheet',
      'Daily site work — fill it once, sign it once, get billed once.'
    ));

    var statsArea = el('div');
    appEl.appendChild(statsArea);

    appEl.appendChild(el('div', { style: { margin: '8px 0 16px' } }, [
      UI.btn('New logsheet entry', {
        type: 'primary',
        block: true,
        icon: 'plus',
        onClick: function () { location.hash = '#/logsheet/new'; }
      })
    ]));

    appEl.appendChild(UI.sectionHeader('Recent entries', { support: 'Most recent first' }));

    var listArea = el('div');
    listArea.appendChild(UI.skeleton(3));
    appEl.appendChild(listArea);

    Promise.all([
      api.apiCall('GET', '/api/field/logsheet-summary'),
      api.apiCall('GET', '/api/field/logsheets?limit=30')
    ]).then(function (results) {
      listArea.textContent = '';

      var sumRaw = results[0] && results[0].data;
      var summary = (sumRaw && (sumRaw.message || sumRaw.data)) || null;
      if (summary) {
        statsArea.appendChild(UI.statGrid([
          { value: (summary.draft.hours + summary.open.hours).toFixed(1) + 'h',
            label: 'Pending verification',
            support: summary.draft.count + summary.open.count + ' entries' },
          { value: summary.verified.hours.toFixed(1) + 'h',
            label: 'Verified',
            support: 'this month, awaiting bill' },
          { value: summary.billed.hours.toFixed(1) + 'h',
            label: 'Billed',
            support: formatCurrency(summary.billed.amount) },
          { value: (summary.draft.hours + summary.open.hours +
                    summary.verified.hours + summary.billed.hours).toFixed(1) + 'h',
            label: 'This month total',
            support: 'all entries' }
        ], 2));
      }

      var listRes = results[1] && results[1].data;
      var rows = (listRes && (listRes.message || listRes.data)) || [];
      if (!rows.length) {
        listArea.appendChild(UI.empty('clip', 'No logsheet entries yet', {
          text: 'Fill today’s logsheet',
          onClick: function () { location.hash = '#/logsheet/new'; }
        }));
        return;
      }

      var listWrap = el('div', { className: 'm3-list' });
      for (var i = 0; i < rows.length; i++) {
        (function (row) {
          var status = deriveStatus(row);
          var rightStack = el('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }
          }, [
            el('span', { textContent: (row.total_hours || 0).toFixed(1) + 'h',
                         style: { font: 'var(--m3-title-medium)' } }),
            UI.pill(status, statusColor(status))
          ]);

          var subParts = [formatDate(row.log_date)];
          if (row.equipment_label || row.equipment_item) {
            subParts.push(row.equipment_label || row.equipment_item);
          }
          if (row.site_name) subParts.push(row.site_name);

          listWrap.appendChild(UI.listCard({
            title: row.customer_name || row.customer || 'No customer',
            sub: subParts.join(' · '),
            right: rightStack,
            onClick: function () { location.hash = '#/logsheet/' + encodeURIComponent(row.name); }
          }));
        })(rows[i]);
      }
      listArea.appendChild(listWrap);
    }).catch(function () {
      listArea.textContent = '';
      listArea.appendChild(UI.error('Could not load logsheets.'));
    });
  };

  // ── New screen ──────────────────────────────────────────────────────

  window.Screens.logsheetNew = function (appEl) {
    var el = UI.el;
    appEl.appendChild(UI.pageHeader(
      'New logsheet',
      'Record today’s work. Attach the signed paper photo before submitting.'
    ));

    var formArea = el('div');
    appEl.appendChild(formArea);

    // Customer search — uses existing endpoint
    var customerInput = UI.m3TextField('Customer', { required: true,
      support: 'Type to search the customer master' });
    var customerHidden = { name: '', label: '' };
    var customerResults = el('div', { style: { marginTop: '4px' } });

    var customerInputEl = customerInput._getInput();
    var debounceTimer = null;
    customerInputEl.addEventListener('input', function () {
      var q = customerInputEl.value.trim();
      customerHidden.name = '';  // reset selection if user keeps typing
      customerResults.textContent = '';
      if (debounceTimer) clearTimeout(debounceTimer);
      if (q.length < 2) return;
      debounceTimer = setTimeout(function () {
        var qs = '?search=' + encodeURIComponent(q) + '&limit=8';
        api.apiCall('GET', '/api/field/customers' + qs).then(function (res) {
          customerResults.textContent = '';
          var data = res && res.data && (res.data.message || res.data.data) || [];
          for (var i = 0; i < Math.min(data.length, 8); i++) {
            (function (cust) {
              var btn = el('button', {
                type: 'button',
                className: 'btn btn-outline',
                style: { display: 'block', width: '100%', textAlign: 'left',
                         padding: '8px 12px', marginBottom: '4px' },
                textContent: cust.customer_name || cust.name,
                onClick: function () {
                  customerHidden.name = cust.name;
                  customerHidden.label = cust.customer_name || cust.name;
                  customerInputEl.value = customerHidden.label;
                  customerResults.textContent = '';
                }
              });
              customerResults.appendChild(btn);
            })(data[i]);
          }
        });
      }, 250);
    });

    var siteField = UI.m3TextField('Site / location', {
      required: true, support: 'Customer location where the equipment was today'
    });

    var equipmentField = UI.m3TextField('Equipment label', {
      support: 'e.g. DC-150. Free text — link to ERPNext Item later from desk.'
    });

    // Pre-populate equipment with recent values for quick re-entry
    api.apiCall('GET', '/api/field/recent-equipment').then(function (res) {
      var list = res && res.data && (res.data.message || res.data.data) || [];
      if (!list.length) return;
      var hint = el('div', {
        style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0 8px' }
      });
      for (var i = 0; i < Math.min(list.length, 6); i++) {
        (function (label) {
          hint.appendChild(el('button', {
            type: 'button',
            className: 'btn btn-outline',
            style: { padding: '4px 10px', fontSize: '12px' },
            textContent: label,
            onClick: function () {
              equipmentField._getInput().value = label;
            }
          }));
        })(list[i]);
      }
      equipmentField.appendChild(hint);
    }).catch(function () { /* non-fatal */ });

    var workTypeField = UI.m3SelectField('Work type',
      WORK_TYPES.map(function (t) { return { value: t, text: t }; }),
      { value: 'Lifting', required: true });

    var shiftField = UI.m3SelectField('Shift',
      SHIFTS.map(function (s) { return { value: s, text: s }; }),
      { value: 'Day' });

    var hoursField = UI.m3TextField('Hours worked', {
      type: 'number', min: '0', step: '0.5', required: true
    });
    var idleField = UI.m3TextField('Idle hours', {
      type: 'number', min: '0', step: '0.5', value: '0',
      support: 'Equipment on site but not working'
    });

    var dateField = UI.m3TextField('Date', {
      type: 'date', value: todayISO(), required: true
    });

    var signedByField = UI.m3TextField('Site supervisor name', {
      required: true,
      support: 'Whoever signed the paper — required to submit'
    });

    // Photo upload — capture from camera on phone
    var photoFile = null;
    var photoPreview = el('div', { style: { margin: '8px 0' } });
    var photoLabel = el('div', {
      textContent: 'Signed paper photo',
      style: { font: 'var(--m3-label-medium)', color: 'var(--m3-on-surface-variant)',
               margin: '12px 0 4px', letterSpacing: '0.5px' }
    });
    var photoInput = el('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      style: { display: 'none' }
    });
    photoInput.addEventListener('change', function () {
      photoFile = photoInput.files && photoInput.files[0];
      photoPreview.textContent = '';
      if (!photoFile) return;
      var img = el('img', {
        src: URL.createObjectURL(photoFile),
        style: { maxWidth: '100%', borderRadius: '8px', maxHeight: '300px' }
      });
      photoPreview.appendChild(img);
      photoPreview.appendChild(el('div', {
        textContent: photoFile.name + ' · ' + Math.round(photoFile.size / 1024) + ' KB',
        style: { font: 'var(--m3-body-small)', color: 'var(--m3-on-surface-variant)',
                 marginTop: '4px' }
      }));
    });
    var photoBtn = UI.btn('Take photo / choose file', {
      type: 'outline',
      block: true,
      icon: 'clip',
      onClick: function () { photoInput.click(); }
    });

    var remarksField = UI.m3TextField('Remarks', {
      multiline: true, rows: 3, support: 'Optional'
    });

    var rateField = UI.m3TextField('Rate per hour (₹)', {
      type: 'number', min: '0', step: '1',
      support: 'Optional — leave blank if billed by shift'
    });

    var errorBox = el('div', {
      style: { color: 'var(--m3-error)', font: 'var(--m3-body-small)',
               display: 'none', padding: '8px 0' }
    });

    function showError(msg) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
    }

    var submitBtn = UI.btn('Submit logsheet', {
      type: 'primary', block: true, icon: 'check',
      onClick: function () { handleSubmit(true); }
    });
    var draftBtn = UI.btn('Save as draft', {
      type: 'outline', block: true,
      onClick: function () { handleSubmit(false); }
    });

    formArea.appendChild(dateField);
    formArea.appendChild(customerInput);
    formArea.appendChild(customerResults);
    formArea.appendChild(siteField);
    formArea.appendChild(equipmentField);
    formArea.appendChild(workTypeField);
    formArea.appendChild(shiftField);
    formArea.appendChild(hoursField);
    formArea.appendChild(idleField);
    formArea.appendChild(rateField);
    formArea.appendChild(signedByField);
    formArea.appendChild(photoLabel);
    formArea.appendChild(photoPreview);
    formArea.appendChild(photoInput);
    formArea.appendChild(photoBtn);
    formArea.appendChild(remarksField);
    formArea.appendChild(errorBox);
    formArea.appendChild(el('div', {
      style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }
    }, [draftBtn, submitBtn]));

    function handleSubmit(doSubmit) {
      errorBox.style.display = 'none';

      var customer = customerHidden.name;
      if (!customer) { showError('Please pick a customer from the search results.'); return; }

      var siteName = siteField._getValue().trim();
      if (!siteName) { showError('Please enter the site / location.'); return; }

      var hours = parseFloat(hoursField._getValue());
      if (!hours || hours <= 0) { showError('Enter the hours worked.'); return; }

      var date = dateField._getValue() || todayISO();
      var signedBy = signedByField._getValue().trim();
      if (doSubmit && !signedBy) {
        showError('Site supervisor name is required to submit.');
        return;
      }
      if (doSubmit && !photoFile) {
        showError('Attach a photo of the signed paper logsheet to submit.');
        return;
      }

      var btn = doSubmit ? submitBtn : draftBtn;
      btn._setLoading(true, doSubmit ? 'Submitting…' : 'Saving…');

      var body = {
        log_date: date,
        customer: customer,
        site_name: siteName,
        equipment_label: equipmentField._getValue().trim() || null,
        work_type: workTypeField._getSelect().value || 'Lifting',
        shift: shiftField._getSelect().value || 'Day',
        total_hours: hours,
        idle_hours: parseFloat(idleField._getValue()) || 0,
        signed_by: signedBy || null,
        rate_per_hour: parseFloat(rateField._getValue()) || 0,
        remarks: remarksField._getValue() || null,
        do_submit: 0  // create as draft first; upload photo; then submit
      };

      // Two-step: create draft → upload photo (if any) → submit
      api.apiCall('POST', '/api/field/logsheets', body).then(function (res) {
        if (res.error) {
          showError(parseErrorMessage(res));
          btn._setLoading(false);
          return;
        }
        var lsName = res.data && (res.data.message && res.data.message.name);
        if (!lsName) {
          showError('Server did not return a name. Try again.');
          btn._setLoading(false);
          return;
        }

        if (!photoFile) {
          // Saved as draft, no photo — done
          UI.toast(doSubmit ? 'Saved as draft (photo missing)' : 'Saved as draft', 'success');
          location.hash = '#/logsheet';
          return;
        }

        uploadPhoto(lsName, photoFile).then(function (uploadRes) {
          if (uploadRes && uploadRes.message && uploadRes.message.file_url) {
            // Stamp the file_url on the logsheet, then optionally submit
            var stamp = {
              log_date: date, customer: customer, site_name: siteName,
              total_hours: hours, work_type: body.work_type, shift: body.shift,
              idle_hours: body.idle_hours, signed_by: signedBy,
              rate_per_hour: body.rate_per_hour, remarks: body.remarks,
              do_submit: doSubmit ? 1 : 0
            };
            // Use update endpoint via /api/field/logsheet/<name>
            return api.apiCall('PUT', '/api/field/logsheet/' + encodeURIComponent(lsName), stamp);
          }
          return null;
        }).then(function () {
          UI.toast(doSubmit ? 'Logsheet submitted' : 'Logsheet saved', 'success');
          location.hash = '#/logsheet';
        }).catch(function (err) {
          UI.toast('Saved draft — photo upload failed (' + (err.message || 'network') + ')', 'danger');
          location.hash = '#/logsheet/' + encodeURIComponent(lsName);
        });
      }).catch(function (err) {
        showError('Network error: ' + (err.message || ''));
        btn._setLoading(false);
      });
    }
  };

  function parseErrorMessage(res) {
    var msg = res.error || 'Failed';
    if (res.data && res.data._server_messages) {
      try {
        var arr = JSON.parse(res.data._server_messages);
        msg = JSON.parse(arr[0]).message || msg;
      } catch (e) { /* keep raw */ }
    }
    return msg;
  }

  function uploadPhoto(logsheetName, file) {
    var formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('doctype', 'Operator Logsheet');
    formData.append('docname', logsheetName);
    formData.append('fieldname', 'supervisor_signature');
    formData.append('is_private', '0');

    return api.getSession().then(function (session) {
      var headers = {};
      var auth = api.getAuthHeader(session);
      if (auth) {
        headers['Authorization'] = auth;
      } else {
        var match = document.cookie.match(/csrf_token=([^;]+)/);
        if (match) headers['X-Frappe-CSRF-Token'] = decodeURIComponent(match[1]);
      }
      return fetch('/api/method/upload_file', {
        method: 'POST', headers: headers,
        credentials: 'same-origin', body: formData
      }).then(function (resp) { return resp.json(); });
    });
  }

  // ── Detail screen ───────────────────────────────────────────────────

  window.Screens.logsheetDetail = function (appEl, params) {
    var el = UI.el;
    var name = params && params.id ? params.id : '';
    var skel = UI.skeleton(3);
    appEl.appendChild(skel);

    if (!name) {
      skel.remove();
      appEl.appendChild(UI.error('No logsheet ID'));
      return;
    }

    api.apiCall('GET', '/api/field/logsheet/' + encodeURIComponent(name)).then(function (res) {
      skel.remove();
      var doc = res && res.data && (res.data.data || res.data.message);
      if (!doc) {
        appEl.appendChild(UI.error('Could not load logsheet'));
        return;
      }
      var status = deriveStatus(doc);

      // Hero
      appEl.appendChild(el('div', { className: 'm3-doc-hero' }, [
        el('div', { className: 'm3-doc-hero-top' }, [
          el('div', { className: 'm3-doc-hero-customer' }, [
            el('div', { className: 'm3-doc-hero-customer-name',
                        textContent: doc.customer_name || doc.customer || '—' }),
            el('div', { className: 'm3-doc-hero-customer-sub',
                        textContent: doc.name + ' · ' + formatDate(doc.log_date) })
          ]),
          el('div', { className: 'm3-doc-hero-amount' }, [
            el('div', { className: 'm3-doc-hero-amount-value',
                        textContent: (doc.total_hours || 0).toFixed(1) + 'h' }),
            el('div', { className: 'm3-doc-hero-amount-label',
                        textContent: doc.shift || 'Day' })
          ])
        ]),
        el('div', {}, [UI.pill(status, statusColor(status))])
      ]));

      // Site & equipment
      appEl.appendChild(UI.sectionHeader('Site & equipment'));
      appEl.appendChild(UI.detailCard([
        { label: 'Site', value: doc.site_name || '—' },
        { label: 'Equipment', value: doc.equipment_label || doc.equipment_item || '—' },
        { label: 'Work type', value: doc.work_type || '—' },
        { label: 'Idle hours', value: (doc.idle_hours || 0).toFixed(1) + 'h' }
      ]));

      // Sign-off
      appEl.appendChild(UI.sectionHeader('Site sign-off'));
      var signoffRows = [
        { label: 'Signed by', value: doc.signed_by || '—' }
      ];
      if (doc.amount) {
        signoffRows.push({ label: 'Amount', value: formatCurrency(doc.amount) });
      }
      appEl.appendChild(UI.detailCard(signoffRows));
      if (doc.supervisor_signature) {
        appEl.appendChild(el('div', { style: { margin: '12px 0' } }, [
          el('img', {
            src: doc.supervisor_signature,
            style: { maxWidth: '100%', borderRadius: '8px', maxHeight: '400px' },
            alt: 'Signed paper photo'
          })
        ]));
      }

      if (doc.sales_invoice) {
        appEl.appendChild(UI.sectionHeader('Billing'));
        appEl.appendChild(UI.detailCard([
          { label: 'Sales Invoice', value: doc.sales_invoice }
        ]));
      }

      // Owner action: cancel a draft or unverified submission
      if (doc.docstatus === 0 || (doc.docstatus === 1 && doc.status !== 'Verified' && !doc.sales_invoice)) {
        appEl.appendChild(el('div', { style: { marginTop: '24px' } }, [
          UI.actionBar([
            { text: doc.docstatus === 0 ? 'Delete draft' : 'Cancel logsheet',
              type: 'outline-danger', icon: 'x',
              onClick: function () {
                UI.confirmDialog(
                  doc.docstatus === 0 ? 'Delete this draft?' : 'Cancel this logsheet?',
                  doc.docstatus === 0
                    ? 'Removed permanently.'
                    : 'You can still re-create it later. Manager will be notified.',
                  { confirmText: 'Yes', danger: true }
                ).then(function (ok) {
                  if (!ok) return;
                  api.apiCall('DELETE', '/api/field/logsheet/' + encodeURIComponent(doc.name)).then(function (r) {
                    if (r.error) {
                      UI.toast('Could not cancel: ' + parseErrorMessage(r), 'danger');
                      return;
                    }
                    UI.toast('Done', 'success');
                    location.hash = '#/logsheet';
                  });
                });
              }
            }
          ])
        ]));
      }
    }).catch(function () {
      skel.remove();
      appEl.appendChild(UI.error('Could not load logsheet'));
    });
  };

})();
