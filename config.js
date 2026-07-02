/**
 * Almail AI — AI configuration.
 *
 * ⚠️ SECURITY NOTE
 * This is a fully client-side app, so everything here ships to the browser and
 * is publicly visible. Every API key below can be read (and abused) by anyone
 * who opens the site. This is fine for personal/testing use.
 *
 * Before any public/production deploy, move the AI calls behind a small
 * serverless proxy (Cloud Function / Vercel / Netlify function) that holds
 * the keys server-side, and have the browser call your proxy instead of the
 * providers directly. See README.md for details.
 */

// Shared behaviour — applies no matter which provider below is active.
export const AI_CONFIG = {
  // How many previous messages to include as context.
  historyLimit: 14,

  // Assistant persona / behaviour.
  systemPrompt:
    "You are Almail AI, a helpful, clever and friendly assistant. " +
    "Answer clearly and concisely. Use Markdown formatting, and always put " +
    "code inside fenced code blocks with a language tag (e.g. ```python). " +
    "You can analyze uploaded text files and images (including photos) to " +
    "answer questions. You cannot generate images.",
};

// Which model answers your messages. Users can switch between these from the
// model picker in the top bar; the choice is remembered in localStorage.
// `label` + `tagline` are the user-facing branding; `model`/`endpoint` are
// the real backend behind each one. Both are OpenAI-compatible chat-
// completions APIs (same request/response shape), so they share one
// implementation in chat.js (streamOpenAICompatible / getAIResponse).
export const PROVIDERS = {
  mistral: {
    label: "Celestra 1.0",
    tagline: "Fast, sharp everyday answers",
    model: "mistral-small-latest",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    // Mistral API key (client-side — see security note above).
    apiKey: "9fJRIRAzrNEvMsciprVznKVYaCDO5gAq",
  },

  openai: {
    label: "Luxora 1.1",
    tagline: "Creative, with a long memory",
    // Swap for whatever OpenAI model you have access to
    // (e.g. "gpt-4o", "gpt-4.1-mini").
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    // OpenAI API key (client-side — see security note above). Get one at
    // https://platform.openai.com/api-keys
    apiKey: "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",
  },
};

// Which provider is used the very first time the app loads (before the user
// has picked one themselves).
export const DEFAULT_PROVIDER = "mistral";
