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
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
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
  const [detectedLang, setDetectedLang] = useState("en-US");
  const [text, setText] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [error, setError] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    // Auto-detect browser/OS language — no picker needed
    setDetectedLang(navigator.language || "en-US");
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

  function startListening() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    // Use browser language for recognition — picks up accent/dialect automatically
    rec.lang = detectedLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < event.results.length; i++) {
        full += event.results[i][0].transcript;
      }
      setText(full);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
  }

  async function submit() {
    if (!selectedJobId || !text.trim()) {
      setError("Select a job and enter an update.");
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
          language: detectedLang.split("-")[0],
          submittedBy: workerName.trim() || undefined,
          // Job context passed to AI parser for smarter extraction
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
          <button className="button primary" onClick={reset} style={{ fontSize: 16, padding: "12px 32px", marginBottom: 12 }}>
            Submit another
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
            Resetting automatically in {countdown}s…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 40px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 24, margin: "0 0 4px", color: "#1e293b" }}>Field Update</h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
          Select your job, speak your update, tap Submit.
        </p>
      </div>

      {/* Job selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>Job *</label>
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
          disabled={loadingJobs}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, background: loadingJobs ? "#f8fafc" : "#fff" }}
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
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>Your name <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional)</span></label>
        <input
          value={workerName}
          onChange={(e) => setWorkerName(e.target.value)}
          placeholder="e.g. Miguel"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, boxSizing: "border-box" }}
        />
      </div>

      {/* Voice button */}
      {voiceSupported && (
        <div style={{ marginBottom: 16, textAlign: "center" }}>
          <button
            onClick={listening ? stopListening : startListening}
            style={{
              width: 96, height: 96, borderRadius: "50%", border: "none",
              background: listening ? "#fee2e2" : "#eff6ff",
              cursor: "pointer", fontSize: 40,
              boxShadow: listening ? "0 0 0 10px #fca5a540" : "0 2px 12px #2563eb20",
              transition: "box-shadow 0.3s, background 0.2s",
            }}
          >
            {listening ? "⏹" : "🎤"}
          </button>
          <p style={{ fontSize: 12, color: listening ? "#b91c1c" : "#94a3b8", margin: "8px 0 0", fontWeight: listening ? 700 : 400 }}>
            {listening ? `Listening (${detectedLang})… tap to stop` : "Tap to speak"}
          </p>
        </div>
      )}

      {/* Text area */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
          Update *
          {voiceSupported && <span style={{ fontWeight: 400, color: "#94a3b8" }}> (or use voice above)</span>}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe what was done, materials used, issues found, crew on site, hours worked…"
          rows={6}
          style={{
            width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0",
            fontSize: 15, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box",
          }}
        />
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>
          Speak naturally in any language — AI extracts materials, hours, and issues automatically.
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
          transition: "background 0.2s",
        }}
      >
        {submitting ? "Sending…" : "Submit Update"}
      </button>
    </div>
  );
}
