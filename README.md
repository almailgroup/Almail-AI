# Almail AI

A clean, fast, sleek AI chatbot — vanilla HTML/CSS/JS with Firebase (Auth +
Firestore) and Google's Gemini API (via a Cloudflare Worker proxy). Liquid-glass
monochrome UI with dark/light themes, a collapsible multi-chat sidebar, and
streaming replies.

![Almail AI](assets/images/AlmailAIWhite.png)

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
- 🧠 **Rich Markdown** — tables, lists, links, **syntax-highlighted** code, and LaTeX math
- 📋 **Copy / regenerate / edit & resubmit** messages
- 📎 **Attachments** — text files (read into context), images, drag-drop & paste
- 📡 **Offline detection** + **retry** on failed replies
- 🛡️ **Sanitized output** (DOMPurify) to prevent HTML/script injection
- ☁️ **Synced history** — messages *and* the chat list persist per-user in
  Firestore, so history follows you across devices
- 🏷️ **Generated chat titles** — the model names each conversation after the
  first exchange
- 🗂️ **Date-grouped sidebar** — Today / Yesterday / Previous 7 days / …
- 📱 **Installable** (PWA web manifest)

## Project structure

```
index.html              # Markup + library includes (entry point)
manifest.json           # PWA manifest (installable)
src/
  css/
    style.css           # Theme tokens + all styling
  js/
    config.js           # AI key / model / persona (isolated)
    firebase.js         # Firebase init (Auth + Firestore)
    chat.js             # App logic: chats, auth, rendering, streaming
assets/
  images/
    AlmailAIWhite.png   # Brand logo (dark backgrounds)
    AlmailAIBlack.png   # Brand logo (light backgrounds)
cloudflare-worker/       # Gemini proxy — keeps the real API key server-side
  src/index.js
  wrangler.toml
  README.md             # Deployment steps
```

This is a static, build-free app — `index.html` and `manifest.json` stay at
the repo root so it can be served as-is by any static host (GitHub Pages,
Netlify, Vercel, etc.), while source and assets are organized under `src/`
and `assets/`.

## Running locally

ES modules must be served over HTTP (opening the file via `file://` won't work):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or:  npx serve .
```

## Configuration

- **AI** (model, persona, history length, Worker endpoint) → [`src/js/config.js`](src/js/config.js)
- **Firebase** project → [`src/js/firebase.js`](src/js/firebase.js)
- **Gemini proxy** (Cloudflare Worker) → [`cloudflare-worker/`](cloudflare-worker/README.md)

## AI: Gemini via a Cloudflare Worker proxy

Almail AI talks to a single model — Google's Gemini — through a small
Cloudflare Worker (in [`cloudflare-worker/`](cloudflare-worker/README.md))
instead of calling Google directly. The real Gemini API key lives server-side
as a Worker secret and is never shipped to the browser; `config.js` only
holds the Worker's URL and a lightweight shared secret the Worker checks
before forwarding a request. See
[`cloudflare-worker/README.md`](cloudflare-worker/README.md) for the full
deploy steps.

> The Firebase web config in `firebase.js` is **not** a secret — it's meant to
> be public; access is controlled by your Firestore security rules.

### Suggested Firestore rules

Each user owns everything under their own `users/{userId}` document, and
nothing else. The recursive wildcard covers both subcollections the app
uses — `messages` (the conversation contents) and `chats` (the conversation
list, which is what makes history appear on a second device).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

> **Upgrading:** if your project still has rules that name `messages`
> explicitly, the chat list can't sync until you widen them as above.
> The app degrades quietly in that case — history stays per-device and the
> browser console logs `Chat list sync unavailable` — so it's worth
> checking after deploying.
