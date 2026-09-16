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
- 🫧 **Liquid-glass sidebar** — a real refracting lens, not a flat blur

## Liquid glass

The sidebar is a glass material: it frosts and tints the page behind it and —
in Chromium — bends the live page through an SVG displacement map with
chromatic aberration at the edges.

`src/js/liquid-glass.js` is a from-scratch port of the SDF displacement-map
technique from [samasante/liquid-glass](https://github.com/samasante/liquid-glass)
(MIT, © 2026 Sam Asante). That library is React-only and this app has no build
step, so the technique is reimplemented in plain ES modules rather than added as
a dependency.

Three things worth knowing:

- **No specular.** The technique can bake a directional rim shine and a soft
  inner glow into the displacement map's blue channel, and layer a sheen over
  the panel in CSS. Both are switched off (`sheen: 0`, `glow: 0`, no
  `box-shadow`), because they read as a luminous haze this design doesn't want.
  The filter skips the specular pass entirely rather than running it as a
  no-op, and the panel is defined by its 1px border alone.
- **Bending the live page is Chromium-only.** `backdrop-filter: url()` ships in
  Chrome/Edge; Safari and Firefox support `backdrop-filter: blur()` but not
  `url()`, and a value they can't parse drops the *whole* declaration. So the
  engine is sniffed, biased toward a false negative, and those browsers get
  frost + saturate + tint instead.
- **Glass needs something behind it.** On a pure black or pure white ground
  there is nothing to refract, so the bend only shows where real content sits
  behind the panel — which today means mobile, where the sidebar overlays the
  conversation. An ambient gradient behind the panel would make it visible on
  desktop too, but it reads as a glow, so the ground stays flat.

The whole effect is additive — the `.glass` class is applied by JS, never in the
markup, so if the script fails to load the sidebar is simply the opaque flat
panel it was before.

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
