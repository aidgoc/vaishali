(function () {
  'use strict';

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

      // Avatar section — centered
      var avatarEl = UI.avatar(employeeName, 88);
      avatarEl.classList.add('avatar-self');
      var avatarSection = el('div', { style: { textAlign: 'center', margin: '0 auto 16px' } }, [
        avatarEl
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

      appEl.appendChild(UI.divider());

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
                  var pollTimer = setInterval(function () {
                    window.fieldAPI.apiCall('GET', '/api/method/vaishali.api.field.get_me')
                      .then(function (meResp) {
                        var me = (meResp.data && meResp.data.data) ||
                                 (meResp.data && meResp.data.message) ||
                                 (meResp.data) || {};
                        if (me.telegram_chat_id) {
                          clearInterval(pollTimer);
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
        textContent: 'DSPL Org OS v1.0',
        style: { textAlign: 'center', fontSize: '11px', marginTop: '24px' }
      }));
    }).catch(function () {
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      appEl.appendChild(UI.error('Failed to load profile'));
    });
  };
})();
