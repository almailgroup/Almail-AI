# End-to-end checks

`chat.e2e.mjs` drives the built client with Playwright. Every step is something
a person does, so a failure here is something a person would hit.

Firebase is replaced at build time rather than mocked in the test: setting
`E2E_STUB=1` makes `next.config.ts` alias `firebase/app`, `firebase/auth`,
`firebase/firestore` and `firebase/storage` to the in-memory stand-ins in
`src/testing/`. The real hooks, store, transport and components run unmodified
— only the network boundary moves. A production build has no reference to
`src/testing` at all; `grep -r src/testing _next/` after a normal build is the
check for that.

```bash
cd web
E2E_STUB=1 NEXT_PUBLIC_BASE_PATH= npx next build
(cd out && python3 -m http.server 8792 --bind 127.0.0.1 &)
node e2e/chat.e2e.mjs
```

It runs the whole suite at 1440×900 and again at 390×730, because the bugs
worth catching here have mostly been phone-only. The model endpoint is
intercepted and replied to with a canned OpenAI-style SSE stream, so no traffic
leaves the machine.

## What it found

Worth recording, because none of it was visible by reading the code:

- A brand-new conversation lost its first exchange. `chatId` is a prop, so it
  lagged a render behind the thread the send had just created: the user turn
  was dropped, the reply was never written, and the effect that clears the view
  on a thread switch fired mid-stream and wiped the answer off the screen.
- The sidebar defaulted to open and its backdrop covered the whole phone, so
  nothing could be typed.
- Code blocks rendered `[object Object], x = ,[object Object],;` — the
  highlighter turns a block's children into element nodes, and `String(...)`
  on those is not the code.
- Two different elements were both labelled "Close sidebar".
