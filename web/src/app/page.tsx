"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Loader2, LogOut, Menu, Moon, PanelRight, Sparkles, Sun } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useThreads } from "@/hooks/use-threads";
import { useUiStore } from "@/store/ui-store";
import { AuthGate } from "@/components/auth-gate";
import { Sidebar } from "@/components/sidebar";
import { ChatView } from "@/components/chat-view";
import { ModelSelector } from "@/components/model-selector";
import { ArtifactPanel, type Artifact } from "@/components/artifact-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Tailwind's `lg`, where the sidebar stops being an overlay. */
const BREAKPOINT = 1024;

/** `useLayoutEffect` warns during the build's prerender; this one does not. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function Page() {
  const auth = useAuth();
  const uid = auth.user?.uid ?? null;

  const { threads, loading: threadsLoading, createThread, patchThread, deleteThread } = useThreads(uid);

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const activeThreadId = useUiStore((s) => s.activeThreadId);
  const setActiveThreadId = useUiStore((s) => s.setActiveThreadId);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);
  const artifactOpen = useUiStore((s) => s.artifactOpen);
  const setArtifactOpen = useUiStore((s) => s.setArtifactOpen);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  // On a narrow screen the sidebar is an overlay, so it must start out of the
  // way — a persisted "open" from a desktop session would otherwise cover the
  // whole phone. Done in a layout effect so the sidebar is gone before paint.
  useIsomorphicLayoutEffect(() => {
    if (window.innerWidth < BREAKPOINT) setSidebarOpen(false);
  }, [setSidebarOpen]);

  // Land on the most recent conversation rather than an empty screen.
  useEffect(() => {
    if (!activeThreadId && threads.length) setActiveThreadId(threads[0]!.id);
  }, [threads, activeThreadId, setActiveThreadId]);

  // Artifacts belong to the conversation on screen.
  useEffect(() => {
    setArtifacts([]);
    setActiveArtifactId(null);
    setArtifactOpen(false);
  }, [activeThreadId, setArtifactOpen]);

  const newChat = useCallback(async () => {
    const id = await createThread();
    if (id) setActiveThreadId(id);
    if (window.innerWidth < BREAKPOINT) setSidebarOpen(false);
  }, [createThread, setActiveThreadId, setSidebarOpen]);

  const ensureThread = useCallback(async () => {
    if (activeThreadId) return activeThreadId;
    const id = await createThread();
    if (id) setActiveThreadId(id);
    return id;
  }, [activeThreadId, createThread, setActiveThreadId]);

  const addArtifact = useCallback((a: Artifact) => {
    // Same snippet twice (a re-render, a regenerate) reuses its tab.
    setArtifacts((prev) => {
      const existing = prev.find((x) => x.code === a.code);
      if (existing) { setActiveArtifactId(existing.id); return prev; }
      setActiveArtifactId(a.id);
      return [...prev, a].slice(-8);
    });
    setArtifactOpen(true);
  }, [setArtifactOpen]);

  // Keyboard: ⌘/Ctrl+K new chat, ⌘/Ctrl+B sidebar, Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); void newChat(); }
      else if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
      else if (e.key === "Escape" && artifactOpen) setArtifactOpen(false);
      // Escape backs out of the overlay sidebar, which is the only thing on
      // screen while it is open on a narrow viewport.
      else if (e.key === "Escape" && sidebarOpen && window.innerWidth < BREAKPOINT) setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat, toggleSidebar, artifactOpen, setArtifactOpen, sidebarOpen, setSidebarOpen]);

  if (auth.loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background" aria-busy>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  if (!auth.user) return <AuthGate auth={auth} />;

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Tap-anywhere dismissal for the overlay sidebar. Deliberately not a
          control: the header's X and Escape are the accessible ways out, and a
          second thing labelled "Close sidebar" only muddies the reading. */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <Sidebar
        threads={threads}
        loading={threadsLoading}
        activeId={activeThreadId}
        open={sidebarOpen}
        search={search}
        onSearch={setSearch}
        onSelect={(id) => {
          setActiveThreadId(id);
          if (window.innerWidth < BREAKPOINT) setSidebarOpen(false);
        }}
        onNew={() => void newChat()}
        onRename={(id, title) => void patchThread(id, { title })}
        onTogglePin={(id, pinned) => void patchThread(id, { pinned })}
        onDelete={(id) => {
          void deleteThread(id);
          if (id === activeThreadId) setActiveThreadId(null);
        }}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 flex-shrink-0 items-center gap-1 border-b border-border px-3">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-expanded={sidebarOpen}>
            <Menu className="h-4 w-4" aria-hidden />
          </Button>
          {/* A phone has no room for both the title and the model, and a title
              cut to "New c…" tells nobody anything. The model wins there. */}
          <h1 className="hidden min-w-0 flex-1 truncate px-2 text-base font-semibold tracking-tight sm:block">
            {activeThread?.title ?? "New chat"}
          </h1>
          <div className="flex-1 sm:hidden" />
          <ModelSelector />
          {/* Only a control when there is something to show. */}
          {!!artifacts.length && (
            <Button
              variant="ghost" size="icon"
              onClick={() => setArtifactOpen(!artifactOpen)}
              aria-label={artifactOpen ? "Hide artifact panel" : "Show artifact panel"}
              aria-expanded={artifactOpen}
            >
              <PanelRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-border text-xs font-bold text-primary">
                  {(auth.user.email?.[0] ?? "G").toUpperCase()}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">
                {auth.user.isAnonymous ? "Guest session" : auth.user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={toggleTheme}>
                {theme === "dark"
                  ? <><Sun className="h-3.5 w-3.5" aria-hidden /> Light theme</>
                  : <><Moon className="h-3.5 w-3.5" aria-hidden /> Dark theme</>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void auth.signOut()}>
                <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <div className="flex min-h-0 flex-1">
          <ChatView
            uid={auth.user.uid}
            chatId={activeThreadId}
            onTitle={(id, title) => void patchThread(id, { title })}
            onTouch={(id) => void patchThread(id, { ts: Date.now() })}
            onEnsureThread={ensureThread}
            onArtifact={addArtifact}
          />
          <ArtifactPanel
            artifacts={artifacts}
            activeId={activeArtifactId}
            open={artifactOpen}
            onSelect={setActiveArtifactId}
            onClose={() => setArtifactOpen(false)}
          />
        </div>
      </div>
    </div>
  );
}
