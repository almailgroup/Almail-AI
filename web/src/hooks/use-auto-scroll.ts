"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sticks to the bottom while tokens arrive, and lets go the moment the reader
 * scrolls up — so following a long answer never fights the person reading it.
 */
export function useAutoScroll<T extends HTMLElement>(dep: unknown, threshold = 120) {
  const ref = useRef<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Ref rather than state: the scroll handler reads it on every frame.
  const stick = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = ref.current;
    if (!el) return;
    stick.current = true;
    setAtBottom(true);
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distance < threshold;
      stick.current = near;
      setAtBottom(near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [threshold]);

  useEffect(() => {
    if (stick.current) ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [dep]);

  return { ref, atBottom, scrollToBottom };
}
