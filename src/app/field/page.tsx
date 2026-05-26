"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Job } from "@/types/jobs";

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionI;
    webkitSpeechRecognition: new () => SpeechRecognitionI;
  }
}
interface SpeechRecognitionI extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number; results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognitionResultList {
  length: number; [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean; [i: number]: { transcript: string };
}

function FieldApp() {
  const searchParams = useSearchParams();
  const businessId = searchParams?.get("businessId") ?? "demo-roofing";
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [workerName, setWorkerName] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [text, setText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionI | null>(null);
  const pressingRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectedLang = useRef("en-US");

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    detectedLang.current = navigator.language || "en-US";
  }, []);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/jobs?businessId=${businessId}`)
      .then(r => r.json())
      .then(d => {
        const open = (d.jobs as Job[]).filter(j => j.status !== "complete");
        setJobs(open);
        if (prefillJobId && open.find(j => j.jobId === prefillJobId)) {
          setSelectedJobId(prefillJobId);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingJobs(false));
  }, [businessId, prefillJobId]);

  function startRecognition() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = detectedLang.current;
    rec.continuous = true;
    rec.interimResults = true;
    let lastCommittedIndex = -1;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "", newFinals = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          if (i > lastCommittedIndex) {
            newFinals += (newFinals ? " " : "") + e.results[i][0].transcript.trim();
            lastCommittedIndex = i;
          }
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      if (newFinals.trim()) setText(p => p.trimEnd() ? p.trimEnd() + " " + newFinals : newFinals);
      setInterimText(interim);
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setInterimText("");
      if (pressingRef.current && e.error !== "not-allowed" && e.error !== "service-not-allowed") {
        setTimeout(() => { if (pressingRef.current) startRecognition(); }, 400);
      } else {
        setPressing(false); pressingRef.current = false;
      }
    };
    rec.onend = () => {
      setInterimText("");
      if (pressingRef.current) setTimeout(() => { if (pressingRef.current) startRecognition(); }, 400);
    };
    rec.start();
    recRef.current = rec;
  }

  function handlePressStart(e: React.PointerEvent) {
    e.preventDefault();
    if (pressingRef.current) return;
    pressingRef.current = true;
    setPressing(true);
    startRecognition();
  }
  function handlePressEnd() {
    if (!pressingRef.current) return;
    pressingRef.current = false;
    setPressing(false);
    recRef.current?.stop();
    setInterimText("");
  }

  async function submit() {
    if (!selectedJobId || !text.trim()) {
      setError("Select a job and record an update.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const selectedJob = jobs.find(j => j.jobId === selectedJobId);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          rawText: text.trim(),
          language: detectedLang.current.split("-")[0],
          submittedBy: workerName.trim() || undefined,
          jobContext: {
            title: selectedJob?.title,
            address: selectedJob?.address,
            serviceType: selectedJob?.serviceType,
            clientName: selectedJob?.clientName,
          },
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setText(""); setInterimText(""); setCountdown(5);
        countdownRef.current = setInterval(() => {
          setCountdown(c => {
            if (c <= 1) { clearInterval(countdownRef.current!); setSubmitted(false); setError(null); return 5; }
            return c - 1;
          });
        }, 1000);
      } else {
        setError("Failed to submit. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    clearInterval(countdownRef.current!);
    setSubmitted(false); setError(null); setCountdown(5);
  }

  const selectedJob = jobs.find(j => j.jobId === selectedJobId);
  const canSubmit = !!selectedJobId && !!text.trim() && !submitting;

  if (submitted) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f0fdf4", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 360, width: "100%" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36, color: "#fff" }}>✓</div>
          <h2 style={{ fontWeight: 800, fontSize: 26, margin: "0 0 8px", color: "#15803d" }}>Update sent!</h2>
          <p style={{ color: "#166534", fontSize: 15, margin: "0 0 4px" }}>Saved to <strong>{selectedJobId}</strong></p>
          <p style={{ color: "#4ade80", fontSize: 13, margin: "0 0 32px" }}>AI is parsing your update now</p>
          <button onClick={reset} style={{ width: "100%", padding: "16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
            Submit another
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#86efac" }}>Auto-resetting in {countdown}s</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; background: #f8fafc; }
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        .mic-ring {
          position: absolute; inset: -16px; border-radius: 50%;
          background: rgba(239,68,68,0.25);
          animation: pulse-ring 1.2s ease-out infinite;
          pointer-events: none;
        }
        @media print { .no-print { display: none; } }
      `}</style>

      {/* Header */}
      <div style={{ background: "#0f172a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: pressing ? "#ef4444" : "#22c55e", transition: "background 0.2s" }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>Luxor Field</span>
        {pressing && <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 600, marginLeft: "auto" }}>● REC</span>}
      </div>

      <div style={{ padding: "20px 16px 120px", maxWidth: 480, margin: "0 auto" }}>

        {/* Job selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
            Job
          </label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              disabled={loadingJobs}
              style={{
                width: "100%", padding: "14px 44px 14px 16px",
                borderRadius: 12, border: "1.5px solid #e2e8f0",
                fontSize: 16, fontWeight: 500, color: selectedJobId ? "#0f172a" : "#94a3b8",
                background: "#fff", appearance: "none", WebkitAppearance: "none",
                cursor: "pointer", outline: "none",
              }}
            >
              {loadingJobs ? <option>Loading jobs…</option>
                : jobs.length === 0 ? <option value="">— No open jobs —</option>
                : <>
                  <option value="">Select a job…</option>
                  {jobs.map(j => (
                    <option key={j.jobId} value={j.jobId}>
                      {j.jobId} — {j.title}
                    </option>
                  ))}
                </>
              }
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

        {/* Mic section */}
        {voiceSupported && (
          <div style={{ textAlign: "center", margin: "28px 0 24px" }}>
            <div style={{ position: "relative", display: "inline-block", marginBottom: 14 }}>
              {pressing && <div className="mic-ring" />}
              <button
                onPointerDown={handlePressStart}
                onPointerUp={handlePressEnd}
                onPointerLeave={handlePressEnd}
                onPointerCancel={handlePressEnd}
                style={{
                  width: 128, height: 128, borderRadius: "50%", border: "none",
                  background: pressing
                    ? "linear-gradient(135deg, #dc2626, #ef4444)"
                    : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                  cursor: "pointer", fontSize: 52, position: "relative", zIndex: 1,
                  boxShadow: pressing
                    ? "0 8px 32px rgba(239,68,68,0.5)"
                    : "0 8px 32px rgba(59,130,246,0.4)",
                  transform: pressing ? "scale(0.94)" : "scale(1)",
                  transition: "background 0.15s, box-shadow 0.2s, transform 0.12s",
                  userSelect: "none", WebkitUserSelect: "none", touchAction: "none",
                }}
              >
                🎤
              </button>
            </div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: pressing ? "#ef4444" : "#64748b", transition: "color 0.15s" }}>
              {pressing ? "Recording — release to pause" : "Hold to record"}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
              Hold mic · release · hold again · tap Submit when done
            </p>
          </div>
        )}

        {/* Transcript */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
            Update {voiceSupported ? "— or type" : ""}
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={voiceSupported ? "Hold the mic above and speak, or type here…" : "Type your update here…"}
            rows={5}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: pressing ? "2px solid #ef4444" : "1.5px solid #e2e8f0",
              fontSize: 15, lineHeight: 1.65, resize: "vertical",
              color: "#0f172a", outline: "none", transition: "border-color 0.15s",
              background: "#fff",
            }}
          />
          {interimText && (
            <div style={{ marginTop: 6, padding: "8px 12px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", fontStyle: "italic" }}>
              <strong style={{ fontStyle: "normal" }}>Hearing: </strong>{interimText}
            </div>
          )}
        </div>

        {/* Worker name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 8 }}>
            Your name <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span>
          </label>
          <input
            value={workerName}
            onChange={e => setWorkerName(e.target.value)}
            placeholder="e.g. Miguel"
            style={{
              width: "100%", padding: "13px 16px", borderRadius: 12,
              border: "1.5px solid #e2e8f0", fontSize: 15, color: "#0f172a",
              outline: "none", background: "#fff",
            }}
          />
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {error}
          </div>
        )}
      </div>

      {/* Fixed submit bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #f1f5f9", padding: "12px 16px", paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            background: canSubmit ? "linear-gradient(135deg, #1d4ed8, #3b82f6)" : "#e2e8f0",
            color: canSubmit ? "#fff" : "#94a3b8",
            fontWeight: 800, fontSize: 17,
            cursor: canSubmit ? "pointer" : "not-allowed",
            transition: "background 0.15s",
            boxShadow: canSubmit ? "0 4px 16px rgba(59,130,246,0.35)" : "none",
          }}
        >
          {submitting ? "Sending…" : "Submit Update"}
        </button>
      </div>
    </>
  );
}

export default function FieldPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <div style={{ color: "#64748b", fontSize: 14 }}>Loading…</div>
      </div>
    }>
      <FieldApp />
    </Suspense>
  );
}
