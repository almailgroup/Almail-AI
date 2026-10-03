# Almail AI — Next.js client

A rewrite of the app at the repository root as a Next.js 15 / React 19 /
TypeScript client, talking to the same Firebase project and the same
Cloudflare Worker.

It lives in `web/` rather than replacing the root. The root is what GitHub
Pages serves today, so the live app keeps working while this is built out;
nothing here is on the critical path until a deploy step points at it.

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build      # static export → web/out
npm run typecheck  # tsc --noEmit
```

## Three decisions worth knowing

**Static export, not a server.** `next.config.ts` sets `output: "export"`.
GitHub Pages runs no Node, so there are no route handlers or edge functions to
lean on — and a build that quietly assumes them fails at deploy time instead of
build time. Everything runs in the browser: Firebase talks to Firestore
directly, and model traffic goes to the Worker.

**The Worker stays.** It is the only reason the provider key is not in the
bundle. `NEXT_PUBLIC_AI_PROXY_SECRET` is the shared secret the Worker checks
before forwarding — public by design, exactly as in the app this replaces, and
not a provider key. A Next API route would have been the idiomatic home for
`streamText`, but a static export has none, so the Worker keeps that job.

**The Firestore schema is unchanged.** `users/{uid}/chats/{chatId}` and
`users/{uid}/messages/{autoId}` are read and written exactly as the current app
writes them, so a user's existing history loads in the new client. Thread
deletes stay tombstones (`deleted: true`) because the old client syncs the same
collection and a hard delete there races a stale local copy back into life.

## Layout

```
src/
  app/            layout, page, globals.css, theme sync
  lib/            firebase.ts, models.ts, types.ts, utils.ts
  hooks/          use-auth, use-threads, use-messages, use-auto-scroll
  store/          ui-store.ts (Zustand, persisted preferences only)
  chat/           worker-transport.ts  (Worker SSE → AI SDK UIMessageChunk)
  components/     chat-view, chat-message, chat-input, sidebar,
                  markdown-viewer, model-selector, artifact-panel, auth-gate
                  ui/  (Radix + cva primitives, shadcn-style)
```

### How auth gates the data

`useAuth` wraps `onAuthStateChanged` and is the single source of truth for
"who is this". `page.tsx` renders a spinner while it is resolving and the
`AuthGate` when it settles on `null` — so no Firestore listener ever attaches
without a `uid`. Every path is built from that `uid` in `lib/firebase.ts`,
which is what keeps one account's history out of another's, with Firestore
rules enforcing the same boundary server-side.

### How streaming reaches Firestore

`WorkerChatTransport` implements the AI SDK's `ChatTransport`. The Worker
speaks OpenAI-style SSE rather than the SDK's own data-stream protocol, so the
transport translates the wire format into `UIMessageChunk`s; `useChat` keeps
ownership of status, abort and regenerate rather than being reimplemented.
Tokens render from `useChat` state as they arrive, and `onFinish` writes the
settled answer to Firestore once — the live snapshot then becomes the source
of truth, so a reload shows the same thing.

## Verified here

- `npm run typecheck` — no errors.
- `npm run build` — compiles and exports; first load 436 kB for `/`.
- The export served and loaded at 1440×900 and 390×730: renders, no console
  errors, auth gate blocking, every button carrying a label or text.

## Not verified here, and why

The sandbox's egress proxy blocks `googleapis.com` and the Worker host, so a
real sign-in, a real Firestore round-trip and a real streamed reply have not
been exercised against live services. The code paths are written against the
same document shapes and the same SSE format the current app uses in
production, but that is reasoning, not a test. Run `npm run dev` against the
real project to confirm them.

## Not built yet

Relative to the brief, and to the app at the root:

- `Cmd+K` is "new chat", not a command palette.
- Projects/Gems, temporary chat, conversation export, voice input and
  read-aloud exist in the root app and have no equivalent here yet.
- No deploy step. Publishing this would mean a Pages workflow that builds
  `web/` and serves `out/`, which also decides the fate of the root app.
- The model list has the two Gemini models the Worker actually routes. Adding
  Claude or GPT is a Worker change plus one entry in `lib/models.ts`; listing
  them before that would put dead options in the picker.
