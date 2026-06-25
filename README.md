# Almail AI

A clean, fast, sleek AI chatbot — vanilla HTML/CSS/JS with Firebase (Auth +
Firestore) and the Mistral AI API. Liquid-glass monochrome UI with dark/light
themes, a collapsible multi-chat sidebar, and streaming replies.

![Almail AI](Almail%20AI%20Logo.png)

## Features

- 💬 **Streaming replies** — answers stream in token-by-token, with a **Stop** button
- 🗂️ **Multi-chat sidebar** — create, rename, pin, search, export, and delete chats
- 📁 **Projects** — group chats into projects (create, rename, delete, move chats in/out)
- 👻 **Temporary chat** — an in-memory chat that's never saved or shown in history
- 🎛️ **Personalization** — custom instructions + creativity (temperature) level
- 🎤 **Voice input** & 🔊 **read-aloud** replies (Web Speech APIs)
- ⌨️ **Keyboard shortcuts** with a help overlay (`?`)
- 🎨 **Liquid-glass UI** — dark / light themes, responsive, swipe gestures, ambient orbs
- ✨ **First-run experience** — splash screen, welcome tour, personalized greeting
- 🧠 **Rich Markdown** — tables, lists, links, and **syntax-highlighted** code
- 📋 **Copy / regenerate / edit & resubmit** messages
- 📎 **Attachments** — text files (read into context), images, drag-drop & paste
- 📡 **Offline detection** + **retry** on failed replies
- 🛡️ **Sanitized output** (DOMPurify) to prevent HTML/script injection
- ☁️ **Synced history** — messages persist per-user in Firestore
- 📱 **Installable** (PWA web manifest)

## Files

```
index.html      # Markup + library includes
style.css       # Theme tokens + all styling
config.js       # AI key / model / persona (isolated)
firebase.js     # Firebase init (Auth + Firestore)
chat.js         # App logic: chats, auth, rendering, streaming
manifest.json   # PWA manifest (installable)
```

## Running locally

ES modules must be served over HTTP (opening the file via `file://` won't work):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or:  npx serve .
```

## Configuration

- **AI** (key, model, persona, history length) → [`config.js`](config.js)
- **Firebase** project → [`firebase.js`](firebase.js)

## ⚠️ Security: the Mistral API key

Because this is a 100% client-side app, the Mistral key in `config.js` is
**visible to anyone** who opens the site and can be abused. This is fine for
local/personal use, but **before deploying publicly**:

1. Move the AI call behind a small **serverless proxy** (Cloud Function,
   Vercel/Netlify function) that keeps the key server-side.
2. Have the browser call *your* proxy instead of `api.mistral.ai` directly.
3. Rotate the key if it has been committed publicly.

> The Firebase web config in `firebase.js` is **not** a secret — it's meant to
> be public; access is controlled by your Firestore security rules.

### Suggested Firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
