/**
 * The models the app can actually reach.
 *
 * Every entry here is served by the Cloudflare Worker in `cloudflare-worker/`,
 * which holds the real provider key as a server-side secret and exposes an
 * OpenAI-compatible surface. `apiKey` below is *not* a provider key — it is the
 * shared secret the Worker checks before forwarding, and it is public by
 * design, exactly as it is in the app this replaces.
 *
 * Adding Claude or GPT is a Worker change plus one entry here; the UI reads
 * this list and needs no edit. Listing a model the Worker cannot route would
 * put a dead option in the picker, so this stays honest about what exists.
 */
export interface ModelSpec {
  id: string;
  label: string;
  /** Shown under the label in the picker. */
  blurb: string;
  endpoint: string;
  /** Shared secret for the Worker, not a provider key. */
  apiKey: string;
  /** Sent as `model` in the request body. */
  model: string;
  supportsImages: boolean;
}

const WORKER = process.env.NEXT_PUBLIC_AI_ENDPOINT
  ?? "https://maham-solutions-ai.steep-band-c624.workers.dev/";
const WORKER_SECRET = process.env.NEXT_PUBLIC_AI_PROXY_SECRET
  ?? "afdd96f242782b40d2245d4adf676345e9cbb3aab7f033fda5dc2454d4673344";

export const MODELS: ModelSpec[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    blurb: "Fast, good for most questions",
    endpoint: WORKER,
    apiKey: WORKER_SECRET,
    model: "gemini-2.5-flash",
    supportsImages: true,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    blurb: "Slower, stronger at hard reasoning",
    endpoint: WORKER,
    apiKey: WORKER_SECRET,
    model: "gemini-2.5-pro",
    supportsImages: true,
  },
];

export const DEFAULT_MODEL_ID = MODELS[0]!.id;

export const modelById = (id: string): ModelSpec =>
  MODELS.find((m) => m.id === id) ?? MODELS[0]!;

export const DEFAULT_SYSTEM_PROMPT = [
  "You are Almail AI, a knowledgeable and direct assistant.",
  "",
  "How to answer:",
  "- Lead with the answer. Don't restate the question or open with filler.",
  "- Match length to the question. Never pad.",
  "- Use Markdown where structure helps — headings, lists, tables.",
  "- Put every snippet in a fenced code block with a language tag.",
  "- Use LaTeX for mathematics: $inline$ and $$display$$.",
].join("\n");
