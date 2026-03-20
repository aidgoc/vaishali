/* hr-hub.js — HR Services screen */
(function () {
  'use strict';
  var el = UI.el;

  window.Screens = window.Screens || {};
  window.Screens.hrHub = function (appEl) {
    var tiles = [
      { label: 'Leave', ic: 'umbrella', hash: '#/leave' },
      { label: 'Expenses', ic: 'receipt', hash: '#/expense' },
      { label: 'Advances', ic: 'banknote', hash: '#/advance' },
      { label: 'Salary', ic: 'wallet', hash: '#/salary' }
    ];

    var grid = el('div', { className: 'hr-grid' });
    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        var tile = el('div', {
          className: 'hr-tile',
          onClick: function () { location.hash = t.hash; }
        }, [
          icon(t.ic),
          el('span', { textContent: t.label })
        ]);
        grid.appendChild(tile);
      })(tiles[i]);
    }
    appEl.appendChild(grid);
  };
})();
