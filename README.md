# Almail AI

A clean, fast, sleek AI chatbot — vanilla HTML/CSS/JS with Firebase (Auth +
Firestore) and the Mistral AI API. Liquid-glass monochrome UI with dark/light
themes, a collapsible multi-chat sidebar, and streaming replies.

![Almail AI](Almail%20AI%20Logo.png)

## Features

- 💬 **Streaming replies** — answers stream in token-by-token, with a **Stop** button
- 🗂️ **Multi-chat sidebar** — create, rename, pin, and delete conversations
- 🎨 **Liquid-glass UI** — dark / light themes, responsive desktop + mobile, swipe gestures
- ✨ **Welcome suggestions** — prompt chips to get started fast
- 🧠 **Rich Markdown** — headings, lists, tables, links, and **syntax-highlighted** code
- 📋 **Copy & regenerate** — copy any message or code block; regenerate AI replies
- ✏️ **Edit & delete** your own messages
- 📎 **Attachments** — attach text files for the assistant to read
- 🛡️ **Sanitized output** (DOMPurify) to prevent HTML/script injection
- ☁️ **Synced history** — messages persist per-user in Firestore

## Files

```
index.html     # Markup + library includes
style.css      # Theme tokens + all styling
config.js      # AI key / model / persona (isolated)
firebase.js    # Firebase init (Auth + Firestore)
chat.js        # App logic: chats, auth, rendering, streaming
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
