/**
 * Maham AI Solutions — AI configuration.
 *
 * ⚠️ SECURITY NOTE
 * This is a fully client-side app, so everything here ships to the browser
 * and is publicly visible. The Gemini provider below points at a Cloudflare
 * Worker proxy instead of Google directly — the real Gemini API key lives
 * server-side as a Worker secret and is never shipped to the browser. The
 * `apiKey` value here is only a shared secret the Worker checks before
 * forwarding a request; it is not the Gemini key itself. See
 * cloudflare-worker/README.md for how to deploy the proxy.
 */

// Shared behaviour — applies no matter which provider below is active.
export const AI_CONFIG = {
  // How many previous messages to include as context.
  historyLimit: 14,

  // Assistant persona / behaviour.
  systemPrompt:
    "You are Maham AI Solutions, a helpful, clever and friendly assistant. " +
    "Answer clearly and concisely. Use Markdown formatting, and always put " +
    "code inside fenced code blocks with a language tag (e.g. ```python). " +
    "You can analyze uploaded text files and images (including photos) to " +
    "answer questions. You cannot generate images.",
};

// A single provider — Google's Gemini, called through the Cloudflare Worker
// proxy in cloudflare-worker/ so the real API key stays server-side. The
// proxy forwards to Gemini's OpenAI-compatible endpoint, so this shares the
// same streamOpenAICompatible/getAIResponse implementation in chat.js as
// any other OpenAI-compatible backend.
export const PROVIDERS = {
  gemini: {
    label: "Gemini",
    tagline: "Google's Gemini model",
    model: "gemini-2.5-flash",
    // Replace with your deployed Worker's URL (see cloudflare-worker/README.md).
    endpoint: "https://maham-solutions-ai.steep-band-c624.workers.dev/",
    // Shared secret the Worker checks (PROXY_SHARED_SECRET) — NOT the real
    // Gemini key. Still visible client-side, so it only gates casual abuse.
    apiKey: "afdd96f242782b40d2245d4adf676345e9cbb3aab7f033fda5dc2454d4673344",
  },
};

// Which provider is used the very first time the app loads (before the user
// has picked one themselves).
export const DEFAULT_PROVIDER = "gemini";
