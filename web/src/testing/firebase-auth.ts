/** Build-time stand-in for firebase/auth. Aliased only when E2E_STUB=1. */
type Cb = (u: unknown) => void;
const listeners = new Set<Cb>();
let current: Record<string, unknown> | null = null;

const mkUser = (email: string, anonymous = false) => ({
  uid: anonymous ? "stub-anon" : "stub-uid-1",
  email: anonymous ? null : email,
  displayName: null,
  photoURL: null,
  isAnonymous: anonymous,
  emailVerified: true,
  metadata: { creationTime: new Date().toUTCString() },
  getIdToken: async () => "stub-token",
});

const emit = () => listeners.forEach((fn) => fn(current));

export function getAuth() {
  return { get currentUser() { return current; } };
}
export function onAuthStateChanged(_auth: unknown, cb: Cb) {
  listeners.add(cb);
  queueMicrotask(() => cb(current));
  return () => listeners.delete(cb);
}
export async function signInWithEmailAndPassword(_a: unknown, email: string, password: string) {
  if (password.startsWith("wrong")) { const e = new Error("bad"); (e as { code?: string }).code = "auth/invalid-credential"; throw e; }
  current = mkUser(email); emit(); return { user: current };
}
export async function createUserWithEmailAndPassword(_a: unknown, email: string) {
  current = mkUser(email); emit(); return { user: current };
}
export async function signInAnonymously() { current = mkUser("", true); emit(); return { user: current }; }
export async function signOut() { current = null; emit(); }
export async function sendPasswordResetEmail() { return true; }
export async function updateProfile() { return true; }
