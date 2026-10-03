import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { modelById, type ModelSpec } from "@/lib/models";

/** Everything the transport needs that is not part of the message list. */
export interface TransportContext {
  modelId: string;
  systemPrompt: string;
  /** 0–1. Higher is more exploratory. */
  temperature: number;
  /** How many prior turns to send. The window is large but not unbounded. */
  historyLimit: number;
}

/** Flatten a UIMessage's parts back to the plain text the Worker expects. */
function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

/** Image attachments travel as data URLs in `file` parts. */
function imagesOf(message: UIMessage): string[] {
  return message.parts.flatMap((part) =>
    part.type === "file" && part.mediaType?.startsWith("image/") ? [part.url] : [],
  );
}

interface WirePayload {
  model: string;
  stream: boolean;
  temperature: number;
  messages: Array<{ role: string; content: unknown }>;
}

function buildPayload(messages: UIMessage[], ctx: TransportContext, spec: ModelSpec): WirePayload {
  const history = messages.slice(-ctx.historyLimit);
  return {
    model: spec.model,
    stream: true,
    temperature: ctx.temperature,
    messages: [
      { role: "system", content: ctx.systemPrompt },
      ...history.map((m) => {
        const images = spec.supportsImages ? imagesOf(m) : [];
        if (!images.length) return { role: m.role, content: textOf(m) };
        // OpenAI-compatible multimodal shape, which the Worker forwards on.
        return {
          role: m.role,
          content: [
            { type: "text", text: textOf(m) },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        };
      }),
    ],
  };
}

/**
 * Bridges the Cloudflare Worker to `useChat`.
 *
 * The Worker speaks OpenAI-style SSE (`choices[0].delta.content`), not the AI
 * SDK's own data-stream protocol, so rather than reimplement the chat state
 * machine we translate the wire format into `UIMessageChunk`s and let the SDK
 * keep ownership of status, abort and regenerate.
 */
export class WorkerChatTransport implements ChatTransport<UIMessage> {
  constructor(private getContext: () => TransportContext) {}

  async sendMessages({
    messages,
    abortSignal,
  }: {
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const ctx = this.getContext();
    const spec = modelById(ctx.modelId);

    const res = await fetch(spec.endpoint, {
      method: "POST",
      signal: abortSignal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${spec.apiKey}`,
      },
      body: JSON.stringify(buildPayload(messages, ctx, spec)),
    });

    if (!res.ok || !res.body) {
      // Surface the provider's own words where it gave any — a bare status
      // code tells the user nothing actionable.
      const detail = await res.text().catch(() => "");
      let message = `The model service returned ${res.status}.`;
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        if (detail.trim()) message = detail.trim().slice(0, 300);
      }
      throw new Error(message);
    }

    return parseOpenAIStream(res.body);
  }

  /**
   * Resuming is a server-side feature — a static client has nowhere to
   * reconnect to, so an interrupted stream is simply regenerated.
   */
  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

/** OpenAI-style `data:` SSE → UIMessageChunk. */
export function parseOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
  const id = crypto.randomUUID();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let started = false;
  let sawText = false;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();

        if (done) {
          // Flush a final line that arrived without a trailing newline.
          emitFrom(buffer, controller);
          buffer = "";
          if (started) controller.enqueue({ type: "text-end", id });
          if (!sawText) {
            controller.error(new Error("The model returned an empty response."));
            return;
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last fragment: a JSON object can span two reads.
        buffer = lines.pop() ?? "";
        for (const line of lines) emitFrom(line, controller);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  function emitFrom(line: string, controller: ReadableStreamDefaultController<UIMessageChunk>) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
      if (!delta) return;
      if (!started) {
        controller.enqueue({ type: "text-start", id });
        started = true;
      }
      sawText = true;
      controller.enqueue({ type: "text-delta", id, delta });
    } catch {
      /* A partial JSON object spanning chunks; the next read completes it. */
    }
  }
}
