"use client";

// Tap-based time clock (Phase 12, Phase 5 — docs/PLATFORM-EXPANSION-PLAN.md). Shared between the
// authenticated field screen (src/app/company/field/page.tsx) and the QR/anonymous one
// (src/app/field/page.tsx) — the only difference between those two callers is where `workerName`
// comes from (the logged-in user vs. a typed name), which the server resolves anyway.

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

/** What each tap is called on the buttons — the "Last tap" line reuses it so the two can never disagree. */
const PUNCH_LABEL: Record<PunchType, string> = {
  office_in: "Arrived at office",
  site_in: "Arrived at job",
  break_start: "Started lunch",
  break_end: "Back from lunch",
  site_out: "Left job",
  office_out: "Done for the day",
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

export function TimeClock({
  businessId,
  jobId,
  workerName,
}: {
  businessId: string | null;
  jobId: string | null;
  workerName: string;
}) {
  const [day, setDay] = useState<WorkerDay>(emptyDay());
  // The server resolves the business's real timezone (see loadBusinessTz) and returns it with
  // every response — this component has no other way to know it (the QR/anonymous field page
  // it also renders on has no BootstrapContext to read useBusinessTimezone() from).
  const [tz, setTz] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

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
  }, [businessId, jobId, workerName]);

  useEffect(() => { refresh(); }, [refresh]);

  async function punch(type: PunchType, opts: { closeOpen?: boolean } = {}) {
    if (!businessId || busy) return;
    setBusy(true);
    setError(null);
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
      const body = await res.json();
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
    } catch {
      setError("Punch failed — check your connection");
    } finally {
      setBusy(false);
    }
  }

  if (!businessId) return null;

  // One big button per likely next step, in the order a day actually runs (owner, 2026-09-28: "arrived office,
  // left office… should be smooth and logical"). The likeliest next tap is the filled one; nothing hides behind a hover.
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
  const primaryStyle: React.CSSProperties = { ...btnStyle, background: "var(--accent)", border: "1px solid var(--accent)", color: "#fff" };

  const since = (ms?: number) => (ms && tz ? ` since ${fmtTime(ms, tz)}` : "");
  const statusLine = (() => {
    switch (day.state) {
      // Back from a job without going home: still on the clock, but not necessarily at the office.
      case "office": return day.lastPunchType === "site_out" ? `On the clock — between jobs${since(day.openSince)}` : `At the office${since(day.openSince)}`;
      case "site": return `At ${day.openJobId ?? "the job"}${since(day.openSince)}`;
      case "break_office": return "On lunch";
      case "site_break": return `On lunch — ${day.openJobId ?? "job"}`;
      default: return "Not clocked in";
    }
  })();
  const lastTap = day.lastPunchType && day.lastPunchAt && tz
    ? `Last tap: ${PUNCH_LABEL[day.lastPunchType]} · ${fmtTime(day.lastPunchAt, tz)}`
    : null;
  const onJob = day.state === "site" || day.state === "site_break";
  const switching = day.state === "site" && !!jobId && jobId !== day.openJobId;
  const needsJobPick = !jobId && (day.state === "off" || day.state === "office");

  const arrivedAtJob = (primary: boolean) => (
    <button style={primary ? primaryStyle : btnStyle} disabled={busy || !jobId} onClick={() => punch("site_in")}>
      <MapPin size={16} strokeWidth={1.75} /> Arrived at job{jobId ? ` ${jobId}` : ""}
    </button>
  );

  return (
    <div style={{
      background: "rgba(15,23,42,0.6)",
      border: "1px solid rgba(148,163,184,0.2)",
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>
          Time clock
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: onJob ? "#5eead4" : "#e2e8f0" }}>{loading ? "…" : statusLine}</span>
      </div>

      {needsName ? (
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>Enter your name above to use the time clock.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {day.state === "off" && (
              <>
                {arrivedAtJob(!!jobId)}
                <button style={jobId ? btnStyle : primaryStyle} disabled={busy} onClick={() => punch("office_in")}>
                  <Building2 size={16} strokeWidth={1.75} /> Arrived at office
                </button>
              </>
            )}
            {day.state === "office" && (
              <>
                {arrivedAtJob(true)}
                <button style={btnStyle} disabled={busy} onClick={() => punch("break_start")}>
                  <Coffee size={16} strokeWidth={1.75} /> Start lunch
                </button>
                <button style={btnStyle} disabled={busy} onClick={() => punch("office_out")}>
                  <LogOut size={16} strokeWidth={1.75} /> Done for the day
                </button>
              </>
            )}
            {day.state === "break_office" && (
              <button style={primaryStyle} disabled={busy} onClick={() => punch("break_end")}>
                <Coffee size={16} strokeWidth={1.75} /> Back from lunch
              </button>
            )}
            {day.state === "site" && (
              <>
                {switching && (
                  <button style={primaryStyle} disabled={busy} onClick={() => punch("site_in", { closeOpen: true })}>
                    <MapPin size={16} strokeWidth={1.75} /> Arrived at {jobId}
                  </button>
                )}
                <button style={switching ? btnStyle : primaryStyle} disabled={busy} onClick={() => punch("site_out")}>
                  <LogOut size={16} strokeWidth={1.75} /> Left {day.openJobId ?? "job"}
                </button>
                <button style={btnStyle} disabled={busy} onClick={() => punch("break_start")}>
                  <Coffee size={16} strokeWidth={1.75} /> Start lunch
                </button>
                <button style={btnStyle} disabled={busy} onClick={() => punch("office_out")}>
                  <Home size={16} strokeWidth={1.75} /> Done for the day
                </button>
              </>
            )}
            {day.state === "site_break" && (
              <>
                <button style={primaryStyle} disabled={busy} onClick={() => punch("break_end")}>
                  <Coffee size={16} strokeWidth={1.75} /> Back from lunch
                </button>
                <button style={btnStyle} disabled={busy} onClick={() => punch("site_out")}>
                  <LogOut size={16} strokeWidth={1.75} /> Left {day.openJobId ?? "job"}
                </button>
              </>
            )}
          </div>
          {needsJobPick && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94a3b8" }}>Pick a job above to clock in at it.</p>
          )}
          {lastTap && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8" }}>{lastTap}</p>}
        </>
      )}

      {conflict?.suggestion && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: 10 }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#fdba74" }}>
            You&apos;re still clocked in at <strong>{conflict.openJobId}</strong>
            {conflict.openSince && conflict.tz ? ` (since ${fmtTime(conflict.openSince, conflict.tz)})` : ""}. {conflict.suggestion}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btnStyle, flex: "none" }} onClick={() => setConflict(null)}>Cancel</button>
            <button style={{ ...btnStyle, flex: "none", background: "#f97316", color: "#fff", border: "none" }} onClick={() => punch("site_in", { closeOpen: true })}>
              <LogIn size={14} strokeWidth={1.75} /> Switch job
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#fca5a5" }}>{error}</p>}
    </div>
  );
}
