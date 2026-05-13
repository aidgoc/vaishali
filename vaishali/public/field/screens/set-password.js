/* set-password.js — First-login password change screen */
(function () {
  'use strict';
  var api = window.fieldAPI;
  var el = UI.el;

  window.Screens = window.Screens || {};
  window.Screens.setPassword = function (appEl) {
    appEl.appendChild(UI.pageHeader(
      'Set a new password',
      'Welcome! Before you continue, please replace the temporary password with one only you know.'
    ));

    var pw1 = el('input', {
      type: 'password', placeholder: 'New password (min 6 characters)',
      autocomplete: 'new-password', 'aria-label': 'New password',
      style: { width: '100%' }
    });
    var pw2 = el('input', {
      type: 'password', placeholder: 'Confirm new password',
      autocomplete: 'new-password', 'aria-label': 'Confirm new password',
      style: { width: '100%' }
    });
    var errorBox = el('div', { className: 'error-box', style: { display: 'none', marginTop: '8px', color: 'var(--red,#dc3545)', fontSize: '14px' } });

    var submitBtn = UI.btn('Save password', {
      type: 'success', block: true, icon: 'check',
      onClick: function () {
        errorBox.style.display = 'none';
        var a = (pw1.value || '').trim();
        var b = (pw2.value || '').trim();
        if (a.length < 6) {
          errorBox.textContent = 'Password must be at least 6 characters.';
          errorBox.style.display = 'block';
          return;
        }
        if (a !== b) {
          errorBox.textContent = 'Passwords do not match.';
          errorBox.style.display = 'block';
          return;
        }
        if (a.toLowerCase() === 'test123') {
          errorBox.textContent = 'Please pick a different password from the temporary one.';
          errorBox.style.display = 'block';
          return;
        }
        submitBtn._setLoading(true, 'Saving...');
        api.apiCall('POST', '/api/method/vaishali.api.field.set_new_password', { new_password: a })
          .then(function (res) {
            if (res.error || (res.status && res.status >= 400)) {
              var msg = (res.data && res.data._server_messages)
                ? api.extractError(res)
                : (res.error || 'Could not save password');
              errorBox.textContent = msg;
              errorBox.style.display = 'block';
              submitBtn._setLoading(false);
              return;
            }
            UI.toast('Password updated', 'success');
            setTimeout(function () { location.hash = '#/home'; }, 400);
          })
          .catch(function (e) {
            errorBox.textContent = (e && e.message) || 'Network error';
            errorBox.style.display = 'block';
            submitBtn._setLoading(false);
          });
      }
    });

    pw2.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });

    var wrap = el('div', { style: { maxWidth: '360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' } }, [
      el('div', { className: 'field-group' }, [pw1]),
      el('div', { className: 'field-group' }, [pw2]),
      errorBox,
      el('div', { style: { marginTop: '8px' } }, [submitBtn]),
    ]);
    appEl.appendChild(wrap);

    setTimeout(function () { pw1.focus(); }, 50);
  };
})();
