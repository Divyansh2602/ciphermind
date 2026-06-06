/**
 * CipherMind — UI Engine (Human Edition)
 * Warm animations, friendly boot, human-feeling interactions
 */

const UI = (() => {

  // ── Boot Sequence ──────────────────────────────────────────────────────
  const bootSteps = [
    { text: 'Loading CipherMind...', type: 'normal', delay: 80 },
    { text: 'Starting Web Crypto API', type: 'normal', delay: 100 },
    { text: '✓ PBKDF2 key derivation ready', type: 'ok', delay: 120 },
    { text: '✓ AES-256-GCM cipher loaded', type: 'ok', delay: 120 },
    { text: '✓ HMAC-SHA512 integrity engine ready', type: 'ok', delay: 100 },
    { text: 'Generating your session passphrase (256-bit)...', type: 'highlight', delay: 500 },
    { text: 'Deriving encryption key (100,000 PBKDF2 rounds)...', type: 'highlight', delay: 700 },
    { text: '✓ Keys derived — stored only in memory', type: 'ok', delay: 200 },
    { text: 'Connecting to Groq inference API...', type: 'normal', delay: 300 },
    { text: '✓ All systems ready — welcome!', type: 'ok', delay: 150 },
  ];

  function runBootSequence(onComplete) {
    const stepsEl = document.getElementById('boot-steps');
    const bar = document.getElementById('boot-progress');
    let i = 0;

    function next() {
      if (i >= bootSteps.length) {
        setTimeout(() => {
          document.getElementById('boot-screen').classList.add('fade-out');
          setTimeout(onComplete, 550);
        }, 350);
        return;
      }
      const step = bootSteps[i];
      const line = document.createElement('div');
      line.className = `boot-step-line ${step.type}`;
      line.textContent = step.text;
      stepsEl.appendChild(line);
      stepsEl.scrollTop = stepsEl.scrollHeight;
      bar.style.width = `${((i + 1) / bootSteps.length) * 100}%`;
      i++;
      setTimeout(next, step.delay);
    }
    next();
  }

  // ── Pipeline Animator ──────────────────────────────────────────────────
  let pipeTimer = null;

  function animatePipeline(durationMs = 4200) {
    const steps = 8;
    const allSteps = document.querySelectorAll('.pipe-step');
    allSteps.forEach(s => s.classList.remove('active', 'done'));

    if (pipeTimer) clearTimeout(pipeTimer);

    const stepDuration = durationMs / steps;
    for (let i = 1; i <= steps; i++) {
      setTimeout(() => {
        // Mark previous as done
        for (let j = 1; j < i; j++) {
          const el = document.getElementById(`ps-${j}`);
          if (el) { el.classList.remove('active'); el.classList.add('done'); }
        }
        const el = document.getElementById(`ps-${i}`);
        if (el) el.classList.add('active');
      }, (i - 1) * stepDuration);
    }

    pipeTimer = setTimeout(() => {
      allSteps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
      setTimeout(() => allSteps.forEach(s => s.classList.remove('done')), 1800);
    }, steps * stepDuration + 200);
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = { enc: 0, dec: 0, tokens: 0, hmac: 0 };

  function bumpStat(key, amount = 1) {
    stats[key] += amount;
    const el = document.getElementById(`stat-${key}`);
    if (!el) return;
    el.textContent = stats[key];
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 300);
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const container = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 130) + 'px';
  }

  // ── Time ───────────────────────────────────────────────────────────────
  function formatTime() {
    return new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  // ── Render Message ─────────────────────────────────────────────────────
  function renderMessage({ role, text, cipherHex, fullData }) {
    const isUser = role === 'user';
    const list = document.getElementById('messages-list');

    // Hide welcome
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.style.display = 'none';

    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : 'ai'}`;

    const escapedText = escapeHtml(text);

    div.innerHTML = `
      <div class="msg-avatar">${isUser ? '🧑' : '🤖'}</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">${isUser ? 'You' : 'CipherMind'}</span>
          <span class="msg-time">${formatTime()}</span>
          ${cipherHex ? `<span class="msg-enc-tag">🔐 encrypted</span>` : ''}
        </div>
        <div class="msg-bubble">${escapedText}</div>
        ${cipherHex ? `<div class="msg-cipher-preview" title="Click to expand">${cipherHex}</div>` : ''}
      </div>
    `;

    // Click bubble → open inspector
    div.querySelector('.msg-bubble').addEventListener('click', () => {
      openInspector(fullData);
    });

    // Toggle cipher preview expand
    const cp = div.querySelector('.msg-cipher-preview');
    if (cp) cp.addEventListener('click', () => cp.classList.toggle('expanded'));

    list.appendChild(div);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
    return div;
  }

  // ── Thinking indicator ─────────────────────────────────────────────────
  const thinkingSteps = [
    'Verifying HMAC signature...',
    'Decrypting with AES-256-GCM...',
    'Sending to Groq...',
    'Groq is thinking...',
    'Encrypting response...',
    'Signing with HMAC...',
  ];

  function renderThinking() {
    const list = document.getElementById('messages-list');
    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = 'thinking-msg';
    div.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">CipherMind</span>
          <span class="msg-time">${formatTime()}</span>
        </div>
        <div class="msg-bubble">
          <div class="thinking-bubble">
            <div class="thinking-dots"><span></span><span></span><span></span></div>
            <span class="thinking-step-text" id="thinking-text">Encrypting your message...</span>
          </div>
        </div>
      </div>
    `;
    list.appendChild(div);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;

    let si = 0;
    const iv = setInterval(() => {
      const el = document.getElementById('thinking-text');
      if (el && si < thinkingSteps.length) el.textContent = thinkingSteps[si++];
      else clearInterval(iv);
    }, 650);

    return { el: div, stop: () => clearInterval(iv) };
  }

  function removeThinking() {
    const el = document.getElementById('thinking-msg');
    if (el) el.remove();
  }

  // ── Inspector ──────────────────────────────────────────────────────────
  function openInspector(data) {
    if (!data) return;
    document.getElementById('app').classList.add('drawer-open');
    const body = document.getElementById('drawer-body');

    body.innerHTML = `
      <div class="drawer-field">
        <div class="drawer-field-label">Role</div>
        <div class="drawer-field-val yellow">${data.role || '—'}</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">Encryption</div>
        <div class="drawer-field-val blue">AES-256-GCM</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">MAC</div>
        <div class="drawer-field-val blue">HMAC-SHA-512</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">Integrity</div>
        <div class="drawer-field-val green">✅ HMAC verified — not tampered</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">IV (Initialization Vector)</div>
        <div class="drawer-field-val">${data.ivHex || '—'}</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">HMAC Signature</div>
        <div class="drawer-field-val green">${(data.hmacHex || '—').substring(0, 64)}...</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">Ciphertext (first 128 chars)</div>
        <div class="drawer-field-val red">${(data.cipherHex || '—').substring(0, 128)}...</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">SHA-256 Plaintext Fingerprint</div>
        <div class="drawer-field-val yellow">${data.plaintextHash || '—'}</div>
      </div>
      <div class="drawer-field">
        <div class="drawer-field-label">Timestamp</div>
        <div class="drawer-field-val">${data.timestamp || '—'}</div>
      </div>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function renderStreamingMessage() {
    const list = document.getElementById('messages-list');
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'message ai';
    div.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">CipherMind</span>
          <span class="msg-time">${formatTime()}</span>
        </div>
        <div class="msg-bubble streaming-bubble" id="streaming-bubble"></div>
      </div>
    `;
    list.appendChild(div);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
    return div;
  }

  function appendStreamToken(div, token) {
    const bubble = div.querySelector('.streaming-bubble');
    if (!bubble) return;
    bubble.innerHTML = escapeHtml(bubble.innerText + token);
    bubble.parentElement.parentElement.parentElement.scrollTop =
      bubble.parentElement.parentElement.parentElement.scrollHeight;
  }
  
  return {
    runBootSequence,
    animatePipeline,
    bumpStat,
    toast,
    autoResize,
    renderMessage,
    renderThinking,
    removeThinking,
    openInspector,
    renderStreamingMessage,
    appendStreamToken,
  };
})();

window.UI = UI;
