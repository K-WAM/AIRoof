"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Job, FieldUpdate } from "@/types/jobs";

// ── SVG mic icon ────────────────────────────────────────────────────────────
function MicIcon({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm6 10a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V21H9v2h6v-2h-2v-2.07A8 8 0 0 0 20 11h-2z" />
    </svg>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────
function FieldApp() {
  const searchParams = useSearchParams();
  const businessId = searchParams?.get("businessId") ?? "demo-roofing";
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [workerName, setWorkerName] = useState("");
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<FieldUpdate[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("audio/webm");

  // Load jobs
  useEffect(() => {
    fetch(`/api/jobs?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => {
        const open = (d.jobs as Job[]).filter(j => j.status !== "complete");
        setJobs(open);
        if (prefillJobId && open.find(j => j.jobId === prefillJobId)) setSelectedJobId(prefillJobId);
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [businessId, prefillJobId]);

  // Load recent updates when job changes
  useEffect(() => {
    if (!selectedJobId) { setRecentUpdates([]); return; }
    fetch(`/api/jobs/${selectedJobId}/updates?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => setRecentUpdates(((d.updates ?? []) as FieldUpdate[]).reverse().slice(0, 8)))
      .catch(() => {});
  }, [selectedJobId, businessId]);

  const selectedJob = jobs.find(j => j.jobId === selectedJobId);

  async function startRecording(e: React.PointerEvent) {
    e.preventDefault();
    if (transcribing || saving) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      mimeTypeRef.current = mimeType;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied. Please allow microphone and try again.");
    }
  }

  async function stopRecording(e: React.PointerEvent) {
    e.preventDefault();
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach(t => t.stop());
      setRecording(false);
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      if (blob.size < 500) return;
      setTranscribing(true);
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64, mimeType: mimeTypeRef.current }),
          });
          const data = await res.json();
          if (data.transcript) {
            setText(prev => prev ? prev + " " + data.transcript : data.transcript);
          } else {
            setError("No speech detected. Try again.");
          }
        } catch {
          setError("Transcription failed. Try again.");
        } finally {
          setTranscribing(false);
        }
      };
    };
    recorder.stop();
  }

  async function handleSave() {
    if (!text.trim() || !selectedJobId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          rawText: text.trim(),
          submittedBy: workerName.trim() || undefined,
          jobContext: selectedJob
            ? { title: selectedJob.title, address: selectedJob.address, serviceType: selectedJob.serviceType, clientName: selectedJob.clientName }
            : undefined,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setText("");
        setSubmitted(true);
        setRecentUpdates(prev => [saved.update, ...prev].slice(0, 8));
        setShowRecent(true);
        setTimeout(() => setSubmitted(false), 3000);
      } else {
        setError("Failed to save. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const isBusy = transcribing || saving;
  const canSave = !!text.trim() && !!selectedJobId && !isBusy;

  const micLabel = !selectedJobId
    ? "Select a job first"
    : recording
    ? "Release to stop"
    : transcribing
    ? "Transcribing…"
    : "Hold to record · Release to stop";

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
          {transcribing && <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>Transcribing…</span>}
        </div>

        <div style={{ flex: 1, padding: "20px 20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

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

          {/* Mic button */}
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
                  width: 100, height: 100, borderRadius: "50%",
                  background: micBg,
                  border: micBorder,
                  boxShadow: micGlow,
                  cursor: (!selectedJobId || isBusy) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                  touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
                }}
              >
                <MicIcon size={36} color={recording ? "#a78bfa" : isBusy || !selectedJobId ? "#334155" : "#7c93c8"} />
              </button>
            </div>
            <p style={{
              margin: 0, fontSize: 12, fontWeight: 500, letterSpacing: "0.01em",
              color: recording ? "#a78bfa" : transcribing ? "#475569" : !selectedJobId ? "#334155" : "#475569",
              transition: "color 0.15s",
            }}>
              {micLabel}
            </p>
          </div>

          {/* Textarea */}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Or type to capture…"
            rows={4}
            disabled={isBusy}
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

          {error && (
            <div style={{ padding: "10px 14px", background: "#2d0f0f", border: "1px solid #7f1d1d", borderRadius: 10, fontSize: 13, color: "#fca5a5" }}>
              {error}
            </div>
          )}

          {submitted && (
            <div style={{ padding: "10px 14px", background: "#0f2d1a", border: "1px solid #166534", borderRadius: 10, fontSize: 13, color: "#86efac", fontWeight: 600 }}>
              ✓ Update saved and parsing…
            </div>
          )}

          {/* Parse & Save */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "none",
              background: canSave ? "#1e2a4a" : "#0f172a",
              color: canSave ? "#f1f5f9" : "#334155",
              fontWeight: 700, fontSize: 16,
              cursor: canSave ? "pointer" : "not-allowed",
              transition: "background 0.15s, color 0.15s",
              letterSpacing: "0.01em",
            }}
          >
            {saving ? "Saving…" : "Parse & Save"}
          </button>

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
