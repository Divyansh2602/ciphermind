const CONFIG = {
  BACKEND_URL: window.location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://your-app.onrender.com',

  // Fallback: call Groq directly from browser (requires API key in UI)
  GROQ_DIRECT_URL: 'https://api.groq.com/openai/v1/chat/completions',
};

window.CONFIG = CONFIG;
