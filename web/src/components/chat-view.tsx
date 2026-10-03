"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, AlertTriangle, Code2, Lightbulb, Mail, Sparkles, Text } from "lucide-react";
import type { Attachment, ChatMessage } from "@/lib/types";
import { useMessages } from "@/hooks/use-messages";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useUiStore } from "@/store/ui-store";
import { WorkerChatTransport } from "@/chat/worker-transport";
import { ChatMessageRow } from "@/components/chat-message";
import { ChatInput } from "@/components/chat-input";
import { Button } from "@/components/ui/button";
import { truncateAtWord } from "@/lib/utils";
import type { Artifact } from "@/components/artifact-panel";

const textOf = (m: UIMessage) =>
  m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

/** Openers for a blank conversation. Each fills the box rather than sending. */
const STARTERS = [
  { icon: Lightbulb, label: "Explain something simply", prompt: "Explain in simple terms: " },
  { icon: Mail, label: "Draft an email", prompt: "Draft a short, professional email that " },
  { icon: Code2, label: "Review my code", prompt: "Review this code and point out bugs:\n\n" },
  { icon: Text, label: "Summarise a long text", prompt: "Summarise the key points of this text:\n\n" },
] as const;

interface ChatViewProps {
  uid: string;
  chatId: string | null;
  onTitle: (chatId: string, title: string) => void;
  onTouch: (chatId: string) => void;
  onEnsureThread: () => Promise<string | null>;
  onArtifact: (artifact: Artifact) => void;
}

export function ChatView({ uid, chatId, onTitle, onTouch, onEnsureThread, onArtifact }: ChatViewProps) {
  const { messages: stored, loading, error: storeError, append, edit, remove, removeAfter } =
    useMessages(uid, chatId);

  const modelId = useUiStore((s) => s.modelId);
  const systemPrompt = useUiStore((s) => s.systemPrompt);
  const temperature = useUiStore((s) => s.temperature);

  // The transport reads live settings through a ref, so changing the model
  // mid-conversation takes effect on the next send without rebuilding it.
  const settings = useRef({ modelId, systemPrompt, temperature, historyLimit: 40 });
  settings.current = { modelId, systemPrompt, temperature, historyLimit: 40 };
  const transport = useMemo(() => new WorkerChatTransport(() => settings.current), []);

  const [sendError, setSendError] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);

  // Which thread the turn in flight belongs to. Two reasons this is a ref and
  // not the prop: a thread created by the send itself is not on the prop until
  // the next render, and `useChat` may hold onto the first `onFinish` it was
  // given, so that callback cannot read `chatId` from a closure.
  const thread = useRef<string | null>(chatId);
  if (chatId) thread.current = chatId;
  const created = useRef<string | null>(null);

  const { messages: live, sendMessage, status, stop, setMessages } = useChat({
    transport,
    onError: (err) => setSendError(err.message || "The model didn't respond. Try again."),
    onFinish: ({ message }) => {
      const text = textOf(message).trim();
      const into = thread.current;
      if (text && into) void append("assistant", text, undefined, into);
    },
  });

  const streaming = status === "submitted" || status === "streaming";

  // The in-flight assistant turn, which is not in Firestore yet.
  const pending = useMemo<ChatMessage | null>(() => {
    if (!streaming) return null;
    const last = live[live.length - 1];
    if (!last || last.role !== "assistant") return null;
    return {
      id: "pending", chatId: chatId ?? "", role: "assistant",
      content: textOf(last), timestamp: null, pending: true,
    };
  }, [live, streaming, chatId]);

  const visible = useMemo(() => (pending ? [...stored, pending] : stored), [stored, pending]);

  const { ref: scrollRef, atBottom, scrollToBottom } = useAutoScroll<HTMLDivElement>(
    pending ? pending.content : visible.length,
  );

  // Switching conversations starts with a clean slate on both sides. A thread
  // the send itself just created is not a switch — clearing there would throw
  // away the reply streaming into it.
  const settled = useRef<string | null>(chatId);
  useEffect(() => {
    if (chatId === settled.current || chatId === created.current) {
      settled.current = chatId;
      created.current = null;   // consumed; a later return here is a real switch
      return;
    }
    settled.current = chatId;
    created.current = null;
    setMessages([]);
    setSendError(null);
  }, [chatId, setMessages]);

  const toUiMessages = useCallback(
    (list: ChatMessage[]): UIMessage[] =>
      list.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [
          { type: "text" as const, text: m.content },
          ...(m.attachments ?? [])
            .filter((a) => a.contentType.startsWith("image/"))
            .map((a) => ({ type: "file" as const, url: a.url, mediaType: a.contentType })),
        ],
      })),
    [],
  );

  const run = useCallback(
    async (history: ChatMessage[]) => {
      setSendError(null);
      const ui = toUiMessages(history);
      const last = ui[ui.length - 1];
      if (!last) return;
      setMessages(ui.slice(0, -1));
      await sendMessage(last);
    },
    [sendMessage, setMessages, toUiMessages],
  );

  const handleSend = useCallback(
    async (text: string, attachments: Attachment[]) => {
      const targetId = chatId ?? (await onEnsureThread());
      if (!targetId) {
        setSendError("Couldn't start a conversation. Check your connection and try again.");
        return;
      }
      thread.current = targetId;
      created.current = targetId;
      if (!stored.length) onTitle(targetId, truncateAtWord(text, 45) || attachments[0]?.name || "New chat");
      onTouch(targetId);

      await append("user", text, attachments, targetId);
      const next: ChatMessage[] = [
        ...stored,
        { id: `local-${Date.now()}`, chatId: targetId, role: "user", content: text, timestamp: Date.now(), attachments },
      ];
      await run(next);
    },
    [chatId, stored, append, onEnsureThread, onTitle, onTouch, run],
  );

  const handleRegenerate = useCallback(
    async (id: string) => {
      const idx = stored.findIndex((m) => m.id === id);
      if (idx < 1) return;
      const target = stored[idx];
      if (target?.timestamp) await removeAfter(target.timestamp - 1);
      await remove(id);
      await run(stored.slice(0, idx));
    },
    [stored, remove, removeAfter, run],
  );

  const handleEdit = useCallback(
    async (id: string, content: string) => {
      const idx = stored.findIndex((m) => m.id === id);
      if (idx < 0) return;
      await edit(id, content);
      const target = stored[idx];
      if (target?.timestamp) await removeAfter(target.timestamp);
      const next = stored.slice(0, idx + 1).map((m) => (m.id === id ? { ...m, content } : m));
      await run(next);
    },
    [stored, edit, removeAfter, run],
  );

  const handleArtifact = useCallback(
    (code: string, language: string) =>
      onArtifact({ id: `${Date.now()}`, title: language || "snippet", language, code }),
    [onArtifact],
  );

  const clearSeed = useCallback(() => setSeed(null), []);

  const empty = !loading && !visible.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {storeError && (
            <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p>{storeError}</p>
            </div>
          )}

          {empty ? (
            <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">How can I help you?</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ask a question, paste some code, or drop a file into the box below.
              </p>
              <ul className="mt-5 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {STARTERS.map(({ icon: Icon, label, prompt }) => (
                  <li key={label}>
                    <button
                      onClick={() => setSeed(prompt)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span>{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            visible.map((m) => (
              <ChatMessageRow
                key={m.id}
                message={m}
                streaming={m.pending}
                onEdit={m.role === "user" && !m.pending ? handleEdit : undefined}
                onRegenerate={m.role === "assistant" && !m.pending ? handleRegenerate : undefined}
                onDelete={m.pending ? undefined : remove}
                onOpenArtifact={handleArtifact}
              />
            ))
          )}

          {sendError && (
            <div role="alert" className="mt-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <p className="flex-1">{sendError}</p>
              <Button size="sm" variant="secondary" onClick={() => void run(stored)}>Retry</Button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none relative z-10 flex justify-center"
          >
            <Button
              size="icon"
              variant="secondary"
              onClick={() => scrollToBottom()}
              aria-label="Scroll to latest message"
              className="pointer-events-auto -mt-12 rounded-full border border-border shadow-lg"
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-shrink-0 px-4 pb-4">
        <div className="mx-auto w-full max-w-3xl">
          <ChatInput
            uid={uid}
            streaming={streaming}
            seed={seed}
            onSeedUsed={clearSeed}
            onSend={handleSend}
            onStop={stop}
          />
          <p className="pt-2 text-center text-[0.7rem] text-muted-foreground">
            Almail AI can make mistakes.
          </p>
        </div>
      </div>
    </div>
  );
}
