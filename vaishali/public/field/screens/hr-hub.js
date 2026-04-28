/* hr-hub.js — HR Services screen — M3 */
(function () {
  'use strict';
  var el = UI.el;
  var icon = window.icon;

  window.Screens = window.Screens || {};
  window.Screens.hrHub = function (appEl) {
    var content = el('div');
    appEl.appendChild(content);

    content.appendChild(UI.pageHeader(
      'HR services',
      'Leave, expenses, salary slips and advances — all in one place.'
    ));

    var tiles = [
      { label: 'Leave', ic: 'umbrella', hash: '#/leave', sub: 'Balance and applications' },
      { label: 'Expenses', ic: 'receipt', hash: '#/expense', sub: 'Claims and reimbursements' },
      { label: 'Advances', ic: 'banknote', hash: '#/advance', sub: 'Salary advance requests' },
      { label: 'Salary', ic: 'wallet', hash: '#/salary', sub: 'Payslips and history' },
      { label: 'Budget', ic: 'receipt', hash: '#/budget', sub: 'Expense budget tracker' }
    ];

    var listWrap = el('div', { className: 'm3-list' });
    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        var leadingIcon = el('div', {
          style: {
            width: '40px',
            height: '40px',
            borderRadius: '9999px',
            background: 'var(--m3-secondary-container)',
            color: 'var(--m3-on-secondary-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: '0'
          }
        });
        if (icon) leadingIcon.appendChild(icon(t.ic));

        var chev = el('span', { 'aria-hidden': 'true', style: { color: 'var(--m3-on-surface-variant)' } });
        if (icon) chev.appendChild(icon('right'));

        listWrap.appendChild(UI.listCard({
          avatar: leadingIcon,
          title: t.label,
          sub: t.sub,
          right: chev,
          onClick: function () { location.hash = t.hash; }
        }));
      })(tiles[i]);
    }
    content.appendChild(listWrap);
  };
})();
