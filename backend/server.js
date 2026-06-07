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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['POST', 'GET'],
}));

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

app.post('/api/image', async (req, res) => {
  const { prompt } = req.body;
  const HF_KEY = process.env.HF_API_KEY;

  const response = await fetch(
    'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!response.ok) {
    return res.status(500).json({ error: 'Image generation failed' });
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  res.json({ image: `data:image/jpeg;base64,${base64}` });
});