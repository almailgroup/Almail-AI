import type { Timestamp } from "firebase/firestore";

export type Role = "user" | "assistant";

/**
 * A conversation. Shape matches what the existing app writes, so history
 * created before this rewrite still loads.
 */
export interface Thread {
  id: string;
  title: string;
  /** Last-touched, epoch ms. Drives the Today / Yesterday grouping. */
  ts: number;
  pinned?: boolean;
  projectId?: string | null;
  deleted?: boolean;
}

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
  size: number;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  /** Firestore writes a server timestamp; it is null for a beat after a local write. */
  timestamp: Timestamp | null;
  attachments?: Attachment[];
}

/** A message on screen, which may not be in Firestore yet. */
export interface ChatMessage extends Omit<StoredMessage, "timestamp"> {
  timestamp: number | null;
  pending?: boolean;
}

export type ThreadGroup = "Pinned" | "Today" | "Yesterday" | "Previous 7 days" | "Previous 30 days" | "Older";
