"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Artifact {
  id: string;
  title: string;
  language: string;
  code: string;
}

const RENDERABLE = new Set(["html", "svg"]);

interface ArtifactPanelProps {
  artifacts: Artifact[];
  activeId: string | null;
  open: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Side workspace for generated code.
 *
 * HTML and SVG get a preview tab, sandboxed with no `allow-scripts` and no
 * same-origin access — generated markup renders but cannot reach the app, the
 * user's Firebase session, or the network.
 */
export function ArtifactPanel({ artifacts, activeId, open, onSelect, onClose }: ArtifactPanelProps) {
  const active = artifacts.find((a) => a.id === activeId) ?? artifacts[artifacts.length - 1];
  const [tab, setTab] = useState<"code" | "preview">("code");
  const [copied, setCopied] = useState(false);
  const canPreview = !!active && RENDERABLE.has(active.language.toLowerCase());

  useEffect(() => {
    if (!canPreview) setTab("code");
  }, [canPreview, active?.id]);

  const copy = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const download = () => {
    if (!active) return;
    const blob = new Blob([active.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/[^\w.-]+/g, "-")}.${active.language || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="artifact"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          className="flex h-full w-full flex-col border-l border-border bg-card lg:w-[46%] lg:max-w-[640px]"
          aria-label="Artifact workspace"
        >
          <header className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-border px-3">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {artifacts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={cn(
                    "shrink-0 truncate rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    a.id === active?.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                  aria-current={a.id === active?.id}
                >
                  {a.title}
                </button>
              ))}
            </div>
            {canPreview && (
              <div className="flex shrink-0 rounded-full bg-muted p-0.5" role="tablist">
                {(["code", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize",
                      tab === t ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy artifact">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            </Button>
            <Button variant="ghost" size="icon" onClick={download} aria-label="Download artifact">
              <Download className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close artifact panel">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-auto">
            {!active ? (
              <p className="p-6 text-sm text-muted-foreground">
                Code from the conversation shows up here.
              </p>
            ) : tab === "preview" ? (
              <iframe
                title={`Preview of ${active.title}`}
                // No allow-scripts, no allow-same-origin: it renders, and that
                // is all it can do.
                sandbox=""
                srcDoc={active.code}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <pre className="overflow-auto p-4 font-mono text-[0.8rem] leading-relaxed">
                <code>{active.code}</code>
              </pre>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
