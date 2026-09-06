/**
 * Maham AI Solutions — Gemini proxy (Cloudflare Worker)
 *
 * Keeps the real Gemini API key server-side. The browser calls this Worker
 * instead of Google directly; the Worker attaches the real key (stored as a
 * Worker secret, never shipped to the client) and forwards the request to
 * Gemini's OpenAI-compatible endpoint. Because that endpoint speaks the same
 * chat-completions request/response shape chat.js already expects, no app
 * code changes are needed — this Worker's URL is just the `endpoint` in
 * config.js.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/openai
 */

const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: cors });
    }

    // Lightweight gate so randoms who find the Worker URL can't spend your
    // Gemini quota. This is NOT the real Gemini key — it's a shared secret
    // that config.js sends as its "apiKey" for this provider. Anyone who
    // opens dev tools can still read it (this is a client-side app), so it
    // only raises the bar; it does not make the endpoint private.
    if (env.PROXY_SHARED_SECRET) {
      const auth = request.headers.get("Authorization") || "";
      const provided = auth.replace(/^Bearer\s+/i, "");
      if (provided !== env.PROXY_SHARED_SECRET) {
        return new Response("Unauthorized", { status: 401, headers: cors });
      }
    }

    if (!env.GEMINI_API_KEY) {
      return new Response("Worker is missing GEMINI_API_KEY", { status: 500, headers: cors });
    }

    const upstream = await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.GEMINI_API_KEY}`,
      },
      body: await request.text(),
    });

    const headers = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);

    // Stream straight through — this preserves Server-Sent Events chunking
    // for `stream: true` requests instead of buffering the whole reply.
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
