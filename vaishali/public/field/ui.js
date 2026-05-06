/* ui.js — DOM-builder component library for Field App */
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

    // Chevron — universal "tap to open" affordance. Suppressed by opts.noChevron
    // for cases where the row already has a clear right-side action (e.g. swipe
    // rows that show their own buttons).
    if (opts.onClick && opts.noChevron !== true) {
      var chev = el('div', { className: 'list-chevron', 'aria-hidden': 'true' });
      setIconHTML(chev, 'chevronRight');
      parts.push(chev);
    }

    var cls = 'list-card';
    if (opts.onClick) cls += ' tappable';
    var attrs = { className: cls };
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
  // Notion-style avatar palette — soft tinted backgrounds with matching text
  var _avatarPalette = [
    { bg: '#F3E8FF', fg: '#7C3AED' }, // purple
    { bg: '#DBEAFE', fg: '#2563EB' }, // blue
    { bg: '#D1FAE5', fg: '#059669' }, // green
    { bg: '#FEF3C7', fg: '#D97706' }, // amber
    { bg: '#FFE4E6', fg: '#E11D48' }, // rose
    { bg: '#E0E7FF', fg: '#4F46E5' }, // indigo
    { bg: '#CCFBF1', fg: '#0D9488' }, // teal
    { bg: '#FDE68A', fg: '#92400E' }, // yellow
  ];

  function avatar(name, size) {
    size = size || 36;
    var words = (name || '').trim().split(/\s+/);
    var initials = '';
    for (var i = 0; i < Math.min(words.length, 2); i++) {
      if (words[i]) initials += words[i][0].toUpperCase();
    }
    // Deterministic color from name hash
    var hash = 0;
    var str = name || '';
    for (var j = 0; j < str.length; j++) hash = ((hash << 5) - hash) + str.charCodeAt(j);
    var palette = _avatarPalette[Math.abs(hash) % _avatarPalette.length];

    return el('div', {
      className: 'list-avatar',
      textContent: initials,
      style: {
        width: size + 'px',
        height: size + 'px',
        fontSize: Math.round(size * 0.36) + 'px',
        background: palette.bg,
        color: palette.fg
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
      'outline-danger': 'btn-outline-danger',
      tonal: 'm3-btn-tonal',
      text: 'm3-btn-text'
    };
    // Backward-compat: emailComposer used opts.variant; treat as alias for opts.type.
    var typeKey = opts.type || opts.variant;
    var cls = 'btn';
    if (typeKey && typeMap[typeKey]) cls += ' ' + typeMap[typeKey];
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
    // Pass-through; callers debounce with their own UI.debounce / utils.debounce
    // wrapper. Internal debouncing here used to compound with caller debounces
    // and added 300-600 ms of perceived latency.
    var ic = el('span', { className: 'search-icon' });
    setIconHTML(ic, 'search');
    var inp = el('input', {
      className: 'form-control search-input',
      type: 'text',
      placeholder: placeholder || 'Search\u2026',
      onInput: function (e) {
        if (onInput) onInput(e.target.value);
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
    function doToggle() {
      var isActive = track.classList.toggle('active');
      wrapper.setAttribute('aria-checked', String(isActive));
      if (onChange) onChange(isActive);
    }
    var wrapper = el('div', {
      className: 'toggle-wrapper',
      role: 'switch',
      tabIndex: '0',
      'aria-checked': String(!!checked),
      onClick: doToggle,
      onKeydown: function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          doToggle();
        }
      }
    }, [
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
      style: { display: 'grid', gridTemplateColumns: 'repeat(' + (cols || 2) + ', 1fr)', gap: '10px' }
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
    count = count || 3;
    var widths = ['80%', '60%', '40%', '70%', '50%', '65%', '45%', '55%'];
    var items = [];
    for (var i = 0; i < count; i++) {
      var w = widths[i % widths.length];
      items.push(el('div', {
        className: 'skeleton skeleton-card',
        style: { width: w }
      }));
    }
    return el('div', { 'aria-busy': 'true', 'aria-label': 'Loading', style: { padding: '8px 0' } }, items);
  }

  /* ──────────────────────────────────────────────────────────────
     25. empty(iconName, text)
     ────────────────────────────────────────────────────────────── */
  function empty(iconName, text, ctaOpts) {
    var ic = el('span', { className: 'empty-icon' });
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
    var t = el('div', { className: cls, textContent: text, role: 'alert' });
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
  function fab(onClickOrOpts) {
    // Back-compat: passing a function falls back to AI-chat default.
    var opts;
    if (typeof onClickOrOpts === 'function') {
      opts = { onClick: onClickOrOpts, icon: 'bot', ariaLabel: 'Open AI chat' };
    } else {
      opts = onClickOrOpts || {};
    }
    var cls = 'fab';
    if (opts.label) cls += ' m3-fab-extended';
    if (opts.className) cls += ' ' + opts.className;
    var button = el('button', {
      className: cls,
      onClick: opts.onClick || null,
      'aria-label': opts.ariaLabel || opts.label || 'Action'
    });
    setIconHTML(button, opts.icon || 'plus');
    if (opts.label) {
      button.appendChild(el('span', { textContent: opts.label }));
    }
    return button;
  }

  /* ──────────────────────────────────────────────────────────────
     31. bottomSheet(title, contentEl)
     ────────────────────────────────────────────────────────────── */
  function bottomSheet(title, contentEl) {
    var closeBtn = el('button', { className: 'bottom-sheet-close', 'aria-label': 'Close' });
    setIconHTML(closeBtn, 'x');

    var header = el('div', { className: 'bottom-sheet-header' }, [
      el('div', { className: 'bottom-sheet-title', textContent: title }),
      closeBtn
    ]);

    var sheet = el('div', {
      className: 'bottom-sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title
    }, [
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
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    closeBtn.addEventListener('click', close);

    overlay._close = close;
    /* Auto-focus close button after caller appends to DOM */
    setTimeout(function () { closeBtn.focus(); }, 100);
    return overlay;
  }

  /* ──────────────────────────────────────────────────────────────
     32. actionCard(opts)
     ────────────────────────────────────────────────────────────── */
  function actionCard(opts) {
    // opts: { icon, label, value, sub, onClick, accent }
    // accent: 'green', 'red', or null
    var cls = 'action-card';
    if (opts.onClick) cls += ' tappable';
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
     KPI Row — single card with horizontal stats separated by dividers
     ────────────────────────────────────────────────────────────── */
  function kpiRow(items) {
    // items: [{value: '3/5', label: 'Team Present'}, ...]
    var children = [];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) {
        children.push(el('div', { className: 'kpi-divider' }));
      }
      children.push(el('div', { className: 'kpi-item' }, [
        el('div', { className: 'kpi-value', textContent: String(items[i].value) }),
        el('div', { className: 'kpi-label', textContent: items[i].label })
      ]));
    }
    return el('div', { className: 'kpi-row' }, children);
  }

  /* ──────────────────────────────────────────────────────────────
     fieldError — inline validation feedback
     ────────────────────────────────────────────────────────────── */
  function fieldError(inputEl, message) {
    // Remove existing error
    var parent = inputEl.parentNode;
    var existing = parent.querySelector('.field-error-text');
    if (existing) parent.removeChild(existing);

    if (message) {
      inputEl.classList.add('field-error');
      var errEl = el('div', { className: 'field-error-text', textContent: message });
      parent.appendChild(errEl);
    } else {
      inputEl.classList.remove('field-error');
    }
  }

  /* ══════════════════════════════════════════════════════════════
     MATERIAL 3 COMPONENTS
     ══════════════════════════════════════════════════════════════ */

  /* ── pageHeader(title, support, opts) ─────────────────────────
     Heuristic 1 (visibility of system status): every screen begins with
     a clear title and supporting text so the user always knows where
     they are and what this page does.
     ────────────────────────────────────────────────────────────── */
  function pageHeader(title, support, opts) {
    opts = opts || {};
    var children = [];
    children.push(el('h1', {
      className: 'm3-page-title',
      textContent: title || '',
      role: 'heading',
      'aria-level': '1'
    }));
    if (support) {
      children.push(el('p', { className: 'm3-page-support', textContent: support }));
    }
    if (opts.action) {
      var actBtn = btn(opts.action.text, {
        type: opts.action.type || 'tonal',
        icon: opts.action.icon,
        onClick: opts.action.onClick
      });
      children.push(el('div', { style: { marginTop: '12px' } }, [actBtn]));
    }
    return el('section', { className: 'm3-page-header' }, children);
  }

  /* ── sectionHeader(title, opts) ───────────────────────────────
     M3 section header — title + optional supporting text + optional action.
     Replaces the older sectionHeading for grouped content.
     ────────────────────────────────────────────────────────────── */
  function sectionHeader(title, opts) {
    opts = opts || {};
    var titleBlock = [el('h2', { className: 'm3-section-title', textContent: title })];
    if (opts.support) {
      titleBlock.push(el('p', { className: 'm3-section-support', textContent: opts.support }));
    }
    var children = [el('div', { className: 'm3-section-titles' }, titleBlock)];
    if (opts.action) {
      children.push(el('button', {
        className: 'm3-section-action',
        textContent: opts.action.text,
        onClick: opts.action.onClick
      }));
    }
    return el('header', { className: 'm3-section-header' }, children);
  }

  /* ── stat(value, label, opts) ─────────────────────────────────
     Single source of truth for stats across the app. Same shape for
     leave balance, casual leaves, team present, approvals, etc.
     opts: { support, trend: { dir: 'up'|'down', text }, onClick }
     ────────────────────────────────────────────────────────────── */
  function stat(value, label, opts) {
    opts = opts || {};
    var children = [
      el('div', { className: 'm3-stat-label', textContent: label || '' }),
      el('div', { className: 'm3-stat-value', textContent: String(value) })
    ];
    if (opts.support) {
      children.push(el('div', { className: 'm3-stat-support', textContent: opts.support }));
    }
    if (opts.trend) {
      var dir = opts.trend.dir === 'down' ? 'down' : 'up';
      children.push(el('div', { className: 'm3-stat-trend ' + dir, textContent: opts.trend.text }));
    }
    var attrs = {
      className: 'm3-stat',
      'aria-label': label + ': ' + value
    };
    if (opts.onClick) {
      attrs.onClick = opts.onClick;
      attrs.role = 'button';
      attrs.tabIndex = '0';
    }
    return el('div', attrs, children);
  }

  /* ── statGrid(items, cols) ────────────────────────────────────
     Uniform grid of stats. Each item: { value, label, support?, trend? }
     ────────────────────────────────────────────────────────────── */
  function statGrid(items, cols) {
    cols = cols || 2;
    var children = [];
    for (var i = 0; i < items.length; i++) {
      children.push(stat(items[i].value, items[i].label, {
        support: items[i].support,
        trend: items[i].trend,
        onClick: items[i].onClick
      }));
    }
    var cls = 'm3-stat-grid';
    if (cols === 3) cls += ' cols-3';
    if (cols === 4) cls += ' cols-4';
    return el('div', { className: cls }, children);
  }

  /* ── chip(text, opts) ─────────────────────────────────────────
     M3 filter / suggestion chip. opts: { selected, onClick, icon, leading }
     ────────────────────────────────────────────────────────────── */
  function chip(text, opts) {
    opts = opts || {};
    var cls = 'm3-chip';
    if (opts.selected) cls += ' selected';
    var children = [];
    if (opts.selected) {
      var checkLeading = el('span', { className: 'm3-chip-leading' });
      setIconHTML(checkLeading, 'check');
      children.push(checkLeading);
    } else if (opts.icon) {
      var leading = el('span', { className: 'm3-chip-leading' });
      setIconHTML(leading, opts.icon);
      children.push(leading);
    }
    children.push(el('span', { className: 'm3-chip-text', textContent: text }));
    var attrs = {
      className: cls,
      onClick: opts.onClick || null,
      role: 'button',
      tabIndex: '0',
      'aria-pressed': opts.selected ? 'true' : 'false'
    };
    return el('button', attrs, children);
  }

  /* ── chipSet(options, opts) ───────────────────────────────────
     Selector pills. options: [{value, label, icon?}, ...]
     opts: { value, onChange, multi }
     If options.length > 7, this is the recommended replacement for
     a dropdown. For 1-7 single-select, a dropdown is still fine.
     ────────────────────────────────────────────────────────────── */
  function chipSet(options, opts) {
    opts = opts || {};
    var multi = !!opts.multi;
    var current = multi ? (opts.value || []).slice() : (opts.value || null);
    var wrapper = el('div', { className: 'm3-chip-set', role: 'group' });

    function isSelected(v) {
      if (multi) {
        for (var i = 0; i < current.length; i++) {
          if (current[i] === v) return true;
        }
        return false;
      }
      return current === v;
    }

    function render() {
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      for (var i = 0; i < options.length; i++) {
        (function (op) {
          var c = chip(op.label, {
            selected: isSelected(op.value),
            icon: op.icon,
            onClick: function () {
              if (multi) {
                var idx = current.indexOf(op.value);
                if (idx >= 0) current.splice(idx, 1);
                else current.push(op.value);
              } else {
                current = op.value;
              }
              render();
              if (opts.onChange) opts.onChange(current);
            }
          });
          wrapper.appendChild(c);
        })(options[i]);
      }
    }
    render();
    wrapper._getValue = function () { return current; };
    return wrapper;
  }

  /* ── segmented(options, opts) ─────────────────────────────────
     M3 segmented button. options: [{value, label, icon?}, ...]
     opts: { value, onChange, multi }
     Best for 2-5 mutually-exclusive related options.
     ────────────────────────────────────────────────────────────── */
  function segmented(options, opts) {
    opts = opts || {};
    var multi = !!opts.multi;
    var current = multi ? (opts.value || []).slice() : (opts.value || (options[0] && options[0].value));
    var wrapper = el('div', { className: 'm3-segmented', role: multi ? 'group' : 'radiogroup' });

    function isSelected(v) {
      if (multi) return current.indexOf(v) >= 0;
      return current === v;
    }

    function render() {
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      for (var i = 0; i < options.length; i++) {
        (function (op) {
          var cls = 'm3-segment';
          if (isSelected(op.value)) cls += ' selected';
          var children = [];
          if (isSelected(op.value)) {
            var ic = el('span', {});
            setIconHTML(ic, 'check');
            children.push(ic);
          } else if (op.icon) {
            var ic2 = el('span', {});
            setIconHTML(ic2, op.icon);
            children.push(ic2);
          }
          children.push(el('span', { textContent: op.label }));
          var seg = el('button', {
            className: cls,
            role: multi ? 'button' : 'radio',
            'aria-pressed': isSelected(op.value) ? 'true' : 'false',
            'aria-checked': isSelected(op.value) ? 'true' : 'false',
            onClick: function () {
              if (multi) {
                var idx = current.indexOf(op.value);
                if (idx >= 0) current.splice(idx, 1);
                else current.push(op.value);
              } else {
                current = op.value;
              }
              render();
              if (opts.onChange) opts.onChange(current);
            }
          }, children);
          wrapper.appendChild(seg);
        })(options[i]);
      }
    }
    render();
    wrapper._getValue = function () { return current; };
    return wrapper;
  }

  /* ── checkbox(label, opts) ────────────────────────────────────
     M3 checkbox. opts: { checked, onChange, name, value }
     ────────────────────────────────────────────────────────────── */
  function checkbox(label, opts) {
    opts = opts || {};
    var input = el('input', {
      type: 'checkbox',
      checked: !!opts.checked,
      name: opts.name || null,
      value: opts.value != null ? opts.value : ''
    });
    if (opts.onChange) {
      input.addEventListener('change', function () { opts.onChange(input.checked, input); });
    }
    var box = el('span', { className: 'm3-checkbox-box', 'aria-hidden': 'true' });
    var labelEl = el('span', { className: 'm3-checkbox-label', textContent: label });
    return el('label', { className: 'm3-checkbox' }, [input, box, labelEl]);
  }

  /* ── radio(label, opts) ───────────────────────────────────────
     M3 radio. opts: { checked, onChange, name, value }
     Use radioGroup for a grouped set.
     ────────────────────────────────────────────────────────────── */
  function radio(label, opts) {
    opts = opts || {};
    var input = el('input', {
      type: 'radio',
      checked: !!opts.checked,
      name: opts.name || null,
      value: opts.value != null ? opts.value : ''
    });
    if (opts.onChange) {
      input.addEventListener('change', function () { if (input.checked) opts.onChange(input.value, input); });
    }
    var circle = el('span', { className: 'm3-radio-circle', 'aria-hidden': 'true' });
    var labelEl = el('span', { className: 'm3-radio-label', textContent: label });
    return el('label', { className: 'm3-radio' }, [input, circle, labelEl]);
  }

  /* ── radioGroup(name, options, opts) ──────────────────────────
     options: [{value, label, support?}, ...]
     opts: { value, onChange }
     ────────────────────────────────────────────────────────────── */
  function radioGroup(name, options, opts) {
    opts = opts || {};
    var current = opts.value;
    var wrapper = el('div', { role: 'radiogroup', className: 'm3-radio-group' });
    for (var i = 0; i < options.length; i++) {
      (function (op) {
        var r = radio(op.label, {
          name: name,
          value: op.value,
          checked: current === op.value,
          onChange: function (v) {
            current = v;
            if (opts.onChange) opts.onChange(v);
          }
        });
        wrapper.appendChild(r);
      })(options[i]);
    }
    wrapper._getValue = function () { return current; };
    return wrapper;
  }

  /* ── selectableList(options, opts) ────────────────────────────
     A list where each row is selectable via a checkbox (multi) or
     radio (single). Best for in-list selection (vs. dropdown).
     opts: { value, multi, onChange }
     options: [{value, title, support?}, ...]
     ────────────────────────────────────────────────────────────── */
  function selectableList(options, opts) {
    opts = opts || {};
    var multi = !!opts.multi;
    var current = multi ? (opts.value || []).slice() : (opts.value || null);
    var wrapper = el('div', { className: 'm3-selectable-list', role: multi ? 'group' : 'radiogroup' });

    function isSelected(v) {
      if (multi) return current.indexOf(v) >= 0;
      return current === v;
    }

    function render() {
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      for (var i = 0; i < options.length; i++) {
        (function (op) {
          var contentChildren = [
            el('div', { className: 'm3-selectable-title', textContent: op.title })
          ];
          if (op.support) {
            contentChildren.push(el('div', { className: 'm3-selectable-support', textContent: op.support }));
          }
          var leading;
          if (multi) {
            leading = el('input', { type: 'checkbox', checked: isSelected(op.value), 'aria-hidden': 'true', tabIndex: '-1' });
            var cbBox = el('span', { className: 'm3-checkbox-box' });
            leading = el('span', { className: 'm3-checkbox', style: { padding: '0' } }, [leading, cbBox]);
          } else {
            leading = el('input', { type: 'radio', checked: isSelected(op.value), name: opts.name || 'sel', 'aria-hidden': 'true', tabIndex: '-1' });
            var rcCircle = el('span', { className: 'm3-radio-circle' });
            leading = el('span', { className: 'm3-radio', style: { padding: '0' } }, [leading, rcCircle]);
          }
          var row = el('button', {
            className: 'm3-selectable-row' + (isSelected(op.value) ? ' selected' : ''),
            role: multi ? 'checkbox' : 'radio',
            'aria-checked': isSelected(op.value) ? 'true' : 'false',
            onClick: function () {
              if (multi) {
                var idx = current.indexOf(op.value);
                if (idx >= 0) current.splice(idx, 1);
                else current.push(op.value);
              } else {
                current = op.value;
              }
              render();
              if (opts.onChange) opts.onChange(current);
            }
          }, [leading, el('div', { className: 'm3-selectable-content' }, contentChildren)]);
          wrapper.appendChild(row);
        })(options[i]);
      }
    }
    render();
    wrapper._getValue = function () { return current; };
    return wrapper;
  }

  /* ── selectOrChips(label, options, opts) ──────────────────────
     Smart wrapper: picks the right pattern based on count.
     - <= 7 options → dropdown (UI.select)
     - > 7 options  → chip set (single-select)
     opts: { value, onChange, multi }
     If multi:true, always returns selectableList regardless of count.
     ────────────────────────────────────────────────────────────── */
  function selectOrChips(label, options, opts) {
    opts = opts || {};
    var labelEl = el('label', {
      textContent: label,
      style: {
        display: 'block',
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        marginBottom: '8px',
        letterSpacing: '0.5px'
      }
    });
    var control;
    if (opts.multi) {
      control = selectableList(options.map(function (o) {
        return typeof o === 'string' ? { value: o, title: o } : { value: o.value, title: o.label || o.text, support: o.support };
      }), { value: opts.value, multi: true, onChange: opts.onChange });
    } else if (options.length > 7) {
      control = chipSet(options.map(function (o) {
        return typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label || o.text };
      }), { value: opts.value, onChange: opts.onChange });
    } else {
      var sel = select(label, options, opts.value);
      // Re-wire onChange
      var selectEl = sel.querySelector('select');
      if (selectEl && opts.onChange) {
        selectEl.addEventListener('change', function () { opts.onChange(selectEl.value); });
      }
      return sel; // already includes label
    }
    return el('div', { className: 'field-group' }, [labelEl, control]);
  }

  /* ── snackbar(text, opts) ─────────────────────────────────────
     M3 snackbar with optional action. opts: { type, action: { text, onClick }, duration }
     ────────────────────────────────────────────────────────────── */
  function snackbar(text, opts) {
    opts = opts || {};
    var type = opts.type || '';
    var duration = opts.duration || (opts.action ? 6000 : 3000);

    if (!opts.action) {
      // Simple snackbar — reuse legacy toast
      return toast(text, type);
    }

    // Snackbar with action button
    var cls = 'toast-fallback';
    if (type) cls += ' ' + type;
    cls += ' m3-snackbar-with-action';

    var actionBtn = el('button', {
      className: 'm3-snackbar-action',
      textContent: opts.action.text,
      onClick: function () {
        if (opts.action.onClick) opts.action.onClick();
        if (sb.parentNode) sb.parentNode.removeChild(sb);
      }
    });

    var sb = el('div', { className: cls, role: 'alert' }, [
      el('span', { className: 'm3-snackbar-text', textContent: text }),
      actionBtn
    ]);
    document.body.appendChild(sb);
    setTimeout(function () {
      if (sb.parentNode) sb.parentNode.removeChild(sb);
    }, duration);
    return sb;
  }

  /* ── dialog(opts) ─────────────────────────────────────────────
     M3 modal dialog — replaces native confirm()/alert().
     opts: { title, body, icon, actions: [{ text, type, onClick }], dismissOnScrim }
     Returns the overlay element. Caller must append to document.body.
     Each action's onClick may return false to keep the dialog open.
     ────────────────────────────────────────────────────────────── */
  function dialog(opts) {
    opts = opts || {};
    var children = [];

    if (opts.icon) {
      var ic = el('div', { className: 'm3-dialog-icon' });
      setIconHTML(ic, opts.icon);
      children.push(ic);
    }
    if (opts.title) {
      children.push(el('h2', { className: 'm3-dialog-title', textContent: opts.title }));
    }
    if (opts.body) {
      children.push(el('p', { className: 'm3-dialog-body', textContent: opts.body }));
    }

    var actions = opts.actions || [{ text: 'OK', type: 'text' }];
    var actionEls = [];
    for (var i = 0; i < actions.length; i++) {
      (function (a) {
        var b = btn(a.text, {
          type: a.type || 'text',
          onClick: function () {
            var keep = false;
            if (a.onClick) keep = a.onClick() === false;
            if (!keep) close();
          }
        });
        actionEls.push(b);
      })(actions[i]);
    }
    children.push(el('div', { className: 'm3-dialog-actions' }, actionEls));

    var dialogEl = el('div', {
      className: 'm3-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title || 'Dialog'
    }, children);

    var overlay = el('div', { className: 'm3-dialog-scrim' }, [dialogEl]);

    function close() {
      overlay.classList.add('closing');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 200);
    }

    if (opts.dismissOnScrim !== false) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
      });
    }
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    overlay._close = close;

    // Auto-focus first non-cancel action
    setTimeout(function () {
      if (actionEls.length > 0) {
        actionEls[actionEls.length - 1].focus();
      }
    }, 100);

    return overlay;
  }

  /* ── confirmDialog(title, body, opts) ─────────────────────────
     Convenience wrapper for the most common case: confirm/cancel.
     Returns a Promise that resolves true (confirm) or false (cancel).
     opts: { confirmText, cancelText, danger, icon }
     ────────────────────────────────────────────────────────────── */
  function confirmDialog(title, body, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var d = dialog({
        title: title,
        body: body,
        icon: opts.icon,
        actions: [
          { text: opts.cancelText || 'Cancel', type: 'text', onClick: function () { resolve(false); } },
          { text: opts.confirmText || 'Confirm', type: opts.danger ? 'danger' : 'primary', onClick: function () { resolve(true); } }
        ]
      });
      document.body.appendChild(d);
    });
  }

  /* ── m3TextField(label, opts) ────────────────────────────────
     M3 filled text field with floating label.
     opts: { value, type, name, required, placeholder, support, multiline, rows,
             onChange, onInput }
     Returns a wrapper div; access the input via wrapper.querySelector('input,textarea').
     ────────────────────────────────────────────────────────────── */
  var _m3FieldId = 0;
  function m3TextField(label, opts) {
    opts = opts || {};
    _m3FieldId++;
    var id = 'm3f-' + _m3FieldId;
    var multi = !!opts.multiline;
    var inputAttrs = {
      id: id,
      className: 'm3-textfield-input',
      // A non-empty placeholder is required so :placeholder-shown
      // pseudo-class flips the label correctly. We use a single space.
      placeholder: opts.placeholder || ' ',
      value: opts.value != null ? String(opts.value) : '',
      name: opts.name || null,
      required: !!opts.required,
      readOnly: !!opts.readOnly
    };
    if (!multi) inputAttrs.type = opts.type || 'text';
    if (opts.min != null) inputAttrs.min = opts.min;
    if (opts.max != null) inputAttrs.max = opts.max;
    if (opts.step != null) inputAttrs.step = opts.step;
    if (multi) inputAttrs.rows = opts.rows || 3;

    var input = el(multi ? 'textarea' : 'input', inputAttrs);

    if (opts.onChange) {
      input.addEventListener('change', function () { opts.onChange(input.value, input); });
    }
    if (opts.onInput) {
      input.addEventListener('input', function () { opts.onInput(input.value, input); });
    }

    var labelEl = el('label', {
      className: 'm3-textfield-label',
      htmlFor: id,
      textContent: label || ''
    });

    var children = [input, labelEl];
    if (opts.support) {
      children.push(el('p', { className: 'm3-textfield-support', textContent: opts.support }));
    }

    var wrapper = el('div', { className: 'm3-textfield' + (multi ? ' multiline' : '') }, children);

    // Helpers exposed on the wrapper
    wrapper._getValue = function () { return input.value; };
    wrapper._setValue = function (v) { input.value = v != null ? String(v) : ''; };
    wrapper._getInput = function () { return input; };
    wrapper._setError = function (msg) {
      var supEl = wrapper.querySelector('.m3-textfield-support');
      if (msg) {
        input.classList.add('field-error');
        if (!supEl) {
          supEl = el('p', { className: 'm3-textfield-support error', textContent: msg });
          wrapper.appendChild(supEl);
        } else {
          supEl.classList.add('error');
          supEl.textContent = msg;
        }
      } else {
        input.classList.remove('field-error');
        if (supEl) supEl.classList.remove('error');
      }
    };
    return wrapper;
  }

  /* ── m3SelectField(label, options, opts) ──────────────────────
     M3 filled select with floating label. options: [{value,text}|string].
     opts: { value, name, onChange, support }
     ────────────────────────────────────────────────────────────── */
  function m3SelectField(label, options, opts) {
    opts = opts || {};
    _m3FieldId++;
    var id = 'm3s-' + _m3FieldId;

    var optEls = [];
    // Empty placeholder option lets the label float properly when nothing's selected
    if (opts.value == null || opts.value === '') {
      optEls.push(el('option', { value: '', textContent: '', selected: true, disabled: !!opts.required }));
    }
    for (var i = 0; i < options.length; i++) {
      var op = options[i];
      var v = typeof op === 'string' ? op : op.value;
      var t = typeof op === 'string' ? op : (op.text || op.label);
      optEls.push(el('option', {
        value: v,
        textContent: t,
        selected: opts.value === v
      }));
    }

    var sel = el('select', {
      id: id,
      className: 'm3-textfield-input',
      name: opts.name || null,
      required: !!opts.required
    }, optEls);

    if (opts.onChange) {
      sel.addEventListener('change', function () { opts.onChange(sel.value, sel); });
    }

    var labelEl = el('label', {
      className: 'm3-textfield-label',
      htmlFor: id,
      textContent: label || ''
    });

    var children = [sel, labelEl];
    if (opts.support) {
      children.push(el('p', { className: 'm3-textfield-support', textContent: opts.support }));
    }

    var wrapper = el('div', { className: 'm3-textfield m3-select' + (opts.value ? ' has-value' : '') }, children);

    // Keep has-value class in sync so floating label works on select
    sel.addEventListener('change', function () {
      if (sel.value) wrapper.classList.add('has-value');
      else wrapper.classList.remove('has-value');
    });

    wrapper._getValue = function () { return sel.value; };
    wrapper._setValue = function (v) { sel.value = v != null ? String(v) : ''; if (sel.value) wrapper.classList.add('has-value'); };
    wrapper._getSelect = function () { return sel; };
    return wrapper;
  }

  /* ── m3PageWrap(content) ─────────────────────────────────────
     Standard padding wrapper used by screens. Expose for consistency.
     ────────────────────────────────────────────────────────────── */
  function pageWrap(children) {
    if (!Array.isArray(children)) children = [children];
    return el('div', { className: 'm3-page-wrap' }, children);
  }

  /* ── _formatTimelineDate(date) ─────────────────────────────────
     Accepts: Date | ISO string | "YYYY-MM-DD HH:MM:SS" (server UTC).
     Server is UTC, so naïve datetimes get a 'Z' suffix so the
     browser converts to user's local TZ (IST in our case).
     Returns "27 Apr 2026, 09:15" or "" if unparseable.
     ────────────────────────────────────────────────────────────── */
  function _formatTimelineDate(d) {
    if (!d) return '';
    var dt;
    if (d instanceof Date) {
      dt = d;
    } else if (typeof d === 'string') {
      var s = d;
      // "YYYY-MM-DD HH:MM:SS" — treat as UTC (server is UTC, site is IST)
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
        s = s.replace(' ', 'T') + 'Z';
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && s.indexOf('Z') < 0 && s.indexOf('+') < 0) {
        s = s + 'Z';
      }
      dt = new Date(s);
    } else {
      return '';
    }
    if (isNaN(dt.getTime())) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var hh = dt.getHours();
    var mm = dt.getMinutes();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear() +
           ', ' + pad(hh) + ':' + pad(mm);
  }

  /* ── commentBox(opts) ─────────────────────────────────────────
     M3 inline comment composer: textarea + circular send button.
     opts: {
       placeholder: string ('Add a comment…'),
       onSubmit: function(text) — called on Send click or Cmd/Ctrl+Enter,
       initialValue: string,
       sendLabel: string (a11y label for send button)
     }
     Returns div. Cleared after onSubmit unless onSubmit returns false.
     ────────────────────────────────────────────────────────────── */
  function commentBox(opts) {
    opts = opts || {};
    var ta = el('textarea', {
      className: 'm3-comment-input',
      placeholder: opts.placeholder || 'Add a comment…',
      rows: 1,
      value: opts.initialValue || '',
      'aria-label': opts.placeholder || 'Add a comment'
    });

    var sendBtn = el('button', {
      type: 'button',
      className: 'm3-comment-send',
      disabled: !(opts.initialValue && opts.initialValue.trim()),
      'aria-label': opts.sendLabel || 'Send'
    });
    setIconHTML(sendBtn, 'send');

    function refreshDisabled() {
      sendBtn.disabled = !ta.value.trim();
    }

    function submit() {
      var text = ta.value.trim();
      if (!text) return;
      var result = opts.onSubmit ? opts.onSubmit(text) : undefined;
      // If handler explicitly returns false, keep the value (caller will clear).
      if (result !== false) {
        ta.value = '';
        refreshDisabled();
        // Reset auto-grow height
        ta.style.height = '';
      }
    }

    ta.addEventListener('input', function () {
      refreshDisabled();
      // Auto-grow textarea up to ~120px
      ta.style.height = 'auto';
      var newH = Math.min(ta.scrollHeight, 120);
      ta.style.height = newH + 'px';
    });

    ta.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    sendBtn.addEventListener('click', submit);

    var wrapper = el('div', { className: 'm3-comment-box' }, [ta, sendBtn]);
    wrapper._getValue = function () { return ta.value; };
    wrapper._clear = function () { ta.value = ''; refreshDisabled(); ta.style.height = ''; };
    wrapper._focus = function () { ta.focus(); };
    return wrapper;
  }

  /* ── activityTimeline(items, opts) ────────────────────────────
     M3 activity timeline. items: array of {
       type: 'status' | 'comment' | 'doc' (default 'status'),
       title: string,
       body: string (optional, mainly for comments),
       user: string (optional),
       date: Date | string,
       icon: string (optional — defaults from type)
     }
     opts: {
       onAddComment: function(text) — when set, renders inline composer below,
       emptyText: string ('No activity yet'),
       commentPlaceholder: string
     }
     Returns div.m3-timeline.
     ────────────────────────────────────────────────────────────── */
  function activityTimeline(items, opts) {
    opts = opts || {};
    items = items || [];

    var typeIconDefault = { status: 'check', comment: 'edit', doc: 'file' };
    var children = [];

    if (!items.length) {
      children.push(el('div', {
        className: 'm3-timeline-empty',
        textContent: opts.emptyText || 'No activity yet'
      }));
    } else {
      var rail = el('ol', { className: 'm3-timeline-rail', role: 'list' });
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var type = it.type || 'status';
        var iconName = it.icon || typeIconDefault[type] || 'check';

        var iconCircle = el('div', {
          className: 'm3-timeline-icon m3-timeline-icon-' + type,
          'aria-hidden': 'true'
        });
        setIconHTML(iconCircle, iconName);

        var contentChildren = [];
        if (it.title) {
          contentChildren.push(el('p', {
            className: 'm3-timeline-title',
            textContent: it.title
          }));
        }
        if (it.body) {
          contentChildren.push(el('p', {
            className: 'm3-timeline-body',
            textContent: it.body
          }));
        }

        var metaParts = [];
        if (it.user) metaParts.push(it.user);
        var dateStr = _formatTimelineDate(it.date);
        if (dateStr) metaParts.push(dateStr);
        if (metaParts.length) {
          contentChildren.push(el('p', {
            className: 'm3-timeline-meta',
            textContent: metaParts.join(' · ')
          }));
        }

        var content = el('div', { className: 'm3-timeline-content' }, contentChildren);
        var row = el('li', { className: 'm3-timeline-row m3-timeline-row-' + type }, [
          el('div', { className: 'm3-timeline-rail-col' }, [iconCircle]),
          content
        ]);
        rail.appendChild(row);
      }
      children.push(rail);
    }

    if (typeof opts.onAddComment === 'function') {
      children.push(commentBox({
        placeholder: opts.commentPlaceholder || 'Add a comment…',
        onSubmit: opts.onAddComment
      }));
    }

    return el('div', { className: 'm3-timeline' }, children);
  }

  /* ──────────────────────────────────────────────────────────────
     swipeRow(content, { leadingActions, trailingActions })
     Mobile swipe-to-reveal-actions row (Salesforce/Gmail/iOS pattern).
     - swipe LEFT  → exposes trailing actions (right side)
     - swipe RIGHT → exposes leading actions (left side)
     - threshold 80px to commit; snaps open to expose actions fully
     - tap action → run onClick + collapse
     - vertical scroll detection: if drag is >15deg vertical, abort
     - tap outside / scroll page → snap back
     Each action: { icon, label, color, onClick }
       color ∈ 'primary' | 'success' | 'danger' | 'tonal'
     `content` is a DOM element (typically UI.listCard output).
     Returns the wrapper element.
     ────────────────────────────────────────────────────────────── */
  function swipeRow(content, actions) {
    actions = actions || {};
    var leading = Array.isArray(actions.leadingActions) ? actions.leadingActions : [];
    var trailing = Array.isArray(actions.trailingActions) ? actions.trailingActions : [];

    var ACTION_WIDTH = 80;          // px, matches CSS .m3-swipe-action width
    var THRESHOLD = 80;             // px to commit a swipe
    var VERTICAL_CANCEL_TAN = 0.27; // tan(15deg) ≈ 0.27 — beyond this it's a vertical scroll
    var leadingMax = leading.length * ACTION_WIDTH;
    var trailingMax = trailing.length * ACTION_WIDTH;

    var row = el('div', { className: 'm3-swipe-row' });

    function buildAction(action) {
      var btnEl = el('button', {
        type: 'button',
        className: 'm3-swipe-action color-' + (action.color || 'primary'),
        'aria-label': action.label || ''
      });
      if (action.icon) setIconHTML(btnEl, action.icon);
      if (action.label) {
        btnEl.appendChild(el('span', { className: 'm3-swipe-action-label', textContent: action.label }));
      }
      btnEl.addEventListener('click', function (e) {
        e.stopPropagation();
        collapse();
        if (typeof action.onClick === 'function') {
          /* defer slightly so snap-back animation begins before screen swap */
          setTimeout(function () { action.onClick(e); }, 0);
        }
      });
      return btnEl;
    }

    var leadingEl = null;
    if (leading.length) {
      var leadingChildren = [];
      for (var i = 0; i < leading.length; i++) leadingChildren.push(buildAction(leading[i]));
      leadingEl = el('div', { className: 'm3-swipe-actions leading', 'aria-hidden': 'true' }, leadingChildren);
      row.appendChild(leadingEl);
    }
    var trailingEl = null;
    if (trailing.length) {
      var trailingChildren = [];
      for (var t = 0; t < trailing.length; t++) trailingChildren.push(buildAction(trailing[t]));
      trailingEl = el('div', { className: 'm3-swipe-actions trailing', 'aria-hidden': 'true' }, trailingChildren);
      row.appendChild(trailingEl);
    }

    var contentWrap = el('div', { className: 'm3-swipe-content' });
    contentWrap.appendChild(content);
    row.appendChild(contentWrap);

    /* gesture state */
    var startX = 0;
    var startY = 0;
    var currentX = 0;          /* committed offset (e.g. -150 when trailing exposed) */
    var dragX = 0;             /* live offset during drag */
    var locked = null;         /* 'h' | 'v' | null — gesture axis decision */
    var pointerActive = false;

    function setTransform(px) {
      contentWrap.style.transform = 'translate3d(' + px + 'px, 0, 0)';
    }

    function open(side) {
      if (side === 'leading' && leadingMax) currentX = leadingMax;
      else if (side === 'trailing' && trailingMax) currentX = -trailingMax;
      else currentX = 0;
      row.classList.remove('is-dragging');
      row.classList.toggle('is-open', currentX !== 0);
      setTransform(currentX);
    }

    function collapse() {
      currentX = 0;
      row.classList.remove('is-dragging');
      row.classList.remove('is-open');
      setTransform(0);
    }

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      var touch = e.touches[0];
      startX = touch.pageX;
      startY = touch.pageY;
      dragX = currentX;
      locked = null;
      pointerActive = true;
    }

    function onTouchMove(e) {
      if (!pointerActive) return;
      var touch = e.touches[0];
      var dx = touch.pageX - startX;
      var dy = touch.pageY - startY;
      var adx = Math.abs(dx);
      var ady = Math.abs(dy);

      if (locked == null) {
        /* need a small movement before deciding axis */
        if (adx < 6 && ady < 6) return;
        /* if drag is more than ~15deg from horizontal, treat as vertical scroll */
        if (ady > adx || (adx > 0 && ady / adx > VERTICAL_CANCEL_TAN)) {
          locked = 'v';
          pointerActive = false;
          return;
        }
        locked = 'h';
        row.classList.add('is-dragging');
      }

      if (locked !== 'h') return;

      /* block vertical scroll once we own the horizontal gesture */
      if (e.cancelable) e.preventDefault();

      var next = currentX + dx;
      var minX = -trailingMax;
      var maxX = leadingMax;
      var RUBBER = 24;
      if (next > maxX) next = maxX + Math.min(next - maxX, RUBBER) * 0.4;
      if (next < minX) next = minX + Math.max(next - minX, -RUBBER) * 0.4;
      /* if a side has no actions, prevent swiping that direction at all */
      if (!leadingMax && next > 0) next = 0;
      if (!trailingMax && next < 0) next = 0;

      dragX = next;
      setTransform(next);
    }

    function onTouchEnd() {
      if (!pointerActive && locked !== 'h') {
        if (locked === 'v') locked = null;
        return;
      }
      pointerActive = false;
      if (locked !== 'h') { locked = null; return; }
      locked = null;
      row.classList.remove('is-dragging');

      var delta = dragX - currentX;
      if (currentX === 0) {
        if (delta <= -THRESHOLD && trailingMax) open('trailing');
        else if (delta >= THRESHOLD && leadingMax) open('leading');
        else collapse();
      } else if (currentX < 0) {
        /* trailing exposed — close if user dragged right past threshold */
        if (delta >= THRESHOLD) collapse();
        else open('trailing');
      } else {
        /* leading exposed — close if user dragged left past threshold */
        if (delta <= -THRESHOLD) collapse();
        else open('leading');
      }
    }

    function onTouchCancel() {
      pointerActive = false;
      locked = null;
      row.classList.remove('is-dragging');
      setTransform(currentX);
    }

    contentWrap.addEventListener('touchstart', onTouchStart, { passive: true });
    /* touchmove must be non-passive so we can preventDefault on horizontal drag */
    contentWrap.addEventListener('touchmove', onTouchMove, { passive: false });
    contentWrap.addEventListener('touchend', onTouchEnd, { passive: true });
    contentWrap.addEventListener('touchcancel', onTouchCancel, { passive: true });

    /* tap-outside / scroll-away handled by a single delegated listener
       installed at module init (see _swipeRowDelegated below). Per-row
       listeners used to leak — every swipeRow added 3 document listeners
       that were never removed when the row was unmounted, so navigating
       lists slowly degraded responsiveness. */
    row._collapse = collapse;
    row._openLeading = function () { open('leading'); };
    row._openTrailing = function () { open('trailing'); };

    return row;
  }

  /* Single delegated listener — collapses any open swipeRow when the user
     taps elsewhere or scrolls. Installs once on module init. */
  (function _swipeRowDelegated() {
    function collapseOpenExcept(target) {
      var open = document.querySelector('.m3-swipe-row.is-open');
      if (!open) return;
      if (target && open.contains(target)) return;
      if (typeof open._collapse === 'function') open._collapse();
    }
    document.addEventListener('touchstart', function (e) {
      collapseOpenExcept(e.target);
    }, true);
    document.addEventListener('mousedown', function (e) {
      collapseOpenExcept(e.target);
    }, true);
    window.addEventListener('scroll', function () {
      collapseOpenExcept(null);
    }, true);
  })();

  /* ──────────────────────────────────────────────────────────────
     stagePath(stages, current, opts)
     M3 visual progression strip (Salesforce / Pipedrive style).
       stages: array of { value, label } OR array of strings
       current: stage value of the active stage; null/undefined => all todo
       opts: {
         onClick: function(stageValue, idx),  // when set, stages tappable
         compact: boolean,                    // smaller variant
         completedIcon: 'check' | 'checkSm'   // default 'check'
       }
     Terminal stages (value matches /won|lost|cancel/i) at the last
     position render with success/error/neutral color when current.
     Returns: HTMLElement (div.m3-stage-path)
     ────────────────────────────────────────────────────────────── */
  function stagePath(stages, current, opts) {
    opts = opts || {};
    var completedIcon = opts.completedIcon || 'check';

    /* normalize stages to [{value,label}] */
    var norm = [];
    if (Array.isArray(stages)) {
      for (var n = 0; n < stages.length; n++) {
        var s = stages[n];
        if (s == null) continue;
        if (typeof s === 'string') {
          norm.push({ value: s, label: s });
        } else {
          norm.push({ value: s.value, label: s.label != null ? s.label : String(s.value) });
        }
      }
    }

    /* find current index by value */
    var currentIdx = -1;
    if (current != null) {
      for (var k = 0; k < norm.length; k++) {
        if (norm[k].value === current) { currentIdx = k; break; }
      }
    }

    /* terminal-state detection — only meaningful on the last stage */
    function terminalKind(value) {
      if (value == null) return null;
      var v = String(value).toLowerCase();
      if (v.indexOf('won') >= 0) return 'won';
      if (v.indexOf('lost') >= 0) return 'lost';
      if (v.indexOf('cancel') >= 0) return 'cancelled';
      return null;
    }

    var pathCls = 'm3-stage-path';
    if (opts.compact) pathCls += ' compact';
    var path = el('div', {
      className: pathCls,
      role: 'list',
      'aria-label': 'Stage progression'
    });

    for (var i = 0; i < norm.length; i++) {
      (function (op, idx) {
        var state;        // 'completed' | 'current' | 'todo'
        var terminal = null;
        if (currentIdx < 0) {
          state = 'todo';
        } else if (idx < currentIdx) {
          state = 'completed';
        } else if (idx === currentIdx) {
          state = 'current';
          if (idx === norm.length - 1) terminal = terminalKind(op.value);
        } else {
          state = 'todo';
        }

        var stageCls = 'm3-stage ' + state;
        if (terminal) stageCls += ' terminal-' + terminal;

        var children = [];

        /* leading marker: check icon (completed/terminal) or bullet (current non-terminal) */
        if (state === 'completed' || terminal) {
          var ic = el('span', { className: 'm3-stage-icon', 'aria-hidden': 'true' });
          setIconHTML(ic, completedIcon);
          children.push(ic);
        } else if (state === 'current') {
          children.push(el('span', { className: 'm3-stage-current-dot', 'aria-hidden': 'true' }));
        }

        children.push(el('span', { className: 'm3-stage-label', textContent: op.label }));

        var ariaCurrent = state === 'current' ? 'step' : null;
        var attrs = {
          className: stageCls,
          role: opts.onClick ? 'button' : 'listitem',
          'aria-label': op.label + ', ' + state,
          'aria-current': ariaCurrent
        };
        if (opts.onClick) {
          attrs.tabIndex = '0';
          attrs.onClick = function () { opts.onClick(op.value, idx); };
          attrs.onKeyDown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              opts.onClick(op.value, idx);
            }
          };
        }
        var stageEl = el(opts.onClick ? 'button' : 'div', attrs, children);
        path.appendChild(stageEl);

        /* connector after every stage except the last */
        if (idx < norm.length - 1) {
          var connCls = 'm3-stage-connector';
          /* connector takes "completed" color when the LEFT stage is completed */
          if (state === 'completed') connCls += ' completed';
          path.appendChild(el('span', { className: connCls, 'aria-hidden': 'true' }));
        }
      })(norm[i], i);
    }

    return path;
  }

  /* ──────────────────────────────────────────────────────────────
     statusPicker(opts) — M3 inline status picker bottom sheet
     opts: {
       title: string,
       current: string (value of currently-selected option),
       options: [{ value, label, color, icon, description }],
       onSelect: function(value) -> Promise|undefined
     }
     Returns an overlay element. Caller MUST appendChild to body.
     ────────────────────────────────────────────────────────────── */
  function statusPicker(opts) {
    opts = opts || {};
    var title = opts.title || 'Change status';
    var current = opts.current;
    var options = opts.options || [];
    var onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;

    /* Drag handle (M3 spec) */
    var dragHandle = el('div', { className: 'bottom-sheet-handle', 'aria-hidden': 'true' });

    /* Header — reuses existing bottom-sheet-* classes */
    var closeBtn = el('button', { className: 'bottom-sheet-close', 'aria-label': 'Close' });
    setIconHTML(closeBtn, 'x');
    var header = el('div', { className: 'bottom-sheet-header' }, [
      el('div', { className: 'bottom-sheet-title', textContent: title }),
      closeBtn
    ]);

    /* Options list */
    var listEl = el('div', { className: 'm3-status-option-list', role: 'listbox', 'aria-label': title });

    var rows = [];
    for (var i = 0; i < options.length; i++) {
      (function (opt) {
        var isCurrent = opt.value === current;

        var iconWrap = el('div', {
          className: 'm3-status-option-icon color-' + (opt.color || 'gray')
        });
        if (opt.icon) setIconHTML(iconWrap, opt.icon);

        var labelEl = el('div', { className: 'm3-status-option-label', textContent: opt.label || opt.value });
        var contentChildren = [labelEl];
        if (opt.description) {
          contentChildren.push(el('div', { className: 'm3-status-option-desc', textContent: opt.description }));
        }
        var contentEl = el('div', { className: 'm3-status-option-content' }, contentChildren);

        var rowChildren = [iconWrap, contentEl];
        if (isCurrent) {
          var checkEl = el('span', { className: 'm3-status-option-check', 'aria-hidden': 'true' });
          setIconHTML(checkEl, 'check');
          rowChildren.push(checkEl);
        }

        var rowCls = 'm3-status-option' + (isCurrent ? ' is-current' : '');
        var row = el('div', {
          className: rowCls,
          role: 'option',
          tabIndex: '0',
          'aria-selected': isCurrent ? 'true' : 'false',
          'data-value': opt.value
        }, rowChildren);

        function pick() {
          if (row.classList.contains('is-loading')) return;
          /* Lock all rows while saving */
          for (var j = 0; j < rows.length; j++) {
            rows[j].setAttribute('aria-disabled', 'true');
          }
          row.classList.add('is-loading');

          var result;
          try {
            result = onSelect ? onSelect(opt.value) : undefined;
          } catch (err) {
            row.classList.remove('is-loading');
            for (var k = 0; k < rows.length; k++) rows[k].removeAttribute('aria-disabled');
            toast((err && err.message) || 'Could not update status', 'error');
            return;
          }

          /* If onSelect returned a thenable, wait; otherwise auto-dismiss now */
          if (result && typeof result.then === 'function') {
            result.then(function () {
              close();
            }, function (err) {
              row.classList.remove('is-loading');
              for (var k = 0; k < rows.length; k++) rows[k].removeAttribute('aria-disabled');
              toast((err && err.message) || 'Could not update status', 'error');
            });
          } else {
            close();
          }
        }

        row.addEventListener('click', pick);
        row.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });

        rows.push(row);
        listEl.appendChild(row);
      })(options[i]);
    }

    var sheet = el('div', {
      className: 'bottom-sheet',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title
    }, [
      dragHandle,
      header,
      el('div', { className: 'bottom-sheet-content' }, [listEl])
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
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    closeBtn.addEventListener('click', close);

    overlay._close = close;

    /* Auto-focus the current option (or first) after caller appends */
    setTimeout(function () {
      var focusTarget = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].classList.contains('is-current')) { focusTarget = rows[i]; break; }
      }
      if (!focusTarget && rows.length) focusTarget = rows[0];
      if (focusTarget) focusTarget.focus();
    }, 100);

    return overlay;
  }

  /* ──────────────────────────────────────────────────────────────
     recents — recently viewed records (localStorage-backed)
     ──────────────────────────────────────────────────────────────
     Tracks the last 20 entities the user opened across the app.
     Storage:
       key   = 'vaishali_recents_v1'
       value = JSON array of { doctype, name, title, subtitle, hash, viewedAt }
     All localStorage access is wrapped in try/catch so Safari private mode
     and other restricted contexts degrade gracefully (track is a no-op,
     list returns []).
     ────────────────────────────────────────────────────────────── */
  var RECENTS_KEY = 'vaishali_recents_v1';
  var RECENTS_MAX = 20;

  function _recentsRead() {
    try {
      var raw = window.localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function _recentsWrite(items) {
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items));
    } catch (e) {
      /* storage full / disabled — silently ignore */
    }
  }

  function _recentsTrack(entry) {
    if (!entry || !entry.doctype || !entry.name) return;
    var items = _recentsRead();
    var filtered = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.doctype !== entry.doctype || it.name !== entry.name) {
        filtered.push(it);
      }
    }
    filtered.unshift({
      doctype: entry.doctype,
      name: entry.name,
      title: entry.title || entry.name,
      subtitle: entry.subtitle || '',
      hash: entry.hash || '',
      viewedAt: Date.now()
    });
    if (filtered.length > RECENTS_MAX) filtered.length = RECENTS_MAX;
    _recentsWrite(filtered);
  }

  function _recentsList() {
    var items = _recentsRead();
    /* sort defensively — stored already ordered, but tolerate corruption */
    items.sort(function (a, b) {
      return (b && b.viewedAt || 0) - (a && a.viewedAt || 0);
    });
    return items;
  }

  function _recentsClear() {
    try {
      window.localStorage.removeItem(RECENTS_KEY);
    } catch (e) { /* ignore */ }
  }

  var recents = {
    track: _recentsTrack,
    list: _recentsList,
    clear: _recentsClear
  };

  /* short-form doctype label for the meta line on each chip */
  var _DOCTYPE_LABEL = {
    'Lead': 'Lead',
    'Customer': 'Cust',
    'Opportunity': 'Opp',
    'Quotation': 'Quote',
    'Sales Order': 'SO',
    'Sales Invoice': 'SI',
    'Sales Interaction': 'Interact',
    'Item': 'Item',
    'Employee': 'Employee',
    'DCR': 'DCR',
    'Warranty Claim': 'Warranty',
    'CAPA': 'CAPA',
    'Purchase Order': 'PO',
    'Purchase Invoice': 'PI',
    'BOM': 'BOM',
    'Work Order': 'WO',
    'Issue': 'Issue'
  };

  function _doctypeLabel(dt) {
    if (_DOCTYPE_LABEL[dt]) return _DOCTYPE_LABEL[dt];
    return (dt || '').toString();
  }

  function _recentsInitials(text) {
    var words = (text || '').trim().split(/\s+/);
    var out = '';
    for (var i = 0; i < Math.min(words.length, 2); i++) {
      if (words[i]) out += words[i][0].toUpperCase();
    }
    return out || '·';
  }

  /* ──────────────────────────────────────────────────────────────
     recentsStrip(opts) — horizontal strip of recently viewed chips
     ──────────────────────────────────────────────────────────────
     opts:
       filter    — optional fn(item) → boolean
       emptyText — string shown when list is empty; pass null to suppress
                   (returns null in that case)
       limit     — max chips rendered (default 8)

     Returns: HTMLElement, or null if no items and emptyText === null.
     ────────────────────────────────────────────────────────────── */
  function recentsStrip(opts) {
    opts = opts || {};
    var limit = typeof opts.limit === 'number' ? opts.limit : 8;
    var emptyText = opts.emptyText === undefined
      ? 'No recently viewed records yet.'
      : opts.emptyText;

    var items = recents.list();
    if (typeof opts.filter === 'function') {
      items = items.filter(opts.filter);
    }
    if (items.length > limit) items = items.slice(0, limit);

    if (items.length === 0 && emptyText === null) return null;

    var wrap = el('div', { className: 'm3-recents-wrap' }, [
      sectionHeading('Recently viewed')
    ]);

    if (items.length === 0) {
      wrap.appendChild(el('div', {
        className: 'm3-recents-empty',
        textContent: emptyText
      }));
      return wrap;
    }

    var strip = el('div', {
      className: 'm3-recents',
      role: 'list',
      'aria-label': 'Recently viewed records'
    });

    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var avatarEl = el('div', {
          className: 'm3-recents-chip-avatar',
          textContent: _recentsInitials(item.title),
          'aria-hidden': 'true'
        });
        var titleEl = el('div', {
          className: 'm3-recents-chip-title',
          textContent: item.title || item.name
        });
        var subText = item.subtitle || _doctypeLabel(item.doctype);
        var subEl = el('div', {
          className: 'm3-recents-chip-sub',
          textContent: subText
        });
        var metaEl = el('div', {
          className: 'm3-recents-chip-meta',
          textContent: _doctypeLabel(item.doctype)
        });

        var chipEl = el('div', {
          className: 'm3-recents-chip',
          role: 'listitem',
          tabindex: '0',
          'aria-label': (item.title || item.name) + ' — ' + _doctypeLabel(item.doctype),
          onClick: function () {
            if (item.hash) window.location.hash = item.hash;
          },
          onKeydown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              if (item.hash) window.location.hash = item.hash;
            }
          }
        }, [avatarEl, titleEl, subEl, metaEl]);

        strip.appendChild(chipEl);
      })(items[i]);
    }

    wrap.appendChild(strip);
    return wrap;
  }

  /* ──────────────────────────────────────────────────────────────
     emailComposer(opts) — M3 in-app email composer
     ──────────────────────────────────────────────────────────────
     opts:
       to       string | string[]   recipient(s) — comma-separated allowed
       cc       string | string[]   optional CC list
       subject  string              initial subject
       body     string              initial plain-text body
       doctype  string              optional — attaches Communication to record
       name     string              optional — record name (Lead/Customer/etc.)
       onSent   function(res)       callback after successful send

     Returns an overlay element. Caller MUST appendChild to body
     (same convention as bottomSheet / statusPicker).
     ────────────────────────────────────────────────────────────── */
  function emailComposer(opts) {
    opts = opts || {};

    function _normalizeAddrs(v) {
      if (v == null) return '';
      if (Array.isArray(v)) return v.filter(Boolean).join(', ');
      return String(v);
    }

    function _splitAddrs(s) {
      if (!s) return [];
      var parts = String(s).split(/[,;]+/);
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (p) out.push(p);
      }
      return out;
    }

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function _validateAddrs(s) {
      var list = _splitAddrs(s);
      if (!list.length) return { ok: false, reason: 'empty' };
      for (var i = 0; i < list.length; i++) {
        if (!EMAIL_RE.test(list[i])) return { ok: false, reason: 'invalid', bad: list[i] };
      }
      return { ok: true, list: list };
    }

    function _plainToHtml(plain) {
      if (!plain) return '';
      var escaped = String(plain)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped.split(/\n{2,}/).map(function (para) {
        return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
      }).join('');
    }

    /* Header */
    var closeBtn = el('button', { className: 'bottom-sheet-close', 'aria-label': 'Close' });
    setIconHTML(closeBtn, 'x');
    var header = el('div', { className: 'bottom-sheet-header' }, [
      el('div', { className: 'bottom-sheet-title', textContent: 'New email' }),
      closeBtn
    ]);

    /* Fields */
    var toField = m3TextField('To', {
      type: 'email',
      value: _normalizeAddrs(opts.to),
      required: true,
      name: 'to'
    });

    var ccField = m3TextField('Cc', {
      type: 'email',
      value: _normalizeAddrs(opts.cc),
      name: 'cc'
    });
    var ccWrap = el('div', { className: 'm3-email-composer-cc-wrap' }, [ccField]);
    var ccInitial = !!_normalizeAddrs(opts.cc);
    if (!ccInitial) ccWrap.style.display = 'none';

    var ccToggle = el('button', {
      type: 'button',
      className: 'm3-email-composer-cc-toggle',
      textContent: ccInitial ? 'Hide Cc' : 'Add Cc',
      'aria-expanded': ccInitial ? 'true' : 'false'
    });
    ccToggle.addEventListener('click', function () {
      var isHidden = ccWrap.style.display === 'none';
      if (isHidden) {
        ccWrap.style.display = '';
        ccToggle.textContent = 'Hide Cc';
        ccToggle.setAttribute('aria-expanded', 'true');
        var ccInput = ccField._getInput();
        if (ccInput) ccInput.focus();
      } else {
        ccWrap.style.display = 'none';
        ccField._setValue('');
        ccField._setError(null);
        ccToggle.textContent = 'Add Cc';
        ccToggle.setAttribute('aria-expanded', 'false');
      }
    });

    var subjectField = m3TextField('Subject', {
      value: opts.subject || '',
      required: true,
      name: 'subject'
    });

    var bodyField = m3TextField('Message', {
      value: opts.body || '',
      multiline: true,
      rows: 8,
      name: 'body'
    });

    var fieldsWrap = el('div', { className: 'm3-email-composer-fields' }, [
      toField,
      ccToggle,
      ccWrap,
      subjectField,
      bodyField
    ]);

    /* Send bar (sticky at bottom of scroll content) */
    var sendBtn = btn('Send', {
      icon: 'send',
      type: 'primary',
      block: true,
      onClick: function () { _send(); }
    });
    var sendBar = el('div', { className: 'm3-email-composer-send-bar' }, [sendBtn]);

    var sheetContent = el('div', { className: 'bottom-sheet-content' }, [
      fieldsWrap,
      sendBar
    ]);

    var sheet = el('div', {
      className: 'bottom-sheet m3-email-composer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'New email'
    }, [header, sheetContent]);

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
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    closeBtn.addEventListener('click', close);
    overlay._close = close;

    function _setSending(isSending) {
      var input = sendBtn;
      if (isSending) {
        input.setAttribute('disabled', 'disabled');
        input.classList.add('is-loading');
        var textEl = input.querySelector('.btn-text');
        if (textEl) {
          if (!input._origText) input._origText = textEl.textContent;
          textEl.textContent = 'Sending…';
        }
      } else {
        input.removeAttribute('disabled');
        input.classList.remove('is-loading');
        var textEl2 = input.querySelector('.btn-text');
        if (textEl2 && input._origText) {
          textEl2.textContent = input._origText;
        }
      }
    }

    function _send() {
      /* Reset prior errors */
      toField._setError(null);
      subjectField._setError(null);
      ccField._setError(null);

      var toVal = toField._getValue().trim();
      var toCheck = _validateAddrs(toVal);
      if (!toCheck.ok) {
        toField._setError(toCheck.reason === 'empty'
          ? 'Recipient is required'
          : ('Invalid email: ' + (toCheck.bad || '')));
        var toInp = toField._getInput();
        if (toInp) toInp.focus();
        return;
      }

      var ccVal = '';
      if (ccWrap.style.display !== 'none') {
        ccVal = ccField._getValue().trim();
        if (ccVal) {
          var ccCheck = _validateAddrs(ccVal);
          if (!ccCheck.ok) {
            ccField._setError('Invalid email: ' + (ccCheck.bad || ''));
            var ccInp = ccField._getInput();
            if (ccInp) ccInp.focus();
            return;
          }
        }
      }

      var subjectVal = subjectField._getValue().trim();
      if (!subjectVal) {
        subjectField._setError('Subject is required');
        var sInp = subjectField._getInput();
        if (sInp) sInp.focus();
        return;
      }

      var bodyVal = bodyField._getValue();
      var contentHtml = _plainToHtml(bodyVal);

      var payload = {
        recipients: toCheck.list.join(', '),
        subject: subjectVal,
        content: contentHtml,
        send_email: 1,
        print_html: '',
        send_me_a_copy: 0
      };
      if (ccVal) payload.cc = _splitAddrs(ccVal).join(', ');
      if (opts.doctype) payload.doctype = opts.doctype;
      if (opts.name) payload.name = opts.name;

      _setSending(true);

      var api = (window.fieldAPI && typeof window.fieldAPI.apiCall === 'function')
        ? window.fieldAPI : null;
      var endpoint = '/api/method/frappe.core.doctype.communication.email.make';

      var sendPromise;
      if (api) {
        sendPromise = api.apiCall('POST', endpoint, payload);
      } else {
        /* Fallback: direct fetch with CSRF token */
        var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        var csrf = (typeof frappe !== 'undefined' && frappe.csrf_token) ? frappe.csrf_token : null;
        if (!csrf) {
          var match = document.cookie.match(/csrf_token=([^;]+)/);
          if (match) csrf = decodeURIComponent(match[1]);
        }
        if (csrf) headers['X-Frappe-CSRF-Token'] = csrf;
        sendPromise = fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: headers,
          body: JSON.stringify(payload)
        }).then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              var msg = 'Send failed (' + r.status + ')';
              try {
                var j = JSON.parse(t);
                if (j && j._server_messages) {
                  var arr = JSON.parse(j._server_messages);
                  if (arr && arr.length) {
                    var first = JSON.parse(arr[0]);
                    if (first && first.message) msg = first.message;
                  }
                } else if (j && j.exception) {
                  msg = j.exception;
                }
              } catch (e) { /* ignore parse failure */ }
              throw new Error(msg);
            });
          }
          return r.json();
        });
      }

      sendPromise.then(function (res) {
        _setSending(false);
        toast('Email sent', 'success');
        close();
        if (typeof opts.onSent === 'function') {
          try { opts.onSent(res); } catch (e) { /* swallow */ }
        }
      }, function (err) {
        _setSending(false);
        var msg = (err && err.message) ? err.message : 'Could not send email';
        toast(msg, 'error');
      });
    }

    /* Auto-focus: body if not pre-filled, else To if empty, else body */
    setTimeout(function () {
      var toInp = toField._getInput();
      var bodyInp = bodyField._getInput();
      if (!opts.body && !toInp.value) {
        toInp.focus();
      } else if (!opts.body) {
        bodyInp.focus();
      } else if (!toInp.value) {
        toInp.focus();
      } else {
        bodyInp.focus();
      }
    }, 100);

    return overlay;
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
    actionCard: actionCard,
    kpiRow: kpiRow,
    fieldError: fieldError,

    // M3 components
    pageHeader: pageHeader,
    sectionHeader: sectionHeader,
    stat: stat,
    statGrid: statGrid,
    chip: chip,
    chipSet: chipSet,
    segmented: segmented,
    checkbox: checkbox,
    radio: radio,
    radioGroup: radioGroup,
    selectableList: selectableList,
    selectOrChips: selectOrChips,
    snackbar: snackbar,
    pageWrap: pageWrap,
    dialog: dialog,
    confirmDialog: confirmDialog,
    m3TextField: m3TextField,
    m3SelectField: m3SelectField,
    activityTimeline: activityTimeline,
    commentBox: commentBox,
    swipeRow: swipeRow,
    stagePath: stagePath,
    statusPicker: statusPicker,
    emailComposer: emailComposer,

    // Recently viewed
    recents: recents,
    recentsStrip: recentsStrip,

    // Photo attachments (camera-only)
    attachPhotos: attachPhotos
  };

  // ─── Photo Attachment Widget ─────────────────────────────────────────

  // Camera-only photo attachment for a parent doc. Renders a thumbnail
  // strip of existing image attachments + a "Take photo" button that
  // hints the device camera (capture=environment) instead of the gallery.
  // Note: `capture` is a hint — desktop browsers fall back to file picker.
  // On mobile, every supported browser respects it.
  function attachPhotos(opts) {
    opts = opts || {};
    var doctype = opts.doctype;
    var docname = opts.docname;
    var label = opts.label || 'Photos';
    var maxFiles = opts.max || 8;
    var onChange = opts.onChange || function () {};

    var box = el('div', { className: 'attach-photos' });
    var heading = el('div', {
      textContent: label,
      style: {
        font: 'var(--m3-label-medium)',
        color: 'var(--m3-on-surface-variant)',
        margin: '8px 0 8px',
        letterSpacing: '0.4px'
      }
    });
    box.appendChild(heading);

    var thumbStrip = el('div', {
      className: 'attach-photos-strip',
      style: {
        display: 'flex', flexWrap: 'wrap', gap: '8px',
        marginBottom: '8px'
      }
    });
    box.appendChild(thumbStrip);

    var photos = [];  // { name, file_url, file_name, thumb_el }

    function renderThumbs() {
      thumbStrip.textContent = '';
      for (var i = 0; i < photos.length; i++) {
        (function (p) {
          var thumb = el('div', {
            style: {
              position: 'relative',
              width: '80px', height: '80px',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--m3-surface-variant, #eee)',
              flexShrink: '0'
            }
          });
          var img = el('img', {
            src: p.file_url,
            alt: p.file_name || 'Photo',
            style: {
              width: '100%', height: '100%', objectFit: 'cover',
              cursor: 'pointer'
            },
            onClick: function () { window.open(p.file_url, '_blank'); }
          });
          thumb.appendChild(img);

          var rm = el('button', {
            'aria-label': 'Remove photo',
            style: {
              position: 'absolute', top: '2px', right: '2px',
              width: '22px', height: '22px',
              border: '0', borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)', color: '#fff',
              fontSize: '14px', lineHeight: '20px',
              cursor: 'pointer'
            },
            textContent: '×',
            onClick: function (e) {
              e.stopPropagation();
              if (!confirm('Remove this photo?')) return;
              window.fieldAPI.apiCall('DELETE',
                '/api/resource/File/' + encodeURIComponent(p.name)
              ).then(function (r) {
                if (r.error) { showToastSafe('Could not remove photo', 'danger'); return; }
                photos = photos.filter(function (x) { return x.name !== p.name; });
                renderThumbs();
                onChange(photos);
              });
            }
          });
          thumb.appendChild(rm);
          thumbStrip.appendChild(thumb);
        })(photos[i]);
      }
    }

    function showToastSafe(msg, type) {
      if (typeof toast === 'function') { toast(msg, type); }
      else if (window.UI && window.UI.toast) { window.UI.toast(msg, type); }
    }

    // Hidden file input — capture=environment hints the back camera on mobile.
    var fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      style: { display: 'none' }
    });
    fileInput.setAttribute('capture', 'environment');

    var takeBtn = el('button', {
      type: 'button',
      className: 'm3-btn m3-btn-outline',
      style: {
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '8px',
        border: '1px solid var(--m3-outline-variant, #ccc)',
        background: 'transparent', cursor: 'pointer',
        font: 'var(--m3-label-large)'
      },
      onClick: function () {
        if (photos.length >= maxFiles) {
          showToastSafe('Max ' + maxFiles + ' photos', 'danger');
          return;
        }
        fileInput.click();
      }
    });
    if (window.icon) takeBtn.appendChild(window.icon('camera') || document.createTextNode('📷'));
    takeBtn.appendChild(el('span', { textContent: 'Take photo' }));
    box.appendChild(takeBtn);
    box.appendChild(fileInput);

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;

      takeBtn.disabled = true;
      var origText = takeBtn.lastChild.textContent;
      takeBtn.lastChild.textContent = 'Uploading…';

      window.fieldAPI.uploadFile(f, doctype, docname).then(function (file) {
        photos.push({
          name: file.name,
          file_url: file.file_url,
          file_name: file.file_name
        });
        renderThumbs();
        onChange(photos);
      }).catch(function (err) {
        showToastSafe('Upload failed: ' + (err && err.message ? err.message : err), 'danger');
      }).then(function () {
        fileInput.value = '';
        takeBtn.disabled = false;
        takeBtn.lastChild.textContent = origText;
      });
    });

    // Load existing image attachments
    if (doctype && docname) {
      var qs = '?filters=' + encodeURIComponent(JSON.stringify([
        ["File", "attached_to_doctype", "=", doctype],
        ["File", "attached_to_name", "=", docname]
      ])) + '&fields=' + encodeURIComponent(JSON.stringify([
        "name", "file_url", "file_name", "is_private"
      ])) + '&limit_page_length=50';
      window.fieldAPI.apiCall('GET', '/api/resource/File' + qs).then(function (res) {
        var data = (res && res.data && (res.data.data || res.data.message)) || [];
        for (var i = 0; i < data.length; i++) {
          var f = data[i];
          var url = f.file_url || '';
          // Filter to images only — there could be other attachments
          if (!/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(url) &&
              !/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.file_name || '')) {
            continue;
          }
          photos.push({ name: f.name, file_url: url, file_name: f.file_name });
        }
        renderThumbs();
      });
    }

    return box;
  }

})();
