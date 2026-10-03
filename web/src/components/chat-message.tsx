"use client";

import { memo, useState } from "react";
import { motion } from "motion/react";
import { Check, Copy, Pencil, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import type { ChatMessage as Message } from "@/lib/types";
import { LazyMarkdownViewer } from "@/components/markdown-lazy";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
  streaming?: boolean;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onOpenArtifact?: (code: string, language: string) => void;
}

export const ChatMessageRow = memo(function ChatMessageRow({
  message, streaming, onEdit, onDelete, onRegenerate, onOpenArtifact,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const save = () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== message.content) onEdit?.(message.id, next);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      // The gutter holds the assistant's mark; the person's turn leaves it
      // empty so both speak from one margin.
      className="group grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]"
      aria-label={isUser ? "Your message" : "Assistant message"}
    >
      {!isUser && (
        <div
          className="grid h-8 w-8 place-items-center self-start rounded-full border border-border bg-card"
          aria-hidden
        >
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={cn("col-start-2 min-w-0", isUser && "justify-self-start")}>
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === "Escape") { setEditing(false); setDraft(message.content); }
              }}
              rows={Math.min(10, draft.split("\n").length + 1)}
              autoFocus
              aria-label="Edit message"
              className="w-full resize-y rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(message.content); }}>
                <X className="h-3.5 w-3.5" aria-hidden /> Cancel
              </Button>
              <Button size="sm" onClick={save}>Save &amp; resend</Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "rounded-2xl border border-border",
                isUser ? "inline-block max-w-[46rem] bg-muted px-4 py-3" : "bg-card px-4 py-3 sm:px-5",
              )}
            >
              {isUser ? (
                <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed">
                  {message.content}
                </p>
              ) : (
                <LazyMarkdownViewer
                  content={message.content}
                  onOpenArtifact={onOpenArtifact}
                  className={streaming ? "stream-caret" : undefined}
                />
              )}

              {!!message.attachments?.length && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {message.attachments.map((a) => (
                    <li key={a.url}>
                      {a.contentType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url} alt={a.name}
                          className="max-h-44 rounded-xl border border-border object-cover"
                        />
                      ) : (
                        <a
                          href={a.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
                        >
                          {a.name}
                          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Always in the DOM so the row never reflows on hover; hidden from
                assistive tech only when it is also hidden visually. */}
            <div
              className={cn(
                "mt-1.5 flex gap-1 transition-opacity",
                "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
                "max-[640px]:opacity-100",
              )}
            >
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={copy}
                aria-label={copied ? "Copied" : "Copy message"}>
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              </Button>
              {isUser && onEdit && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  onClick={() => setEditing(true)} aria-label="Edit and resend">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              {!isUser && onRegenerate && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  onClick={() => onRegenerate(message.id)} aria-label="Regenerate response">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full"
                  onClick={() => onDelete(message.id)} aria-label="Delete message">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.article>
  );
});
