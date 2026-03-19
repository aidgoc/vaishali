(function () {
  'use strict';
  window.Screens = window.Screens || {};
  window.Screens.hrHub = function (appEl) {
    appEl.appendChild(UI.page('HR Services', '#/home'));

    var tiles = [
      { label: 'Leave', ic: 'umbrella', hash: '#/leave', color: 'tile-green' },
      { label: 'Expenses', ic: 'receipt', hash: '#/expense', color: 'tile-blue' },
      { label: 'Advances', ic: 'banknote', hash: '#/advance', color: 'tile-amber' },
      { label: 'Salary', ic: 'wallet', hash: '#/salary', color: '' }
    ];

    var grid = UI.el('div', { className: 'quick-actions' });
    for (var i = 0; i < tiles.length; i++) {
      (function (t) {
        var iconEl = UI.el('div', { className: 'tile-icon' });
        iconEl.appendChild(icon(t.ic));
        grid.appendChild(UI.el('div', {
          className: 'action-tile' + (t.color ? ' ' + t.color : ''),
          onClick: function () { location.hash = t.hash; }
        }, [iconEl, UI.el('div', { className: 'tile-label', textContent: t.label })]));
      })(tiles[i]);
    }
    appEl.appendChild(grid);
  };
})();
