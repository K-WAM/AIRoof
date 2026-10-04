"use client";

// The one way to pick a job on both field screens (2026-10-04). Built for a shop with 50 jobs open and a worker who
// has never seen the app: a search box, a short list of the jobs this person is most likely at, and "Show all" under
// it. Finished jobs stay reachable (a late photo, a callback) — they just sit below the open ones with a "Done" tag.
// Once a job is picked it collapses to one card; tapping the card reopens the picker.

import { useMemo, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { matchesJobSearch } from "@/lib/jobs/search";
import type { Job } from "@/types/jobs";

const LIKELY = 5;
const DONE = new Set(["complete", "invoiced"]);

/** The short list: clocked-in job, the last one used on this device, this crew's jobs (today's first), then the newest. */
export function likelyJobs(jobs: Job[], opts: { clockedInJobId?: string | null; recentJobId?: string | null; myCrewId?: string | null; now?: number }): Job[] {
  const now = opts.now ?? Date.now();
  const dayStart = now - ((now % 86_400_000) || 0); // coarse "today" for ranking only; the exact day does not matter here
  const score = (j: Job): number => {
    if (j.jobId === opts.clockedInJobId) return 0;
    if (j.jobId === opts.recentJobId) return 1;
    if (opts.myCrewId && j.assignedCrewId === opts.myCrewId) return j.scheduledStart && j.scheduledStart >= dayStart && j.scheduledStart < dayStart + 86_400_000 ? 2 : 3;
    return 4;
  };
  return jobs
    .filter((j) => !DONE.has(j.status))
    .map((j, i) => ({ j, s: score(j), i }))
    .sort((a, b) => a.s - b.s || (b.j.updatedAt ?? 0) - (a.j.updatedAt ?? 0) || a.i - b.i)
    .slice(0, LIKELY)
    .map((x) => x.j);
}

export function JobPicker({ jobs, loading, selectedId, onSelect, myCrewId, clockedInJobId, recentJobId }: {
  jobs: Job[];
  loading: boolean;
  selectedId: string;
  onSelect: (jobId: string) => void;
  myCrewId?: string | null;
  clockedInJobId?: string | null;
  recentJobId?: string | null;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const selected = jobs.find((j) => j.jobId === selectedId);
  const open = !selected || picking;

  const likely = useMemo(() => likelyJobs(jobs, { clockedInJobId, recentJobId, myCrewId }), [jobs, clockedInJobId, recentJobId, myCrewId]);
  const all = useMemo(() => [...jobs].sort((a, b) => Number(DONE.has(a.status)) - Number(DONE.has(b.status)) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)), [jobs]);
  const q = query.trim();
  const rows = q ? all.filter((j) => matchesJobSearch(j, q)).slice(0, 20) : showAll ? all : likely;
  const hiddenCount = !q && !showAll ? all.length - likely.length : 0;

  const choose = (id: string) => { onSelect(id); setPicking(false); setQuery(""); setShowAll(false); };

  const Row = ({ job, last }: { job: Job; last: boolean }) => (
    <button type="button" onClick={() => choose(job.jobId)} data-testid="job-option"
      style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", borderBottom: last ? "none" : "1px solid #334155", cursor: "pointer", color: "#f8fafc" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: "#f97316" }}>{job.jobId}</span>
        {job.jobId === clockedInJobId && <Tag color="#5eead4">Clocked in</Tag>}
        {myCrewId && job.assignedCrewId === myCrewId && job.jobId !== clockedInJobId && <Tag color="#5eead4">Your crew</Tag>}
        {DONE.has(job.status) && <Tag color="#94a3b8">Done</Tag>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{job.title}</div>
      {job.address && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{job.address}</div>}
    </button>
  );

  if (loading) {
    return <div style={{ padding: "14px 16px", background: "#1e293b", border: "1px solid #334155", borderRadius: 16, color: "#64748b", fontSize: 15 }}>Loading jobs…</div>;
  }

  if (!open && selected) {
    return (
      <button type="button" onClick={() => setPicking(true)} aria-label={`Job ${selected.jobId} — tap to change`} data-testid="job-selected"
        style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 16, padding: "14px 16px", textAlign: "left", cursor: "pointer", color: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#f97316", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>{selected.jobId}</span>
          {DONE.has(selected.status) && <Tag color="#94a3b8">Done</Tag>}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#94a3b8" }}>Change <ChevronDown size={16} strokeWidth={1.75} /></span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{selected.title}</div>
        {selected.address && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
            <MapPin size={12} strokeWidth={1.75} />{selected.address}
          </div>
        )}
      </button>
    );
  }

  return (
    <div data-testid="job-picker">
      <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{selected ? "Change job" : "Which job are you at?"}</p>
      {jobs.length > LIKELY && (
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search size={16} strokeWidth={1.75} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#64748b", pointerEvents: "none" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Job number, name or address" aria-label="Search jobs" inputMode="search" autoComplete="off"
            style={{ width: "100%", padding: "12px 12px 12px 38px", borderRadius: 12, border: "1.5px solid #334155", background: "#0f172a", color: "#f1f5f9", fontSize: 15, outline: "none" }} />
        </div>
      )}
      <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 16, overflow: "hidden" }}>
        {rows.length === 0 && <p style={{ margin: 0, padding: "14px 16px", color: "#94a3b8", fontSize: 14 }}>{q ? `Nothing matches “${q}”.` : "No jobs yet."}</p>}
        {rows.map((job, i) => <Row key={job.jobId} job={job} last={i === rows.length - 1} />)}
      </div>
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowAll(true)} style={{ marginTop: 8, width: "100%", minHeight: 40, background: "transparent", border: "1px dashed #334155", borderRadius: 12, color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Show all {all.length} jobs
        </button>
      )}
      {selected && <button type="button" onClick={() => { setPicking(false); setQuery(""); setShowAll(false); }} style={{ marginTop: 8, width: "100%", minHeight: 40, background: "transparent", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>Keep {selected.jobId}</button>}
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${color}26`, color }}>{children}</span>;
}
