/* vaishali_chat.js — Floating Vaishali AI chat widget for Desk */
(function () {
  'use strict';

  // Skip on mobile (PWA available) and on the Field PWA itself
  if (window.innerWidth < 768) return;
  if (window.location.pathname.indexOf('/field') === 0) return;

  // Wait for frappe to be ready
  if (typeof frappe === 'undefined') return;

  // ─── State ──────────────────────────────────────────────────
  var _open = false;
  var _loading = false;
  var _messages = [];
  var _historyLoaded = false;
  var _container = null;
  var _msgArea = null;
  var _input = null;

  // ─── Markdown renderer (XSS-safe: escape first, then format) ──
  function renderMarkdown(text) {
    if (!text) return '';
    var s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre class="vc-code-block"><code>' + code.trim() + '</code></pre>';
    });
    s = s.replace(/`([^`]+)`/g, '<code class="vc-inline-code">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/^### (.+)$/gm, '<strong style="font-size:1em">$1</strong>');
    s = s.replace(/^## (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    s = s.replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="vc-list">$1</ul>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // ─── DOM helper ──────────────────────────────────────────────
  function h(tag, cls, attrs) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'textContent') el.textContent = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    return el;
  }

  // Safely set markdown-rendered content on an element.
  // renderMarkdown() HTML-escapes all input before applying transforms,
  // so the resulting HTML contains only our own formatting tags.
  function setMarkdownHTML(el, text) {
    el.innerHTML = renderMarkdown(text); // nosec: input is HTML-escaped before markdown transform
  }

  // ─── Build widget DOM ────────────────────────────────────────
  function buildWidget() {
    // FAB button
    var fab = h('button', 'vc-fab');
    fab.textContent = 'V';
    fab.title = 'Vaishali AI';
    fab.setAttribute('aria-label', 'Open Vaishali AI chat');
    fab.addEventListener('click', togglePanel);

    // Panel
    var panel = h('div', 'vc-panel');
    panel.style.display = 'none';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Vaishali AI chat');

    // Header
    var header = h('div', 'vc-header');
    var titleWrap = h('div', 'vc-header-left');
    var avatar = h('div', 'vc-header-avatar');
    avatar.textContent = 'V';
    titleWrap.appendChild(avatar);
    var titleText = h('div', 'vc-header-title');
    titleText.textContent = 'Vaishali';
    titleWrap.appendChild(titleText);
    header.appendChild(titleWrap);

    var actions = h('div', 'vc-header-actions');
    var clearBtn = h('button', 'vc-header-btn', { title: 'Clear conversation' });
    clearBtn.textContent = '\u2715';
    clearBtn.addEventListener('click', clearChat);
    actions.appendChild(clearBtn);
    var minBtn = h('button', 'vc-header-btn', { title: 'Minimize' });
    minBtn.textContent = '\u2013';
    minBtn.addEventListener('click', togglePanel);
    actions.appendChild(minBtn);
    header.appendChild(actions);
    panel.appendChild(header);

    // Messages area
    _msgArea = h('div', 'vc-messages');
    panel.appendChild(_msgArea);

    // Input area
    var inputArea = h('div', 'vc-input-area');
    _input = h('textarea', 'vc-input', { placeholder: 'Ask Vaishali...', rows: '1' });
    _input.addEventListener('input', function () {
      this.style.height = '40px';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    _input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      if (e.key === 'Escape') togglePanel();
    });
    inputArea.appendChild(_input);
    var sendBtn = h('button', 'vc-send-btn');
    sendBtn.textContent = '\u27A4';
    sendBtn.addEventListener('click', sendMessage);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    // Container
    _container = h('div', 'vc-widget');
    _container.appendChild(fab);
    _container.appendChild(panel);
    document.body.appendChild(_container);
  }

  // ─── Toggle ──────────────────────────────────────────────────
  function togglePanel() {
    _open = !_open;
    var panel = _container.querySelector('.vc-panel');
    var fab = _container.querySelector('.vc-fab');
    panel.style.display = _open ? 'flex' : 'none';
    fab.style.display = _open ? 'none' : 'flex';
    if (_open) {
      if (!_historyLoaded) loadHistory();
      setTimeout(function () { if (_input) _input.focus(); }, 100);
    }
  }

  // ─── Render messages ─────────────────────────────────────────
  function renderMessages() {
    _msgArea.textContent = '';
    if (_messages.length === 0) {
      var welcome = h('div', 'vc-welcome');
      var icon = h('div', 'vc-welcome-icon');
      icon.textContent = 'V';
      welcome.appendChild(icon);
      var title = h('div', 'vc-welcome-title');
      title.textContent = 'Hi! I\'m Vaishali';
      welcome.appendChild(title);
      var sub = h('div', 'vc-welcome-sub');
      sub.textContent = 'Your DSPL ERP assistant. Ask me anything.';
      welcome.appendChild(sub);
      _msgArea.appendChild(welcome);

      var suggestions = ['How many open leads?', 'Business dashboard', 'Pending sales orders'];
      var chips = h('div', 'vc-suggestions');
      suggestions.forEach(function (text) {
        var chip = h('button', 'vc-chip');
        chip.textContent = text;
        chip.addEventListener('click', function () {
          if (_input) _input.value = text;
          sendMessage();
        });
        chips.appendChild(chip);
      });
      _msgArea.appendChild(chips);
    } else {
      _messages.forEach(function (msg) {
        _msgArea.appendChild(makeBubble(msg));
      });
    }
    scrollBottom();
  }

  function makeBubble(msg) {
    var isUser = msg.role === 'user';
    var wrap = h('div', 'vc-msg ' + (isUser ? 'vc-msg-user' : 'vc-msg-ai'));
    if (!isUser) {
      var av = h('div', 'vc-avatar');
      av.textContent = 'V';
      wrap.appendChild(av);
    }
    var bubble = h('div', 'vc-bubble ' + (isUser ? 'vc-bubble-user' : 'vc-bubble-ai'));
    if (isUser) {
      bubble.textContent = msg.content;
    } else {
      setMarkdownHTML(bubble, msg.content);
    }
    wrap.appendChild(bubble);
    return wrap;
  }

  function makeToolPills(toolCalls) {
    if (!toolCalls || !toolCalls.length) return null;
    var container = h('div', 'vc-tools');
    toolCalls.forEach(function (tc) {
      var label = tc.name.replace(/_/g, ' ');
      var cls = tc.status === 'error' ? 'vc-tool-error' : tc.status === 'done' ? 'vc-tool-done' : 'vc-tool-running';
      var sym = tc.status === 'error' ? '\u2717 ' : tc.status === 'done' ? '\u2713 ' : '\u23f3 ';
      var pill = h('div', 'vc-tool-pill ' + cls);
      pill.textContent = sym + label;
      container.appendChild(pill);
    });
    return container;
  }

  function makeTyping() {
    var wrap = h('div', 'vc-msg vc-msg-ai vc-typing-wrap');
    var av = h('div', 'vc-avatar');
    av.textContent = 'V';
    wrap.appendChild(av);
    var bubble = h('div', 'vc-bubble vc-bubble-ai vc-typing');
    for (var i = 0; i < 3; i++) bubble.appendChild(h('span', 'vc-dot'));
    wrap.appendChild(bubble);
    return wrap;
  }

  function scrollBottom() {
    if (_msgArea) _msgArea.scrollTop = _msgArea.scrollHeight;
  }

  // ─── API calls ───────────────────────────────────────────────
  function sendMessage() {
    if (_loading || !_input) return;
    var text = _input.value.trim();
    if (!text) return;

    // Remove welcome
    var welcome = _msgArea.querySelector('.vc-welcome');
    if (welcome) welcome.remove();
    var sug = _msgArea.querySelector('.vc-suggestions');
    if (sug) sug.remove();

    _messages.push({ role: 'user', content: text });
    _msgArea.appendChild(makeBubble({ role: 'user', content: text }));
    _input.value = '';
    _input.style.height = '40px';

    _loading = true;
    var typing = makeTyping();
    _msgArea.appendChild(typing);
    scrollBottom();

    frappe.xcall('vaishali.api.chat.send_message', { message: text })
      .then(function (result) {
        typing.remove();
        _loading = false;
        var pills = makeToolPills(result && result.tool_calls);
        if (pills) _msgArea.appendChild(pills);
        var aiMsg = (result && result.response) || 'No response received.';
        _messages.push({ role: 'assistant', content: aiMsg });
        _msgArea.appendChild(makeBubble({ role: 'assistant', content: aiMsg }));
        scrollBottom();
      })
      .catch(function (err) {
        typing.remove();
        _loading = false;
        var errMsg = (err && err.message) || 'Failed to get response. Please try again.';
        _messages.push({ role: 'assistant', content: errMsg });
        _msgArea.appendChild(makeBubble({ role: 'assistant', content: errMsg }));
        scrollBottom();
      });
  }

  function loadHistory() {
    _historyLoaded = true;
    frappe.xcall('vaishali.api.chat.get_history')
      .then(function (result) {
        if (result && result.history && result.history.length) {
          _messages = result.history;
        }
        renderMessages();
      })
      .catch(function () {
        renderMessages();
      });
  }

  function clearChat() {
    if (!confirm('Clear conversation history?')) return;
    frappe.xcall('vaishali.api.chat.clear_history')
      .then(function () {
        _messages = [];
        renderMessages();
      });
  }

  // ─── Init ────────────────────────────────────────────────────
  $(document).ready(function () {
    if (frappe.session.user === 'Guest') return;
    buildWidget();
  });

})();
