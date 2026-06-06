/**
 * CipherMind — Frontend App
 * Features: Streaming, File Upload, Mobile Sidebar, Crypto
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

    // ── File Upload ────────────────────────────────────────────────────
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    let attachedFile = null;
    let attachedFileContent = '';
    let attachedFileName = '';

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        UI.toast('File too large. Max 5MB.', 'error');
        return;
      }

      attachedFileName = file.name;
      UI.toast(`Reading ${file.name}...`, 'info');

      try {
        if (file.type === 'application/pdf') {
          attachedFileContent = await extractPDF(file);
        } else if (file.type.startsWith('image/')) {
          attachedFileContent = await extractImage(file);
        } else {
          attachedFileContent = await extractText(file);
        }

        attachedFile = file;
        uploadBtn.classList.add('has-file');
        showFilePreview(attachedFileName);
        UI.toast(`✅ ${file.name} ready`, 'success');
      } catch (e) {
        UI.toast('Could not read file: ' + e.message, 'error');
      }

      fileInput.value = '';
    });

    function showFilePreview(name) {
      removeFilePreview();
      const preview = document.createElement('div');
      preview.className = 'file-preview';
      preview.id = 'file-preview';
      preview.innerHTML = `
        <span>📎</span>
        <span class="file-preview-name">${name}</span>
        <button class="file-preview-remove" id="remove-file">✕</button>
      `;
      document.querySelector('.input-zone').insertBefore(
        preview,
        document.querySelector('.enc-live')
      );
      document.getElementById('remove-file').addEventListener('click', clearFile);
    }

    function removeFilePreview() {
      const existing = document.getElementById('file-preview');
      if (existing) existing.remove();
    }

    function clearFile() {
      attachedFile = null;
      attachedFileContent = '';
      attachedFileName = '';
      uploadBtn.classList.remove('has-file');
      removeFilePreview();
    }

    // Expose to sendMessage scope
    window._clearFile = clearFile;
    window._getFileContent = () => ({
      content: attachedFileContent,
      name: attachedFileName,
      hasFile: !!attachedFile,
      type: attachedFile?.type
    });
  }

  // ── Send Message ──────────────────────────────────────────────────────
  async function sendMessage() {
    if (!apiKey) {
      UI.toast('Enter your Groq API key first', 'error');
      return;
    }

    const input = document.getElementById('user-input');
    const rawText = input.value.trim();
    const fileInfo = window._getFileContent ? window._getFileContent() : { hasFile: false };

    if (!rawText && !fileInfo.hasFile) return;
    if (!rawText && fileInfo.hasFile) {
      UI.toast('Add a message about the file', 'info');
      return;
    }

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
      encResult = await CryptoEngine.encrypt(rawText);
      UI.bumpStat('enc');
    } catch (e) {
      UI.toast('Encryption error: ' + e.message, 'error');
      isSending = false;
      document.getElementById('send-btn').classList.remove('sending');
      return;
    }

    const plaintextHash = await CryptoEngine.sha256(rawText);

    // Render user message (show filename if file attached)
    UI.renderMessage({
      role: 'user',
      text: fileInfo.hasFile ? `📎 ${fileInfo.name}\n\n${rawText}` : rawText,
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

    // Build message content with file context
    let messageContent = rawText;
    if (fileInfo.hasFile) {
      if (fileInfo.type?.startsWith('image/')) {
        messageContent = `[Image attached: ${fileInfo.name}]\n\nUser says: ${rawText}`;
      } else {
        messageContent = `[File attached: ${fileInfo.name}]\n\nFile contents:\n\`\`\`\n${fileInfo.content.substring(0, 8000)}\n\`\`\`\n\nUser question: ${rawText}`;
      }
      window._clearFile?.();
    }

    conversationHistory.push({ role: 'user', content: messageContent });

    // Show thinking indicator
    const thinking = UI.renderThinking();

    // Call API
    let aiText = '';
    try {
      const result = await callAPI(conversationHistory);
      const t1 = Date.now();

      if (result instanceof Response) {
        // ── Streaming response ──────────────────────────────────────────
        thinking.stop();
        UI.removeThinking();

        const streamDiv = UI.renderStreamingMessage();
        const reader = result.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices[0]?.delta?.content || '';
              if (token) {
                aiText += token;
                UI.appendStreamToken(streamDiv, token);
              }
              const totalTokens = parsed.x_groq?.usage?.completion_tokens;
              if (totalTokens) UI.bumpStat('tokens', totalTokens);
            } catch {}
          }
        }

        const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
        document.getElementById('speed-badge').textContent = `⚡ ${elapsed}s`;

      } else {
        // ── Non-streaming fallback ──────────────────────────────────────
        aiText = result.choices[0]?.message?.content || 'No response.';
        UI.bumpStat('tokens', result.usage?.total_tokens || 1);
        const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
        document.getElementById('speed-badge').textContent = `⚡ ${elapsed}s`;
        thinking.stop();
        UI.removeThinking();
        UI.renderMessage({ role: 'ai', text: aiText, cipherHex: null, fullData: null });
      }

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

    // Encrypt AI response for stats/display
    try {
      await CryptoEngine.encrypt(aiText);
      UI.bumpStat('enc');
      UI.bumpStat('dec');
      UI.bumpStat('hmac');
    } catch {}

    conversationHistory.push({ role: 'assistant', content: aiText });

    isSending = false;
    document.getElementById('send-btn').classList.remove('sending');
  }

  // ── API Call ──────────────────────────────────────────────────────────
  async function callAPI(messages) {
    // Backend proxy mode
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

    // Direct Groq mode with streaming
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
        stream: true,
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

    return res; // Return raw Response for streaming
  }

  // ── File Extractors ───────────────────────────────────────────────────
  function extractText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  function extractImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  }

  async function extractPDF(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';

    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }

    return text.trim() || 'Could not extract text from this PDF.';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
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

// ── Global helper for suggestion chips ───────────────────────────────────
function fillInput(text) {
  const input = document.getElementById('user-input');
  input.value = text;
  input.focus();
  UI.autoResize(input);
  document.getElementById('char-count').textContent = `${text.length} chars`;
}

document.addEventListener('DOMContentLoaded', () => App.init());

// ── Mobile Sidebar Toggle ─────────────────────────────────────────────────
(function () {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!toggle || !sidebar || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  toggle.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  document.getElementById('set-key-btn')?.addEventListener('click', () => {
    if (window.innerWidth < 600) closeSidebar();
  });
})();