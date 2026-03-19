(function () {
  'use strict';

  window.Screens = window.Screens || {};

  window.Screens.profile = function (appEl) {
    var el = UI.el;

    // Page header (no back button — main tab)
    appEl.appendChild(UI.page('Profile'));

    // Show skeleton while loading
    var loader = UI.skeleton(2);
    appEl.appendChild(loader);

    // Use frappeGetProfile on Frappe Cloud (native API), or /api/field/me on FastAPI
    var profilePromise;
    if (typeof window.fieldAPI.frappeGetProfile === 'function') {
      profilePromise = window.fieldAPI.frappeGetProfile().then(function (d) {
        return { data: { data: d } };
      });
    } else {
      profilePromise = window.fieldAPI.apiCall('GET', '/api/field/me');
    }

    profilePromise.then(function (resp) {
      // Remove skeleton
      if (loader.parentNode) loader.parentNode.removeChild(loader);

      var profile = (resp.data && resp.data.data) || (resp.data && resp.data.message) || (resp.data) || {};
      var employeeName = profile.employee_name || 'Employee';
      var department = profile.department || '';
      var designation = profile.designation || '';
      var phone = profile.cell_phone || '';
      var email = profile.personal_email || '';
      var doj = profile.date_of_joining || '';
      var status = profile.status || '';

      // Avatar section — centered
      var avatarSection = el('div', { style: { textAlign: 'center', margin: '0 auto 16px' } }, [
        UI.avatar(employeeName, 88)
      ]);
      appEl.appendChild(avatarSection);

      // Employee name — centered
      appEl.appendChild(el('h2', {
        textContent: employeeName,
        style: { textAlign: 'center', fontSize: '20px', fontWeight: '700', margin: '0 0 4px' }
      }));

      // Department + Designation subtitle — centered
      var subtitle = [department, designation].filter(Boolean).join(' \u00B7 ');
      if (subtitle) {
        appEl.appendChild(el('div', {
          className: 'ink-tertiary',
          textContent: subtitle,
          style: { textAlign: 'center', fontSize: '13px', marginBottom: '16px' }
        }));
      }

      appEl.appendChild(UI.divider());

      // Detail card with profile rows
      appEl.appendChild(UI.detailCard([
        { label: 'Department', value: department },
        { label: 'Designation', value: designation },
        { label: 'Phone', value: phone },
        { label: 'Email', value: email },
        { label: 'Date of Joining', value: doj },
        { label: 'Status', value: status }
      ]));

      appEl.appendChild(UI.divider());

      // Sign Out button
      appEl.appendChild(UI.btn('Sign Out', {
        type: 'outline-danger',
        block: true,
        icon: 'logOut',
        onClick: function () {
          Auth.clearSession();
        }
      }));

      // App version footer
      appEl.appendChild(el('div', {
        className: 'ink-tertiary',
        textContent: 'DSPL Org OS v1.0',
        style: { textAlign: 'center', fontSize: '11px', marginTop: '24px' }
      }));
    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load profile'));
    });
  };
})();
