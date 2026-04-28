(function () {
  'use strict';

  var _pollTimer = null;

  window.addEventListener('hashchange', function() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  });

  window.Screens = window.Screens || {};

  window.Screens.profile = function (appEl) {
    var el = UI.el;

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

      // M3 profile hero — large avatar, name, role
      var initials = employeeName.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var hero = el('div', { className: 'profile-hero' }, [
        el('div', { className: 'profile-avatar', textContent: initials }),
        el('h2', { textContent: employeeName })
      ]);
      var subtitle = [department, designation].filter(Boolean).join(' \u00B7 ');
      if (subtitle) {
        hero.appendChild(el('p', { className: 'profile-subtitle', textContent: subtitle }));
      }
      appEl.appendChild(hero);

      // Work section
      appEl.appendChild(UI.sectionHeader('Work', { support: 'Role and employment status' }));
      appEl.appendChild(UI.detailCard([
        { label: 'Department', value: department },
        { label: 'Designation', value: designation },
        { label: 'Status', value: status }
      ]));

      // Contact section
      appEl.appendChild(UI.sectionHeading('Contact'));
      appEl.appendChild(UI.detailCard([
        { label: 'Phone', value: phone },
        { label: 'Email', value: email },
        { label: 'Date of Joining', value: doj }
      ]));

      // Sign Out button with M3 confirm dialog
      var signOutBtn = UI.btn('Sign out', {
        type: 'outline-danger',
        block: true,
        icon: 'logOut',
        onClick: function () {
          UI.confirmDialog(
            'Sign out of DSPL Field?',
            'You will need to sign in again with your email and password to access the app.',
            { confirmText: 'Sign out', cancelText: 'Cancel', danger: true, icon: 'logOut' }
          ).then(function (ok) {
            if (!ok) return;
            window.fieldAPI.apiCall('GET', '/api/method/logout').then(function () {
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                  for (var i = 0; i < regs.length; i++) regs[i].unregister();
                });
                caches.keys().then(function (names) {
                  for (var i = 0; i < names.length; i++) caches.delete(names[i]);
                });
              }
              localStorage.clear();
              Auth.clearSession();
            }).catch(function () {
              localStorage.clear();
              Auth.clearSession();
            });
          });
        }
      });
      var signOutWrap = el('div', { style: { marginTop: '32px' } }, [signOutBtn]);
      appEl.appendChild(signOutWrap);

      // ─── Telegram section ─────────────────────────────────────
      var telegramSection = el('div', { className: 'telegram-section' });
      appEl.appendChild(telegramSection);

      function renderTelegramSection(isConnected) {
        telegramSection.textContent = '';
        if (isConnected) {
          telegramSection.appendChild(UI.card([
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
              el('div', {
                style: {
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: '#2AABEE', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: '0'
                },
                textContent: '\u2708\uFE0F'
              }),
              el('div', {}, [
                el('div', { textContent: 'Telegram Connected', style: { fontWeight: '600', fontSize: '15px' } }),
                el('div', { textContent: 'Notifications enabled', className: 'ink-tertiary', style: { fontSize: '13px', marginTop: '2px' } })
              ])
            ])
          ]));
        } else {
          var connectBtn = UI.btn('Connect Telegram', {
            type: 'outline',
            block: true,
            onClick: function () {
              connectBtn.disabled = true;
              connectBtn.textContent = 'Connecting\u2026';

              window.fieldAPI.apiCall('POST', '/api/method/vaishali.api.field.generate_telegram_token')
                .then(function (resp) {
                  var botUrl = resp.data && (resp.data.bot_url || (resp.data.data && resp.data.data.bot_url));
                  if (!botUrl) {
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Connect Telegram';
                    window.fieldAPI.showToast('Could not get Telegram link. Please try again.', 'danger');
                    return;
                  }
                  window.open(botUrl, '_blank');

                  // Poll every 3 s to check if telegram_chat_id has appeared
                  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
                  _pollTimer = setInterval(function () {
                    window.fieldAPI.apiCall('GET', '/api/method/vaishali.api.field.get_me')
                      .then(function (meResp) {
                        var me = (meResp.data && meResp.data.data) ||
                                 (meResp.data && meResp.data.message) ||
                                 (meResp.data) || {};
                        if (me.telegram_chat_id) {
                          clearInterval(_pollTimer);
                          _pollTimer = null;
                          window.fieldAPI.showToast('Telegram connected!', 'success');
                          renderTelegramSection(true);
                        }
                      })
                      .catch(function () {
                        // silently ignore poll errors
                      });
                  }, 3000);
                })
                .catch(function () {
                  connectBtn.disabled = false;
                  connectBtn.textContent = 'Connect Telegram';
                  window.fieldAPI.showToast('Failed to connect Telegram. Please try again.', 'danger');
                });
            }
          });
          telegramSection.appendChild(connectBtn);
        }
      }

      renderTelegramSection(!!profile.telegram_chat_id);

      // App version footer
      appEl.appendChild(el('div', {
        className: 'ink-tertiary',
        textContent: 'v1.0',
        style: { textAlign: 'center', fontSize: '11px', marginTop: '24px', opacity: '0.5' }
      }));
    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load profile'));
    });
  };
})();
