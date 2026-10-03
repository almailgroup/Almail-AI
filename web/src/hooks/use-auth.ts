"use client";

import { useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInAnonymously, signOut as fbSignOut, sendPasswordResetEmail, updateProfile,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface AuthState {
  user: User | null;
  /** True until Firebase has told us whether anyone is signed in. */
  loading: boolean;
  error: string | null;
}

/** Firebase's codes are not sentences; these are. */
function readableAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email": return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "That email and password don't match an account.";
    case "auth/email-already-in-use": return "There's already an account with that email.";
    case "auth/weak-password": return "Use at least six characters.";
    case "auth/too-many-requests": return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed": return "Couldn't reach the server. Check your connection.";
    case "auth/operation-not-allowed": return "That sign-in method isn't enabled for this project.";
    default: return (err as { message?: string })?.message ?? "Something went wrong signing in.";
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ user: null, loading: true, error: null });

  useEffect(() => {
    // The single source of truth for "who is this". Everything that reads
    // user data waits on it, so a listener can never attach with no uid.
    return onAuthStateChanged(
      auth,
      (user) => setState({ user, loading: false, error: null }),
      (err) => setState({ user: null, loading: false, error: readableAuthError(err) }),
    );
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setState((s) => ({ ...s, error: null }));
    try {
      await fn();
      return true;
    } catch (err) {
      setState((s) => ({ ...s, error: readableAuthError(err) }));
      return false;
    }
  }, []);

  return {
    ...state,
    signIn: useCallback(
      (email: string, password: string) => run(() => signInWithEmailAndPassword(auth, email, password)),
      [run],
    ),
    signUp: useCallback(
      (email: string, password: string, displayName?: string) =>
        run(async () => {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          if (displayName) await updateProfile(cred.user, { displayName });
        }),
      [run],
    ),
    /** Guest mode. Firestore rules still scope everything to this uid. */
    continueAsGuest: useCallback(() => run(() => signInAnonymously(auth)), [run]),
    resetPassword: useCallback(
      (email: string) => run(() => sendPasswordResetEmail(auth, email)),
      [run],
    ),
    signOut: useCallback(() => run(() => fbSignOut(auth)), [run]),
    clearError: useCallback(() => setState((s) => ({ ...s, error: null })), []),
  };
}
