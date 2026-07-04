"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFieldAudio, type FieldAudioResult } from "@/hooks/useFieldAudio";
import { PhotoCapture } from "@/components/field/PhotoCapture";
import type { Job, FieldUpdate, ProposedCorrection } from "@/types/jobs";

// ── SVG mic icon ────────────────────────────────────────────────────────────
function MicIcon({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm6 10a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2z" />
    </svg>
  );
}

// Remember the QR link's access (businessId + key) so the PWA / a plain
// revisit of /field keeps working after the first scan.
const ACCESS_STORE = "luxorFieldAccess";

function loadStoredAccess(): { businessId: string; key: string } | null {
  try {
    const raw = localStorage.getItem(ACCESS_STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.businessId === "string" && typeof parsed?.key === "string" ? parsed : null;
  } catch {
    return null;
  }
}

// ── Main app ────────────────────────────────────────────────────────────────
function FieldApp() {
  const searchParams = useSearchParams();
  const urlBusinessId = searchParams?.get("businessId");
  const urlKey = searchParams?.get("key");
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [businessId, setBusinessId] = useState(urlBusinessId ?? "demo-roofing");
  const [fieldKey, setFieldKey] = useState(urlKey ?? "");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [workerName, setWorkerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<FieldUpdate[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  // Type-to-capture fallback (collapsed by default — voice is the primary path)
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [textProposed, setTextProposed] = useState<ProposedCorrection | null>(null);

  // Resolve access: URL key wins and is persisted; otherwise fall back to the stored one.
  useEffect(() => {
    if (urlKey && urlBusinessId) {
      try {
        localStorage.setItem(ACCESS_STORE, JSON.stringify({ businessId: urlBusinessId, key: urlKey }));
      } catch {}
      return;
    }
    const stored = loadStoredAccess();
    if (stored && (!urlBusinessId || stored.businessId === urlBusinessId)) {
      setBusinessId(stored.businessId);
      setFieldKey(stored.key);
    }
  }, [urlKey, urlBusinessId]);

  const keySuffix = fieldKey ? `&key=${encodeURIComponent(fieldKey)}` : "";

  // Load jobs
  useEffect(() => {
    setLoadingJobs(true);
    fetch(`/api/jobs?businessId=${businessId}${keySuffix}`)
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          setAccessDenied(true);
          return { jobs: [] };
        }
        setAccessDenied(false);
        return r.json();
      })
      .then((d) => {
        const open = ((d.jobs ?? []) as Job[]).filter((j) => j.status !== "complete");
        setJobs(open);
        if (prefillJobId && open.find((j) => j.jobId === prefillJobId)) setSelectedJobId(prefillJobId);
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [businessId, prefillJobId, keySuffix]);

  const refreshRecent = useCallback((jobId: string) => {
    if (!jobId) { setRecentUpdates([]); return; }
    fetch(`/api/jobs/${jobId}/updates?businessId=${businessId}${keySuffix}`)
      .then((r) => (r.ok ? r.json() : { updates: [] }))
      .then((d) => setRecentUpdates(((d.updates ?? []) as FieldUpdate[]).reverse().slice(0, 8)))
      .catch(() => {});
  }, [businessId, keySuffix]);

  // Load recent updates when job changes
  useEffect(() => {
    refreshRecent(selectedJobId);
  }, [selectedJobId, refreshRecent]);

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);
  const jobContext = selectedJob
    ? { title: selectedJob.title, address: selectedJob.address, serviceType: selectedJob.serviceType, clientName: selectedJob.clientName }
    : undefined;

  function flashSaved(summary?: string) {
    setSavedNote(summary || "Update saved");
    setShowRecent(true);
    setTimeout(() => setSavedNote(null), 3500);
  }

  // ── Voice: one hold-to-talk → transcribe + parse + save in one round trip ──
  const onVoiceSuccess = useCallback((result: FieldAudioResult) => {
    flashSaved(result.changesSummary);
    refreshRecent(selectedJobId);
  }, [refreshRecent, selectedJobId]);

  const {
    status: audioStatus,
    transcript,
    proposedCorrection,
    confirmCorrection,
    cancelCorrection,
    startRecording,
    stopRecording,
  } = useFieldAudio(selectedJobId || null, {
    businessId,
    fieldKey: fieldKey || undefined,
    submittedBy: workerName.trim() || undefined,
    jobContext,
    onSuccess: onVoiceSuccess,
  });

  // ── Typed fallback (posts raw text to the updates endpoint) ──
  async function saveTyped() {
    if (!text.trim() || !selectedJobId || savingText) return;
    setSavingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(fieldKey ? { "x-field-key": fieldKey } : {}),
        },
        body: JSON.stringify({ businessId, rawText: text.trim(), submittedBy: workerName.trim() || undefined, jobContext }),
      });
      const data = await res.json();
      if (res.ok && data.proposedCorrection) {
        setTextProposed(data.proposedCorrection as ProposedCorrection);
      } else if (res.ok) {
        setText("");
        flashSaved();
        refreshRecent(selectedJobId);
      } else {
        setError("Failed to save. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSavingText(false);
    }
  }

  async function confirmTypedCorrection() {
    if (!textProposed || !selectedJobId) return;
    setSavingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/updates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(fieldKey ? { "x-field-key": fieldKey } : {}),
        },
        body: JSON.stringify({ businessId, submittedBy: workerName.trim() || undefined, confirmCorrection: textProposed }),
      });
      if (res.ok) {
        setTextProposed(null);
        setText("");
        flashSaved("Correction applied");
        refreshRecent(selectedJobId);
      } else {
        setError("Failed to apply correction. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSavingText(false);
    }
  }

  // One correction card serves both paths
  const activeProposed = proposedCorrection ?? textProposed;
  const confirmActive = proposedCorrection ? confirmCorrection : confirmTypedCorrection;
  const cancelActive = proposedCorrection ? cancelCorrection : () => setTextProposed(null);

  const recording = audioStatus === "recording";
  const transcribing = audioStatus === "transcribing";
  const isBusy = transcribing || savingText;

  const micLabel = !selectedJobId
    ? "Select a job first"
    : recording
    ? "Listening… release when done"
    : transcribing
    ? "Saving your update…"
    : audioStatus === "error"
    ? "Didn't catch that — hold and try again"
    : "Hold to speak · release to save";

  const micBg = recording
    ? "radial-gradient(circle, #3b1a6e 0%, #1e0f40 100%)"
    : isBusy || !selectedJobId
    ? "#1a1f2e"
    : "radial-gradient(circle, #1e2a4a 0%, #0f172a 100%)";

  const micBorder = recording
    ? "2.5px solid #7c3aed"
    : isBusy || !selectedJobId
    ? "2px solid #1e2a4a"
    : "2px solid #2d3f6e";

  const micGlow = recording ? "0 0 40px rgba(124,58,237,0.5), 0 0 80px rgba(124,58,237,0.2)" : "none";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body { margin: 0; min-height: 100dvh; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; background: #0a0e1a; color: #e2e8f0; }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .pulse { position: absolute; inset: -12px; border-radius: 50%; border: 2px solid #7c3aed; animation: pulse-ring 1.4s ease-out infinite; pointer-events: none; }
        .pulse2 { animation-delay: 0.5s; }
      `}</style>

      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#0a0e1a", padding: "0 0 env(safe-area-inset-bottom,0)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e2a4a" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: recording ? "#7c3aed" : "#22c55e", transition: "background 0.2s", flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em", color: "#f8fafc" }}>Luxor Field</span>
          {recording && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: "0.06em" }}>● REC</span>}
          {transcribing && <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>Saving…</span>}
        </div>

        <div style={{ flex: 1, padding: "20px 20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Access denied — expired/missing key */}
          {accessDenied && (
            <div style={{ padding: "16px", background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: "#fca5a5" }}>This link isn&apos;t active</p>
              <p style={{ margin: 0, fontSize: 13, color: "#f1a8a8", lineHeight: 1.5 }}>
                Scan the current QR code from the office to open the field screen. If you keep seeing this, ask the office for a fresh field link.
              </p>
            </div>
          )}

          {/* Job selector */}
          <div>
            <div style={{ position: "relative" }}>
              <select
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value)}
                disabled={loadingJobs || isBusy}
                style={{
                  width: "100%", padding: "13px 40px 13px 16px", borderRadius: 14,
                  border: "1.5px solid #1e2a4a", fontSize: 15, fontWeight: 500,
                  color: selectedJobId ? "#f1f5f9" : "#475569",
                  background: "#0f172a", appearance: "none", WebkitAppearance: "none",
                  cursor: loadingJobs || isBusy ? "not-allowed" : "pointer", outline: "none",
                }}
              >
                {loadingJobs ? <option>Loading jobs…</option>
                  : jobs.length === 0 ? <option value="">— No open jobs —</option>
                  : <><option value="">Select a job…</option>{jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} — {j.title}</option>)}</>}
              </select>
              <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#475569", pointerEvents: "none", fontSize: 12 }}>▾</div>
            </div>
            {selectedJob && (
              <div style={{ marginTop: 6, padding: "6px 12px", background: "#0f172a", border: "1px solid #1e2a4a", borderRadius: 8, fontSize: 12, color: "#475569" }}>
                {[selectedJob.address, selectedJob.clientName, selectedJob.serviceType].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>

          {/* Worker name */}
          <input
            value={workerName}
            onChange={e => setWorkerName(e.target.value)}
            placeholder="Your name (optional)"
            disabled={isBusy}
            style={{
              width: "100%", padding: "11px 16px", borderRadius: 12,
              border: "1.5px solid #1e2a4a", fontSize: 14, color: "#e2e8f0",
              background: "#0f172a", outline: "none",
            }}
          />

          {/* Mic button — hold to speak, release to save (one step) */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 8 }}>
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {recording && <div className="pulse" />}
              {recording && <div className="pulse pulse2" />}
              <button
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onPointerLeave={stopRecording}
                onPointerCancel={stopRecording}
                disabled={!selectedJobId || isBusy}
                style={{
                  position: "relative", zIndex: 1,
                  width: 110, height: 110, borderRadius: "50%",
                  background: micBg,
                  border: micBorder,
                  boxShadow: micGlow,
                  cursor: (!selectedJobId || isBusy) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                  touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
                }}
              >
                <MicIcon size={40} color={recording ? "#a78bfa" : isBusy || !selectedJobId ? "#334155" : "#7c93c8"} />
              </button>
            </div>
            <p style={{
              margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.01em",
              color: recording ? "#a78bfa" : transcribing ? "#94a3b8" : audioStatus === "error" ? "#fca5a5" : !selectedJobId ? "#334155" : "#64748b",
              transition: "color 0.15s",
            }}>
              {micLabel}
            </p>
            {transcript && !recording && !activeProposed && (
              <p style={{ margin: 0, fontSize: 12, color: "#475569", fontStyle: "italic", textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
                &ldquo;{transcript.length > 140 ? transcript.slice(0, 140) + "…" : transcript}&rdquo;
              </p>
            )}
          </div>

          {/* Photo capture */}
          <PhotoCapture
            jobId={selectedJobId || null}
            businessId={businessId}
            fieldKey={fieldKey || undefined}
            submittedBy={workerName.trim() || undefined}
            disabled={isBusy}
            onUploaded={() => flashSaved("Photo saved")}
          />

          {error && (
            <div style={{ padding: "10px 14px", background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 10, fontSize: 13, color: "#fca5a5" }}>
              {error}
            </div>
          )}

          {savedNote && (
            <div style={{ padding: "10px 14px", background: "#0f2d1a", border: "1px solid #166534", borderRadius: 10, fontSize: 13, color: "#86efac", fontWeight: 600 }}>
              ✓ {savedNote}
            </div>
          )}

          {/* One-tap correction confirm card — code computed old/new + running total */}
          {activeProposed && (
            <div style={{ padding: "16px", background: "#1a1430", border: "1.5px solid #7c3aed", borderRadius: 14 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#c4b5fd", textTransform: "uppercase", letterSpacing: "0.06em" }}>Confirm correction</p>
              <p style={{ margin: "0 0 4px", fontSize: 15, color: "#f1f5f9", lineHeight: 1.5 }}>
                Change <strong style={{ textTransform: "capitalize" }}>{activeProposed.item}</strong> on the matching entry from{" "}
                <strong style={{ color: "#fca5a5" }}>{activeProposed.oldValue}</strong> → <strong style={{ color: "#86efac" }}>{activeProposed.newValue}</strong>?
              </p>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#94a3b8" }}>
                Running total becomes <strong style={{ color: "#f1f5f9" }}>{activeProposed.newTotal}</strong> (was {activeProposed.currentTotal}).
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={cancelActive} disabled={isBusy} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                <button onClick={confirmActive} disabled={isBusy} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{isBusy ? "Applying…" : "Confirm change"}</button>
              </div>
            </div>
          )}

          {/* Type-to-capture fallback (collapsed — voice is the primary path) */}
          {!typing ? (
            <button
              onClick={() => setTyping(true)}
              style={{
                width: "100%", padding: "10px 16px",
                background: "transparent", border: "1px dashed #1e2a4a",
                borderRadius: 12, cursor: "pointer",
                color: "#475569", fontSize: 13, fontWeight: 600,
              }}
            >
              ⌨ Type instead
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Type your update — materials, hours, issues…"
                rows={4}
                disabled={isBusy}
                autoFocus
                style={{
                  width: "100%", padding: "14px 16px", borderRadius: 14,
                  border: "1.5px solid #1e2a4a",
                  fontSize: 15, lineHeight: 1.6, resize: "vertical",
                  color: "#f1f5f9", background: "#0f172a",
                  outline: "none", transition: "border-color 0.15s",
                  fontFamily: "inherit",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2d3f6e"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#1e2a4a"; }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setTyping(false); setText(""); }}
                  disabled={savingText}
                  style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1.5px solid #1e2a4a", background: "transparent", color: "#64748b", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveTyped}
                  disabled={!text.trim() || !selectedJobId || isBusy}
                  style={{
                    flex: 2, padding: "13px", borderRadius: 12, border: "none",
                    background: text.trim() && selectedJobId && !isBusy ? "#1e2a4a" : "#0f172a",
                    color: text.trim() && selectedJobId && !isBusy ? "#f1f5f9" : "#334155",
                    fontWeight: 700, fontSize: 15,
                    cursor: text.trim() && selectedJobId && !isBusy ? "pointer" : "not-allowed",
                  }}
                >
                  {savingText ? "Saving…" : "Save update"}
                </button>
              </div>
            </div>
          )}

          {/* RECENT */}
          {recentUpdates.length > 0 && (
            <div>
              <button
                onClick={() => setShowRecent(r => !r)}
                style={{
                  width: "100%", padding: "12px 16px",
                  background: "#0f172a", border: "1.5px solid #1e2a4a",
                  borderRadius: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  color: "#475569", fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                }}
              >
                <span>▶ RECENT ({recentUpdates.length})</span>
                <span style={{ transition: "transform 0.15s", display: "inline-block", transform: showRecent ? "rotate(90deg)" : "none" }}>›</span>
              </button>

              {showRecent && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {recentUpdates.map((u, i) => (
                    <div key={u.updateId ?? i} style={{
                      padding: "12px 14px", background: "#0f172a",
                      border: "1px solid #1e2a4a", borderRadius: 10,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {u.submittedBy ?? "Field update"}
                        </span>
                        <span style={{ fontSize: 11, color: "#334155" }}>
                          {new Date(u.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                        {u.rawText.length > 120 ? u.rawText.slice(0, 120) + "…" : u.rawText}
                      </p>
                      {u.parsed && (
                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {u.parsed.timeline.length > 0 && <span style={{ fontSize: 10, padding: "2px 8px", background: "#1e2a4a", borderRadius: 20, color: "#7c93c8" }}>{u.parsed.timeline.length} steps</span>}
                          {u.parsed.materials.length > 0 && <span style={{ fontSize: 10, padding: "2px 8px", background: "#1e2a4a", borderRadius: 20, color: "#7c93c8" }}>{u.parsed.materials.length} materials</span>}
                          {u.parsed.issues.length > 0 && <span style={{ fontSize: 10, padding: "2px 8px", background: "#2d1a1a", borderRadius: 20, color: "#f87171" }}>{u.parsed.issues.length} issue{u.parsed.issues.length > 1 ? "s" : ""}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0e1a" }}>
        <div style={{ color: "#334155", fontSize: 14 }}>Loading…</div>
      </div>
    }>
      <FieldApp />
    </Suspense>
  );
}
