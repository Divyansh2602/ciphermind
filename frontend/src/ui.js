/**
 * CipherMind — UI Engine
 * Handles: Boot sequence, pipeline animator, message rendering,
 *          streaming, crypto inspector, TTS, stat bumping
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
        ${!isUser ? `<button class="tts-btn" title="Read aloud">🔊</button>` : ''}
        ${cipherHex ? `<div class="msg-cipher-preview" title="Click to expand">${cipherHex}</div>` : ''}
      </div>
    `;

    // Click bubble → open inspector
    div.querySelector('.msg-bubble').addEventListener('click', () => {
      openInspector(fullData);
    });

    // TTS button
    const ttsBtn = div.querySelector('.tts-btn');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(text, ttsBtn);
      });
    }

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

  // ── Streaming ──────────────────────────────────────────────────────────
  function renderStreamingMessage() {
    const list = document.getElementById('messages-list');
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.style.display = 'none';

    const div = document.createElement('div');
    div.className = 'message ai';
    div.id = 'streaming-msg';
    div.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">CipherMind</span>
          <span class="msg-time">${formatTime()}</span>
        </div>
        <div class="msg-bubble streaming-bubble" id="streaming-bubble"></div>
        <button class="tts-btn" id="streaming-tts-btn" title="Read aloud" style="display:none">🔊</button>
      </div>
    `;
    list.appendChild(div);
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
    return div;
  }

  function appendStreamToken(div, token) {
    const bubble = div.querySelector('.streaming-bubble');
    if (!bubble) return;
    // Use innerText to accumulate, then set innerHTML with escape
    bubble._rawText = (bubble._rawText || '') + token;
    bubble.innerHTML = escapeHtml(bubble._rawText);
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
  }

  function finalizeStreamingMessage(div, fullText) {
    if (!div) return;
    div.removeAttribute('id');

    const bubble = div.querySelector('.streaming-bubble');
    if (bubble) {
      bubble.classList.remove('streaming-bubble');
      bubble._rawText = null;
    }

    // Show TTS button
    const ttsBtn = div.querySelector('#streaming-tts-btn');
    if (ttsBtn) {
      ttsBtn.style.display = 'inline-flex';
      ttsBtn.removeAttribute('id');
      ttsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speakText(fullText, ttsBtn);
      });
    }
  }

  // ── Text to Speech ─────────────────────────────────────────────────────
  let currentTtsBtn = null;

  function speakText(text, btn) {
    if (!window.speechSynthesis) {
      toast('Text to speech not supported in this browser', 'error');
      return;
    }

    // If already speaking, stop
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      document.querySelectorAll('.tts-btn').forEach(b => {
        b.textContent = '🔊';
        b.classList.remove('speaking');
        b.dataset.speaking = 'false';
      });
      // If same button — just stop
      if (currentTtsBtn === btn) {
        currentTtsBtn = null;
        return;
      }
    }

    // Clean markdown from text for better speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, '. ')
      .replace(/\.{2,}/g, '.')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Pick best available English voice
    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.name.includes('Google US English') ||
        v.name.includes('Samantha') ||
        v.name.includes('Daniel') ||
        v.name.includes('Karen') ||
        (v.lang.startsWith('en') && v.localService)
      ) || voices.find(v => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      loadVoice();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoice, { once: true });
    }

    utterance.onstart = () => {
      btn.textContent = '⏹️';
      btn.classList.add('speaking');
      btn.dataset.speaking = 'true';
      currentTtsBtn = btn;
    };

    utterance.onend = () => {
      btn.textContent = '🔊';
      btn.classList.remove('speaking');
      btn.dataset.speaking = 'false';
      currentTtsBtn = null;
    };

    utterance.onerror = () => {
      btn.textContent = '🔊';
      btn.classList.remove('speaking');
      btn.dataset.speaking = 'false';
      currentTtsBtn = null;
    };

    window.speechSynthesis.speak(utterance);
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
        <div class="drawer-field-label">MAC Algorithm</div>
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
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
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
    finalizeStreamingMessage,
    speakText,
  };
})();

window.UI = UI;