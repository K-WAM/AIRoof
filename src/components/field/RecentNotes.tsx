"use client";

// The last notes on the selected job, newest first, each with WHO sent it and when — shared by both field screens so a
// crew member can see their note landed on the right job (and what a teammate already said) without leaving the screen.

import { useEffect, useState } from "react";
import type { FieldUpdate } from "@/types/jobs";

export function RecentNotes({ businessId, jobId, refreshKey, limit = 6 }: { businessId: string | null; jobId: string | null; refreshKey?: unknown; limit?: number }) {
  // Tagged with the job they belong to: while another job's list loads, the old list must not sit under the new
  // heading (it read as "my note went to the wrong job").
  const [loaded, setLoaded] = useState<{ jobId: string; updates: FieldUpdate[] } | null>(null);
  const [original, setOriginal] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!businessId || !jobId) { setLoaded(null); return; }
    let live = true;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/updates?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : { updates: [] }))
      .then((d) => { if (live) setLoaded({ jobId, updates: ((d.updates ?? []) as FieldUpdate[]).filter((u) => u.kind !== "correction").reverse().slice(0, limit) }); })
      .catch(() => {});
    return () => { live = false; };
  }, [businessId, jobId, refreshKey, limit]);

  const updates = loaded && loaded.jobId === jobId ? loaded.updates : [];
  if (!jobId || updates.length === 0) return null;
  return (
    <section aria-label={`Recent notes on ${jobId}`} data-testid="recent-notes" style={{ display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8" }}>Recent notes on {jobId}</h2>
      {updates.map((u) => {
        const showOriginal = original.has(u.updateId);
        const text = u.rawTextEn && !showOriginal ? u.rawTextEn : u.rawText;
        return (
          <article key={u.updateId} style={{ padding: "10px 12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <strong style={{ color: "#e2e8f0" }}>{u.submittedBy ?? "Crew"}</strong>
              <span style={{ color: "#64748b" }}>{new Date(u.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1", lineHeight: 1.45 }}>{text.length > 160 ? `${text.slice(0, 160)}…` : text}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {u.parseError && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#3b2a0b", color: "#fcd34d" }}>Office will check the details</span>}
              {u.parsed && u.parsed.materials.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#1e293b", color: "#93c5fd" }}>{u.parsed.materials.length} material{u.parsed.materials.length === 1 ? "" : "s"}</span>}
              {u.parsed && u.parsed.labor.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#1e293b", color: "#93c5fd" }}>labor</span>}
              {u.parsed && u.parsed.issues.length > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#2d1a1a", color: "#fca5a5" }}>{u.parsed.issues.length} issue{u.parsed.issues.length === 1 ? "" : "s"}</span>}
              {u.rawTextEn && (
                <button type="button" onClick={() => setOriginal((prev) => { const next = new Set(prev); if (next.has(u.updateId)) next.delete(u.updateId); else next.add(u.updateId); return next; })}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, border: "none", background: "#1e293b", color: "#93c5fd", cursor: "pointer" }}>
                  {showOriginal ? "Show English" : "Show original"}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
