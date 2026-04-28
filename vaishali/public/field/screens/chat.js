/* chat.js — Vaishali AI chat screen for DSPL Org OS (v2) */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  function chatCall(method, path, body) {
    return api.apiCall(method, path, body, { timeout: 120000 });
  }

  // ─── Conversation ID ─────────────────────────────────────────────
  var _CONV_KEY = 'vaishali_session_id';
  var _conversationId = localStorage.getItem(_CONV_KEY) || '';

  // ─── State ──────────────────────────────────────────────────────
  var _messages = [];
  var _isLoading = false;
  var _chatContainer = null;
  var _inputEl = null;
  var _commands = null;
  var _cmdMenu = null;

  // ─── Simple markdown renderer (HTML-escaped first for XSS safety) ──
  // Security note: ALL input is HTML-entity-escaped in Step 1 before
  // any markdown formatting tags are applied in Step 2. This ensures
  // the resulting string only contains our own safe formatting tags
  // (<strong>, <em>, <code>, <pre>, <li>, <ul>, <br>).
  function renderMarkdown(text) {
    if (!text) return '';
    // Step 1: HTML-escape all entities to prevent XSS
    var s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Step 2: Apply markdown formatting on the now-safe string
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre class="chat-code-block"><code>' + code.trim() + '</code></pre>';
    });
    s = s.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/^### (.+)$/gm, '<strong style="font-size:1em">$1</strong>');
    s = s.replace(/^## (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    s = s.replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="chat-list">$1</ul>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // Set pre-escaped markdown-rendered content on an element.
  function setMarkdownContent(element, text) {
    var safeHTML = renderMarkdown(text);
    element.innerHTML = safeHTML;  // safe: input HTML-escaped before markdown transform
  }

  // ─── Message bubble ─────────────────────────────────────────────
  function messageBubble(msg) {
    var isUser = msg.role === 'user';
    var wrapper = el('div', { className: 'chat-msg ' + (isUser ? 'chat-msg-user' : 'chat-msg-ai') });

    if (!isUser) {
      var avatar = el('div', { className: 'chat-avatar' });
      avatar.textContent = 'V';
      wrapper.appendChild(avatar);
    }

    var bubble = el('div', { className: 'chat-bubble ' + (isUser ? 'chat-bubble-user' : 'chat-bubble-ai') });
    if (isUser) {
      bubble.textContent = msg.content;
    } else {
      setMarkdownContent(bubble, msg.content);
    }
    wrapper.appendChild(bubble);
    return wrapper;
  }

  function typingIndicator() {
    var wrapper = el('div', { className: 'chat-msg chat-msg-ai', id: 'chat-typing' });
    var avatar = el('div', { className: 'chat-avatar' });
    avatar.textContent = 'V';
    wrapper.appendChild(avatar);
    var bubble = el('div', { className: 'chat-bubble chat-bubble-ai chat-typing' }, [
      el('span', { className: 'chat-dot' }),
      el('span', { className: 'chat-dot' }),
      el('span', { className: 'chat-dot' }),
    ]);
    wrapper.appendChild(bubble);
    return wrapper;
  }

  function toolCallPills(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return null;
    var container = el('div', { className: 'chat-tools' });
    for (var i = 0; i < toolCalls.length; i++) {
      var tc = toolCalls[i];
      var label = tc.name.replace(/_/g, ' ');
      var statusClass = tc.status === 'error' ? 'chat-tool-error' :
                        tc.status === 'done' ? 'chat-tool-done' : 'chat-tool-running';
      var statusSymbol = tc.status === 'error' ? '\u2717 ' :
                         tc.status === 'done' ? '\u2713 ' : '\u23f3 ';
      var pill = el('div', { className: 'chat-tool-pill ' + statusClass });
      pill.textContent = statusSymbol + label;
      container.appendChild(pill);
    }
    return container;
  }

  function scrollToBottom() {
    if (_chatContainer) {
      _chatContainer.scrollTop = _chatContainer.scrollHeight;
    }
  }

  // ─── Slash command autocomplete ──────────────────────────────────
  function loadCommands() {
    if (_commands) return Promise.resolve();
    return api.apiCall('GET', '/api/method/vaishali.api.chat.get_commands').then(function (resp) {
      _commands = (resp.data && resp.data.message && resp.data.message.commands) || [];
    }).catch(function () { _commands = []; });
  }

  function handleSlashInput(value) {
    if (!_commands || !_cmdMenu || !value.startsWith('/')) {
      hideCmdMenu();
      return;
    }
    var query = value.toLowerCase();
    var matches = _commands.filter(function (c) { return c.name.indexOf(query) === 0; });
    if (matches.length === 0) { hideCmdMenu(); return; }

    _cmdMenu.textContent = '';
    matches.forEach(function (cmd) {
      var item = el('div', { className: 'chat-cmd-item', style: 'padding:8px 12px;cursor:pointer' });
      var name = el('div', { style: 'font-size:13px;font-weight:600;color:#E60005' });
      name.textContent = cmd.name;
      item.appendChild(name);
      var desc = el('div', { style: 'font-size:11px;color:#636366' });
      desc.textContent = cmd.description;
      item.appendChild(desc);
      item.addEventListener('click', function () {
        _inputEl.value = cmd.name + ' ';
        _inputEl.focus();
        hideCmdMenu();
      });
      _cmdMenu.appendChild(item);
    });
    _cmdMenu.style.display = 'block';
  }

  function hideCmdMenu() {
    if (_cmdMenu) _cmdMenu.style.display = 'none';
  }

  // ─── Send message ──────────────────────────────────────────────
  function sendMessage() {
    if (_isLoading || !_inputEl) return;
    var text = _inputEl.value.trim();
    if (!text) return;
    hideCmdMenu();

    var welcome = _chatContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    var suggestions = _chatContainer.querySelector('.chat-suggestions');
    if (suggestions) suggestions.remove();

    _messages.push({ role: 'user', content: text });
    _chatContainer.appendChild(messageBubble({ role: 'user', content: text }));
    _inputEl.value = '';
    _inputEl.style.height = '44px';

    _isLoading = true;
    _chatContainer.appendChild(typingIndicator());
    scrollToBottom();
    _updateInputState();

    var body = { message: text };
    if (_conversationId) body.session_id = _conversationId;

    chatCall('POST', '/api/ai/chat', body)
      .then(function (resp) {
        var typing = document.getElementById('chat-typing');
        if (typing) typing.remove();
        _isLoading = false;

        if (resp.error || resp.status >= 400) {
          var errMsg = (resp.data && resp.data.error) || resp.error || 'Failed to send message';
          _messages.push({ role: 'assistant', content: errMsg });
          _chatContainer.appendChild(messageBubble({ role: 'assistant', content: errMsg }));
        } else {
          var data = resp.data || {};
          if (data.session_id) {
            _conversationId = data.session_id;
            localStorage.setItem(_CONV_KEY, _conversationId);
          }
          var pills = toolCallPills(data.tool_calls);
          if (pills) _chatContainer.appendChild(pills);
          var aiMsg = data.response || 'No response received.';
          _messages.push({ role: 'assistant', content: aiMsg });
          _chatContainer.appendChild(messageBubble({ role: 'assistant', content: aiMsg }));
        }
        scrollToBottom();
        _updateInputState();
      })
      .catch(function () {
        var typing = document.getElementById('chat-typing');
        if (typing) typing.remove();
        _isLoading = false;
        var errContent = 'Network error. Please try again.';
        _messages.push({ role: 'assistant', content: errContent });
        _chatContainer.appendChild(messageBubble({ role: 'assistant', content: errContent }));
        scrollToBottom();
        _updateInputState();
      });
  }

  function _updateInputState() {
    var sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      sendBtn.disabled = _isLoading;
      sendBtn.style.opacity = _isLoading ? '0.5' : '1';
    }
  }

  // ─── Load history ──────────────────────────────────────────────
  function loadHistory() {
    if (!_conversationId) {
      _messages = [];
      return Promise.resolve();
    }
    var path = '/api/ai/history?session_id=' + encodeURIComponent(_conversationId);
    return chatCall('GET', path).then(function (resp) {
      if (resp.data && resp.data.history) {
        _messages = resp.data.history;
      }
      if (resp.data && resp.data.session_id) {
        _conversationId = resp.data.session_id;
        localStorage.setItem(_CONV_KEY, _conversationId);
      }
    }).catch(function () {
      _messages = [];
    });
  }

  function newConversation() {
    _messages = [];
    _conversationId = '';
    localStorage.removeItem(_CONV_KEY);
    var appEl = document.getElementById('app');
    if (appEl) renderChat(appEl);
  }

  function clearHistory() {
    if (!_conversationId) { newConversation(); return; }
    var path = '/api/ai/history?session_id=' + encodeURIComponent(_conversationId);
    chatCall('DELETE', path).then(function () {
      newConversation();
    });
  }

  // ─── Render ────────────────────────────────────────────────────
  function renderChat(container) {
    container.textContent = '';
    container.style.padding = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    var headerTitle = el('div', { className: 'chat-header-title' }, [
      el('span', { textContent: 'Vaishali' }),
      el('span', { className: 'chat-header-sub', textContent: 'DSPL AI Assistant' }),
    ]);
    var headerActions = el('div', { style: 'display:flex;gap:8px' });
    var newBtn = el('button', {
      className: 'chat-clear-btn',
      textContent: 'New',
      onClick: newConversation,
    });
    headerActions.appendChild(newBtn);
    var clearBtn = el('button', {
      className: 'chat-clear-btn',
      title: 'Clear conversation',
      textContent: 'Clear',
      onClick: function () {
        UI.confirmDialog(
          'Clear conversation history?',
          'All messages in this conversation will be permanently removed. This cannot be undone.',
          { confirmText: 'Clear', cancelText: 'Keep history', danger: true, icon: 'trash' }
        ).then(function (ok) { if (ok) clearHistory(); });
      },
    });
    headerActions.appendChild(clearBtn);
    var header = el('div', { className: 'chat-header' }, [
      el('div', { className: 'chat-header-left' }, [headerTitle]),
      headerActions,
    ]);
    container.appendChild(header);

    _chatContainer = el('div', { className: 'chat-messages' });
    container.appendChild(_chatContainer);

    if (_messages.length === 0) {
      var welcomeIcon = el('div', { className: 'chat-welcome-icon' });
      welcomeIcon.textContent = 'V';
      var welcome = el('div', { className: 'chat-welcome' }, [
        welcomeIcon,
        el('div', { className: 'chat-welcome-title', textContent: 'Hi! I\'m Vaishali' }),
        el('div', { className: 'chat-welcome-sub', textContent: 'Your DSPL ERP assistant. Type / for commands.' }),
      ]);
      _chatContainer.appendChild(welcome);

      var suggestions = [
        '/pipeline',
        '/follow-up',
        'Business dashboard overview',
        'How many pending sales orders?',
      ];
      var chipsRow = el('div', { className: 'chat-suggestions' });
      for (var i = 0; i < suggestions.length; i++) {
        (function (text) {
          var chip = el('button', {
            className: 'chat-suggestion-chip',
            textContent: text,
            onClick: function () {
              if (_inputEl) _inputEl.value = text;
              sendMessage();
            },
          });
          chipsRow.appendChild(chip);
        })(suggestions[i]);
      }
      _chatContainer.appendChild(chipsRow);
    } else {
      for (var j = 0; j < _messages.length; j++) {
        _chatContainer.appendChild(messageBubble(_messages[j]));
      }
    }

    var inputArea = el('div', { className: 'chat-input-area', style: 'position:relative' });
    _cmdMenu = el('div', {});
    _cmdMenu.style.cssText = 'position:absolute;bottom:100%;left:0;right:0;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;display:none;z-index:10';
    inputArea.appendChild(_cmdMenu);

    _inputEl = el('textarea', {
      className: 'chat-input',
      placeholder: 'Ask Vaishali... (type / for commands)',
      rows: 1,
    });
    _inputEl.addEventListener('input', function () {
      this.style.height = '44px';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      handleSlashInput(this.value);
    });
    _inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    inputArea.appendChild(_inputEl);

    var sendBtn = el('button', {
      className: 'chat-send-btn',
      id: 'chat-send-btn',
      textContent: '\u27A4',
      onClick: sendMessage,
    });
    inputArea.appendChild(sendBtn);
    container.appendChild(inputArea);

    scrollToBottom();
  }

  window.Screens = window.Screens || {};
  window.Screens.chat = function (appEl) {
    Promise.all([loadHistory(), loadCommands()]).then(function () {
      renderChat(appEl);
    });
  };

})();
