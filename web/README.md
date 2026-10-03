# Almail AI — Next.js client

A rewrite of the app at the repository root as a Next.js 15 / React 19 /
TypeScript client, talking to the same Firebase project and the same
Cloudflare Worker.

This is the site. The repository root holds its built export, because GitHub
Pages serves the branch root; `../scripts/deploy.sh` builds this and lays it
down there. The previous vanilla app is kept, working, under `../legacy/`.

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

`npm run typecheck` is clean, and `e2e/chat.e2e.mjs` drives the built client
through sign-in, a send, a streamed reply, markdown, threads, message actions,
the artifact panel, the model picker, the theme and sign-out — at 1440×900 and
again at 390×730. See [`e2e/README.md`](e2e/README.md), including what that
suite caught that reading the code did not.

The deployed export was also loaded from the path Pages serves it at, with
every same-origin asset checked for a 404, which is how a wrong `basePath`
shows up before it is live rather than after.

## Not verified here, and why

The sandbox's egress proxy blocks `googleapis.com` and the Worker host, so a
real sign-in, a real Firestore round-trip and a real streamed reply have not
run against live services. Those paths are exercised end to end against the
in-memory stand-ins, against the same document shapes and the same SSE wire
format the previous app uses in production — but the live round trip itself is
reasoning, not a test.

## Not built yet

Relative to the brief, and to the app now under `../legacy/`:

- `Cmd+K` is "new chat", not a command palette.
- Projects/Gems, temporary chat, conversation export, voice input and
  read-aloud exist in the legacy app and have no equivalent here yet. That is
  why it is still deployed.
- The model list has the two Gemini models the Worker actually routes. Adding
  Claude or GPT is a Worker change plus one entry in `lib/models.ts`; listing
  them before that would put dead options in the picker.
