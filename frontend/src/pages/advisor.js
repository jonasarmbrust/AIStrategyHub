/**
 * AI Strategy Advisor — Interactive chat with a context-aware AI consultant.
 */
import { api, showToast } from '../main.js';

let chatHistory = [];
let isStreaming = false;

export function renderAdvisor(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">🧠 AI Strategy Advisor</h1>
          <p class="page-description">Your personal AI strategy consultant — grounded in your assessment data, framework knowledge, and research sources.</p>
        </div>
        <div id="advisor-context-badge" style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.03); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
          Loading context...
        </div>
      </div>
    </div>

    <div class="card" style="display: flex; flex-direction: column; height: calc(100vh - 160px); overflow: hidden;">
      
      <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px;">
        <div class="advisor-msg assistant fade-in">
          <div class="advisor-avatar">🧠</div>
          <div class="advisor-bubble">
            <div class="advisor-bubble-content">
              <strong>Welcome!</strong> I'm your AI Strategy Advisor, powered by Gemini Pro and grounded in the full OAIMM framework.<br><br>
              I know your current assessment scores, gaps, strengths, and research sources. Ask me anything about your AI maturity strategy.
            </div>
            <div class="advisor-suggestions">
              <button class="advisor-suggestion-btn" data-q="What should I focus on next to improve my AI maturity?">🎯 What should I focus on next?</button>
              <button class="advisor-suggestion-btn" data-q="How does our organization compare to EU AI Act requirements?">⚖️ EU AI Act readiness?</button>
              <button class="advisor-suggestion-btn" data-q="Give me a 90-day action plan to move from our current level to the next maturity level.">📋 90-day action plan</button>
              <button class="advisor-suggestion-btn" data-q="What are the quick wins we can achieve this week with minimal effort?">⚡ Quick wins this week?</button>
            </div>
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid var(--glass-border); padding: 16px 24px; background: var(--bg-secondary);">
        <div style="display: flex; gap: 12px; align-items: flex-end;">
          <textarea id="chat-input" 
            placeholder="Ask about your AI strategy, maturity gaps, compliance, or next steps..." 
            rows="1"
            style="flex: 1; resize: none; background: var(--bg-primary); border: 1px solid var(--glass-border); border-radius: 12px; padding: 12px 16px; color: var(--text-primary); font-size: 0.9rem; font-family: inherit; outline: none; transition: border-color 0.2s; max-height: 120px; line-height: 1.5;"
          ></textarea>
          <button id="btn-send" class="btn btn-primary" style="padding: 12px 20px; border-radius: 12px; font-weight: 600; min-width: 80px;">
            Send ↑
          </button>
        </div>
      </div>
    </div>
  `;

  // Load context badge
  loadContext();

  // Event listeners
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');

  sendBtn.addEventListener('click', () => sendMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  // Focus input
  input.addEventListener('focus', () => { input.style.borderColor = 'var(--accent-blue)'; });
  input.addEventListener('blur', () => { input.style.borderColor = 'var(--glass-border)'; });

  // Suggestion buttons
  document.querySelectorAll('.advisor-suggestion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.q;
      sendMessage();
    });
  });
}

async function loadContext() {
  const badge = document.getElementById('advisor-context-badge');
  if (!badge) return;

  try {
    const ctx = await api.get('/advisor/context');
    const parts = [];
    parts.push(`📊 ${ctx.dimensions} dimensions, ${ctx.checkpoints} checkpoints`);
    if (ctx.has_assessment) parts.push('✅ Assessment loaded');
    if (ctx.has_research) parts.push('🔬 Research loaded');
    badge.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    badge.style.color = 'var(--accent-emerald)';
  } catch {
    badge.textContent = '⚠️ Backend offline';
    badge.style.color = 'var(--accent-red)';
  }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const msgText = input.value.trim();
  if (!msgText || isStreaming) return;

  input.value = '';
  input.style.height = 'auto';

  // Add user message
  appendMessage('user', msgText);
  chatHistory.push({ role: 'user', content: msgText });

  // Show typing indicator
  const typingEl = appendTypingIndicator();

  isStreaming = true;
  const sendBtn = document.getElementById('btn-send');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

  try {
    const res = await fetch('/api/advisor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msgText,
        history: chatHistory.slice(0, -1), // exclude current message
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const reply = data.response;

    // Remove typing indicator
    typingEl.remove();

    // Add assistant response with parsed markdown
    appendMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

  } catch (e) {
    typingEl.remove();
    appendMessage('error', `Failed to get response: ${e.message}`);
    showToast(`Advisor error: ${e.message}`, 'error');
  } finally {
    isStreaming = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send ↑'; }
  }
}

function appendMessage(role, content) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `advisor-msg ${role} fade-in`;

  if (role === 'user') {
    div.innerHTML = `
      <div class="advisor-bubble user-bubble">
        <div class="advisor-bubble-content">${escapeHtml(content)}</div>
      </div>
      <div class="advisor-avatar user-avatar">You</div>
    `;
  } else if (role === 'error') {
    div.innerHTML = `
      <div class="advisor-avatar" style="background: var(--accent-red);">!</div>
      <div class="advisor-bubble" style="border-color: rgba(239, 68, 68, 0.2);">
        <div class="advisor-bubble-content" style="color: var(--accent-red);">${escapeHtml(content)}</div>
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="advisor-avatar">🧠</div>
      <div class="advisor-bubble">
        <div class="advisor-bubble-content">${parseMarkdown(content)}</div>
      </div>
    `;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function appendTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'advisor-msg assistant fade-in';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="advisor-avatar">🧠</div>
    <div class="advisor-bubble">
      <div class="advisor-typing">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function parseMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background: rgba(59,130,246,0.1); padding: 1px 5px; border-radius: 4px; font-size: 0.85em; color: var(--accent-blue);">$1</code>')
    .replace(/^### (.*$)/gim, '<h4 style="margin: 12px 0 4px; font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin: 16px 0 6px; font-weight: 800; color: var(--accent-blue); font-size: 1.05rem;">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="margin: 20px 0 8px; font-weight: 800; font-size: 1.2rem;">$1</h2>')
    .replace(/^- (.*$)/gim, '<div style="padding-left: 16px; position: relative; margin: 3px 0;"><span style="position: absolute; left: 0; color: var(--accent-blue);">•</span>$1</div>')
    .replace(/^\d+\. (.*$)/gim, '<div style="padding-left: 20px; margin: 3px 0;">$1</div>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
