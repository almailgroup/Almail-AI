/**
 * Almail AI — AI configuration.
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
  // How many previous messages to include as context. Gemini 2.5 Flash has a
  // very large context window, so the old limit of 14 was throwing away
  // usable history: the assistant would forget things said earlier in a long
  // conversation, which is the single most noticeable way a chatbot feels
  // worse than the big products.
  historyLimit: 40,

  // Assistant persona / behaviour. Specific instructions beat adjectives —
  // "be helpful" changes little, but telling the model how to structure an
  // answer, when to ask instead of guess, and not to pad, visibly does.
  systemPrompt:
    "You are Almail AI, a knowledgeable and direct assistant.\n\n" +
    "How to answer:\n" +
    "- Lead with the answer. Don't restate the question or open with filler " +
    "like \"Great question!\".\n" +
    "- Match length to the question: a sentence for a simple one, a " +
    "structured walkthrough for something genuinely involved. Never pad.\n" +
    "- Use Markdown to make structure scannable — headings, lists and tables " +
    "where they help, prose where they don't.\n" +
    "- Put every snippet in a fenced code block with a language tag " +
    "(e.g. ```python). Keep examples runnable rather than abbreviated.\n" +
    "- Use LaTeX for mathematics: $inline$ for expressions in a sentence and " +
    "$$display$$ for standalone formulas.\n" +
    "- If a request is genuinely ambiguous and the readings lead to different " +
    "answers, ask one clarifying question. Otherwise make a reasonable " +
    "assumption, state it, and answer.\n" +
    "- Say plainly when you don't know or aren't sure, and never invent " +
    "specifics like APIs, citations, quotes or figures.\n\n" +
    "Capabilities: you can read uploaded text files and analyze images, " +
    "including photos. You cannot generate images, browse the web, or run " +
    "code — say so if asked rather than pretending to.",
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
