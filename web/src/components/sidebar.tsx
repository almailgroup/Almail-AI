"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2, X,
} from "lucide-react";
import type { Thread } from "@/lib/types";
import { groupThreads, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarProps {
  threads: Thread[];
  loading: boolean;
  activeId: string | null;
  open: boolean;
  search: string;
  onSearch: (s: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function Sidebar({
  threads, loading, activeId, open, search,
  onSearch, onSelect, onNew, onRename, onTogglePin, onDelete, onClose,
}: SidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? threads.filter((t) => t.title.toLowerCase().includes(q)) : threads;
    return groupThreads(filtered);
  }, [threads, search]);

  const commitRename = (id: string) => {
    const next = draft.trim();
    setRenamingId(null);
    if (next) onRename(id, next);
  };

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.nav
          key="sidebar"
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          aria-label="Conversations"
          className={cn(
            "flex h-full w-[min(20rem,85vw)] flex-col border-r border-border bg-card",
            "fixed inset-y-0 left-0 z-40 lg:static lg:z-auto",
          )}
        >
          <header className="flex h-14 flex-shrink-0 items-center gap-2 px-3">
            <h2 className="flex-1 px-1 text-base font-semibold tracking-tight">Chats</h2>
            <Button variant="ghost" size="icon" onClick={onNew} aria-label="New chat">
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden"
              aria-label="Close sidebar">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </header>

          <div className="relative flex-shrink-0 px-3 pb-2">
            <Search
              className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              type="search"
              className="h-9 rounded-full bg-muted pl-9 text-[0.85rem]"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {loading ? (
              <ul className="space-y-1.5 px-1 pt-2" aria-busy>
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
                ))}
              </ul>
            ) : !groups.length ? (
              <p className="px-3 pt-6 text-sm text-muted-foreground">
                {search ? "No conversations match that." : "No conversations yet."}
              </p>
            ) : (
              groups.map(({ group, threads: items }) => (
                <section key={group} aria-labelledby={`group-${group}`}>
                  <h3
                    id={`group-${group}`}
                    className="px-3 pb-1 pt-4 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {group}
                  </h3>
                  <ul className="space-y-0.5">
                    {items.map((t) => (
                      <li key={t.id} className="group/row relative">
                        {renamingId === t.id ? (
                          <Input
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitRename(t.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(t.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            aria-label={`Rename ${t.title}`}
                            className="h-9 text-sm"
                          />
                        ) : (
                          <div
                            className={cn(
                              "flex items-center rounded-lg pr-1 transition-colors",
                              t.id === activeId ? "bg-accent" : "hover:bg-accent/60",
                            )}
                          >
                            <button
                              onClick={() => onSelect(t.id)}
                              aria-current={t.id === activeId ? "page" : undefined}
                              className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
                            >
                              {t.pinned && <Pin className="mr-1.5 inline h-3 w-3 text-primary" aria-label="Pinned" />}
                              {t.title}
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 shrink-0 rounded-full opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 max-[640px]:opacity-100"
                                  aria-label={`Options for ${t.title}`}
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => { setRenamingId(t.id); setDraft(t.title); }}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => onTogglePin(t.id, !t.pinned)}>
                                  {t.pinned
                                    ? <><PinOff className="h-3.5 w-3.5" aria-hidden /> Unpin</>
                                    : <><Pin className="h-3.5 w-3.5" aria-hidden /> Pin</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={() => onDelete(t.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
