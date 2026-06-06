require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['POST', 'GET'],
}));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'CipherMind backend running', timestamp: new Date().toISOString() });
});

// Main chat proxy endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server' });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const SYSTEM_PROMPT = `You are CipherMind, a smart and friendly AI assistant inside an encrypted chat app powered by Groq.
Be helpful, warm, and conversational. When relevant, you can mention that the chat uses AES-256-GCM encryption.
Answer clearly and concisely. For code, format it properly.`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json();
      return res.status(groqRes.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await groqRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ CipherMind backend running on port ${PORT}`);
});
