# Almail Gemini proxy (Cloudflare Worker)

A thin reverse proxy in front of Gemini's OpenAI-compatible endpoint. It
exists so the real Gemini API key lives server-side (as a Worker secret)
instead of shipping to every browser that loads Almail AI.

The frontend (`src/js/config.js`) talks to this Worker using the same
OpenAI-style chat-completions request/response shape `chat.js` already
speaks, because Gemini exposes an OpenAI-compatible `chat/completions`
endpoint. No changes to `chat.js` are needed.

## 1. Get a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) (or
   Google Cloud Console → APIs & Services → Credentials) and create/copy an
   API key for the Gemini API.
2. If a key was ever pasted somewhere public (a screenshot, a chat, a repo),
   delete it and generate a new one — treat exposed keys as burned.

## 2. Install Wrangler and log in

```bash
cd cloudflare-worker
npm install
npx wrangler login   # opens a browser to authorize your Cloudflare account
```

## 3. Set the secrets

Never put these in `wrangler.toml` or commit them — they're pushed straight
to Cloudflare and stay out of git:

```bash
npx wrangler secret put GEMINI_API_KEY
# paste your real Gemini key when prompted

npx wrangler secret put PROXY_SHARED_SECRET
# make up a random string, e.g.: openssl rand -hex 32
```

`PROXY_SHARED_SECRET` is optional but recommended — it stops random people
who find your Worker's URL from spending your Gemini quota. It is **not**
the Gemini key; it's just a shared password between the frontend and the
Worker. If you skip setting it, the Worker automatically skips that check
(see `src/index.js`) — no code changes needed either way.

## 4. Deploy

```bash
npx wrangler deploy
```

Wrangler prints the Worker's URL, something like:

```
https://almail-gemini-proxy.<your-subdomain>.workers.dev
```

## 5. Point the frontend at it

Edit `src/js/config.js`:

```js
gemini: {
  label: "Gemini",
  tagline: "Google's Gemini model",
  model: "gemini-2.5-flash",
  endpoint: "https://almail-gemini-proxy.<your-subdomain>.workers.dev/v1/chat/completions",
  apiKey: "<the PROXY_SHARED_SECRET you set above>",
},
```

## 6. (Recommended) Lock down CORS

By default the Worker replies with `Access-Control-Allow-Origin: *`, which
lets any website call it — fine for testing, not for production. Once you
know Almail's real domain, add it to `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-real-domain.com"
```

then `npx wrangler deploy` again.

## Local development

```bash
npx wrangler dev
```

This starts the Worker on `http://localhost:8787`. Put secrets for local
testing in a `.dev.vars` file (already git-ignored):

```
GEMINI_API_KEY=...
PROXY_SHARED_SECRET=...
```

## How it works

`src/index.js` is the entire Worker: it checks the shared secret, then
forwards the request body as-is to
`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
with the real key attached, and streams the response straight back —
including Server-Sent Events chunks for streaming replies.
