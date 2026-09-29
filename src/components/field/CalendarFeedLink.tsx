"use client";

import { useState } from "react";

/**
 * "Add to my phone calendar" on the Field screen's My schedule (T-153 B5). The link is shown once, right after it is
 * made; "Reset link" makes a new one and the old one stops working at once. The screen says plainly what the link
 * shows, because anyone holding it can read it (see src/lib/calendar/ics.ts).
 */
export function CalendarFeedLink({ businessId }: { businessId: string }) {
  const [link, setLink] = useState<{ url: string; webcal: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function makeLink() {
    if (busy) return;
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const response = await fetch("/api/company/team/me/calendar-feed", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId }),
      });
      const data = await response.json().catch(() => ({})) as { url?: string; webcal?: string; error?: string };
      if (!response.ok || !data.url || !data.webcal) throw new Error(data.error ?? "The calendar link could not be made.");
      setLink({ url: data.url, webcal: data.webcal });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The calendar link could not be made.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setError("Copy failed — press and hold the link to copy it."); }
  }

  const button: React.CSSProperties = { minHeight: 44, padding: "8px 12px", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#e2e8f0", fontWeight: 600, fontSize: 13 };
  return (
    <div style={{ marginBottom: 10 }}>
      {!link ? (
        <button type="button" style={button} disabled={busy} onClick={() => void makeLink()}>
          {busy ? "Making the link…" : "Add to my phone calendar"}
        </button>
      ) : (
        <div style={{ padding: 10, borderRadius: 10, background: "#0f172a", display: "grid", gap: 8 }}>
          <a href={link.webcal} style={{ ...button, background: "var(--accent)", border: "none", color: "#fff", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Open in my calendar app
          </a>
          <code style={{ fontSize: 11, color: "#94a3b8", overflowWrap: "anywhere" }}>{link.url}</code>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={button} onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>
            <button type="button" style={button} disabled={busy} onClick={() => void makeLink()}>Reset link</button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>
            Your calendar shows each visit&apos;s time, the customer&apos;s first name and the address. Phone numbers and gate
            codes stay in this app. Keep the link to yourself — &ldquo;Reset link&rdquo; turns the old one off.
          </p>
        </div>
      )}
      {error && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
    </div>
  );
}
