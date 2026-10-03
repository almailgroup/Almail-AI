# Almail AI

An AI chatbot — Next.js 15 / React 19 / TypeScript, with Firebase (Auth +
Firestore + Storage) and Google's Gemini, reached through a Cloudflare Worker
proxy. Live at **https://almailgroup.github.io/Almail-AI/**.

![Almail AI](legacy/assets/images/AlmailAIWhite.png)

The source lives in [`web/`](web/README.md). What sits at the repository root is
its **built output** — GitHub Pages serves the branch root, so the export has to
be committed there. Do not edit the root `index.html`, `_next/` or the icons by
hand; they are generated. Change `web/src/**`, then:

```bash
./scripts/deploy.sh      # typecheck, build, lay the export at the root
git add -A && git commit && git push
```

## Layout

```
web/                     # the application — edit here
  src/
    app/                 layout, page, globals.css, theme sync
    lib/                 firebase.ts, models.ts, types.ts, utils.ts
    hooks/               use-auth, use-threads, use-messages, use-auto-scroll
    store/               ui-store.ts  (Zustand; preferences persist, panels don't)
    chat/                worker-transport.ts  (Worker SSE → AI SDK chunks)
    components/          chat-view, chat-message, chat-input, sidebar,
                         markdown-viewer, model-selector, artifact-panel,
                         auth-gate, ui/ (Radix + cva primitives)
    testing/             in-memory Firebase, aliased in only when E2E_STUB=1
  e2e/                   Playwright suite — see web/e2e/README.md
  public/                manifest + icons

scripts/deploy.sh        # build web/ and lay the export at the root
cloudflare-worker/       # the Gemini proxy, which holds the real API key
legacy/                  # the previous vanilla build, still served
index.html _next/ …      # generated — the deployed export
```

## What it does

- Streaming replies with **Stop**, regenerate, copy, edit-and-resubmit, delete.
- A conversation sidebar: create, rename, pin, search, delete, grouped by day.
  History is per-user in Firestore, so it follows you across devices.
- Email/password or guest sign-in. Nothing reads data before Firebase has said
  who you are, so a Firestore listener can never attach without a `uid`.
- Markdown with tables, syntax-highlighted code and LaTeX. Code blocks open in
  a side panel; the preview iframe is `sandbox=""`, so nothing in a reply runs.
- Attachments by click, drag or paste, into Firebase Storage, capped at 10 MB.
- Dark and light, applied before first paint so a reload never flashes white.
- Installable (web manifest), and built for a phone as much as a desktop.

## The legacy app

The previous vanilla HTML/CSS/JS build is kept, working, at
[`/Almail-AI/legacy/`](https://almailgroup.github.io/Almail-AI/legacy/). It
reads and writes the same Firestore documents, so the same account shows the
same history in either one. A few of its features have no equivalent in the new
client yet — projects, temporary chat, conversation export, voice input and
read-aloud — which is the reason it is still deployed rather than deleted.

## AI: Gemini via a Cloudflare Worker proxy

Model traffic goes to a small Worker (in
[`cloudflare-worker/`](cloudflare-worker/README.md)) rather than to Google
directly. The real Gemini key lives server-side as a Worker secret and is never
shipped to the browser; the client holds only the Worker's URL and a shared
secret the Worker checks before forwarding. A static export has no server to
put a route handler on, which is why the Worker keeps that job.

> The Firebase web config is **not** a secret — it is meant to be public.
> Access is controlled by your Firestore security rules.

### Firestore rules

Each user owns everything under their own `users/{userId}` document and nothing
else. The recursive wildcard covers both subcollections — `messages` and
`chats`.

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

Storage needs the matching rule for attachments:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Running locally

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm run typecheck
node e2e/chat.e2e.mjs # against a stubbed build — see web/e2e/README.md
```
