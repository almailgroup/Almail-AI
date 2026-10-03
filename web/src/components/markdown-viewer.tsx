"use client";

import React, { memo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The plain text of a React subtree.
 *
 * `rehype-highlight` replaces a code block's text with a tree of coloured
 * `<span>`s, so `String(children)` yields "[object Object]". Copy, and the
 * artifact panel, need the source back.
 */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

interface CodeBlockProps {
  language: string;
  code: string;
  children: React.ReactNode;
  onOpenArtifact?: (code: string, language: string) => void;
}

function CodeBlock({ language, code, children, onOpenArtifact }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard is blocked in some embedded contexts; failing is not fatal. */
    }
  }, [code]);

  return (
    <div className="group/code my-3 overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {onOpenArtifact && (
            <Button
              variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => onOpenArtifact(code, language)}
            >
              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
              Open
            </Button>
          )}
          <Button
            variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {/* The highlighted children render as they came, so the colours survive. */}
      <pre className="overflow-x-auto bg-card p-3 text-[0.82rem] leading-relaxed">
        <code className={language ? `language-${language} hljs` : "hljs"}>{children}</code>
      </pre>
    </div>
  );
}

export interface MarkdownViewerProps {
  content: string;
  className?: string;
  onOpenArtifact?: (code: string, language: string) => void;
}

/**
 * Markdown for model output.
 *
 * `react-markdown` builds a React tree rather than setting innerHTML, so model
 * output can never become live markup — there is no sanitiser to get wrong.
 * Memoised on `content` because this re-renders on every streamed token.
 */
export const MarkdownViewer = memo(function MarkdownViewer({
  content, className, onOpenArtifact,
}: MarkdownViewerProps) {
  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
          pre: ({ children }) => {
            // react-markdown nests <code> inside <pre>; lift it so the block
            // gets its own chrome instead of a bare scroll box.
            const child = React.Children.toArray(children)[0] as
              | React.ReactElement<{ className?: string; children?: React.ReactNode }>
              | undefined;
            const cls = child?.props?.className ?? "";
            const language = /language-(\w+)/.exec(cls)?.[1] ?? "";
            const code = textOf(child?.props?.children).replace(/\n$/, "");
            return (
              <CodeBlock language={language} code={code} onOpenArtifact={onOpenArtifact}>
                {child?.props?.children}
              </CodeBlock>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
