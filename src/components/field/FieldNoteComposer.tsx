"use client";

// One way to send a field note, shared by both field screens (the signed-in /company/field and the no-login QR
// /field) — 2026-10-04 field-update pass. It exists to make three things impossible to get wrong:
//   1. WHICH JOB: the job the note goes to is printed right above the button, in words, before anyone talks; a crew
//      member clocked in at a different job is warned; a pending correction stays tied to the job it came from.
//   2. WHO: the author's name is shown before sending and on the receipt (the server records the login, or the name
//      typed on a QR link — never an anonymous note).
//   3. WHAT HAPPENED: a receipt that stays on screen — "Saved to J-1001 by Carlos · Added 12 bundles…" — instead of a
//      two-second flash, and plain-words errors that say what to do next.
// Voice is primary (hold to talk, or tap once to start and once to stop); typing is always one tap away.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Keyboard, Mic, X } from "lucide-react";
import { useFieldAudio, type FieldAudioResult } from "@/hooks/useFieldAudio";
import type { ProposedCorrection } from "@/types/jobs";

export interface ComposerJob { jobId: string; title?: string; address?: string }
export interface SavedReceipt { jobId: string; by?: string; summary: string; transcript?: string; updatedJob?: FieldAudioResult["updatedJob"] }

const TAP_MS = 400;
const card: React.CSSProperties = { borderRadius: 14, padding: "12px 14px", fontSize: 13, lineHeight: 1.45 };
const ghostBtn: React.CSSProperties = {
  minHeight: 44, padding: "10px 14px", borderRadius: 12, border: "1px solid #334155", background: "transparent",
  color: "#cbd5e1", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
};
const primaryBtn: React.CSSProperties = { ...ghostBtn, border: "none", background: "var(--accent, #0f766e)", color: "#fff" };

export function FieldNoteComposer({
  businessId,
  job,
  authorName,
  blockedReason,
  clockedInJobId,
  onSaved,
}: {
  businessId: string | null;
  job: ComposerJob | null;
  /** Shown before sending ("as Carlos"); the server records the same name. */
  authorName: string;
  /** Why notes can't be sent yet (no name typed, no job picked). Null = ready. */
  blockedReason?: string | null;
  /** The job this person is clocked in at, if any — a different selected job gets a warning. */
  clockedInJobId?: string | null;
  onSaved?: (receipt: SavedReceipt) => void;
}) {
  const jobId = job?.jobId ?? null;
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [typedProposal, setTypedProposal] = useState<{ correction: ProposedCorrection; jobId: string } | null>(null);
  const [typedError, setTypedError] = useState<string | null>(null);
  const tapMode = useRef(false);
  const [tapping, setTapping] = useState(false); // mirrors tapMode for the label
  const setTap = (on: boolean) => { tapMode.current = on; setTapping(on); };
  const pressedAt = useRef(0);

  // A different job clears what belonged to the last one: its receipt, a half-typed note's correction, any error.
  useEffect(() => { setReceipt(null); setTypedProposal(null); setTypedError(null); }, [jobId]);

  const saved = useCallback((r: SavedReceipt) => { setReceipt(r); onSaved?.(r); }, [onSaved]);
  const onVoiceSuccess = useCallback((result: FieldAudioResult) => {
    saved({ jobId: result.jobId ?? jobId ?? "", by: result.submittedBy ?? authorName, summary: result.changesSummary, transcript: result.transcript, updatedJob: result.updatedJob });
  }, [saved, jobId, authorName]);

  const audio = useFieldAudio(blockedReason ? null : jobId, { businessId, submittedBy: authorName || undefined, onSuccess: onVoiceSuccess });
  const recording = audio.status === "recording";
  const working = audio.status === "transcribing" || savingText;
  const ready = !!jobId && !blockedReason;
  useEffect(() => { if (!recording && tapMode.current && audio.status !== null) setTap(false); }, [recording, audio.status]);

  // Hold to talk, or tap once to start and tap again to stop — a quick tap no longer records half a second of nothing.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!ready || working) return;
    if (recording && tapMode.current) { setTap(false); void audio.stopRecording(e); return; }
    setReceipt(null);
    pressedAt.current = Date.now();
    setTap(false);
    void audio.startRecording(e);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (tapMode.current) return;
    if (Date.now() - pressedAt.current < TAP_MS) { setTap(true); return; }
    void audio.stopRecording(e);
  };
  const onPointerLeave = (e: React.PointerEvent) => { if (!tapMode.current && recording) void audio.stopRecording(e); };

  async function postTyped(body: Record<string, unknown>, targetJobId: string) {
    setSavingText(true); setTypedError(null);
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(targetJobId)}/updates`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, submittedBy: authorName || undefined, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setTypedError(typeof data.error === "string" ? data.error : "Not saved. Check your signal and try again."); return null; }
      return data as { proposedCorrection?: ProposedCorrection; changesSummary?: string; submittedBy?: string; jobId?: string };
    } catch {
      setTypedError("Not saved — no connection. Your text is still here; try again.");
      return null;
    } finally { setSavingText(false); }
  }

  async function saveTyped() {
    if (!ready || !jobId || !text.trim() || working) return;
    const data = await postTyped({ rawText: text.trim() }, jobId);
    if (!data) return;
    if (data.proposedCorrection) { setTypedProposal({ correction: data.proposedCorrection, jobId }); return; }
    const said = text.trim();
    setText(""); setTyping(false);
    saved({ jobId: data.jobId ?? jobId, by: data.submittedBy ?? authorName, summary: data.changesSummary ?? "Saved", transcript: said });
  }

  async function confirmTyped() {
    if (!typedProposal) return;
    const data = await postTyped({ confirmCorrection: typedProposal.correction }, typedProposal.jobId);
    if (!data) return;
    setTypedProposal(null); setText(""); setTyping(false);
    saved({ jobId: data.jobId ?? typedProposal.jobId, by: data.submittedBy ?? authorName, summary: "Correction applied" });
  }

  const proposal = audio.proposedCorrection ? { correction: audio.proposedCorrection, jobId: audio.proposedFor ?? jobId ?? "" } : typedProposal;
  const confirmProposal = audio.proposedCorrection ? audio.confirmCorrection : confirmTyped;
  const cancelProposal = audio.proposedCorrection ? audio.cancelCorrection : () => setTypedProposal(null);
  const error = audio.status === "error" || audio.errorMessage ? (audio.errorMessage ?? "Didn't catch that. Hold the button and try again.") : typedError;

  const micLabel = !jobId ? "Pick a job above first"
    : blockedReason ? blockedReason
    : recording ? (tapping ? "Recording… tap to stop" : "Listening… let go to save")
    : audio.status === "transcribing" ? (audio.progress ?? "Saving…")
    : "Hold to talk — or tap to start";
  const mismatch = !!jobId && !!clockedInJobId && clockedInJobId !== jobId;

  return (
    <section aria-label="Send a field note" style={{ display: "grid", gap: 14 }}>
      {/* WHERE + WHO, before anything is said */}
      {jobId ? (
        <div data-testid="note-target" style={{ ...card, background: "#0b1324", border: "1px solid #1e3a5f", color: "#cbd5e1" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7dd3fc" }}>Notes go to</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#f8fafc", marginTop: 2 }}>{jobId}{job?.title ? ` · ${job.title}` : ""}</div>
          {job?.address && <div style={{ color: "#94a3b8", marginTop: 2 }}>{job.address}</div>}
          {authorName && <div style={{ color: "#94a3b8", marginTop: 4 }}>Sent as <strong style={{ color: "#e2e8f0" }}>{authorName}</strong></div>}
        </div>
      ) : null}
      {mismatch && (
        <div role="alert" data-testid="note-job-mismatch" style={{ ...card, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.5)", color: "#fcd34d", display: "flex", gap: 8 }}>
          <AlertTriangle size={16} style={{ flex: "none", marginTop: 2 }} />
          <span>You&apos;re clocked in at <strong>{clockedInJobId}</strong>, but notes will go to <strong>{jobId}</strong>. Switch the job above if that&apos;s wrong.</span>
        </div>
      )}

      {/* The button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 4 }}>
        <button
          type="button"
          aria-label={recording ? "Stop recording" : "Record a voice note"}
          data-testid="note-mic"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={onPointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!ready || working}
          style={{
            width: 112, height: 112, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
            border: recording ? "3px solid #f97316" : "2px solid #334155",
            background: !ready || working ? "#1e293b" : recording ? "#f97316" : "var(--accent, #0f766e)",
            boxShadow: recording ? "0 0 0 10px rgba(249,115,22,0.18)" : "0 6px 20px rgba(0,0,0,0.4)",
            cursor: !ready || working ? "not-allowed" : "pointer", touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
            transition: "background .15s, box-shadow .2s",
          }}
        >
          <Mic size={44} strokeWidth={1.75} color={!ready || working ? "#64748b" : "#fff"} />
        </button>
        <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: recording ? "#fdba74" : ready ? "#cbd5e1" : "#64748b", textAlign: "center" }}>
          {micLabel}
        </p>
        {ready && !recording && !working && (
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", textAlign: "center", maxWidth: 320 }}>
            Say what you used, who worked how long, and anything you found — e.g. &ldquo;12 bundles of shingles, Carlos 8 hours, cracked vent boot.&rdquo;
          </p>
        )}
      </div>

      {error && (
        <div role="alert" data-testid="note-error" style={{ ...card, background: "#2d0f0f", border: "1px solid #7f1d1d", color: "#fca5a5" }}>{error}</div>
      )}

      {receipt && (
        <div role="status" data-testid="note-receipt" style={{ ...card, background: "#0f2d1a", border: "1px solid #166534", color: "#bbf7d0" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Check size={16} style={{ flex: "none", marginTop: 2 }} />
            <div>
              <strong>Saved to {receipt.jobId}{receipt.by ? ` by ${receipt.by}` : ""}</strong>
              <div>{receipt.summary}</div>
              {receipt.transcript && <div style={{ color: "#86efac", fontStyle: "italic", marginTop: 4 }}>&ldquo;{receipt.transcript.length > 160 ? `${receipt.transcript.slice(0, 160)}…` : receipt.transcript}&rdquo;</div>}
            </div>
          </div>
        </div>
      )}

      {proposal && (
        <div data-testid="note-correction" style={{ ...card, background: "#1e293b", border: "1.5px solid #f97316", color: "#f8fafc" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 800, color: "#fdba74", textTransform: "uppercase", letterSpacing: "0.06em" }}>Change an earlier entry on {proposal.jobId}?</p>
          <p style={{ margin: "0 0 4px", fontSize: 15 }}>
            <strong style={{ textTransform: "capitalize" }}>{proposal.correction.item}</strong>: <strong style={{ color: "#fca5a5" }}>{proposal.correction.oldValue}</strong> → <strong style={{ color: "#86efac" }}>{proposal.correction.newValue}</strong>
          </p>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#94a3b8" }}>Total becomes <strong style={{ color: "#f8fafc" }}>{proposal.correction.newTotal}</strong> (was {proposal.correction.currentTotal}).</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={cancelProposal} disabled={working} style={{ ...ghostBtn, flex: 1 }}><X size={15} /> Keep as is</button>
            <button type="button" onClick={() => void confirmProposal()} disabled={working} style={{ ...primaryBtn, flex: 2, background: "#f97316" }}><Check size={15} /> {working ? "Applying…" : "Yes, change it"}</button>
          </div>
        </div>
      )}

      {/* Typing: one tap away, same receipt */}
      {!typing ? (
        <button type="button" onClick={() => setTyping(true)} disabled={!ready} data-testid="note-type-toggle"
          style={{ ...ghostBtn, width: "100%", borderStyle: "dashed", color: ready ? "#94a3b8" : "#475569", cursor: ready ? "pointer" : "not-allowed" }}>
          <Keyboard size={15} /> Type a note instead
        </button>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <label htmlFor="field-note-text" style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>Note for {jobId}</label>
          <textarea id="field-note-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={5000} autoFocus disabled={working}
            placeholder="Materials used, who worked how long, anything you found…"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 15, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => { setTyping(false); setText(""); setTypedError(null); }} disabled={savingText} style={{ ...ghostBtn, flex: 1 }}>Cancel</button>
            <button type="button" onClick={() => void saveTyped()} disabled={!ready || !text.trim() || working} data-testid="note-save"
              style={{ ...primaryBtn, flex: 2, opacity: !ready || !text.trim() || working ? 0.5 : 1 }}>{savingText ? "Saving…" : `Save to ${jobId}`}</button>
          </div>
        </div>
      )}
    </section>
  );
}
