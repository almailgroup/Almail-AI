# Almail AI

A clean, fast, sleek AI chatbot — vanilla HTML/CSS/JS with Firebase (Auth +
Firestore) and Google's Gemini API (via a Cloudflare Worker proxy). A rail, a
chat index, a reading column and a workbench for code — dark/light themes and
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
- 🎨 **Dark / light themes** — responsive, swipe gestures, no decoration
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
- 🪶 **Workbench design system** — slate surfaces, amber accent, monospace chrome
- 🗒️ **Sidebar as an index** — full-bleed rows, search in the header, hairline sections

## Layout

The interface is a rail, an overlay panel, a document and a workbench — not a
sidebar and a chat.

- **Rail (64px).** The only permanent chrome besides the conversation: new
  chat, chats, temporary chat, account. Icons only.
- **Chat list as an overlay panel.** Summoned from the rail, it slides over the
  conversation and dismisses on backdrop click or Escape. It is not a column,
  so the reading measure sits on the true centre of the window. Its contents
  are an index rather than a menu — see below.
- **Turns as a document.** No bubbles on either side. Each turn carries a small
  label and is separated by space and a hairline; the user's own words read a
  shade quieter than the answer. Opposing bubbles are a messaging idiom and
  this is a reading tool — they also halve the line length for no gain.
- **Composer as the hero.** With no conversation yet it centres under the
  greeting; it docks to the foot once the first turn lands. Driven by an
  `is-empty` class on `#app`.
- **Workbench on the right.** Code is the one thing a chat transcript handles
  badly: the answer you need is three questions up the scroll. So fenced code
  blocks are also routed into a tabbed panel that stays put. See below.

The rail reuses the ids of the old collapsed-sidebar strip (`si-new`,
`si-chats`, `si-temp`, `si-account`), so every handler in `chat.js` still binds
after the move.

## Workbench

`enhanceCodeBlocks()` in `src/js/chat.js` hands every fenced block to
`addToWorkbench()`, which gives it a tab in `#workbench`. The transcript keeps
a preview trimmed to 132px that acts as a handle: clicking it makes that tab
active and opens the panel.

- **The panel belongs to the chat on screen**, not to the session —
  `switchToChat()` calls `resetWorkbench()` first, so tabs never leak between
  conversations.
- **Snippets are deduplicated on content.** Streaming re-renders the stable
  part of a reply on every paragraph boundary, and a re-render or a regenerate
  re-runs the enhancer over blocks it has already seen; matching on the code
  itself means those reuse their tab instead of stacking up. Eight tabs is the
  cap.
- **Previews only fade where lines are actually cut.** The mask is applied
  from a `wb-clipped` class the enhancer sets after measuring, because a fade
  under a block that already ends on its last line reads as a bug.
- **Below 1100px it stops being a column** and becomes a sheet over the
  conversation with a scrim, dismissed by the scrim, the close button or
  Escape. It never covers the rail, so the way out is always on screen.

Everything in the panel is written with `textContent`: it is model output, and
the transcript's own sanitizing doesn't reach here.

## Sidebar: the index

The panel was a menu — a wordmark, two actions, a projects box with its own
empty-state sentence, a search field, the list, an upgrade card, an account
card and a settings row. Nine zones in one column, four of which the rail
already owns.

It is one thing now: an index of conversations.

- **Search is the header.** No wordmark: the rail is the brand anchor and the
  topbar carries the title. The header is 46px, the same as the topbar and the
  workbench head, so one chrome line runs unbroken across all three columns.
  The field has no box of its own — a control that *is* the header doesn't
  also need a container drawn round it. Focus turns the header's own rule
  amber and the magnifier with it; there is no ring.
- **Rows are full-bleed index entries**, 30px, no pills. The open conversation
  is marked by a 2px amber bar in the gutter as well as a fill, because at
  this density a fill on its own reads as hover.
- **Section labels are rules**, not headings: `TODAY` in small-caps monospace
  followed by a hairline to the panel edge, so the eye catches a boundary when
  scrolling past at speed. Projects use the same treatment, with the `+` at
  the far end of the rule.
- **Actions sit above the list, not in it.** New chat is an outlined monospace
  button; temporary chat is the ghost icon beside it.
- **The footer is one strip** — upgrade, then the account row with settings as
  an icon button in the same line.

The animated `.sidebar-glow` backdrop is gone. So is `src/js/liquid-glass.js`,
a from-scratch port of the SDF displacement-map technique from
[samasante/liquid-glass](https://github.com/samasante/liquid-glass) (MIT,
© 2026 Sam Asante), which had been dormant behind a check for that same glow
element. Deleting the glow would have switched the glass back on, and a
Chromium-only refraction filter under a flat tool panel is decoration this
design spent two rounds removing — so both went.

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
