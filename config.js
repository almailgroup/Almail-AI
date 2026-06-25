/**
 * Almail AI — AI configuration.
 *
 * ⚠️ SECURITY NOTE
 * This is a fully client-side app, so everything here ships to the browser and
 * is publicly visible. The Mistral key below can be read (and abused) by anyone
 * who opens the site. This is fine for personal/testing use.
 *
 * Before any public/production deploy, move the AI call behind a small
 * serverless proxy (Cloud Function / Vercel / Netlify function) that holds the
 * key server-side, and have the browser call your proxy instead of Mistral
 * directly. See README.md for details.
 */

export const AI_CONFIG = {
  // Mistral API key (client-side — see security note above).
  apiKey: "9fJRIRAzrNEvMsciprVznKVYaCDO5gAq",

  // Model + endpoint.
  model: "mistral-small-latest",
  endpoint: "https://api.mistral.ai/v1/chat/completions",

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
