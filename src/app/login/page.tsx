"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Honor middleware's ?next= deep link (e.g. a superadmin who clicked an /admin link
  // while logged out), falling back to the dashboard. Only allow same-origin paths.
  function postLoginDest(): string {
    if (typeof window === "undefined") return "/company/dashboard";
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/company/dashboard";
  }

  async function handleGoogle() {
    if (!auth) { setError("Firebase not configured."); return; }
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      document.cookie = "__session=1; path=/; max-age=86400; SameSite=Strict";
      router.replace(postLoginDest());
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) { setError("Firebase not configured."); return; }
    if (!email || !password) { setError("Enter email and password."); return; }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      document.cookie = "__session=1; path=/; max-age=86400; SameSite=Strict";
      router.replace(postLoginDest());
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError("No account found. Check your email and password, or contact your administrator.");
      } else if (code === "auth/wrong-password") {
        setError("Incorrect password.");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "var(--background)",
      padding: "24px",
    }}>
      <div className="panel" style={{ width: "100%", maxWidth: 380, boxShadow: "var(--shadow-md)" }}>
        <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", padding: "32px 28px" }}>
          <div style={{ textAlign: "center" }}>
            <Image src="/logo.png" alt="Luxor AI" width={403} height={322} priority style={{ height: 40, width: "auto", margin: "0 auto 14px", display: "block" }} />
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Luxor Ops</h1>
            <p style={{ color: "var(--text-muted)", marginTop: "0.4rem", fontSize: "0.9rem" }}>
              Sign in to access your dashboard
            </p>
          </div>

          {/* Google */}
          <button
            type="button"
            className="button"
            onClick={handleGoogle}
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}
          >
            <GoogleIcon />
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>or</span>
            <hr style={{ flex: 1, border: "none", borderTop: "1px solid var(--border)" }} />
          </div>

          {/* Email / Password */}
          <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="field">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <div className="field">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="button primary" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
            Access is provisioned by your administrator.
          </p>

          {error && (
            <p style={{ color: "var(--danger)", fontSize: "0.85rem", textAlign: "center", margin: 0 }}>
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.2l-6.3-5.4C29.4 34.9 26.8 36 24 36c-5.1 0-9.5-3.3-11.2-7.9l-6.6 5.1C9.8 39.6 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.4C37.1 38.9 44 33.3 44 24c0-1.3-.1-2.7-.4-3.9z"/>
    </svg>
  );
}
