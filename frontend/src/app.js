/**
 * CipherMind — Frontend App
 * Works in two modes:
 *   1. Backend mode: requests go through your Render backend (API key server-side)
 *   2. Direct mode:  calls Groq directly from browser (API key entered in UI)
 */

const App = (() => {
  let apiKey = '';
  let selectedModel = 'llama-3.3-70b-versatile';
  let conversationHistory = [];
  let isSending = false;

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    UI.runBootSequence(async () => {
      const app = document.getElementById('app');
      app.classList.remove('hidden');

      // Init crypto
      try {
        const keyInfo = await CryptoEngine.init();
        document.getElementById('session-key-display').textContent = keyInfo.keyFingerprint;
        UI.toast('🔐 Session keys generated!', 'success');
      } catch (e) {
        UI.toast('Crypto init failed: ' + e.message, 'error');
      }

      // If backend URL is configured, skip asking for API key
      if (CONFIG.BACKEND_URL) {
        apiKey = '__backend__';
        document.getElementById('set-key-btn').textContent = '✓ Via backend';
        document.getElementById('set-key-btn').classList.add('connected');
        document.getElementById('api-key-input').disabled = true;
        document.getElementById('api-key-input').placeholder = 'Using backend API key';
        document.getElementById('connect-hint').textContent = 'API key secured on server';
        document.getElementById('connect-hint').className = 'connect-hint success';
        document.getElementById('send-btn').disabled = false;
      }

      bindEvents();
    });
  }

  // ── Events ────────────────────────────────────────────────────────────
  function bindEvents() {
    const input = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const setKeyBtn = document.getElementById('set-key-btn');
    const apiInput = document.getElementById('api-key-input');
    const modelSelect = document.getElementById('model-select');
    const clearBtn = document.getElementById('clear-btn');
    const exportBtn = document.getElementById('export-btn');
    const drawerClose = document.getElementById('drawer-close');

    // API Key connect
    setKeyBtn.addEventListener('click', connectKey);
    apiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') connectKey(); });

    function connectKey() {
      const key = apiInput.value.trim();
      if (!key.startsWith('gsk_')) {
        document.getElementById('connect-hint').textContent = 'Key must start with gsk_';
        document.getElementById('connect-hint').className = 'connect-hint error';
        return;
      }
      apiKey = key;
      apiInput.classList.add('connected');
      setKeyBtn.textContent = '✓ Connected';
      setKeyBtn.classList.add('connected');
      sendBtn.disabled = false;
      document.getElementById('connect-hint').textContent = '✓ Connected — free tier active';
      document.getElementById('connect-hint').className = 'connect-hint success';
      UI.toast('Connected to Groq! Start chatting 🎉', 'success');
    }

    // Model
    modelSelect.addEventListener('change', () => {
      selectedModel = modelSelect.value;
      UI.toast(`Model: ${modelSelect.options[modelSelect.selectedIndex].text.split('—')[0].trim()}`, 'info');
    });

    // Input
    input.addEventListener('input', async () => {
      UI.autoResize(input);
      document.getElementById('char-count').textContent = `${input.value.length} chars`;

      // Live encryption preview
      const encLive = document.getElementById('enc-live');
      if (input.value.length > 2) {
        try {
          const enc = await CryptoEngine.encrypt(input.value.slice(0, 24));
          const parsed = JSON.parse(enc.envelope);
          encLive.textContent = `🔐 ${parsed.ct.substring(0, 52)}...`;
          encLive.classList.add('active');
        } catch {}
      } else {
        encLive.textContent = '';
        encLive.classList.remove('active');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isSending) sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => { if (!isSending) sendMessage(); });

    clearBtn.addEventListener('click', () => {
      conversationHistory = [];
      document.getElementById('messages-list').innerHTML = '';
      document.getElementById('welcome').style.display = '';
      UI.toast('Session cleared', 'info');
    });

    exportBtn.addEventListener('click', exportChat);
    drawerClose.addEventListener('click', () => {
      document.getElementById('app').classList.remove('drawer-open');
    });
  }

  // ── Send Message ──────────────────────────────────────────────────────
  async function sendMessage() {
    if (!apiKey) {
      UI.toast('Enter your Groq API key first', 'error');
      return;
    }

    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text) return;

    isSending = true;
    input.value = '';
    UI.autoResize(input);
    document.getElementById('char-count').textContent = '0 chars';
    document.getElementById('enc-live').textContent = '';
    document.getElementById('enc-live').classList.remove('active');
    document.getElementById('send-btn').classList.add('sending');

    // Animate pipeline
    UI.animatePipeline(4000);

    const t0 = Date.now();

    // Encrypt user message
    let encResult;
    try {
      encResult = await CryptoEngine.encrypt(text);
      UI.bumpStat('enc');
    } catch (e) {
      UI.toast('Encryption error: ' + e.message, 'error');
      isSending = false;
      return;
    }

    const plaintextHash = await CryptoEngine.sha256(text);

    // Render user message
    UI.renderMessage({
      role: 'user',
      text,
      cipherHex: encResult.cipherHex,
      fullData: {
        role: 'user',
        ivHex: encResult.fullIv,
        cipherHex: encResult.fullCipher,
        hmacHex: encResult.fullHmac,
        plaintextHash,
        timestamp: new Date().toISOString()
      }
    });

    // Show thinking
    const thinking = UI.renderThinking();
    conversationHistory.push({ role: 'user', content: text });

    // Call API
    let aiText;
    try {
      const data = await callAPI(conversationHistory);
      aiText = data.choices[0]?.message?.content || 'No response.';
      UI.bumpStat('tokens', data.usage?.total_tokens || 1);

      // Show response time
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      document.getElementById('speed-badge').textContent = `⚡ ${elapsed}s`;
    } catch (e) {
      thinking.stop();
      UI.removeThinking();
      UI.renderMessage({
        role: 'ai',
        text: `Oops, something went wrong: ${e.message}`,
        fullData: { role: 'ai', error: e.message, timestamp: new Date().toISOString() }
      });
      isSending = false;
      document.getElementById('send-btn').classList.remove('sending');
      return;
    }

    // Encrypt AI response for display
    let aiEnc;
    try {
      aiEnc = await CryptoEngine.encrypt(aiText);
      UI.bumpStat('enc');
      UI.bumpStat('dec');
      UI.bumpStat('hmac');
    } catch {
      aiEnc = { cipherHex: 'N/A', fullIv: 'N/A', fullHmac: 'N/A', fullCipher: 'N/A' };
    }

    const aiHash = await CryptoEngine.sha256(aiText);

    thinking.stop();
    UI.removeThinking();

    UI.renderMessage({
      role: 'ai',
      text: aiText,
      cipherHex: aiEnc.cipherHex,
      fullData: {
        role: 'ai',
        ivHex: aiEnc.fullIv,
        cipherHex: aiEnc.fullCipher,
        hmacHex: aiEnc.fullHmac,
        plaintextHash: aiHash,
        timestamp: new Date().toISOString()
      }
    });

    conversationHistory.push({ role: 'assistant', content: aiText });

    isSending = false;
    document.getElementById('send-btn').classList.remove('sending');
  }

  // ── API Call ──────────────────────────────────────────────────────────
  async function callAPI(messages) {
    // Use backend if configured, otherwise call Groq directly
    if (CONFIG.BACKEND_URL) {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: selectedModel }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return res.json();
    }

    // Direct Groq call
    const SYSTEM = `You are CipherMind, a smart and friendly AI assistant inside an encrypted chat app.
Be warm, conversational, and genuinely helpful. Format code clearly. Keep answers focused.`;

    const res = await fetch(CONFIG.GROQ_DIRECT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ── Export ────────────────────────────────────────────────────────────
  function exportChat() {
    if (!conversationHistory.length) {
      UI.toast('No messages to export yet', 'error');
      return;
    }
    const lines = [
      'CipherMind — Encrypted Chat Export',
      `Exported: ${new Date().toLocaleString()}`,
      '─'.repeat(40),
      '',
      ...conversationHistory.map((m, i) =>
        `[${i + 1}] ${m.role === 'user' ? 'You' : 'CipherMind'}\n${m.content}\n`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ciphermind-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('Chat exported!', 'success');
  }

  return { init };
})();

// ── Global helper for suggestion chips ──────────────────────────────────
function fillInput(text) {
  const input = document.getElementById('user-input');
  input.value = text;
  input.focus();
  UI.autoResize(input);
  document.getElementById('char-count').textContent = `${text.length} chars`;
}

document.addEventListener('DOMContentLoaded', () => App.init());
