/**
 * CipherMind — Frontend App
 * Features: Streaming, File Upload, Vision AI, Chat History, Image Generation, Mobile Sidebar
 */

const App = (() => {
  let apiKey = '';
  let selectedModel = 'llama-3.3-70b-versatile';
  let conversationHistory = [];
  let isSending = false;

  // ── Chat History State ─────────────────────────────────────────────────
  let currentChatId = null;
  const STORAGE_KEY = 'ciphermind_chats';

  function generateId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  function getAllChats() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveAllChats(chats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }

  function saveCurrentChat() {
    if (!currentChatId || !conversationHistory.length) return;
    const chats = getAllChats();
    const idx = chats.findIndex(c => c.id === currentChatId);
    const rawTitle = conversationHistory[0]?.content || 'New Chat';
    const title = rawTitle.substring(0, 36) + (rawTitle.length > 36 ? '...' : '');
    const chatData = {
      id: currentChatId,
      title,
      updatedAt: new Date().toISOString(),
      messages: conversationHistory
    };
    if (idx >= 0) chats[idx] = chatData;
    else chats.unshift(chatData);
    saveAllChats(chats);
    renderChatList();
  }

  function startNewChat() {
    currentChatId = generateId();
    conversationHistory = [];
    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('welcome').style.display = '';
    document.getElementById('speed-badge').textContent = '—';
    renderChatList();
    UI.toast('New chat started', 'info');
  }

  function loadChat(id) {
    const chats = getAllChats();
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    currentChatId = id;
    conversationHistory = chat.messages || [];
    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('welcome').style.display = 'none';
    conversationHistory.forEach(msg => {
      UI.renderMessage({
        role: msg.role === 'user' ? 'user' : 'ai',
        text: msg.content,
        cipherHex: null,
        fullData: null
      });
    });
    renderChatList();
    UI.toast(`Loaded: ${chat.title}`, 'info');
    setTimeout(() => {
      const area = document.getElementById('messages-area');
      area.scrollTop = area.scrollHeight;
    }, 100);
  }

  function deleteChat(id) {
    const chats = getAllChats().filter(c => c.id !== id);
    saveAllChats(chats);
    if (id === currentChatId) startNewChat();
    else renderChatList();
    UI.toast('Chat deleted', 'info');
  }

  function renderChatList() {
    const list = document.getElementById('chat-list');
    const empty = document.getElementById('chat-list-empty');
    const chats = getAllChats();
    list.querySelectorAll('.chat-item').forEach(el => el.remove());
    if (chats.length === 0) { empty.style.display = ''; return; }
    empty.style.display = 'none';
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-item ${chat.id === currentChatId ? 'active' : ''}`;
      const date = new Date(chat.updatedAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      item.innerHTML = `
        <div class="chat-item-info">
          <div class="chat-item-title">${escapeHtmlLocal(chat.title)}</div>
          <div class="chat-item-date">${dateStr}</div>
        </div>
        <button class="chat-item-delete" data-id="${chat.id}" title="Delete">✕</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.chat-item-delete')) return;
        loadChat(chat.id);
        if (window.innerWidth < 600) {
          document.getElementById('sidebar').classList.remove('open');
          document.getElementById('sidebar-overlay').classList.remove('show');
          document.body.style.overflow = '';
        }
      });
      item.querySelector('.chat-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteChat(chat.id);
      });
      list.appendChild(item);
    });
  }

  // ── Image Generation ──────────────────────────────────────────────────
  const IMAGE_KEYWORDS = [
    'draw ', 'draw a ', 'draw an ',
    'generate image', 'generate a image', 'generate an image',
    'create image', 'create a image', 'create an image',
    'make image', 'make a image', 'make an image',
    'generate picture', 'generate a picture', 'generate the picture',
    'create picture', 'create a picture',
    'make picture', 'make a picture',
    'generate art', 'create art', 'make art',
    'paint a', 'paint an', 'paint the',
    'illustrate', 'sketch a', 'sketch an',
    'show me a picture', 'show me an image',
    'image of', 'picture of', 'photo of',
    'generate a photo', 'create a photo'
  ];

  function isImageRequest(text) {
    const lower = text.toLowerCase().trim();
    return IMAGE_KEYWORDS.some(kw => lower.startsWith(kw) || lower.includes(kw));
  }

  function extractImagePrompt(text) {
    const lower = text.toLowerCase().trim();
    const triggers = [
      'draw a ', 'draw an ', 'draw ',
      'generate an image of ', 'generate a image of ', 'generate image of ',
      'generate an image ', 'generate a image ', 'generate image ',
      'create an image of ', 'create a image of ', 'create image of ',
      'create an image ', 'create a image ', 'create image ',
      'make an image of ', 'make a image of ', 'make image of ',
      'make an image ', 'make a image ', 'make image ',
      'generate a picture of ', 'generate a picture ',
      'create a picture of ', 'create a picture ',
      'make a picture of ', 'make a picture ',
      'generate art of ', 'create art of ', 'make art of ',
      'paint a ', 'paint an ', 'paint ',
      'illustrate ', 'sketch a ', 'sketch an ', 'sketch ',
      'show me a picture of ', 'show me an image of ',
      'generate a photo of ', 'create a photo of ',
      'photo of ', 'image of ', 'picture of '
    ];
    for (const trigger of triggers) {
      if (lower.startsWith(trigger)) {
        return text.substring(trigger.length).trim();
      }
    }
    return text;
  }

  async function generateAndShowImage(prompt, containerDiv) {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'img-loading';
    loadingEl.innerHTML = `<div class="img-loading-spinner"></div><span>Generating image...</span>`;
    containerDiv.appendChild(loadingEl);
    document.getElementById('messages-area').scrollTop =
      document.getElementById('messages-area').scrollHeight;

    try {
      const encodedPrompt = encodeURIComponent(prompt + ', high quality, detailed');
      const seed = Math.floor(Math.random() * 99999);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${seed}&nologo=true`;

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
        setTimeout(reject, 30000);
      });

      loadingEl.remove();
      const wrap = document.createElement('div');
      wrap.className = 'msg-image-wrap';
      wrap.innerHTML = `
        <div class="msg-image-label">🎨 Generated image</div>
        <img src="${imageUrl}" alt="${escapeHtmlLocal(prompt)}" onclick="window.open('${imageUrl}', '_blank')" />
        <a class="img-download-btn" href="${imageUrl}" download="ciphermind-image.jpg" target="_blank">↓ Download</a>
      `;
      containerDiv.appendChild(wrap);
      document.getElementById('messages-area').scrollTop =
        document.getElementById('messages-area').scrollHeight;
    } catch (e) {
      loadingEl.remove();
      const errEl = document.createElement('div');
      errEl.style.cssText = 'font-size:13px;color:var(--red);margin-top:8px;';
      errEl.textContent = '⚠️ Image generation failed. Try again.';
      containerDiv.appendChild(errEl);
    }
  }

  // ── Vision Message Builders ───────────────────────────────────────────
  function buildVisionMessages(userText, base64, mimeType) {
    return [
      {
        role: 'system',
        content: `You are CipherMind, a smart AI assistant with vision capabilities inside an encrypted chat app.
Analyze images thoroughly — describe text, tables, charts, diagrams, people, objects, colors, and any visual content you see.
Be detailed and helpful.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` }
          },
          {
            type: 'text',
            text: userText || 'Please analyze this image in detail. Describe everything you see including any text, tables, charts, and visual elements.'
          }
        ]
      }
    ];
  }

  function buildPdfVisionMessages(userText, pageImages) {
    const content = [];
    pageImages.forEach((base64, idx) => {
      content.push({ type: 'text', text: `Page ${idx + 1}:` });
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64}` }
      });
    });
    content.push({
      type: 'text',
      text: userText || 'Please analyze this PDF. Extract all text, describe tables with data, explain charts and diagrams.'
    });
    return [
      {
        role: 'system',
        content: `You are CipherMind, a smart AI assistant with vision capabilities.
Analyze PDF pages thoroughly — extract all text, describe tables, explain charts and diagrams. Be comprehensive and accurate.`
      },
      { role: 'user', content }
    ];
  }

  // ── Init ────────────────────────────────────────────────────────────────
  async function init() {
    UI.runBootSequence(async () => {
      const app = document.getElementById('app');
      app.classList.remove('hidden');

      try {
        const keyInfo = await CryptoEngine.init();
        document.getElementById('session-key-display').textContent = keyInfo.keyFingerprint;
        UI.toast('🔐 Session keys generated!', 'success');
      } catch (e) {
        UI.toast('Crypto init failed: ' + e.message, 'error');
      }

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

      startNewChat();
      renderChatList();
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
    const newChatBtn = document.getElementById('new-chat-btn');

    newChatBtn.addEventListener('click', startNewChat);

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

    modelSelect.addEventListener('change', () => {
      selectedModel = modelSelect.value;
      UI.toast(`Model: ${modelSelect.options[modelSelect.selectedIndex].text.split('—')[0].trim()}`, 'info');
    });

    input.addEventListener('input', async () => {
      UI.autoResize(input);
      document.getElementById('char-count').textContent = `${input.value.length} chars`;
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

    clearBtn.addEventListener('click', startNewChat);
    exportBtn.addEventListener('click', exportChat);
    drawerClose.addEventListener('click', () => {
      document.getElementById('app').classList.remove('drawer-open');
    });

    // ── File Upload ────────────────────────────────────────────────────
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const filePreview = document.getElementById('file-preview');
    const filePreviewName = document.getElementById('file-preview-name');
    const removeFileBtn = document.getElementById('remove-file');

    let attachedFile = null;
    let attachedFileContent = '';
    let attachedFileName = '';
    let attachedFileType = '';
    let attachedBase64 = null;
    let attachedPdfImages = null;

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        UI.toast('File too large — max 10MB', 'error');
        fileInput.value = '';
        return;
      }
      UI.toast(`Reading ${file.name}...`, 'info');
      try {
        let content = '';
        let base64 = null;
        let pdfImages = null;

        if (file.type === 'application/pdf') {
          UI.toast('Converting PDF pages for vision analysis...', 'info');
          const result = await extractPDFAsImages(file);
          pdfImages = result.images;
          content = result.text;
        } else if (file.type.startsWith('image/')) {
          base64 = await extractImageBase64(file);
          content = '[Image file]';
        } else {
          content = await extractText(file);
        }

        attachedFile = file;
        attachedFileContent = content;
        attachedFileName = file.name;
        attachedFileType = file.type;
        attachedBase64 = base64;
        attachedPdfImages = pdfImages;

        filePreviewName.textContent = file.name;
        filePreview.style.display = 'flex';
        uploadBtn.classList.add('has-file');
        UI.toast(`✅ ${file.name} ready for analysis`, 'success');
      } catch (e) {
        UI.toast('Could not read file: ' + e.message, 'error');
      }
      fileInput.value = '';
    });

    removeFileBtn.addEventListener('click', clearAttachment);

    function clearAttachment() {
      attachedFile = null;
      attachedFileContent = '';
      attachedFileName = '';
      attachedFileType = '';
      attachedBase64 = null;
      attachedPdfImages = null;
      filePreview.style.display = 'none';
      filePreviewName.textContent = '';
      uploadBtn.classList.remove('has-file');
    }

    window._clearFile = clearAttachment;
    window._getFileContent = () => ({
      content: attachedFileContent,
      name: attachedFileName,
      hasFile: !!attachedFile,
      type: attachedFileType,
      base64: attachedBase64,
      pdfImages: attachedPdfImages
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
    UI.animatePipeline(4000);

    // ── Image generation check FIRST ─────────────────────────────────
    if (!fileInfo.hasFile && isImageRequest(rawText)) {
      const imagePrompt = extractImagePrompt(rawText);
      UI.toast('🎨 Generating image...', 'info');

      // Encrypt for display
      let encResult;
      try {
        encResult = await CryptoEngine.encrypt(rawText);
        UI.bumpStat('enc');
      } catch {}

      UI.renderMessage({
        role: 'user',
        text: rawText,
        cipherHex: encResult?.cipherHex || null,
        fullData: null
      });

      // AI message container
      const imgMsgDiv = document.createElement('div');
      imgMsgDiv.className = 'message ai';
      imgMsgDiv.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-name">CipherMind</span>
            <span class="msg-time">${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
          </div>
          <div class="msg-bubble" id="img-bubble-content">
            <span style="font-size:13px;color:var(--text-3);">Here's your image for: <em>${escapeHtmlLocal(imagePrompt)}</em></span>
          </div>
        </div>
      `;
      document.getElementById('messages-list').appendChild(imgMsgDiv);
      document.getElementById('welcome').style.display = 'none';

      await generateAndShowImage(imagePrompt, imgMsgDiv.querySelector('#img-bubble-content'));

      conversationHistory.push({ role: 'user', content: rawText });
      conversationHistory.push({ role: 'assistant', content: `Generated image for: "${imagePrompt}"` });
      saveCurrentChat();

      isSending = false;
      document.getElementById('send-btn').classList.remove('sending');
      return;
    }

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

    // Build message content
    let messageContent = rawText;
    let visionMessages = null;

    if (fileInfo.hasFile) {
      if (fileInfo.type?.startsWith('image/') && fileInfo.base64) {
        visionMessages = buildVisionMessages(rawText, fileInfo.base64, fileInfo.type);
      } else if (fileInfo.type === 'application/pdf' && fileInfo.pdfImages?.length > 0) {
        visionMessages = buildPdfVisionMessages(rawText, fileInfo.pdfImages);
      } else {
        messageContent = `[File: ${fileInfo.name}]\n\nContents:\n\`\`\`\n${fileInfo.content.substring(0, 8000)}\n\`\`\`\n\nQuestion: ${rawText}`;
      }
      window._clearFile?.();
    }

    if (!visionMessages) {
      conversationHistory.push({ role: 'user', content: messageContent });
    }

    const thinking = UI.renderThinking();
    let aiText = '';

    try {
      const result = await callAPI(conversationHistory, { vision: !!visionMessages, visionMessages });
      const t1 = Date.now();

      if (result instanceof Response) {
        // Streaming
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
              if (token) { aiText += token; UI.appendStreamToken(streamDiv, token); }
              const totalTokens = parsed.x_groq?.usage?.completion_tokens;
              if (totalTokens) UI.bumpStat('tokens', totalTokens);
            } catch {}
          }
        }
        document.getElementById('speed-badge').textContent = `⚡ ${((Date.now() - t1) / 1000).toFixed(1)}s`;

      } else {
        // Non-streaming (vision)
        aiText = result.choices[0]?.message?.content || 'No response.';
        UI.bumpStat('tokens', result.usage?.total_tokens || 1);
        document.getElementById('speed-badge').textContent = `⚡ ${((Date.now() - t1) / 1000).toFixed(1)}s`;
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

    try {
      await CryptoEngine.encrypt(aiText);
      UI.bumpStat('enc');
      UI.bumpStat('dec');
      UI.bumpStat('hmac');
    } catch {}

    if (visionMessages) {
      conversationHistory.push({ role: 'user', content: rawText + ' [file attached]' });
    }
    conversationHistory.push({ role: 'assistant', content: aiText });
    saveCurrentChat();

    isSending = false;
    document.getElementById('send-btn').classList.remove('sending');
  }

  // ── API Call ──────────────────────────────────────────────────────────
  async function callAPI(messages, options = {}) {
    const { vision = false, visionMessages = null } = options;

    if (CONFIG.BACKEND_URL) {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: visionMessages || messages,
          model: vision ? 'meta-llama/llama-4-scout-17b-16e-instruct' : selectedModel,
          vision
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      return res.json();
    }

    const SYSTEM = `You are CipherMind, a smart and friendly AI assistant inside an encrypted chat app.
Be warm, conversational, and genuinely helpful. Format code clearly. Keep answers focused.
When analyzing files or images, be thorough — describe text, tables, charts, diagrams, and visual elements.`;

    const model = vision ? 'meta-llama/llama-4-scout-17b-16e-instruct' : selectedModel;
    const useStream = !vision;

    const messagesToSend = visionMessages || [
      { role: 'system', content: SYSTEM },
      ...messages
    ];

    const res = await fetch(CONFIG.GROQ_DIRECT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        stream: useStream,
        messages: messagesToSend,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    return useStream ? res : res.json();
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

  function extractImageBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  }

  async function extractPDFAsImages(file) {
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images = [];
    let textFallback = '';
    const pagesToProcess = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      const textContent = await page.getTextContent();
      textFallback += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return { images, text: textFallback.trim() };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ── Export ────────────────────────────────────────────────────────────
  function exportChat() {
    if (!conversationHistory.length) { UI.toast('No messages to export yet', 'error'); return; }
    const lines = [
      'CipherMind — Encrypted Chat Export',
      `Exported: ${new Date().toLocaleString()}`,
      '─'.repeat(40), '',
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

  // ── Helpers ───────────────────────────────────────────────────────────
  function escapeHtmlLocal(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();

// ── Global helpers ────────────────────────────────────────────────────────
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