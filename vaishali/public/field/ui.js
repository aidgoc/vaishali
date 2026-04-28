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
  function fab(onClick) {
    var button = el('button', { className: 'fab', onClick: onClick, 'aria-label': 'Open AI chat' });
    setIconHTML(button, 'bot');
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
      type: opts.type || 'text',
      // A non-empty placeholder is required so :placeholder-shown
      // pseudo-class flips the label correctly. We use a single space.
      placeholder: opts.placeholder || ' ',
      value: opts.value != null ? String(opts.value) : '',
      name: opts.name || null,
      required: !!opts.required,
      readOnly: !!opts.readOnly
    };
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
    m3SelectField: m3SelectField
  };

})();
