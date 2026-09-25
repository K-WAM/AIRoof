"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Work complete" for the field screens. Two taps on purpose (the first arms it, the second confirms) so a stray
 * touch in a pocket can't close a job. Talks to the narrow /api/jobs/[jobId]/complete endpoint, which is pinned to
 * one job, idempotent, and never moves an invoiced job backwards.
 */
export function WorkCompleteButton({ businessId, jobId, workerName, disabled, onCompleted }: {
  businessId: string | null;
  jobId: string | null;
  workerName?: string;
  disabled?: boolean;
  onCompleted?: () => void;
}) {
  const [state, setState] = useState<"idle" | "armed" | "saving" | "done" | "error">("idle");
  const disarm = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Switching jobs starts over: never carry "done"/"armed" from one job to the next.
  useEffect(() => {
    setState("idle");
    if (disarm.current) clearTimeout(disarm.current);
  }, [jobId]);
  useEffect(() => () => { if (disarm.current) clearTimeout(disarm.current); }, []);

  const off = disabled || !jobId || !businessId || state === "saving";

  async function onTap() {
    if (off || !jobId || !businessId) return;
    if (state === "idle" || state === "error" || state === "done") {
      if (state === "done") return;
      setState("armed");
      disarm.current = setTimeout(() => setState("idle"), 5000);
      return;
    }
    if (disarm.current) clearTimeout(disarm.current);
    setState("saving");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, completedBy: workerName?.trim() || undefined }),
      });
      if (!res.ok) throw new Error("failed");
      setState("done");
      onCompleted?.();
    } catch {
      setState("error");
    }
  }

  const label =
    state === "armed" ? "Tap again to mark this job complete"
    : state === "saving" ? "Saving…"
    : state === "done" ? "✓ Job marked complete"
    : state === "error" ? "Couldn't save — tap to try again"
    : "✔ Work complete";

  return (
    <button
      type="button"
      onClick={() => void onTap()}
      disabled={off || state === "done"}
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        width: "100%", padding: "12px", minHeight: 44, borderRadius: 12,
        border: state === "armed" ? "1.5px solid var(--accent)" : state === "done" ? "1.5px solid #166534" : "1.5px solid #1e2a4a",
        background: state === "armed" ? "var(--accent)" : "#0f172a",
        color: state === "armed" ? "#fff" : state === "done" ? "#86efac" : state === "error" ? "#fca5a5" : off ? "#334155" : "#7c93c8",
        fontWeight: 700, fontSize: 14, cursor: off || state === "done" ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
