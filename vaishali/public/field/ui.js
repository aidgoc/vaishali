/* ui.js — DOM-builder component library for DSPL Field App */
(function () {
  'use strict';

  var icon = window.icon;

  /* ──────────────────────────────────────────────────────────────
     1. el(tag, attrs, children) — core DOM builder
     ────────────────────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'textContent') { node.textContent = v; }
        else if (k === 'className') { node.className = v; }
        else if (k === 'htmlFor') { node.htmlFor = v; }
        else if (k === 'disabled') { node.disabled = !!v; }
        else if (k === 'hidden') { node.hidden = !!v; }
        else if (k === 'value') { node.value = v; }
        else if (k === 'type') { node.type = v; }
        else if (k === 'name') { node.name = v; }
        else if (k === 'placeholder') { node.placeholder = v; }
        else if (k === 'readOnly') { node.readOnly = !!v; }
        else if (k === 'selected') { node.selected = !!v; }
        else if (k === 'checked') { node.checked = !!v; }
        else if (k === 'required') { node.required = !!v; }
        else if (k === 'min') { node.min = v; }
        else if (k === 'max') { node.max = v; }
        else if (k === 'step') { node.step = v; }
        else if (k === 'rows') { node.rows = v; }
        else if (k === 'multiple') { node.multiple = !!v; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        }
        else if (k === 'style' && typeof v === 'object') {
          var sk = Object.keys(v);
          for (var j = 0; j < sk.length; j++) {
            node.style[sk[j]] = v[sk[j]];
          }
        }
        else { node.setAttribute(k, v); }
      }
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      for (var c = 0; c < children.length; c++) {
        var child = children[c];
        if (child == null) continue;
        if (typeof child === 'string') {
          node.appendChild(document.createTextNode(child));
        } else {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  /* helper: append icon DOM element into a container */
  function setIconHTML(element, name) {
    /* icon() returns a DOM <span> element containing trusted static SVG */
    element.appendChild(icon(name));
    return element;
  }

  /* ──────────────────────────────────────────────────────────────
     2. card(children, opts)
     ────────────────────────────────────────────────────────────── */
  function card(children, opts) {
    opts = opts || {};
    var cls = 'card-surface';
    if (opts.accent) cls += ' accent-' + opts.accent;
    if (opts.tappable) cls += ' tappable';
    if (opts.className) cls += ' ' + opts.className;
    var attrs = { className: cls };
    if (opts.onClick) attrs.onClick = opts.onClick;
    if (!Array.isArray(children)) children = [children];
    return el('div', attrs, children);
  }

  /* ──────────────────────────────────────────────────────────────
     4. statCard(value, label)
     ────────────────────────────────────────────────────────────── */
  function statCard(value, label) {
    return el('div', { className: 'stat-card', 'aria-label': String(value) + ' ' + label }, [
      el('div', { className: 'stat-value', textContent: String(value) }),
      el('div', { className: 'stat-label', textContent: label })
    ]);
  }

  /* ──────────────────────────────────────────────────────────────
     5. listCard(opts)
     ────────────────────────────────────────────────────────────── */
  function listCard(opts) {
    opts = opts || {};
    var parts = [];

    if (opts.avatar != null) {
      if (typeof opts.avatar === 'string') {
        parts.push(avatar(opts.avatar));
      } else {
        parts.push(opts.avatar);
      }
    }

    var contentChildren = [];
    if (opts.title) contentChildren.push(el('div', { className: 'list-title', textContent: opts.title }));
    if (opts.sub) contentChildren.push(el('div', { className: 'list-sub', textContent: opts.sub }));
    parts.push(el('div', { className: 'list-content' }, contentChildren));

    if (opts.right != null) {
      var rightEl = typeof opts.right === 'string'
        ? el('span', { textContent: opts.right })
        : opts.right;
      parts.push(el('div', { className: 'list-right' }, [rightEl]));
    }

    var attrs = { className: 'list-card' };
    if (opts.onClick) {
      attrs.onClick = opts.onClick;
      attrs.role = 'button';
      attrs.tabIndex = '0';
    }
    return el('div', attrs, parts);
  }

  /* ──────────────────────────────────────────────────────────────
     6. detailRow(label, value)
     ────────────────────────────────────────────────────────────── */
  function detailRow(label, value) {
    return el('div', { className: 'detail-row' }, [
      el('span', { className: 'detail-label', textContent: label }),
      el('span', { className: 'detail-value', textContent: value || '\u2014' })
    ]);
  }

  /* ──────────────────────────────────────────────────────────────
     7. detailCard(rows)
     ────────────────────────────────────────────────────────────── */
  function detailCard(rows) {
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      items.push(detailRow(rows[i].label, rows[i].value));
    }
    return el('div', { className: 'detail-card' }, items);
  }

  /* ──────────────────────────────────────────────────────────────
     8. pill(text, color)
     ────────────────────────────────────────────────────────────── */
  function pill(text, color) {
    var cls = 'indicator-pill';
    if (color) cls += ' ' + color;
    return el('span', { className: cls, textContent: text });
  }

  /* ──────────────────────────────────────────────────────────────
     9. avatar(name, size)
     ────────────────────────────────────────────────────────────── */
  function avatar(name, size) {
    size = size || 42;
    var words = (name || '').trim().split(/\s+/);
    var initials = '';
    for (var i = 0; i < Math.min(words.length, 2); i++) {
      if (words[i]) initials += words[i][0].toUpperCase();
    }
    return el('div', {
      className: 'list-avatar',
      textContent: initials,
      style: {
        width: size + 'px',
        height: size + 'px',
        fontSize: Math.round(size * 0.36) + 'px'
      }
    });
  }

  /* ──────────────────────────────────────────────────────────────
     10. amount(value)
     ────────────────────────────────────────────────────────────── */
  function amount(value) {
    var num = Number(value) || 0;
    var formatted = '\u20B9' + num.toLocaleString('en-IN');
    return el('span', { className: 'amount', textContent: formatted });
  }

  /* ──────────────────────────────────────────────────────────────
     11. btn(text, opts)
     ────────────────────────────────────────────────────────────── */
  function btn(text, opts) {
    opts = opts || {};
    var typeMap = {
      primary: 'btn-primary-styled',
      success: 'btn-success-custom',
      danger: 'btn-danger-custom',
      outline: 'btn-outline',
      'outline-danger': 'btn-outline-danger'
    };
    var cls = 'btn';
    if (opts.type && typeMap[opts.type]) cls += ' ' + typeMap[opts.type];
    if (opts.block) cls += ' btn-block';
    if (opts.className) cls += ' ' + opts.className;

    var children = [];
    if (opts.icon) {
      var ic = el('span', { className: 'btn-icon' });
      setIconHTML(ic, opts.icon);
      children.push(ic);
    }
    children.push(el('span', { className: 'btn-text', textContent: text }));

    var btnAttrs = {
      className: cls,
      disabled: opts.disabled || false,
      onClick: opts.onClick || null
    };
    if (opts.icon && (!text || text === '')) {
      btnAttrs['aria-label'] = text || opts.icon;
    }
    var button = el('button', btnAttrs, children);

    /* _setLoading method */
    button._setLoading = function (isLoading, loadingText) {
      if (isLoading) {
        button._savedHTML = [];
        while (button.firstChild) {
          button._savedHTML.push(button.removeChild(button.firstChild));
        }
        button.disabled = true;
        if (loadingText) {
          button.appendChild(el('span', { textContent: loadingText }));
          button.appendChild(document.createTextNode(' '));
        }
        button.appendChild(el('span', { className: 'spinner' }));
      } else {
        while (button.firstChild) button.removeChild(button.firstChild);
        if (button._savedHTML) {
          for (var si = 0; si < button._savedHTML.length; si++) {
            button.appendChild(button._savedHTML[si]);
          }
          button._savedHTML = null;
        }
        button.disabled = false;
      }
    };

    return button;
  }

  /* ──────────────────────────────────────────────────────────────
     12. actionBar(buttons)
     ────────────────────────────────────────────────────────────── */
  function actionBar(buttons) {
    var items = [];
    for (var i = 0; i < buttons.length; i++) {
      items.push(btn(buttons[i].text, buttons[i]));
    }
    return el('div', { className: 'action-bar' }, items);
  }

  /* ──────────────────────────────────────────────────────────────
     13. field(label, inputEl)
     ────────────────────────────────────────────────────────────── */
  function field(label, inputEl) {
    var labelEl = el('label', { textContent: label });
    if (inputEl.id) labelEl.htmlFor = inputEl.id;
    return el('div', { className: 'field-group' }, [labelEl, inputEl]);
  }

  /* ──────────────────────────────────────────────────────────────
     14. textInput(placeholder, opts)
     ────────────────────────────────────────────────────────────── */
  function textInput(placeholder, opts) {
    opts = opts || {};
    return el('input', {
      className: 'form-control',
      type: opts.type || 'text',
      placeholder: placeholder || '',
      value: opts.value || '',
      readOnly: opts.readOnly || false,
      required: opts.required || false,
      name: opts.name || null
    });
  }

  /* ──────────────────────────────────────────────────────────────
     15. dateInput(label, value)
     ────────────────────────────────────────────────────────────── */
  function dateInput(label, value) {
    var inp = el('input', {
      className: 'form-control',
      type: 'date',
      value: value || ''
    });
    return field(label, inp);
  }

  /* ──────────────────────────────────────────────────────────────
     16. textarea(placeholder, opts)
     ────────────────────────────────────────────────────────────── */
  function textarea(placeholder, opts) {
    opts = opts || {};
    return el('textarea', {
      className: 'form-control',
      placeholder: placeholder || '',
      rows: opts.rows || 3,
      value: opts.value || '',
      name: opts.name || null
    });
  }

  /* ──────────────────────────────────────────────────────────────
     17. select(label, options, selectedValue)
     ────────────────────────────────────────────────────────────── */
  function select(label, options, selectedValue) {
    var optEls = [];
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var val, txt;
      if (typeof opt === 'string') {
        val = opt;
        txt = opt;
      } else {
        val = opt.value;
        txt = opt.text;
      }
      optEls.push(el('option', {
        value: val,
        textContent: txt,
        selected: val === selectedValue
      }));
    }
    var sel = el('select', { className: 'form-control' }, optEls);
    return field(label, sel);
  }

  /* ──────────────────────────────────────────────────────────────
     18. searchInput(placeholder, onInput)
     ────────────────────────────────────────────────────────────── */
  function searchInput(placeholder, onInput) {
    var timer = null;
    var ic = el('span', { className: 'search-icon' });
    setIconHTML(ic, 'search');
    var inp = el('input', {
      className: 'form-control search-input',
      type: 'text',
      placeholder: placeholder || 'Search\u2026',
      onInput: function (e) {
        var val = e.target.value;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          if (onInput) onInput(val);
        }, 300);
      }
    });
    return el('div', { className: 'search-input-wrapper' }, [ic, inp]);
  }

  /* ──────────────────────────────────────────────────────────────
     19. toggle(label, checked, onChange)
     ────────────────────────────────────────────────────────────── */
  function toggle(label, checked, onChange) {
    var track = el('div', { className: 'toggle-track' + (checked ? ' active' : '') }, [
      el('div', { className: 'toggle-thumb' })
    ]);
    var wrapper = el('div', { className: 'toggle-wrapper', onClick: function () {
      var isActive = track.classList.toggle('active');
      if (onChange) onChange(isActive);
    } }, [
      el('span', { className: 'toggle-label', textContent: label }),
      track
    ]);
    return wrapper;
  }

  /* ──────────────────────────────────────────────────────────────
     20. grid(children, cols)
     ────────────────────────────────────────────────────────────── */
  function grid(children, cols) {
    return el('div', {
      className: 'ui-grid',
      style: { display: 'grid', gridTemplateColumns: 'repeat(' + (cols || 2) + ', 1fr)', gap: '12px' }
    }, children);
  }

  /* ──────────────────────────────────────────────────────────────
     21. divider()
     ────────────────────────────────────────────────────────────── */
  function divider() {
    return el('div', { className: 'divider' });
  }

  /* ──────────────────────────────────────────────────────────────
     22. sectionHeading(text)
     ────────────────────────────────────────────────────────────── */
  function sectionHeading(text) {
    return el('div', { className: 'section-heading', textContent: text });
  }

  /* ──────────────────────────────────────────────────────────────
     23. tabs(items, activeValue, onChange)
     ────────────────────────────────────────────────────────────── */
  function tabs(items, activeValue, onChange) {
    var bar = el('div', { className: 'tab-bar' });
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var cls = 'tab-item';
        if (item.value === activeValue) cls += ' active';
        var tabBtn = el('button', {
          className: cls,
          textContent: item.label,
          'data-value': item.value,
          onClick: function () {
            var all = bar.querySelectorAll('.tab-item');
            for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
            tabBtn.classList.add('active');
            if (onChange) onChange(item.value);
          }
        });
        bar.appendChild(tabBtn);
      })(items[i]);
    }
    return bar;
  }

  /* ──────────────────────────────────────────────────────────────
     24. skeleton(count)
     ────────────────────────────────────────────────────────────── */
  function skeleton(count) {
    count = count || 2;
    var items = [];
    for (var i = 0; i < count; i++) {
      items.push(el('div', { className: 'skeleton skeleton-card' }));
    }
    return el('div', { 'aria-busy': 'true', 'aria-label': 'Loading' }, items);
  }

  /* ──────────────────────────────────────────────────────────────
     25. empty(iconName, text)
     ────────────────────────────────────────────────────────────── */
  function empty(iconName, text, ctaOpts) {
    var ic = el('div', { className: 'empty-icon' });
    setIconHTML(ic, iconName);
    var children = [ic, el('div', { className: 'empty-text', textContent: text })];
    if (ctaOpts) {
      children.push(el('div', { className: 'empty-cta', style: { marginTop: '16px' } }, [
        btn(ctaOpts.text, { type: ctaOpts.type || 'primary', onClick: ctaOpts.onClick })
      ]));
    }
    return el('div', { className: 'empty-state', role: 'status' }, children);
  }

  /* ──────────────────────────────────────────────────────────────
     26. error(text)
     ────────────────────────────────────────────────────────────── */
  function error(text) {
    return el('div', { className: 'error-box', textContent: text, role: 'alert' });
  }

  /* ──────────────────────────────────────────────────────────────
     27. toast(text, type)
     ────────────────────────────────────────────────────────────── */
  function toast(text, type) {
    var cls = 'toast-fallback';
    if (type) cls += ' ' + type;
    var t = el('div', { className: cls, textContent: text, role: 'alert', 'aria-live': 'polite' });
    document.body.appendChild(t);
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 3000);
    return t;
  }

  /* ──────────────────────────────────────────────────────────────
     28. nav(tabsList, activeTab)
     ────────────────────────────────────────────────────────────── */
  function nav(tabsList, activeTab) {
    var existing = document.getElementById('bottom-nav');
    if (existing) existing.parentNode.removeChild(existing);

    var navEl = el('nav', { className: 'bottom-nav', id: 'bottom-nav' });

    for (var i = 0; i < tabsList.length; i++) {
      (function (item) {
        var cls = 'nav-item';
        if (item.tab === activeTab) cls += ' active';
        var ic = el('span', { className: 'nav-icon' });
        setIconHTML(ic, item.ic);
        var navItem = el('a', {
          className: cls,
          'data-tab': item.tab,
          'aria-label': item.label,
          'aria-current': item.tab === activeTab ? 'page' : null,
          onClick: function (e) {
            e.preventDefault();
            location.hash = item.hash;
          }
        }, [
          ic,
          el('span', { className: 'nav-label', textContent: item.label })
        ]);
        navEl.appendChild(navItem);
      })(tabsList[i]);
    }

    navEl.hidden = false;
    document.body.appendChild(navEl);
    return navEl;
  }

  /* ──────────────────────────────────────────────────────────────
     29. updateNavActive(tabName)
     ────────────────────────────────────────────────────────────── */
  function updateNavActive(tabName) {
    var navEl = document.getElementById('bottom-nav');
    if (!navEl) return;
    var items = navEl.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-tab') === tabName) {
        items[i].classList.add('active');
        items[i].setAttribute('aria-current', 'page');
      } else {
        items[i].classList.remove('active');
        items[i].removeAttribute('aria-current');
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────
     30. fab(onClick)
     ────────────────────────────────────────────────────────────── */
  function fab(onClick) {
    var button = el('button', { className: 'fab', onClick: onClick });
    setIconHTML(button, 'bot');
    return button;
  }

  /* ──────────────────────────────────────────────────────────────
     31. bottomSheet(title, contentEl)
     ────────────────────────────────────────────────────────────── */
  function bottomSheet(title, contentEl) {
    var closeBtn = el('button', { className: 'bottom-sheet-close' });
    setIconHTML(closeBtn, 'x');

    var header = el('div', { className: 'bottom-sheet-header' }, [
      el('div', { className: 'bottom-sheet-title', textContent: title }),
      closeBtn
    ]);

    var sheet = el('div', { className: 'bottom-sheet' }, [
      header,
      el('div', { className: 'bottom-sheet-content' }, [contentEl])
    ]);

    var overlay = el('div', { className: 'bottom-sheet-overlay' }, [sheet]);

    function close() {
      overlay.classList.add('closing');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 250);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener('click', close);

    overlay._close = close;
    return overlay;
  }

  /* ──────────────────────────────────────────────────────────────
     32. actionCard(opts)
     ────────────────────────────────────────────────────────────── */
  function actionCard(opts) {
    // opts: { icon, label, value, sub, onClick, accent }
    // accent: 'green', 'red', or null
    var cls = 'action-card';
    if (opts.accent) cls += ' accent-' + opts.accent;

    var children = [];

    // Icon
    if (opts.icon) {
      var ic = el('div', { className: 'action-icon' });
      setIconHTML(ic, opts.icon);
      children.push(ic);
    }

    // Label
    children.push(el('div', { className: 'action-label', textContent: opts.label || '' }));

    // Value (large)
    if (opts.value != null) {
      children.push(el('div', { className: 'action-value', textContent: String(opts.value) }));
    }

    // Sub text
    if (opts.sub) {
      children.push(el('div', { className: 'action-sub', textContent: opts.sub }));
    }

    var acAttrs = {
      className: cls,
      onClick: opts.onClick || null,
      role: 'button',
      tabIndex: '0',
      'aria-label': (opts.label || '') + (opts.value != null ? ' ' + String(opts.value) : '')
    };
    return el('div', acAttrs, children);
  }

  /* ──────────────────────────────────────────────────────────────
     Export
     ────────────────────────────────────────────────────────────── */
  window.UI = {
    el: el,
    card: card,
    statCard: statCard,
    listCard: listCard,
    detailRow: detailRow,
    detailCard: detailCard,
    pill: pill,
    avatar: avatar,
    amount: amount,
    btn: btn,
    actionBar: actionBar,
    field: field,
    textInput: textInput,
    dateInput: dateInput,
    textarea: textarea,
    select: select,
    searchInput: searchInput,
    toggle: toggle,
    grid: grid,
    divider: divider,
    sectionHeading: sectionHeading,
    tabs: tabs,
    skeleton: skeleton,
    empty: empty,
    error: error,
    toast: toast,
    nav: nav,
    updateNavActive: updateNavActive,
    fab: fab,
    bottomSheet: bottomSheet,
    actionCard: actionCard
  };

})();
