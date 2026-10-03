"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, Square, X } from "lucide-react";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, paths } from "@/lib/firebase";
import type { Attachment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

interface ChatInputProps {
  uid: string;
  disabled?: boolean;
  streaming?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
}

export function ChatInput({ uid, disabled, streaming, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Grow with the text, to a ceiling, then scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const tooBig = list.find((f) => f.size > MAX_BYTES);
      if (tooBig) {
        setError(`${tooBig.name} is ${formatBytes(tooBig.size)} — the limit is 10 MB.`);
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const uploaded = await Promise.all(
          list.map(async (file) => {
            const r = storageRef(storage, paths.upload(uid, file.name));
            await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
            return {
              name: file.name,
              url: await getDownloadURL(r),
              contentType: file.type || "application/octet-stream",
              size: file.size,
            } satisfies Attachment;
          }),
        );
        setAttachments((prev) => [...prev, ...uploaded]);
      } catch (err) {
        setError(
          (err as { code?: string }).code === "storage/unauthorized"
            ? "Your Storage rules don't allow uploads for this account."
            : "That upload didn't go through. Try again.",
        );
      } finally {
        setUploading(false);
      }
    },
    [uid],
  );

  const submit = useCallback(() => {
    const text = value.trim();
    if ((!text && !attachments.length) || disabled || streaming) return;
    onSend(text, attachments);
    setValue("");
    setAttachments([]);
  }, [value, attachments, disabled, streaming, onSend]);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-[1.75rem] border bg-card transition-colors",
        dragging ? "border-primary ring-2 ring-ring/30" : "border-border",
      )}
    >
      {dragging && (
        <p className="px-5 pt-4 text-sm text-primary" role="status">Drop to attach</p>
      )}

      {!!attachments.length && (
        <ul className="flex flex-wrap gap-2 px-4 pt-3">
          {attachments.map((a) => (
            <li key={a.url}
              className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs">
              <span className="max-w-[12rem] truncate">{a.name}</span>
              <span className="text-muted-foreground">{formatBytes(a.size)}</span>
              <button
                onClick={() => setAttachments((p) => p.filter((x) => x.url !== a.url))}
                aria-label={`Remove ${a.name}`}
                className="grid h-4 w-4 place-items-center rounded-full hover:bg-accent"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="px-5 pt-3 text-xs text-destructive">{error}</p>
      )}

      <div className="flex items-end gap-1 p-2 pl-5">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) { e.preventDefault(); void upload(files); }
          }}
          placeholder={disabled ? "Sign in to start chatting…" : "Ask anything…"}
          aria-label="Message"
          className="max-h-[200px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2.5 text-[0.98rem] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />

        <input
          ref={fileRef} type="file" multiple hidden
          onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ""; }}
        />
        <Button
          variant="ghost" size="pill" disabled={disabled || uploading}
          onClick={() => fileRef.current?.click()} aria-label="Attach files"
        >
          {uploading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <Paperclip className="h-4 w-4" aria-hidden />}
        </Button>

        {streaming ? (
          <Button size="pill" variant="secondary" onClick={onStop} aria-label="Stop generating">
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
          </Button>
        ) : (
          <Button size="pill" disabled={!canSend} onClick={submit} aria-label="Send message">
            <ArrowUp className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
