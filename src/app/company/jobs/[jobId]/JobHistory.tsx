"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormat } from "@/hooks/useFormat";
import type { HistoryEvent } from "@/lib/jobs/history";

/** How many of the latest events show before "Show all" — the recent trail is what people scan for. */
const RECENT = 5;

/**
 * Read-only "Job history" — the audit trail (call -> job -> arrival -> field updates -> photos -> findings -> quote ->
 * invoice), newest first so what just happened is at the top. Derived server-side from the job's own records (the API
 * stays chronological; it is reversed here); refetched only when the job changes (`version` is job.updatedAt), so it costs
 * nothing while nothing is happening.
 */
export function JobHistory({ businessId, jobId, version }: { businessId: string; jobId: string; version: number }) {
  const { fmtDay, fmtTime } = useFormat();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${encodeURIComponent(jobId)}/history?businessId=${encodeURIComponent(businessId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history"))))
      .then((d: { events: HistoryEvent[] }) => { if (live) { setEvents(d.events ?? []); setFailed(false); } })
      // A failed refresh keeps the history already on screen.
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [businessId, jobId, version]);

  const newestFirst = useMemo(() => [...(events ?? [])].reverse(), [events]);
  const visible = showAll ? newestFirst : newestFirst.slice(0, RECENT);

  const days = useMemo(() => {
    const out: Array<{ day: string; events: HistoryEvent[] }> = [];
    for (const event of visible) {
      const day = fmtDay(event.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.events.push(event); else out.push({ day, events: [event] });
    }
    return out;
  }, [visible, fmtDay]);

  return (
    <section className="panel no-print" style={{ marginBottom: 16 }} aria-labelledby="job-history-title">
      <div className="panel-header"><h2 className="panel-title" id="job-history-title">Job history</h2></div>
      <div className="panel-body">
        {events === null && !failed && <p style={{ margin: 0, color: "var(--text-muted)" }}>Loading history…</p>}
        {events === null && failed && <p style={{ margin: 0, color: "var(--text-muted)" }}>Could not load the history. It will retry when the job changes.</p>}
        {events && events.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)" }}>Nothing has happened on this job yet.</p>}
        {days.map((group) => (
          <div key={group.day} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 4px" }}>{group.day}</div>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
              {group.events.map((event) => (
                <li key={event.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ flex: "0 0 64px", fontSize: 12, color: "var(--text-muted)", paddingTop: 2 }}>{fmtTime(event.at)}</span>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <strong style={{ fontSize: 14 }}>{event.title}</strong>
                    {event.by && <span style={{ color: "var(--text-muted)", fontSize: 13 }}> · {event.by}</span>}
                    {event.detail && <><br /><span style={{ fontSize: 13, color: "var(--text-muted)" }}>{event.detail}</span></>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {events && events.length > RECENT && (
          <button type="button" className="button small" onClick={() => setShowAll((all) => !all)}>
            {showAll ? "Show only the latest" : `Show all ${events.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
