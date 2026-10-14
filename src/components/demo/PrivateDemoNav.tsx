"use client";
import Link from "next/link";
import { useState } from "react";
import { openPrivateFieldDemo } from "./RoofingTrial";

export function PrivateDemoNav() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <nav aria-label="Your private demo" data-testid="private-demo-nav" style={{ padding: "12px 16px", marginBottom: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontSize: 13 }}>
    <strong>Your Private Demo</strong>
    <div style={{ display: "flex", gap: "0 16px", flexWrap: "wrap", alignItems: "center" }}>
      <Link href="/try/roofing" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>1. Call and Book</Link>
      <Link href="/company/pipeline" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>2. See Your Booking</Link>
      <button type="button" className="button small" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await openPrivateFieldDemo(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setBusy(false); } }}>3. Add a Voice Update</button>
      <Link href="/company/jobs/J-1001" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>See Updated Job</Link>
    </div>
    {error && <p role="alert">{error}</p>}
  </nav>;
}
