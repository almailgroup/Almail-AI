import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Thread, ThreadGroup } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Which bucket a thread belongs to, by calendar day rather than elapsed hours. */
export function groupFor(thread: Thread, now = new Date()): ThreadGroup {
  if (thread.pinned) return "Pinned";
  if (!thread.ts) return "Older";
  const days = Math.round((startOfDay(now) - startOfDay(new Date(thread.ts))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return "Older";
}

export const GROUP_ORDER: ThreadGroup[] = [
  "Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older",
];

/** Groups threads for the sidebar, dropping empty buckets. */
export function groupThreads(threads: Thread[], now = new Date()) {
  const buckets = new Map<ThreadGroup, Thread[]>();
  for (const t of threads) {
    const g = groupFor(t, now);
    const list = buckets.get(g);
    if (list) list.push(t);
    else buckets.set(g, [t]);
  }
  return GROUP_ORDER.flatMap((g) => {
    const items = buckets.get(g);
    return items?.length ? [{ group: g, threads: items }] : [];
  });
}

/** Trim to a whole word, so a generated title never ends mid-word. */
export function truncateAtWord(text: string, max: number) {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:.\-–—]+$/, "")}…`;
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1_048_576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1_048_576).toFixed(1)} MB`;
