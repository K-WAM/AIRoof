"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    if (!auth) { setError("Firebase not configured."); return; }
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      document.cookie = "__session=1; path=/; max-age=86400; SameSite=Strict";
      router.replace("/company/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
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
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      document.cookie = "__session=1; path=/; max-age=86400; SameSite=Strict";
      router.replace("/company/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        setError("No account found. Check your email and password.");
      } else if (code === "auth/wrong-password") {
        setError("Incorrect password.");
      } else if (code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Sign in instead.");
      } else if (code === "auth/weak-password") {
        setError("Password must be at least 6 characters.");
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
      background: "#f5f5f7",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "2.5rem 2rem",
        width: "100%",
        maxWidth: "380px",
        boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>AI Receptionist</h1>
          <p style={{ color: "#666", marginTop: "0.4rem", fontSize: "0.9rem" }}>
            Sign in to access your dashboard
          </p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={googleBtnStyle(loading)}
        >
          <GoogleIcon />
          {loading ? "Signing in…" : "Continue with Google"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e0e0e0" }} />
          <span style={{ color: "#aaa", fontSize: "0.8rem" }}>or</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e0e0e0" }} />
        </div>

        {/* Email / Password */}
        <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={loading}
            style={inputStyle}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            style={inputStyle}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
          <button type="submit" disabled={loading} style={primaryBtnStyle(loading)}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: "0.85rem", color: "#666", margin: 0 }}>
          {mode === "signin" ? "No account? " : "Already have an account? "}
          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            style={{ background: "none", border: "none", color: "#4285F4", cursor: "pointer", padding: 0, fontSize: "0.85rem" }}
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>

        {error && (
          <p style={{ color: "#c00", fontSize: "0.85rem", textAlign: "center", margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: "8px" }}>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-9 20-20 0-1.3-.1-2.7-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.2l-6.3-5.4C29.4 34.9 26.8 36 24 36c-5.1 0-9.5-3.3-11.2-7.9l-6.6 5.1C9.8 39.6 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.4C37.1 38.9 44 33.3 44 24c0-1.3-.1-2.7-.4-3.9z"/>
    </svg>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.65rem 0.9rem",
  border: "1px solid #ddd",
  borderRadius: "6px",
  fontSize: "0.95rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.7rem",
    background: disabled ? "#999" : "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
  };
}

function googleBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.7rem",
    background: "#fff",
    color: "#333",
    border: "1px solid #ddd",
    borderRadius: "6px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.95rem",
    fontWeight: 500,
    opacity: disabled ? 0.7 : 1,
  };
}
