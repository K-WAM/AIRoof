"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!auth) {
      setError("Firebase not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace("/company/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign-in failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>AI Receptionist</h1>
      <p style={{ color: "#666" }}>Sign in to access your dashboard</p>
      <button
        onClick={signIn}
        disabled={loading}
        style={{
          padding: "0.75rem 1.5rem",
          background: "#4285F4",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "1rem",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Signing in…" : "Sign in with Google"}
      </button>
      {error && <p style={{ color: "#c00", fontSize: "0.875rem" }}>{error}</p>}
    </div>
  );
}
