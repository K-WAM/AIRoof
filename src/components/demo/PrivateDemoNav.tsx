"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mic, ArrowRight } from "lucide-react";
import { openPrivateFieldDemo } from "./RoofingTrial";

export function PrivateDemoNav() {
  const field = usePathname() === "/field";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <nav aria-label="Your private demo" data-testid="private-demo-nav" className="no-print" style={{ padding: 16, marginBottom: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--text)", fontSize: 13 }}>
    <strong>{field ? "3. Add a Voice Update" : "Next: Add a Voice Update"}</strong>
    <p style={{ margin: "6px 0 12px", lineHeight: 1.5, color: "var(--text-muted)" }}>{field ? "Record below, then open your updated job." : "Speak as your crew would. Your findings, materials and labor go straight into this job."}</p>
    {field ? <Link href="/company/jobs/J-1001" className="button" style={{ display: "flex", justifyContent: "center", minHeight: 44 }}><ArrowRight size={17} aria-hidden="true" />See Updated Job</Link>
      : <button type="button" className="button primary" style={{ width: "100%", minHeight: 44, justifyContent: "center" }} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await openPrivateFieldDemo(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setBusy(false); } }}><Mic size={17} aria-hidden="true" />{busy ? "Opening…" : "3. Add a Voice Update"}</button>}
    {!field && <div style={{ display: "flex", gap: "0 16px", flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
      <Link href="/demo" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Call Again</Link>
      <Link href="/company/pipeline" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Your Booking</Link>
      {!field && <Link href="/company/jobs/J-1001" style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}>Your Job</Link>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </nav>;
}
