"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function EnterSandboxButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/sandbox-token", { method: "POST" });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) throw new Error(data.error ?? "Could not start the sandbox");

      const [auth, authModule] = await Promise.all([getFirebaseAuth(), import("firebase/auth")]);
      if (!auth) throw new Error("Sign-in unavailable");
      const { signInWithCustomToken, setPersistence, browserSessionPersistence } = authModule;
      // Tab-session only — a prospect's own device shouldn't stay signed in as
      // the demo viewer after they close the browser.
      await setPersistence(auth, browserSessionPersistence);
      await signInWithCustomToken(auth, data.token);

      // Mirror login/page.tsx: pre-set the marker cookie so middleware doesn't
      // bounce this navigation before AuthContext's real ID token lands
      // (AuthContext overwrites this with the real token within moments).
      document.cookie = "__session=1; path=/; max-age=86400; SameSite=Strict";
      router.push("/company/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the sandbox");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={enter}
        disabled={loading}
        className="button primary"
        style={{ fontSize: 15, padding: "13px 24px", display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <ExternalLink size={17} strokeWidth={1.75} />
        {loading ? "Opening…" : "See it in the real app →"}
      </button>
      {error && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
