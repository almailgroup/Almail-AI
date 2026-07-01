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
export const PROVIDERS = {
  mistral: {
    label: "Mistral",
    model: "mistral-small-latest",
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    // Mistral API key (client-side — see security note above).
    apiKey: "9fJRIRAzrNEvMsciprVznKVYaCDO5gAq",
  },

  gemini: {
    label: "Gemini",
    // Swap for whatever Gemini model you have access to
    // (e.g. "gemini-2.5-flash", "gemini-2.5-pro").
    model: "gemini-2.0-flash",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    // Paste your Gemini API key here — get one free at
    // https://aistudio.google.com/apikey
    apiKey: "",
  },
};

// Which provider is used the very first time the app loads (before the user
// has picked one themselves).
export const DEFAULT_PROVIDER = "mistral";
