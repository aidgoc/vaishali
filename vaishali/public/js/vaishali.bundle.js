/* vaishali_chat.js — Floating Vaishali AI chat widget for Desk (v2) */
import './daily_call_report_list.js';
import './daily_call_report_form.js';

(function () {
  'use strict';

  // ─── Inject styles (avoids nginx 1-year cache on CSS files) ──
  function injectStyles() {
    if (document.getElementById('vc-styles')) return;
    var style = document.createElement('style');
    style.id = 'vc-styles';
    style.textContent = [
      '.vc-widget{position:fixed;bottom:24px;right:24px;z-index:1050;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
      '@media(max-width:767px){.vc-widget{display:none!important}}',
      '.vc-fab{width:56px;height:56px;border-radius:50%;background:#E60005;color:#fff;border:none;font-size:22px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.16);transition:transform .15s ease,box-shadow .15s ease}',
      '.vc-fab:hover{box-shadow:0 6px 24px rgba(0,0,0,.2);transform:scale(1.05)}',
      '.vc-panel{width:380px;height:520px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.14);border:1px solid rgba(0,0,0,.06);display:flex;flex-direction:column;overflow:hidden}',
      '.vc-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.06);flex-shrink:0}',
      '.vc-header-left{display:flex;align-items:center;gap:10px}',
      '.vc-header-avatar{width:32px;height:32px;border-radius:8px;background:#E60005;color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center}',
      '.vc-header-title{font-size:15px;font-weight:600;color:#1C1C1E;letter-spacing:-.02em}',
      '.vc-header-actions{display:flex;gap:4px}',
      '.vc-header-btn{width:28px;height:28px;border:none;background:transparent;border-radius:6px;cursor:pointer;font-size:14px;color:#636366;display:flex;align-items:center;justify-content:center}',
      '.vc-header-btn:hover{background:rgba(0,0,0,.06)}',
      '.vc-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}',
      '.vc-msg{display:flex;gap:8px;max-width:100%}',
      '.vc-msg-user{justify-content:flex-end}',
      '.vc-msg-ai{justify-content:flex-start;align-items:flex-start}',
      '.vc-avatar{width:26px;height:26px;border-radius:7px;background:#E60005;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}',
      '.vc-bubble{padding:8px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;max-width:85%;word-wrap:break-word;overflow-wrap:break-word}',
      '.vc-bubble-user{background:#2563EB;color:#fff;border-bottom-right-radius:4px}',
      '.vc-bubble-ai{background:#F3F3F3;color:#1C1C1E;border-bottom-left-radius:4px}',
      '.vc-bubble-ai strong{font-weight:600}',
      '.vc-bubble-ai ul.vc-list{margin:4px 0;padding-left:18px}',
      '.vc-bubble-ai li{margin:2px 0}',
      '.vc-code-block{background:#1C1C1E;color:#E5E5EA;padding:10px 12px;border-radius:8px;font-size:12px;overflow-x:auto;margin:6px 0}',
      '.vc-inline-code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-size:12.5px}',
      '.vc-tools{display:flex;flex-wrap:wrap;gap:6px;padding:0 4px}',
      '.vc-tool-pill{font-size:11px;padding:3px 8px;border-radius:9999px;font-weight:500}',
      '.vc-tool-done{background:rgba(16,185,129,.12);color:#059669}',
      '.vc-tool-error{background:rgba(239,68,68,.12);color:#DC2626}',
      '.vc-tool-running{background:rgba(59,130,246,.12);color:#2563EB}',
      '.vc-typing{display:flex;gap:4px;padding:10px 14px}',
      '.vc-dot{width:7px;height:7px;border-radius:50%;background:#9CA3AF;animation:vc-bounce 1.4s ease-in-out infinite}',
      '.vc-dot:nth-child(2){animation-delay:.16s}',
      '.vc-dot:nth-child(3){animation-delay:.32s}',
      '@keyframes vc-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}',
      '.vc-welcome{text-align:center;padding:32px 16px 16px}',
      '.vc-welcome-icon{width:48px;height:48px;border-radius:14px;background:#E60005;color:#fff;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}',
      '.vc-welcome-title{font-size:17px;font-weight:600;color:#1C1C1E;margin-bottom:6px}',
      '.vc-welcome-sub{font-size:13px;color:#636366;line-height:1.4}',
      '.vc-suggestions{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:8px 0}',
      '.vc-chip{background:#F3F3F3;border:none;border-radius:9999px;padding:6px 12px;font-size:12px;color:#1C1C1E;cursor:pointer;transition:background .15s}',
      '.vc-chip:hover{background:#E8E8E8}',
      '.vc-working{display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:11.5px;color:#636366;background:#FAFAFA;border-top:1px solid rgba(0,0,0,.04)}',
      '.vc-working-dot{width:6px;height:6px;border-radius:50%;background:#E60005;animation:vc-pulse 1s ease-in-out infinite}',
      '@keyframes vc-pulse{0%,100%{opacity:1}50%{opacity:.3}}',
      '.vc-field-highlight{animation:vc-flash 1.5s ease-out}',
      '@keyframes vc-flash{0%{background:rgba(250,204,21,.4)}100%{background:transparent}}',
      '.vc-input-area{display:flex;align-items:flex-end;gap:8px;padding:12px 16px;border-top:1px solid rgba(0,0,0,.06);flex-shrink:0;position:relative}',
      '.vc-input{flex:1;border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:8px 12px;font-size:13.5px;resize:none;height:40px;max-height:100px;outline:none;font-family:inherit;line-height:1.4}',
      '.vc-input:focus{border-color:#E60005;box-shadow:0 0 0 2px rgba(230,0,5,.08)}',
      '.vc-send-btn{width:36px;height:36px;border-radius:50%;background:#E60005;color:#fff;border:none;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.vc-send-btn:hover{background:#B80004}',
      '.vc-token-count{font-size:10px;color:#9CA3AF;text-align:right;padding:0 16px 4px}',
      '.vc-cmd-menu{position:absolute;bottom:100%;left:16px;right:16px;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;display:none}',
      '.vc-cmd-item{padding:8px 12px;cursor:pointer;display:flex;flex-direction:column;gap:1px}',
      '.vc-cmd-item:hover{background:#F5F5F5}',
      '.vc-cmd-name{font-size:13px;font-weight:600;color:#E60005}',
      '.vc-cmd-desc{font-size:11px;color:#636366}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ─── State ──────────────────────────────────────────────────
  var _open = false;
  var _loading = false;
  var _messages = [];
  var _historyLoaded = false;
  var _container = null;
  var _msgArea = null;
  var _input = null;
  var _conversationId = null;
  var _commands = null;
  var _cmdMenu = null;
  var _tokenDisplay = null;

  // ─── Markdown renderer (XSS-safe: escape first, then format) ──
  function renderMarkdown(text) {
    if (!text) return '';
    // Step 1: HTML-escape all user content to prevent XSS
    var s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Step 2: Apply markdown formatting on the now-safe escaped string
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
  // renderMarkdown() HTML-escapes ALL input before applying transforms,
  // so the resulting HTML contains only our own safe formatting tags.
  function setMarkdownHTML(el, text) {
    var safeHTML = renderMarkdown(text);
    el.innerHTML = safeHTML; // nosec: input is HTML-escaped before markdown transform
  }

  // ─── Build widget DOM ────────────────────────────────────────
  function buildWidget() {
    injectStyles();

    var fab = h('button', 'vc-fab');
    fab.textContent = 'V';
    fab.title = 'Vaishali AI';
    fab.setAttribute('aria-label', 'Open Vaishali AI chat');
    fab.addEventListener('click', togglePanel);

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
    var newBtn = h('button', 'vc-header-btn', { title: 'New conversation' });
    newBtn.textContent = '+';
    newBtn.addEventListener('click', newConversation);
    actions.appendChild(newBtn);
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

    _msgArea = h('div', 'vc-messages');
    panel.appendChild(_msgArea);

    _tokenDisplay = h('div', 'vc-token-count');
    panel.appendChild(_tokenDisplay);

    var inputArea = h('div', 'vc-input-area');
    _cmdMenu = h('div', 'vc-cmd-menu');
    inputArea.appendChild(_cmdMenu);

    _input = h('textarea', 'vc-input', { placeholder: 'Ask Vaishali... (type / for commands)', rows: '1' });
    _input.addEventListener('input', function () {
      this.style.height = '40px';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      handleSlashInput(this.value);
    });
    _input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      if (e.key === 'Escape') { hideCmdMenu(); togglePanel(); }
    });
    inputArea.appendChild(_input);
    var sendBtn = h('button', 'vc-send-btn');
    sendBtn.textContent = '\u27A4';
    sendBtn.addEventListener('click', sendMessage);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    _container = h('div', 'vc-widget');
    _container.appendChild(fab);
    _container.appendChild(panel);
    document.body.appendChild(_container);
  }

  // ─── Slash command autocomplete ──────────────────────────────
  function loadCommands() {
    if (_commands) return;
    frappe.xcall('vaishali.api.chat.get_commands').then(function (r) {
      _commands = (r && r.commands) || [];
    }).catch(function () { _commands = []; });
  }

  function handleSlashInput(value) {
    if (!_commands || !value.startsWith('/')) {
      hideCmdMenu();
      return;
    }
    var query = value.toLowerCase();
    var matches = _commands.filter(function (c) {
      return c.name.indexOf(query) === 0;
    });
    if (matches.length === 0) {
      hideCmdMenu();
      return;
    }
    _cmdMenu.textContent = '';
    matches.forEach(function (cmd) {
      var item = h('div', 'vc-cmd-item');
      var name = h('div', 'vc-cmd-name');
      name.textContent = cmd.name;
      item.appendChild(name);
      var desc = h('div', 'vc-cmd-desc');
      desc.textContent = cmd.description;
      item.appendChild(desc);
      item.addEventListener('click', function () {
        _input.value = cmd.name + ' ';
        _input.focus();
        hideCmdMenu();
      });
      _cmdMenu.appendChild(item);
    });
    _cmdMenu.style.display = 'block';
  }

  function hideCmdMenu() {
    if (_cmdMenu) _cmdMenu.style.display = 'none';
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
      loadCommands();
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

      var suggestions = ['How many open leads?', '/pipeline', '/report monthly'];
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

  // ─── Client action executor (live agent) ──────────────────
  function executeClientActions(actions) {
    if (!actions || !actions.length) return;
    var panel = _container.querySelector('.vc-panel');

    var bar = h('div', 'vc-working');
    var dot = h('span', 'vc-working-dot');
    bar.appendChild(dot);
    var label = document.createElement('span');
    label.textContent = 'Vaishali is working\u2026';
    bar.appendChild(label);
    panel.insertBefore(bar, panel.querySelector('.vc-input-area'));

    var i = 0;
    function next() {
      if (i >= actions.length) {
        bar.remove();
        scrollBottom();
        return;
      }
      var act = actions[i++];
      var delay = act.delay || 400;

      if (act.type === 'navigate') {
        var route = act.route || '';
        if (route.indexOf('/app/') === 0) route = route.substring(5);
        frappe.set_route(route);
        setTimeout(next, delay + 300);
      } else if (act.type === 'set_value') {
        if (window.cur_frm) {
          cur_frm.set_value(act.field, act.value);
          highlightField(act.field);
        }
        setTimeout(next, delay);
      } else if (act.type === 'highlight') {
        highlightField(act.field);
        setTimeout(next, delay);
      } else if (act.type === 'scroll_to') {
        if (window.cur_frm) cur_frm.scroll_to_field(act.field);
        setTimeout(next, delay);
      } else if (act.type === 'notify') {
        frappe.show_alert({ message: act.message, indicator: act.variant || 'blue' }, 5);
        setTimeout(next, delay);
      } else {
        setTimeout(next, delay);
      }
    }
    setTimeout(next, 600);
  }

  function highlightField(fieldname) {
    if (!window.cur_frm) return;
    var field = cur_frm.fields_dict[fieldname];
    if (!field || !field.$wrapper) return;
    var el = field.$wrapper[0] || field.$wrapper;
    el.classList.add('vc-field-highlight');
    setTimeout(function () { el.classList.remove('vc-field-highlight'); }, 1500);
  }

  // ─── API calls ───────────────────────────────────────────────
  function sendMessage() {
    if (_loading || !_input) return;
    var text = _input.value.trim();
    if (!text) return;
    hideCmdMenu();

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

    var args = { message: text };
    if (_conversationId) args.conversation_id = _conversationId;

    frappe.xcall('vaishali.api.chat.send_message', args)
      .then(function (result) {
        typing.remove();
        _loading = false;

        if (result && result.conversation_id) {
          _conversationId = result.conversation_id;
        }

        var pills = makeToolPills(result && result.tool_calls);
        if (pills) _msgArea.appendChild(pills);
        var aiMsg = (result && result.response) || 'No response received.';
        _messages.push({ role: 'assistant', content: aiMsg });
        _msgArea.appendChild(makeBubble({ role: 'assistant', content: aiMsg }));

        if (result && result.usage && _tokenDisplay) {
          var total = (result.usage.input || 0) + (result.usage.output || 0);
          _tokenDisplay.textContent = total.toLocaleString() + ' tokens';
        }

        scrollBottom();
        executeClientActions(result && result.client_actions);
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
        if (result && result.conversation_id) {
          _conversationId = result.conversation_id;
        }
        renderMessages();
      })
      .catch(function () {
        renderMessages();
      });
  }

  function newConversation() {
    _messages = [];
    _conversationId = null;
    renderMessages();
    if (_tokenDisplay) _tokenDisplay.textContent = '';
  }

  function clearChat() {
    if (!confirm('Clear conversation history?')) return;
    var args = {};
    if (_conversationId) args.conversation_id = _conversationId;
    frappe.xcall('vaishali.api.chat.clear_history', args)
      .then(function () {
        _messages = [];
        _conversationId = null;
        renderMessages();
        if (_tokenDisplay) _tokenDisplay.textContent = '';
      });
  }

  // ─── Init ────────────────────────────────────────────────────
  $(document).ready(function () {
    if (window.innerWidth < 768) return;
    if (window.location.pathname.indexOf('/field') === 0) return;
    if (!window.frappe || frappe.session.user === 'Guest') return;
    buildWidget();
  });

})();
