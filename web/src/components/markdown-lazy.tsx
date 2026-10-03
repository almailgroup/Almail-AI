"use client";

import dynamic from "next/dynamic";
import type { MarkdownViewerProps } from "@/components/markdown-viewer";

/**
 * The markdown stack — katex, highlight.js, the remark/rehype chain — is by
 * far the heaviest thing here, and none of it is needed to paint the shell or
 * the sign-in screen. Loading it on demand keeps first paint cheap; the
 * fallback holds the text so nothing flashes empty while the chunk arrives.
 */
export const LazyMarkdownViewer = dynamic<MarkdownViewerProps>(
  () => import("@/components/markdown-viewer").then((m) => m.MarkdownViewer),
  {
    ssr: false,
    loading: () => <div className="prose-chat text-muted-foreground">…</div>,
  },
);
