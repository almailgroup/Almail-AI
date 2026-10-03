"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "signin" | "signup";

/**
 * Nothing renders behind this until Firebase has resolved who the user is —
 * which is what guarantees a Firestore listener can never attach without a
 * uid, and so can never read another account's data.
 */
export function AuthGate({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (mode === "signin") await auth.signIn(email, password);
    else await auth.signUp(email, password);
    setBusy(false);
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-border bg-card">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Almail AI</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to pick up where you left off." : "Create an account to save your chats."}
          </p>
        </div>

        {/* A real <form> keeps the browser's password manager from treating
            other inputs on the page as the username field. */}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" required aria-label="Email"
          />
          <Input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" required minLength={6} aria-label="Password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {auth.error && (
            <p role="alert" className="text-sm text-destructive">{auth.error}</p>
          )}

          <Button type="submit" disabled={busy} className="mt-1 h-11 rounded-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 flex flex-col gap-2 text-center text-sm">
          <button
            onClick={() => { auth.clearError(); setMode(mode === "signin" ? "signup" : "signin"); }}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
          {mode === "signin" && email && (
            <button
              onClick={() => void auth.resetPassword(email)}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Email me a reset link
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          variant="outline" className="h-11 w-full rounded-full"
          onClick={() => void auth.continueAsGuest()}
        >
          Continue as guest
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Guest chats are saved to this device&apos;s anonymous account.
        </p>
      </div>
    </main>
  );
}
