/**
 * CipherMind Backend — Groq API Proxy
 * Deploy on Render (render.com) — free tier
 *
 * Supports:
 *  - Text chat (streaming)
 *  - Vision analysis (images, PDFs)
 *  - Image generation detection
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['POST', 'GET'],
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests — please wait a few minutes.'
    });
  }
});

app.use('/api/', limiter);

const SYSTEM_PROMPT = `You are CipherMind, a smart and friendly AI assistant inside an encrypted chat app powered by Groq.
Be helpful, warm, and conversational. When relevant, mention that the chat uses AES-256-GCM encryption.
Answer clearly and concisely. For code, format it properly.
When analyzing files or images, be thorough — describe text, tables, charts, diagrams, and visual elements.`;

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'CipherMind backend running',
    timestamp: new Date().toISOString()
  });
});

// Rate limit status endpoint
app.get('/api/status', limiter, (req, res) => {
  const remaining = res.getHeader('RateLimit-Remaining') ?? 50;
  const reset = res.getHeader('RateLimit-Reset');
  const resetTime = reset
    ? new Date(reset * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  res.json({
    remaining: Number(remaining),
    limit: 50,
    resetTime
  });
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  const { messages, model, vision } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    // Vision requests have system prompt built into messages already
    // Text requests need system prompt prepended
    const isVision = vision || (model && model.includes('llama-4'));

    const finalMessages = isVision
      ? messages
      : [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    const finalModel = model || 'llama-3.3-70b-versatile';

    // Vision requests don't stream — more reliable for multimodal
    const shouldStream = !isVision;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: finalModel,
        max_tokens: 2048,
        stream: shouldStream,
        messages: finalMessages,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json();
      return res.status(groqRes.status).json({
        error: err.error?.message || 'Groq API error'
      });
    }

    if (shouldStream) {
      // Stream the response directly to frontend
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = groqRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();

    } else {
      // Return full JSON for vision responses
      const data = await groqRes.json();
      res.json(data);
    }

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ CipherMind backend running on port ${PORT}`);
});

// ── Keep Render warm ──────────────────────────────────────────────────────
const BACKEND_URL = process.env.RENDER_EXTERNAL_URL || null;

if (BACKEND_URL) {
  setInterval(async () => {
    try {
      await fetch(`${BACKEND_URL}/`);
      console.log('🏓 Keep-alive ping sent');
    } catch (e) {
      console.log('⚠️ Keep-alive ping failed:', e.message);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}