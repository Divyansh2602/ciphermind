# 🔐 CipherMind — Encrypted AI Chatbot

A modern, human-feeling AI chatbot with real end-to-end encryption.
Powered by **Groq's free API** (Llama 3.3, Mixtral, Gemma2).

```
ciphermind/
├── frontend/    → Deploy on Vercel (free)
└── backend/     → Deploy on Render (free)
```

---

## ⚡ Quickest way to run locally (no install)

```
1. Open the "frontend" folder
2. Double-click index.html in Chrome or Firefox
3. Enter your Groq key → click Connect
4. Start chatting!
```

---

## 🔑 Get Your FREE Groq API Key

1. Go to **https://console.groq.com**
2. Sign up — no credit card needed
3. API Keys → Create API Key
4. Copy the key (starts with `gsk_`)
5. Paste into CipherMind's Connect bar

**Free tier:** 14,400 requests/day on Llama 3.3 70B ✅

---

## 🚀 Deploy on Vercel + Render (fully free)

### Step 1 — Deploy Backend on Render

1. Go to **render.com** → sign up free
2. New → Web Service → connect your GitHub repo
3. Select the `backend` folder as root
4. Set environment variables:
   - `GROQ_API_KEY` → your gsk_ key
   - `FRONTEND_URL` → your Vercel URL (add after step 2)
5. Click Deploy
6. Copy your Render URL (e.g. `https://ciphermind-backend.onrender.com`)

### Step 2 — Deploy Frontend on Vercel

1. Go to **vercel.com** → sign up free
2. New Project → import your GitHub repo
3. Set root directory to `frontend`
4. Click Deploy
5. Copy your Vercel URL (e.g. `https://ciphermind.vercel.app`)

### Step 3 — Connect them

In `frontend/src/config.js`, update:
```js
BACKEND_URL: 'https://ciphermind-backend.onrender.com',
```

Re-deploy frontend. Done! The API key is now secured on the backend — users don't need to enter it.

---

## 🏃 Run Locally With Backend

```bash
# Terminal 1 — Backend
cd backend
npm install
cp .env.example .env        # fill in GROQ_API_KEY
node server.js              # runs on port 3001

# Terminal 2 — Frontend
cd frontend
# Edit src/config.js: BACKEND_URL: 'http://localhost:3001'
# Open index.html in browser (or use live server)
```

---

## 🔐 Crypto Stack

| Layer | Algorithm | Purpose |
|---|---|---|
| Key Derivation | PBKDF2 + SHA-512 (100k rounds) | Derive keys from passphrase |
| Encryption | AES-256-GCM | Confidentiality + auth tag |
| Integrity | HMAC-SHA-512 | Explicit tamper detection |
| Random | crypto.getRandomValues | Cryptographically secure IV/salt |

All crypto runs in **browser-native Web Crypto API** — zero dependencies, hardware-accelerated.

---

## 🎯 Key Features

- 🔐 AES-256-GCM encryption on every message
- 🛡 HMAC-SHA512 integrity verification
- ⚡ Groq LPU inference — ultra-fast responses  
- 🔬 Crypto Inspector — click any message to see IV, HMAC, ciphertext
- 📊 Live stats: encrypted count, tokens, HMAC checks
- 🔴 Live ciphertext preview as you type
- 📥 Export chat transcript
- 🧩 4 free Groq models to choose from

---

## 💬 Talking Points

> *"Every message is AES-256-GCM encrypted with a fresh random IV before leaving the browser. The backend never sees the keys — they're derived with PBKDF2 at 100,000 iterations and stored only in session memory. You can click any message bubble to inspect the real IV, HMAC signature, and ciphertext in the Crypto Inspector panel."*
