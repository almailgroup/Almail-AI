"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp,
  updateDoc, where, getDocs, writeBatch, type Timestamp,
} from "firebase/firestore";
import { db, paths } from "@/lib/firebase";
import type { Attachment, ChatMessage, Role, StoredMessage } from "@/lib/types";

const millis = (t: Timestamp | null | undefined) => (t ? t.toMillis() : null);

/**
 * Live messages for one thread.
 *
 * The query filters by `chatId` and sorts client-side rather than with
 * `orderBy`: a composite index would otherwise be required, and a brand-new
 * message has a null `timestamp` for the moment before the server stamps it,
 * which an ordered query would drop out of view and then pop back in.
 */
export function useMessages(uid: string | null, chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, paths.messages(uid)), where("chatId", "==", chatId)),
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data = d.data() as Omit<StoredMessage, "id">;
            return {
              id: d.id,
              chatId: data.chatId,
              role: data.role,
              content: data.content,
              attachments: data.attachments,
              timestamp: millis(data.timestamp),
            } satisfies ChatMessage;
          })
          // Unstamped writes are the newest thing on screen, so they sort last.
          .sort((a, b) => (a.timestamp ?? Number.MAX_SAFE_INTEGER) - (b.timestamp ?? Number.MAX_SAFE_INTEGER));
        setMessages(rows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(
          err.code === "permission-denied"
            ? "Your Firestore rules don't allow reading this account's messages."
            : err.message,
        );
        setLoading(false);
      },
    );
    return unsub;
  }, [uid, chatId]);

  /**
   * `into` names the thread explicitly. The first message of a brand-new
   * conversation is written in the same tick the thread is created, before the
   * `chatId` prop has caught up, so a send must not depend on that prop.
   */
  const append = useCallback(
    async (role: Role, content: string, attachments?: Attachment[], into?: string) => {
      const target = into ?? chatId;
      if (!uid || !target) return null;
      const ref = await addDoc(collection(db, paths.messages(uid)), {
        role,
        content,
        chatId: target,
        timestamp: serverTimestamp(),
        ...(attachments?.length ? { attachments } : {}),
      });
      return ref.id;
    },
    [uid, chatId],
  );

  const edit = useCallback(
    async (id: string, content: string) => {
      if (!uid) return;
      await updateDoc(doc(db, paths.message(uid, id)), { content });
    },
    [uid],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!uid) return;
      await deleteDoc(doc(db, paths.message(uid, id)));
    },
    [uid],
  );

  /** Used by edit-and-resubmit and regenerate: drop everything after a point. */
  const removeAfter = useCallback(
    async (timestampExclusive: number) => {
      if (!uid || !chatId) return;
      const snap = await getDocs(
        query(collection(db, paths.messages(uid)), where("chatId", "==", chatId)),
      );
      const doomed = snap.docs.filter((d) => {
        const ts = millis((d.data() as Omit<StoredMessage, "id">).timestamp);
        return ts !== null && ts > timestampExclusive;
      });
      for (let i = 0; i < doomed.length; i += 450) {
        const batch = writeBatch(db);
        for (const d of doomed.slice(i, i + 450)) batch.delete(d.ref);
        await batch.commit();
      }
    },
    [uid, chatId],
  );

  return useMemo(
    () => ({ messages, loading, error, append, edit, remove, removeAfter }),
    [messages, loading, error, append, edit, remove, removeAfter],
  );
}
