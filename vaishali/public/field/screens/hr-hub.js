/* hr-hub.js — HR Services screen */
(function () {
  'use strict';
  var el = UI.el;

  window.Screens = window.Screens || {};
  window.Screens.hrHub = function (appEl) {
    // Subtle description
    appEl.appendChild(el('div', {
      className: 'ink-tertiary',
      textContent: 'Manage your leave, expenses, and payroll.',
      style: { fontSize: '14px', marginBottom: '16px' }
    }));

    var tiles = [
      { label: 'Leave', ic: 'umbrella', hash: '#/leave', sub: 'Balance and applications' },
      { label: 'Expenses', ic: 'receipt', hash: '#/expense', sub: 'Claims and reimbursements' },
      { label: 'Advances', ic: 'banknote', hash: '#/advance', sub: 'Salary advance requests' },
      { label: 'Salary', ic: 'wallet', hash: '#/salary', sub: 'Payslips and history' },
      { label: 'Budget', ic: 'receipt', hash: '#/budget', sub: 'Expense budget tracker' }
    ];

    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        appEl.appendChild(UI.listCard({
          title: t.label,
          sub: t.sub,
          onClick: function () { location.hash = t.hash; }
        }));
      })(tiles[i]);
    }
  };
})();
