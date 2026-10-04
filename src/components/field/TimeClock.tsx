"use client";

// Tap-based time clock (Phase 12, Phase 5 — docs/PLATFORM-EXPANSION-PLAN.md), shared by the signed-in field screen and
// the no-login QR one. Reworked 2026-10-04 ("arrived at office / started lunch… were confusing, but we want the
// functionality"):
//   - Plain verbs that say what the tap DOES: "Clock in at J-1001", "Clock in at the office", "Start lunch", "End lunch",
//     "Leave J-1001", "Clock out for the day".
//   - One big status line with a running timer ("At J-1001 · 1h 05m"), and today's total so far.
//   - Only the taps that make sense right now; the likeliest one is filled.
//   - "Clock out for the day" asks once (it ends the paid day).
//   - Office time is explained where it is offered: paid, but not billed to a job.
// The parent hears every state change (onDayChange) so the note composer can warn when notes and hours point at
// different jobs.

import { useCallback, useEffect, useState } from "react";
import { Building2, Coffee, Home, LogIn, LogOut, MapPin } from "lucide-react";
import { fmtTime } from "@/lib/format";
import type { ClockState, WorkerDay, PunchType } from "@/types/timeclock";

interface ConflictInfo {
  error: string;
  currentState?: ClockState;
  openJobId?: string;
  openSince?: number;
  suggestion?: string;
  tz?: string;
}

/** What each tap did, in the past tense — the "Last tap" line. */
const PUNCH_DONE: Record<PunchType, string> = {
  office_in: "Clocked in at the office",
  site_in: "Clocked in at a job",
  break_start: "Started lunch",
  break_end: "Ended lunch",
  site_out: "Left the job",
  office_out: "Clocked out for the day",
};

function emptyDay(): WorkerDay {
  return { workerKey: "", workerName: "", dayKey: "", state: "off", officeMs: 0, jobs: {}, anomalies: [] };
}

function clockError(status: number, message?: string): string {
  if (status === 401 || status === 403 || message === "Field access revoked" || message === "Field access token expired") {
    return "This link has expired — ask the office for a new QR code.";
  }
  return message || "Time clock unavailable — please try again.";
}

/** "1h 05m" / "12m". */
export function fmtDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function TimeClock({
  businessId,
  jobId,
  workerName,
  onDayChange,
}: {
  businessId: string | null;
  jobId: string | null;
  workerName: string;
  onDayChange?: (day: WorkerDay) => void;
}) {
  const [day, setDayState] = useState<WorkerDay>(emptyDay());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // The server returns the business's timezone with every response (the QR page has no BootstrapContext to read it from).
  const [tz, setTz] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [confirmingOut, setConfirmingOut] = useState(false);

  const setDay = useCallback((next: WorkerDay) => {
    setDayState(next);
    setFetchedAt(Date.now());
    onDayChange?.(next);
  }, [onDayChange]);

  const refresh = useCallback(() => {
    if (!businessId) return;
    setError(null);
    setLoading(true);
    const params = new URLSearchParams({ businessId, ...(jobId ? { jobId } : {}), ...(workerName.trim() ? { workerName: workerName.trim() } : {}) });
    fetch(`/api/timeclock/punch?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          if (body.error === "workerName required") { setNeedsName(true); return; }
          throw new Error(clockError(r.status, body.error));
        }
        setNeedsName(false);
        const body = await r.json();
        setDay(body.day);
        setTz(body.tz);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load time clock"))
      .finally(() => setLoading(false));
  }, [businessId, jobId, workerName, setDay]);

  useEffect(() => { refresh(); }, [refresh]);

  // The running timer: one tick a minute is enough for an "h m" display.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function punch(type: PunchType, opts: { closeOpen?: boolean } = {}) {
    if (!businessId || busy) return;
    setBusy(true);
    setError(null);
    setConfirmingOut(false);
    try {
      const res = await fetch("/api/timeclock/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          type,
          jobId: type === "site_in" ? jobId || undefined :
            (day.state === "site" || day.state === "site_break") && type !== "office_out"
              ? day.openJobId : undefined,
          workerName: workerName.trim() || undefined,
          closeOpen: opts.closeOpen,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setConflict(body as ConflictInfo);
        if (body.tz) setTz(body.tz);
        return;
      }
      if (!res.ok) {
        setError(clockError(res.status, body.error));
        return;
      }
      setConflict(null);
      setDay(body.day);
      setTz(body.tz);
      setNow(Date.now());
    } catch {
      setError("Not saved — no connection. Tap again when you have signal.");
    } finally {
      setBusy(false);
    }
  }

  if (!businessId) return null;

  const btnStyle: React.CSSProperties = {
    flex: "1 1 140px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "rgba(51,65,85,0.45)",
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: 700,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
  };
  const primaryStyle: React.CSSProperties = { ...btnStyle, flex: "1 1 100%", background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff", fontSize: 15 };

  // Live elapsed: the server folded everything up to `fetchedAt`; add the minutes since while a clock is running.
  const accruing = day.state === "office" || day.state === "site";
  const liveExtra = accruing ? Math.max(0, now - fetchedAt) : 0;
  const totalMs = day.officeMs + Object.values(day.jobs).reduce((sum, j) => sum + j.ms, 0) + liveExtra;
  const sinceStart = day.openSince ? now - day.openSince : day.lastPunchAt ? now - day.lastPunchAt : 0;
  const onJob = day.state === "site" || day.state === "site_break";
  const switching = day.state === "site" && !!jobId && jobId !== day.openJobId;

  const status = (() => {
    switch (day.state) {
      case "office": return day.lastPunchType === "site_out"
        ? { text: "On the clock — between jobs", sub: `${fmtDuration(sinceStart)} since you left the last job` }
        : { text: "At the office", sub: `${fmtDuration(sinceStart)} · paid, not billed to a job` };
      case "site": return { text: `At ${day.openJobId ?? "the job"}`, sub: `${fmtDuration(sinceStart)} · these hours go on the job` };
      case "break_office": return { text: "On lunch", sub: `${fmtDuration(sinceStart)} · not paid` };
      case "site_break": return { text: `On lunch — ${day.openJobId ?? "job"}`, sub: `${fmtDuration(sinceStart)} · not paid` };
      default: return { text: "Off the clock", sub: jobId ? `Clock in at ${jobId} and your hours go on it. Office time is paid, not billed to a job.` : "Pick your job above, or clock in at the office (paid, not billed to a job)." };
    }
  })();
  const lastTap = day.lastPunchType && day.lastPunchAt && tz ? `Last tap: ${PUNCH_DONE[day.lastPunchType]} · ${fmtTime(day.lastPunchAt, tz)}` : null;

  const clockInAtJob = (primary: boolean) => (
    <button style={primary ? primaryStyle : btnStyle} disabled={busy || !jobId} onClick={() => punch("site_in")} data-testid="clock-site-in">
      <MapPin size={16} strokeWidth={1.75} /> {jobId ? `Clock in at ${jobId}` : "Pick a job to clock in there"}
    </button>
  );
  const clockOut = (
    <button style={btnStyle} disabled={busy} onClick={() => setConfirmingOut(true)}>
      <Home size={16} strokeWidth={1.75} /> Clock out for the day
    </button>
  );
  const lunch = (
    <button style={btnStyle} disabled={busy} onClick={() => punch("break_start")}>
      <Coffee size={16} strokeWidth={1.75} /> Start lunch
    </button>
  );

  return (
    <section aria-label="Time clock" data-testid="time-clock" style={{
      background: "rgba(15,23,42,0.6)",
      border: `1px solid ${onJob ? "rgba(94,234,212,0.4)" : "rgba(148,163,184,0.2)"}`,
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Time clock</span>
        {totalMs > 0 && <span style={{ fontSize: 12, color: "#94a3b8" }}>Today: <strong style={{ color: "#e2e8f0" }}>{fmtDuration(totalMs)}</strong></span>}
      </div>
      <div role="status" aria-live="polite" style={{ margin: "6px 0 10px" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: onJob ? "#5eead4" : "#f8fafc" }}>{loading && !day.dayKey ? "…" : status.text}</div>
        {!(loading && !day.dayKey) && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{status.sub}</div>}
      </div>

      {needsName ? (
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Enter your name above to use the time clock.</p>
      ) : confirmingOut ? (
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(51,65,85,0.45)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#f8fafc" }}>
            Clock out for the day{onJob ? ` (this also leaves ${day.openJobId})` : ""}? Your hours today: <strong>{fmtDuration(totalMs)}</strong>.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnStyle} disabled={busy} onClick={() => setConfirmingOut(false)}>Not yet</button>
            <button style={{ ...btnStyle, background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" }} disabled={busy} onClick={() => punch("office_out")} data-testid="clock-out-confirm">
              <LogOut size={16} strokeWidth={1.75} /> Yes, clock out
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {day.state === "off" && (
              <>
                {clockInAtJob(!!jobId)}
                <button style={jobId ? btnStyle : primaryStyle} disabled={busy} onClick={() => punch("office_in")}>
                  <Building2 size={16} strokeWidth={1.75} /> Clock in at the office
                </button>
              </>
            )}
            {day.state === "office" && (
              <>
                {clockInAtJob(true)}
                {lunch}
                {clockOut}
              </>
            )}
            {day.state === "break_office" && (
              <button style={primaryStyle} disabled={busy} onClick={() => punch("break_end")}>
                <Coffee size={16} strokeWidth={1.75} /> End lunch
              </button>
            )}
            {day.state === "site" && (
              <>
                {switching && (
                  <button style={primaryStyle} disabled={busy} onClick={() => punch("site_in", { closeOpen: true })}>
                    <MapPin size={16} strokeWidth={1.75} /> Switch to {jobId} (leaves {day.openJobId})
                  </button>
                )}
                <button style={switching ? btnStyle : primaryStyle} disabled={busy} onClick={() => punch("site_out")}>
                  <LogOut size={16} strokeWidth={1.75} /> Leave {day.openJobId ?? "job"}
                </button>
                {lunch}
                {clockOut}
              </>
            )}
            {day.state === "site_break" && (
              <>
                <button style={primaryStyle} disabled={busy} onClick={() => punch("break_end")}>
                  <Coffee size={16} strokeWidth={1.75} /> End lunch
                </button>
                <button style={btnStyle} disabled={busy} onClick={() => punch("site_out")}>
                  <LogOut size={16} strokeWidth={1.75} /> Leave {day.openJobId ?? "job"}
                </button>
              </>
            )}
          </div>
          {/* The status line already says where you are and since when; the last tap only matters when it reads
              oddly (e.g. "between jobs"), so it shows only then. */}
          {lastTap && day.state === "office" && day.lastPunchType === "site_out" && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8" }}>{lastTap}</p>}
        </>
      )}

      {conflict?.suggestion && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#fdba74" }}>
            You&apos;re still clocked in at <strong>{conflict.openJobId}</strong>
            {conflict.openSince && conflict.tz ? ` (since ${fmtTime(conflict.openSince, conflict.tz)})` : ""}. Leave it and clock in at {jobId}?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnStyle, flex: "none" }} onClick={() => setConflict(null)}>Cancel</button>
            <button style={{ ...btnStyle, flex: "none", background: "#f97316", color: "#fff", border: "none" }} onClick={() => punch("site_in", { closeOpen: true })}>
              <LogIn size={14} strokeWidth={1.75} /> Switch job
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
    </section>
  );
}
