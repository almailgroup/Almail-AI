# Almail AI

A clean, fast, sleek AI chatbot — vanilla HTML/CSS/JS with Firebase (Auth +
Firestore) and Google's Gemini API (via a Cloudflare Worker proxy). One soft
surface, two zones — chat results and the conversation — with floating cards,
quick-action tiles and streaming replies.

![Almail AI](assets/images/AlmailAIWhite.png)

## Features

- 💬 **Streaming replies** — answers stream in token-by-token, with a **Stop** button
- 🗂️ **Multi-chat sidebar** — create, rename, pin, search, export, and delete chats
- 📁 **Projects** — group chats into projects (create, rename, delete, move chats in/out)
- 👻 **Temporary chat** — an in-memory chat that's never saved or shown in history
- 🎛️ **Personalization** — custom instructions + creativity (temperature) level
- 🎤 **Voice input** & 🔊 **read-aloud** replies (Web Speech APIs)
- ⌨️ **Keyboard shortcuts** with a help overlay (`?`)
- 🎨 **Dark / light themes** — responsive, swipe gestures
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
- 🛠️ **Workbench panel** — code from the reply gets a tabbed home on the right
- 🪶 **Aurora design system** — a lilac/mint mesh, white cards, one blue accent
- 🗂️ **Chat Results** — history as cards grouped by day, each with a one-tap open
- 🧰 **Quick-action tiles** — files, images, translate and voice, above the composer

## Design

The palette is five values: `#2684FC` blue, `#C3DCA8` green, `#DAD4E2` lilac,
white and black. Everything else is those, at an opacity.

The app is **one surface**, not a set of panels. A mesh of four placed radial
fields — lilac from the top left, green from the bottom left, a blue wash at
the bottom right, white through the middle — is painted once on `#app::before`
and runs *under* the rail and across the seam between the zones. Nothing in it
moves and nothing is blurred: the softness is the gradients' own falloff, so
there is no filter to repaint.

Only content floats. Cards, tool tiles and the composer are translucent white
with a hairline and a soft shadow; the zones underneath them have no fill of
their own.

Dark mode keeps every dimension and drops the mesh to a whisper over a deep
neutral, so the layout never shifts with the theme.

Type is Plus Jakarta Sans.

## Layout

- **Rail.** Circular icon buttons on the bare mesh: new chat, chat results,
  pinned, projects and the output panel at the top; upload, settings and the
  account disc at the foot. The section you are in is a filled blue disc, and
  the three that need an account are dimmed without one. Under 760px it
  leaves the edge and becomes a floating pill bar (navigation only — upload
  and settings are a tap away in the panel footer).
- **Pinned.** The rail's star is the same index narrowed to pinned chats, not
  a second panel: search still applies on top of it, and dismissing the panel
  clears it.
- **Chat Results.** The history, as cards grouped by day. Each card carries
  its title and a round ↗ to open it; the ⋯ menu (rename, pin, export,
  delete) still appears on hover. Above 1180px it takes its place in the row
  instead of overlaying, so browsing never covers the conversation.
- **The conversation.** Assistant turns carry a mark in a 44px gutter and sit
  in a soft card; the person's turn is a bubble that stops well short of the
  measure, in the same column. Both speak from one margin, so there is a
  single edge for the eye to follow — and the answer keeps the full width for
  lists, tables and code.
- **Tool tiles.** Four quick actions above the composer. Each drives
  something the app already does: Chat Files and Images open the picker (the
  second narrows it to images), Translate seeds the composer and puts the
  caret where the text goes, Audio Chat starts voice input. None is a
  placeholder.
- **Composer.** One pill: the field, then attach, mic and a blue send disc on
  the text's own baseline. The disc is disabled until there is text or an
  attachment, and doubles as Stop while a reply streams.
- **Touch parity.** Every menu opens on a tap, not a hover: the own-message
  menu, the theme list, and the row menus. Temporary chat can be left from
  the banner that announces it, because entering it closes the index.

## Workbench

Fenced code blocks are also routed into a tabbed panel on the right, opened
from the ⤢ in the chat header or by clicking a block in the transcript. The
panel belongs to the chat on screen — switching conversations resets it —
snippets are deduplicated on content so a re-render or a regenerate reuses
its tab, and previews fade only where lines are actually cut off. Below
1100px it becomes a sheet with a scrim rather than squeezing the
conversation.

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
