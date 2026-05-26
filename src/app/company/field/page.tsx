"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import type { Job } from "@/types/jobs";

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

export default function FieldPage() {
  const searchParams = useSearchParams();
  const hookBusinessId = useBusinessId();
  const businessId = searchParams?.get("businessId") ?? hookBusinessId;
  const prefillJobId = searchParams?.get("jobId") ?? "";

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState(prefillJobId);
  const [workerName, setWorkerName] = useState("");

  // Voice state
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);   // SR is actively running
  const [pressing, setPressing] = useState(false);     // finger is held down
  const [text, setText] = useState("");                // confirmed transcript (editable)
  const [interimText, setInterimText] = useState(""); // live interim from SR

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognition | null>(null);
  const pressingRef = useRef(false);   // stable ref for callbacks
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectedLang = useRef(typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US");

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    detectedLang.current = navigator.language || "en-US";
  }, []);

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/jobs?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => {
        const openJobs = (d.jobs as Job[]).filter((j) => j.status !== "complete");
        setJobs(openJobs);
        if (prefillJobId && openJobs.find((j) => j.jobId === prefillJobId)) {
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
    // Non-continuous: each session ends at a natural pause and fires onend cleanly.
    // Continuous mode on Android Chrome re-sends buffered audio when restarted,
    // causing every phrase to be duplicated across restart cycles.
    rec.continuous = false;
    rec.interimResults = true;

    // Scoped to this session — never shared between restarts
    let sessionFinal = "";

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          sessionFinal += (sessionFinal ? " " : "") + t.trim();
        } else {
          interim = t;
        }
      }
      setInterimText(interim);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setInterimText("");
      if (sessionFinal.trim()) {
        setText((prev) => (prev.trimEnd() ? prev.trimEnd() + " " + sessionFinal.trim() : sessionFinal.trim()));
        sessionFinal = "";
      }
      if (pressingRef.current && event.error !== "not-allowed" && event.error !== "service-not-allowed") {
        setTimeout(() => { if (pressingRef.current) startRecognition(); }, 250);
      } else {
        setListening(false);
      }
    };

    rec.onend = () => {
      setInterimText("");
      // Commit whatever this session captured
      if (sessionFinal.trim()) {
        setText((prev) => (prev.trimEnd() ? prev.trimEnd() + " " + sessionFinal.trim() : sessionFinal.trim()));
        sessionFinal = "";
      }
      // Restart immediately if still pressing — fresh instance, clean buffer
      if (pressingRef.current) {
        setTimeout(() => { if (pressingRef.current) startRecognition(); }, 80);
      } else {
        setListening(false);
      }
    };

    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  function handlePressStart(e: React.PointerEvent) {
    e.preventDefault(); // prevent ghost clicks on mobile
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
    setListening(false);
  }

  async function submit() {
    if (!selectedJobId || !text.trim()) {
      setError("Select a job and record an update.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const selectedJob = jobs.find((j) => j.jobId === selectedJobId);
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
        setText("");
        setInterimText("");
        setCountdown(5);
        countdownRef.current = setInterval(() => {
          setCountdown((c) => {
            if (c <= 1) {
              clearInterval(countdownRef.current!);
              setSubmitted(false);
              setError(null);
              return 5;
            }
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
    setSubmitted(false);
    setError(null);
    setCountdown(5);
  }

  const selectedJob = jobs.find((j) => j.jobId === selectedJobId);

  if (submitted) {
    return (
      <div style={{
        maxWidth: 480, margin: "0 auto", padding: 24, minHeight: "100vh",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          textAlign: "center", padding: 40, background: "#f0fdf4", borderRadius: 20,
          border: "2px solid #86efac", width: "100%",
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: "#15803d",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 32, color: "#fff",
          }}>✓</div>
          <h2 style={{ fontWeight: 800, fontSize: 22, margin: "0 0 8px", color: "#15803d" }}>Update sent!</h2>
          <p style={{ color: "#166534", fontSize: 15, margin: "0 0 4px" }}>
            Saved to <strong>{selectedJobId}</strong>.
          </p>
          <p style={{ color: "#166534", fontSize: 13, margin: "0 0 28px" }}>
            AI is structuring your update. It will appear in the job detail momentarily.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "12px 32px", background: "#15803d", color: "#fff",
              border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
              marginBottom: 12,
            }}
          >
            Submit another
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
            Resetting in {countdown}s…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 60px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 24, margin: "0 0 4px", color: "#1e293b" }}>Field Update</h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
          Select your job, hold the mic, speak your update, tap Submit.
        </p>
      </div>

      {/* Job selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6, color: "#1e293b" }}>Job *</label>
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          disabled={loadingJobs}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: "1.5px solid #e2e8f0", fontSize: 15,
            background: loadingJobs ? "#f8fafc" : "#fff",
            color: "#1e293b",
          }}
        >
          {loadingJobs ? (
            <option>Loading jobs…</option>
          ) : jobs.length === 0 ? (
            <option value="">— No open jobs —</option>
          ) : (
            <>
              <option value="">— Select a job —</option>
              {jobs.map((j) => (
                <option key={j.jobId} value={j.jobId}>
                  {j.jobId} — {j.title}
                </option>
              ))}
            </>
          )}
        </select>
        {selectedJob && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b" }}>
            {selectedJob.address && <div>{selectedJob.address}</div>}
            {selectedJob.clientName && <div>{selectedJob.clientName}{selectedJob.serviceType ? ` · ${selectedJob.serviceType}` : ""}</div>}
          </div>
        )}
      </div>

      {/* Worker name */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6, color: "#1e293b" }}>
          Your name <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span>
        </label>
        <input
          value={workerName}
          onChange={(e) => setWorkerName(e.target.value)}
          placeholder="e.g. Miguel"
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: "1.5px solid #e2e8f0", fontSize: 15, boxSizing: "border-box", color: "#1e293b",
          }}
        />
      </div>

      {/* Push-to-hold mic button */}
      {voiceSupported && (
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Hold to talk — release to pause — tap Submit when done
          </p>
          <button
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerLeave={handlePressEnd}
            onPointerCancel={handlePressEnd}
            style={{
              width: 112, height: 112, borderRadius: "50%", border: "none",
              background: pressing ? "#ef4444" : "#2563eb",
              cursor: "pointer", fontSize: 44,
              boxShadow: pressing
                ? "0 0 0 16px rgba(239,68,68,0.2), 0 0 0 32px rgba(239,68,68,0.08)"
                : "0 4px 20px rgba(37,99,235,0.35)",
              transition: "background 0.1s, box-shadow 0.2s, transform 0.1s",
              transform: pressing ? "scale(0.95)" : "scale(1)",
              userSelect: "none",
              WebkitUserSelect: "none",
              touchAction: "none",
            }}
          >
            🎤
          </button>
          <p style={{
            fontSize: 13, fontWeight: 700, margin: "12px 0 0",
            color: pressing ? "#ef4444" : "#94a3b8",
          }}>
            {pressing ? "● Recording…" : "Hold to record"}
          </p>
        </div>
      )}

      {/* Transcript area */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6, color: "#1e293b" }}>
          Update *
          {voiceSupported && <span style={{ fontWeight: 400, color: "#94a3b8" }}> — or type below</span>}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hold the mic above and speak, or type your update here…"
          rows={6}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10,
            border: pressing ? "1.5px solid #ef4444" : "1.5px solid #e2e8f0",
            fontSize: 15, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box",
            color: "#1e293b", transition: "border-color 0.15s",
          }}
        />
        {/* Live interim preview */}
        {interimText && (
          <div style={{
            marginTop: 6, padding: "8px 12px", background: "#fefce8",
            border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e",
            fontStyle: "italic",
          }}>
            <span style={{ fontWeight: 700, fontStyle: "normal" }}>Hearing: </span>{interimText}
          </div>
        )}
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
          Speak naturally — crew names, materials, hours, issues — AI extracts and structures everything.
        </p>
      </div>

      {error && (
        <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 16, fontWeight: 600 }}>{error}</p>
      )}

      <button
        onClick={submit}
        disabled={submitting || !selectedJobId || !text.trim()}
        style={{
          width: "100%", padding: "16px", borderRadius: 12, border: "none",
          background: submitting || !selectedJobId || !text.trim() ? "#e2e8f0" : "#2563eb",
          color: submitting || !selectedJobId || !text.trim() ? "#94a3b8" : "#fff",
          fontWeight: 800, fontSize: 17,
          cursor: submitting || !selectedJobId || !text.trim() ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {submitting ? "Sending…" : "Submit Update"}
      </button>
    </div>
  );
}
