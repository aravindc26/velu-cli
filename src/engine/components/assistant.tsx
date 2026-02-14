'use client';

import { useEffect } from 'react';

export function VeluAssistant() {
  useEffect(() => {
    // Guard against double-init
    if (document.getElementById('veluAskBar')) return;

    // ── Inject HTML ──
    const askBar = document.createElement('div');
    askBar.className = 'velu-ask-bar';
    askBar.id = 'veluAskBar';
    askBar.innerHTML = `
      <div class="velu-ask-bar-inner">
        <input type="text" class="velu-ask-input" id="veluAskInput" placeholder="Ask a question..." autocomplete="off" />
        <button class="velu-ask-submit" id="veluAskSubmit" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>`;
    document.body.appendChild(askBar);

    const panel = document.createElement('div');
    panel.className = 'velu-assistant-panel velu-panel-closed';
    panel.id = 'veluAssistantPanel';
    panel.innerHTML = `
      <div class="velu-assistant-header">
        <span class="velu-assistant-title">Assistant</span>
        <div class="velu-assistant-actions">
          <button class="velu-assistant-action" data-velu-action="expand" title="Expand" aria-label="Expand assistant" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
          <button class="velu-assistant-action" data-velu-action="reset" title="New chat" aria-label="New chat" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
          <button class="velu-assistant-action" data-velu-action="close" title="Close" aria-label="Close assistant" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <div class="velu-assistant-messages" id="veluAssistantMessages"></div>
      <div class="velu-assistant-input-area">
        <input type="text" class="velu-assistant-chat-input" id="veluAssistantChatInput" placeholder="Ask a question..." autocomplete="off" />
        <button class="velu-assistant-send" id="veluAssistantSend" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94l18-8.5a.75.75 0 000-1.38l-18-8.5z"/></svg>
        </button>
      </div>`;
    document.body.appendChild(panel);

    // ── Logic ──
    initAssistant();

    return () => {
      askBar.remove();
      panel.remove();
    };
  }, []);

  return null;
}

function initAssistant() {
  const API_BASE = 'https://api.getvelu.com/api/v1/public/ai-assistant';
  const state: {
    conversationId: string | null;
    conversationToken: string | null;
    lastSeq: number;
    eventSource: EventSource | null;
    expanded: boolean;
    bootstrapped: boolean;
  } = {
    conversationId: null,
    conversationToken: null,
    lastSeq: 0,
    eventSource: null,
    expanded: false,
    bootstrapped: false,
  };

  const askBar = document.getElementById('veluAskBar')!;
  const askInput = document.getElementById('veluAskInput') as HTMLInputElement;
  const askSubmit = document.getElementById('veluAskSubmit')!;
  const panel = document.getElementById('veluAssistantPanel')!;
  const messagesEl = document.getElementById('veluAssistantMessages')!;
  const chatInput = document.getElementById('veluAssistantChatInput') as HTMLInputElement;
  const sendBtn = document.getElementById('veluAssistantSend')!;

  function saveState() {
    try {
      sessionStorage.setItem('velu-panel-open', isPanelOpen() ? '1' : '');
      sessionStorage.setItem('velu-panel-expanded', state.expanded ? '1' : '');
      sessionStorage.setItem('velu-panel-messages', messagesEl.innerHTML);
      sessionStorage.setItem('velu-conv-id', state.conversationId || '');
      sessionStorage.setItem('velu-conv-token', state.conversationToken || '');
      sessionStorage.setItem('velu-last-seq', String(state.lastSeq));
    } catch {}
  }

  function openPanel() {
    panel.classList.remove('velu-panel-closed');
    askBar.classList.add('velu-ask-bar-hidden');
    document.documentElement.classList.add('velu-assistant-open');
    chatInput.focus();
    saveState();
  }

  function closePanel() {
    panel.classList.add('velu-panel-closed');
    askBar.classList.remove('velu-ask-bar-hidden');
    document.documentElement.classList.remove('velu-assistant-open');
    document.documentElement.classList.remove('velu-assistant-wide');
    if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
    saveState();
  }

  function resetChat() {
    state.conversationId = null;
    state.conversationToken = null;
    state.lastSeq = 0;
    if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
    messagesEl.innerHTML = '';
    chatInput.value = '';
    chatInput.focus();
    saveState();
  }

  function toggleExpand() {
    state.expanded = !state.expanded;
    panel.classList.toggle('velu-assistant-expanded', state.expanded);
    document.documentElement.classList.toggle('velu-assistant-wide', state.expanded);
    saveState();
  }

  function isPanelOpen() {
    return !panel.classList.contains('velu-panel-closed');
  }

  function bootstrap() {
    if (state.bootstrapped) return Promise.resolve();
    return fetch(API_BASE + '/bootstrap', { credentials: 'include' })
      .then((r) => r.json())
      .then(() => { state.bootstrapped = true; })
      .catch(() => {});
  }

  function formatContent(text: string, citations: any[]) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[(\d+)\]/g, (m, n) => {
      const idx = parseInt(n) - 1;
      const c = citations[idx];
      if (c) {
        return '<a href="' + (c.url || c.route_path || '#') + '" class="velu-citation-ref" target="_blank">[' + n + ']</a>';
      }
      return m;
    });
    return html;
  }

  function addMessage(role: string, content: string, citations: any[] = []) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'velu-msg velu-msg-' + role;
    const bubble = document.createElement('div');
    bubble.className = 'velu-msg-bubble velu-msg-bubble-' + role;
    bubble.innerHTML = formatContent(content, citations);
    msgDiv.appendChild(bubble);

    if (role === 'assistant' && citations.length > 0) {
      const citDiv = document.createElement('div');
      citDiv.className = 'velu-msg-citations';
      citations.forEach((c, i) => {
        const a = document.createElement('a');
        a.href = c.url || c.route_path || '#';
        a.className = 'velu-citation-link';
        a.textContent = '[' + (i + 1) + '] ' + (c.title || c.route_path || 'Source');
        a.target = '_blank';
        citDiv.appendChild(a);
      });
      msgDiv.appendChild(citDiv);
    }

    if (role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'velu-msg-actions';
      actions.innerHTML =
        '<button class="velu-msg-action" title="Like"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg></button>' +
        '<button class="velu-msg-action" title="Dislike"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg></button>' +
        '<button class="velu-msg-action velu-msg-copy" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
      msgDiv.appendChild(actions);

      const copyBtn = actions.querySelector('.velu-msg-copy');
      if (copyBtn) {
        (copyBtn as HTMLElement).onclick = () => {
          navigator.clipboard.writeText(content);
          (copyBtn as HTMLElement).title = 'Copied!';
          setTimeout(() => { (copyBtn as HTMLElement).title = 'Copy'; }, 1500);
        };
      }
    }

    messagesEl.appendChild(msgDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    saveState();
    return bubble;
  }

  function addThinking() {
    const div = document.createElement('div');
    div.className = 'velu-msg velu-msg-assistant';
    div.id = 'veluThinking';
    div.innerHTML = '<div class="velu-msg-bubble velu-msg-bubble-assistant"><span class="velu-thinking-dots"><span></span><span></span><span></span></span></div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeThinking() {
    document.getElementById('veluThinking')?.remove();
  }

  function connectSSE() {
    if (state.eventSource) state.eventSource.close();
    const url = API_BASE + '/conversations/' + state.conversationId + '/events?after_seq=' + state.lastSeq + '&token=' + encodeURIComponent(state.conversationToken || '');
    state.eventSource = new EventSource(url);

    state.eventSource.addEventListener('assistant.completed', (e: MessageEvent) => {
      removeThinking();
      try {
        const data = JSON.parse(e.data);
        const msg = data.message || data;
        if (msg.seq) state.lastSeq = msg.seq;
        addMessage('assistant', msg.content || '', msg.citations || []);
      } catch {}
    });

    state.eventSource.addEventListener('assistant.error', (e: MessageEvent) => {
      removeThinking();
      try {
        const data = JSON.parse(e.data);
        addMessage('assistant', data.error || 'Something went wrong. Please try again.');
      } catch {
        addMessage('assistant', 'Something went wrong. Please try again.');
      }
    });

    state.eventSource.onerror = () => {};
  }

  function sendMessage(text: string) {
    if (!text.trim()) return;
    addMessage('user', text);
    addThinking();

    bootstrap()
      .then(() =>
        fetch(API_BASE + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: text,
            conversation_id: state.conversationId,
          }),
        })
      )
      .then((r) => {
        if (r.status === 429) {
          removeThinking();
          addMessage('assistant', 'Rate limited. Please wait a moment and try again.');
          return;
        }
        return r.json();
      })
      .then((data: any) => {
        if (!data) return;
        if (data.conversation_id) state.conversationId = data.conversation_id;
        if (data.conversation_token) state.conversationToken = data.conversation_token;
        saveState();
        if (!state.eventSource || state.eventSource.readyState === 2) {
          connectSSE();
        }
      })
      .catch(() => {
        removeThinking();
        addMessage('assistant', 'Failed to connect. Please try again.');
      });
  }

  // Event handlers
  askInput.onkeydown = (e) => { if (e.key === 'Enter') { const t = askInput.value.trim(); if (!t) return; askInput.value = ''; openPanel(); sendMessage(t); } };
  askSubmit.onclick = () => { const t = askInput.value.trim(); if (!t) return; askInput.value = ''; openPanel(); sendMessage(t); };
  chatInput.onkeydown = (e) => { if (e.key === 'Enter') { const t = chatInput.value.trim(); if (!t) return; chatInput.value = ''; sendMessage(t); } };
  sendBtn.onclick = () => { const t = chatInput.value.trim(); if (!t) return; chatInput.value = ''; sendMessage(t); };

  panel.addEventListener('click', (e) => {
    const actionBtn = (e.target as HTMLElement).closest('[data-velu-action]');
    if (!actionBtn) return;
    const action = actionBtn.getAttribute('data-velu-action');
    if (action === 'close') closePanel();
    else if (action === 'expand') toggleExpand();
    else if (action === 'reset') resetChat();
  });

  // Scroll: hide ask bar at bottom of page
  window.addEventListener('scroll', () => {
    if (isPanelOpen()) return;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    if (docHeight <= winHeight + 10) return;
    if (docHeight - scrollTop - winHeight < 60) {
      askBar.classList.add('velu-ask-bar-hidden');
    } else {
      askBar.classList.remove('velu-ask-bar-hidden');
    }
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isPanelOpen()) closePanel();
  });

  // Restore from session
  try {
    const savedOpen = sessionStorage.getItem('velu-panel-open');
    const savedExpanded = sessionStorage.getItem('velu-panel-expanded');
    const savedMessages = sessionStorage.getItem('velu-panel-messages');
    const savedConvId = sessionStorage.getItem('velu-conv-id');
    const savedConvToken = sessionStorage.getItem('velu-conv-token');
    const savedSeq = sessionStorage.getItem('velu-last-seq');
    if (savedConvId) state.conversationId = savedConvId;
    if (savedConvToken) state.conversationToken = savedConvToken;
    if (savedSeq) state.lastSeq = parseInt(savedSeq, 10) || 0;
    if (savedMessages) messagesEl.innerHTML = savedMessages;
    if (savedExpanded === '1') {
      state.expanded = true;
      panel.classList.add('velu-assistant-expanded');
      document.documentElement.classList.add('velu-assistant-wide');
    }
    if (savedOpen === '1') {
      openPanel();
      if (state.conversationId) connectSSE();
    }
  } catch {}

  bootstrap();
}
