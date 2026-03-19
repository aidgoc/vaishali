/* chat.js — Vaishali AI chat screen for DSPL Org OS */
(function () {
  'use strict';

  var api = window.fieldAPI;
  var el = UI.el;

  // Chat API call — uses apiCall which handles auth (cookie or token)
  // and path translation (/api/field/chat/* → Frappe method paths)
  function chatCall(method, path, body) {
    return api.apiCall(method, path, body);
  }

  // ─── State ──────────────────────────────────────────────────────
  var _messages = [];      // [{role, content}]
  var _isLoading = false;
  var _chatContainer = null;
  var _inputEl = null;

  // ─── Simple markdown renderer (HTML-escaped first for XSS safety) ──
  function renderMarkdown(text) {
    if (!text) return '';
    // Step 1: Escape all HTML entities to prevent XSS
    var s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Step 2: Apply markdown formatting on the escaped string
    // Code blocks (```...```)
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      return '<pre class="chat-code-block"><code>' + code.trim() + '</code></pre>';
    });
    // Inline code
    s = s.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    // Bold
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Headers
    s = s.replace(/^### (.+)$/gm, '<strong style="font-size:1em">$1</strong>');
    s = s.replace(/^## (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    s = s.replace(/^# (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    // Unordered lists
    s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="chat-list">$1</ul>');
    // Line breaks (outside of pre blocks)
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // Safely set rendered markdown on an element.
  // Input is always HTML-escaped first in renderMarkdown(), so this is safe.
  function setMarkdownContent(element, text) {
    var rendered = renderMarkdown(text);
    element.innerHTML = rendered;  // nosec: input is HTML-escaped before markdown transform
  }

  // ─── Message bubble ─────────────────────────────────────────────
  function messageBubble(msg) {
    var isUser = msg.role === 'user';
    var wrapper = el('div', { className: 'chat-msg ' + (isUser ? 'chat-msg-user' : 'chat-msg-ai') });

    if (!isUser) {
      // AI avatar
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

  // ─── Typing indicator ──────────────────────────────────────────
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

  // ─── Tool call pill ────────────────────────────────────────────
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

  // ─── Scroll to bottom ──────────────────────────────────────────
  function scrollToBottom() {
    if (_chatContainer) {
      _chatContainer.scrollTop = _chatContainer.scrollHeight;
    }
  }

  // ─── Send message ──────────────────────────────────────────────
  function sendMessage() {
    if (_isLoading || !_inputEl) return;
    var text = _inputEl.value.trim();
    if (!text) return;

    // Remove welcome if present
    var welcome = _chatContainer.querySelector('.chat-welcome');
    if (welcome) welcome.remove();
    var suggestions = _chatContainer.querySelector('.chat-suggestions');
    if (suggestions) suggestions.remove();

    // Add user message
    _messages.push({ role: 'user', content: text });
    _chatContainer.appendChild(messageBubble({ role: 'user', content: text }));
    _inputEl.value = '';
    _inputEl.style.height = '44px';

    // Show typing
    _isLoading = true;
    _chatContainer.appendChild(typingIndicator());
    scrollToBottom();
    _updateInputState();

    // Call API
    chatCall('POST', '/api/field/chat', { message: text })
      .then(function (resp) {
        // Remove typing indicator
        var typing = document.getElementById('chat-typing');
        if (typing) typing.remove();
        _isLoading = false;

        if (resp.error || resp.status >= 400) {
          var errMsg = (resp.data && resp.data.error) || resp.error || 'Failed to send message';
          _messages.push({ role: 'assistant', content: errMsg });
          _chatContainer.appendChild(messageBubble({ role: 'assistant', content: errMsg }));
        } else {
          var data = resp.data || {};
          // Show tool call pills if any
          var pills = toolCallPills(data.tool_calls);
          if (pills) _chatContainer.appendChild(pills);
          // Show response
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
    return chatCall('GET', '/api/field/chat/history').then(function (resp) {
      if (resp.data && resp.data.history) {
        _messages = resp.data.history;
      }
    }).catch(function () {
      _messages = [];
    });
  }

  // ─── Clear history ─────────────────────────────────────────────
  function clearHistory() {
    chatCall('DELETE', '/api/field/chat/history').then(function () {
      _messages = [];
      var appEl = document.getElementById('app');
      if (appEl) renderChat(appEl);
    });
  }

  // ─── Render ────────────────────────────────────────────────────
  function renderChat(container) {
    container.textContent = '';

    // Header
    var headerTitle = el('div', { className: 'chat-header-title' }, [
      el('span', { textContent: 'Vaishali' }),
      el('span', { className: 'chat-header-sub', textContent: 'DSPL AI Assistant' }),
    ]);
    var clearBtn = el('button', {
      className: 'chat-clear-btn',
      title: 'Clear conversation',
      textContent: 'Clear',
      onClick: function () {
        if (confirm('Clear conversation history?')) clearHistory();
      },
    });
    var header = el('div', { className: 'chat-header' }, [
      el('div', { className: 'chat-header-left' }, [headerTitle]),
      clearBtn,
    ]);
    container.appendChild(header);

    // Chat messages area
    _chatContainer = el('div', { className: 'chat-messages' });
    container.appendChild(_chatContainer);

    // Render existing messages
    if (_messages.length === 0) {
      // Welcome state
      var welcomeIcon = el('div', { className: 'chat-welcome-icon' });
      welcomeIcon.textContent = 'V';
      var welcome = el('div', { className: 'chat-welcome' }, [
        welcomeIcon,
        el('div', { className: 'chat-welcome-title', textContent: 'Hi! I\'m Vaishali' }),
        el('div', { className: 'chat-welcome-sub', textContent: 'Your DSPL ERP assistant. Ask me anything about your data, create records, run reports, and more.' }),
      ]);
      _chatContainer.appendChild(welcome);

      // Suggestion chips
      var suggestions = [
        'Show my attendance this month',
        'Business dashboard overview',
        'How many pending sales orders?',
        'Apply for leave',
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

    // Input area
    var inputArea = el('div', { className: 'chat-input-area' });
    _inputEl = el('textarea', {
      className: 'chat-input',
      placeholder: 'Ask Vaishali...',
      rows: 1,
    });
    // Auto-resize textarea
    _inputEl.addEventListener('input', function () {
      this.style.height = '44px';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
    // Send on Enter (shift+enter for newline)
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

  // ─── Route registration ────────────────────────────────────────
  window.Screens = window.Screens || {};
  window.Screens.chat = function (appEl) {
    loadHistory().then(function () {
      renderChat(appEl);
    });
  };

})();
