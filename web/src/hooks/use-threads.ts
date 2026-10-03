"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, query, where, getDocs, writeBatch,
} from "firebase/firestore";
import { db, paths } from "@/lib/firebase";
import type { Thread } from "@/lib/types";

/**
 * Live list of the signed-in user's conversations.
 *
 * Deletes are tombstones (`deleted: true`) rather than removals, because the
 * old client syncs the same collection and a hard delete there would race a
 * stale local copy back into existence. They are filtered out here.
 */
export function useThreads(uid: string | null) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, paths.chats(uid)),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Thread, "id">) }))
          .filter((t) => !t.deleted)
          .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
        setThreads(rows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Almost always a rules problem; say so rather than failing silently.
        setError(
          err.code === "permission-denied"
            ? "Your Firestore rules don't allow reading this account's chats."
            : err.message,
        );
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const createThread = useCallback(
    async (title = "New chat") => {
      if (!uid) return null;
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, paths.chat(uid, id)), { title, ts: Date.now(), pinned: false });
      return id;
    },
    [uid],
  );

  const patchThread = useCallback(
    async (id: string, patch: Partial<Thread>) => {
      if (!uid) return;
      await setDoc(doc(db, paths.chat(uid, id)), patch, { merge: true });
    },
    [uid],
  );

  const deleteThread = useCallback(
    async (id: string) => {
      if (!uid) return;
      // Drop the messages for real, tombstone the thread.
      const msgs = await getDocs(query(collection(db, paths.messages(uid)), where("chatId", "==", id)));
      // Firestore caps a batch at 500 writes; chunk so a long chat still clears.
      for (let i = 0; i < msgs.docs.length; i += 450) {
        const batch = writeBatch(db);
        for (const m of msgs.docs.slice(i, i + 450)) batch.delete(m.ref);
        await batch.commit();
      }
      await setDoc(doc(db, paths.chat(uid, id)), { deleted: true, ts: Date.now() }, { merge: true });
    },
    [uid],
  );

  const hardDeleteThread = useCallback(
    async (id: string) => {
      if (!uid) return;
      await deleteDoc(doc(db, paths.chat(uid, id)));
    },
    [uid],
  );

  return useMemo(
    () => ({ threads, loading, error, createThread, patchThread, deleteThread, hardDeleteThread }),
    [threads, loading, error, createThread, patchThread, deleteThread, hardDeleteThread],
  );
}
