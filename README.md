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
- 🌅 **Silk Aurora sidebar** — an animated WebGL backdrop behind the chat list

## Silk Aurora (sidebar backdrop)

`src/js/silk-aurora.js` renders the sidebar's background: a WebGL shader of
drifting silk ribbons in the "Champagne" palette. It's a vanilla port of the
Silk Aurora component from componentry.dev — the original is a React client
component on Next.js/Tailwind/shadcn, so the GLSL is carried over verbatim and
the React lifecycle is rewritten against the DOM.

Three things differ from the original, deliberately:

- **It pauses.** The loop stops when the tab is hidden and when the panel is
  collapsed or slid off-screen. The original runs five octaves of fbm per
  fragment every frame forever, which on a persistent chat sidebar is real
  battery spend on pixels nobody is looking at. Device pixel ratio is capped
  at 2 for the same reason.
- **It has a scrim, and the scrim is measured.** The shader's sheen peaks near
  white and a sidebar is twenty lines of 13px text, not a three-word hero
  headline. Without it the chat list is unreadable wherever a ribbon crosses.
  The scrim is tuned to the brightest point the shader actually produces:
  primary text lands at 5.9:1 and muted text at 4.9:1, both clear of WCAG AA.
  Lighten `#sidebar.has-aurora::after` and that headroom is what you spend.
- **The panel carries its own tokens.** The aurora is dark in both themes, so
  text, border and fill variables are overridden inside the sidebar — including
  the `--clay-*` fills, which are near-white in light mode and otherwise put a
  white account row at the foot of a black panel.

If WebGL is unavailable the canvas removes itself and the sidebar falls back to
its normal themed background, rather than sitting behind a dead black rectangle.
Context loss is handled, which a canvas alive for hours will eventually hit.

## Liquid glass

The glass material is still in `src/js/liquid-glass.js`, but it **stands down
while the aurora is mounted** — an opaque canvas across the panel hides any
backdrop-filter beneath it, and a displacement filter nobody can see still costs
a full re-filter on every repaint. Remove the aurora and the glass takes over
again automatically.

It frosts and tints the page behind the panel and — in Chromium — bends the live
page through an SVG displacement map with chromatic aberration at the edges.

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
