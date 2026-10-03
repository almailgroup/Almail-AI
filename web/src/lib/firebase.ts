/**
 * Firebase, initialised once on the client.
 *
 * The web config is not a secret — it ships to every browser by design, and
 * access is enforced by Firestore security rules keyed on `request.auth.uid`.
 * The provider API key is a different matter entirely: it never appears here,
 * because model traffic goes through the Cloudflare Worker (see lib/models).
 */
import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDBD6WhVr38XJRubzcI1S_75EqIUIi2r0o",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "azsco-ai.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "azsco-ai",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "azsco-ai.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID ?? "938850504673",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:938850504673:web:b0f9e3ab5615079c940ca0",
};

/**
 * Next renders components on the server at build time even with
 * `output: "export"`, and it remounts on hydration — so initialising
 * unconditionally would either run during prerender or create a second app.
 * `getApps()` makes this idempotent.
 */
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

/** Paths, in one place, so a schema change is a single edit. */
export const paths = {
  chats: (uid: string) => `users/${uid}/chats`,
  chat: (uid: string, chatId: string) => `users/${uid}/chats/${chatId}`,
  messages: (uid: string) => `users/${uid}/messages`,
  message: (uid: string, id: string) => `users/${uid}/messages/${id}`,
  upload: (uid: string, name: string) => `users/${uid}/uploads/${Date.now()}-${name}`,
} as const;
