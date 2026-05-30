"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useFieldAudio } from "@/hooks/useFieldAudio";
import type { Job } from "@/types/jobs";

function FieldApp() {
  const searchParams = useSearchParams();
  const businessId = searchParams?.get("businessId") ?? "demo-roofing";
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [workerName, setWorkerName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = { current: null as ReturnType<typeof setInterval> | null };

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

  const selectedJob = jobs.find(j => j.jobId === selectedJobId);

  const handleSuccess = useCallback((result: { transcript: string }) => {
    setLastTranscript(result.transcript || null);
    setSubmitted(true);
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          setSubmitted(false);
          setLastTranscript(null);
          return 5;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const { status: audioStatus, startRecording, stopRecording } = useFieldAudio(
    selectedJobId || null,
    {
      businessId,
      submittedBy: workerName.trim() || undefined,
      jobContext: selectedJob
        ? { title: selectedJob.title, address: selectedJob.address, serviceType: selectedJob.serviceType, clientName: selectedJob.clientName }
        : undefined,
      onSuccess: handleSuccess,
    }
  );

  const isRecording = audioStatus === "recording";
  const isTranscribing = audioStatus === "transcribing";
  const isError = audioStatus === "error";
  const isBusy = isTranscribing;

  function reset() {
    clearInterval(countdownRef.current!);
    setSubmitted(false);
    setLastTranscript(null);
    setCountdown(5);
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f0fdf4", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360, width: "100%" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36, color: "#fff" }}>✓</div>
          <h2 style={{ fontWeight: 800, fontSize: 26, margin: "0 0 8px", color: "#15803d" }}>Update sent!</h2>
          <p style={{ color: "#166534", fontSize: 15, margin: "0 0 4px" }}>Saved to <strong>{selectedJobId}</strong></p>
          {lastTranscript && (
            <p style={{ color: "#166534", fontSize: 13, fontStyle: "italic", margin: "0 0 24px", lineHeight: 1.5 }}>&ldquo;{lastTranscript}&rdquo;</p>
          )}
          <p style={{ color: "#4ade80", fontSize: 13, margin: "0 0 4px" }}>AI is parsing your update now</p>
          <button onClick={reset} style={{ width: "100%", padding: "16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: "pointer", marginTop: 24, marginBottom: 10 }}>Submit another</button>
          <p style={{ margin: 0, fontSize: 12, color: "#86efac" }}>Auto-resetting in {countdown}s</p>
        </div>
      </div>
    );
  }

  const micLabel = !selectedJobId
    ? "Select a job first"
    : isRecording
    ? "Release to submit"
    : isTranscribing
    ? "Transcribing…"
    : isError
    ? "Failed — try again"
    : "Hold to record";

  const micBg = isBusy || !selectedJobId
    ? "#e2e8f0"
    : isRecording
    ? "linear-gradient(135deg, #dc2626, #ef4444)"
    : "linear-gradient(135deg, #1d4ed8, #3b82f6)";

  const micColor = isBusy || !selectedJobId ? "#94a3b8" : "#fff";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; background: #f8fafc; }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .mic-ring { position: absolute; inset: -16px; border-radius: 50%; background: rgba(239,68,68,0.25); animation: pulse-ring 1.2s ease-out infinite; pointer-events: none; }
      `}</style>

      <div style={{ background: "#0f172a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: isRecording ? "#ef4444" : "#22c55e", transition: "background 0.2s" }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Luxor Field</span>
        {isRecording && <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginLeft: "auto" }}>● REC</span>}
        {isTranscribing && <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600, marginLeft: "auto" }}>Processing…</span>}
      </div>

      <div style={{ padding: "20px 16px 120px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Job</label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              disabled={loadingJobs || isBusy}
              style={{ width: "100%", padding: "14px 44px 14px 16px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 16, fontWeight: 500, color: selectedJobId ? "#0f172a" : "#94a3b8", background: "#fff", appearance: "none", WebkitAppearance: "none", cursor: "pointer", outline: "none" }}
            >
              {loadingJobs ? <option>Loading jobs…</option>
                : jobs.length === 0 ? <option value="">— No open jobs —</option>
                : <><option value="">Select a job…</option>{jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} — {j.title}</option>)}</>}
            </select>
            <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#64748b" }}>▾</div>
          </div>
          {selectedJob && (
            <div style={{ marginTop: 6, padding: "8px 12px", background: "#f1f5f9", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
              {selectedJob.address && <div>{selectedJob.address}</div>}
              {selectedJob.clientName && <div>{selectedJob.clientName}{selectedJob.serviceType ? ` · ${selectedJob.serviceType}` : ""}</div>}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", margin: "32px 0 28px" }}>
          <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
            {isRecording && <div className="mic-ring" />}
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              onPointerCancel={stopRecording}
              disabled={!selectedJobId || isBusy}
              style={{
                width: 128, height: 128, borderRadius: "50%", border: "none",
                background: micBg,
                cursor: (!selectedJobId || isBusy) ? "not-allowed" : "pointer",
                fontSize: 52, position: "relative", zIndex: 1, color: micColor,
                boxShadow: isRecording ? "0 8px 32px rgba(239,68,68,0.5)" : (!selectedJobId || isBusy) ? "none" : "0 8px 32px rgba(59,130,246,0.4)",
                transform: isRecording ? "scale(0.94)" : "scale(1)",
                transition: "background 0.15s, box-shadow 0.2s, transform 0.12s",
                userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
              }}
            >
              {isTranscribing ? "⏳" : "🎤"}
            </button>
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: isRecording ? "#ef4444" : isError ? "#b91c1c" : "#64748b", transition: "color 0.15s" }}>
            {micLabel}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            {isTranscribing ? "Whisper is transcribing your audio…" : "Hold mic · speak · release to submit"}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>Your name <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
          <input
            value={workerName}
            onChange={e => setWorkerName(e.target.value)}
            placeholder="e.g. Miguel"
            disabled={isBusy}
            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 15, color: "#0f172a", outline: "none", background: "#fff" }}
          />
        </div>

        {isError && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c", fontSize: 14, fontWeight: 600 }}>
            Recording failed. Check microphone permissions and try again.
          </div>
        )}
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}><div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div></div>}>
      <FieldApp />
    </Suspense>
  );
}
