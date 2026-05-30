"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";

interface Result {
  type: "lead" | "job" | "appt";
  id: string;
  name: string;
  sub: string;
  href: string;
}

export function CommandBar() {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const previewSuffix = searchParams?.get("preview") ? `?preview=${searchParams.get("preview")}` : "";

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [fetched, setFetched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      if (!fetched && businessId) fetchData();
    }
  }, [open, businessId]);

  async function fetchData() {
    try {
      const [leadsRes, jobsRes] = await Promise.all([
        fetch(`/api/businesses/${businessId}/leads`).catch(() => null),
        fetch(`/api/jobs?businessId=${businessId}`).catch(() => null),
      ]);
      const results: Result[] = [];

      if (leadsRes?.ok) {
        const { leads = [] } = await leadsRes.json().catch(() => ({}));
        for (const l of leads) {
          results.push({
            type: "lead",
            id: l.leadId,
            name: l.callerName ?? l.callerPhone ?? "Unknown caller",
            sub: l.serviceRequested ?? l.address ?? l.status ?? "",
            href: `/company/leads${previewSuffix}`,
          });
        }
      }

      if (jobsRes?.ok) {
        const { jobs = [] } = await jobsRes.json().catch(() => ({}));
        for (const j of jobs) {
          results.push({
            type: "job",
            id: j.jobId,
            name: `${j.jobId} — ${j.title}`,
            sub: j.clientName ?? j.address ?? "",
            href: `/company/jobs/${j.jobId}${previewSuffix}`,
          });
        }
      }

      setAllResults(results);
      setFetched(true);
    } catch {
      // graceful fail — search just shows nothing
    }
  }

  const q = query.toLowerCase();
  const filtered = q.length < 1
    ? []
    : allResults
        .filter((r) => r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
        .slice(0, 8);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function navigate(href: string) {
    close();
    window.location.href = href;
  }

  const TYPE_LABEL = { lead: "Lead", job: "Job", appt: "Appt" } as const;

  return (
    <>
      <button className="cmd-trigger" onClick={() => setOpen(true)} aria-label="Search">
        ⌕ Search
        <span className="cmd-kbd">⌘K</span>
      </button>

      <div className={`cmd-overlay${open ? " open" : ""}`} onClick={close}>
        <div className="cmd-box" onClick={(e) => e.stopPropagation()}>
          <div className="cmd-input-row">
            <span className="cmd-search-icon">⌕</span>
            <input
              ref={inputRef}
              className="cmd-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads, jobs…"
            />
            {query && (
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "0 2px" }}
                onClick={() => setQuery("")}
              >
                ✕
              </button>
            )}
          </div>

          <div className="cmd-results">
            {filtered.length > 0 ? (
              filtered.map((r) => (
                <button key={r.type + r.id} className="cmd-result" onClick={() => navigate(r.href)}>
                  <span className={`cmd-type cmd-type--${r.type}`}>{TYPE_LABEL[r.type]}</span>
                  <div className="cmd-result-body">
                    <p className="cmd-result-name">{r.name}</p>
                    {r.sub && <p className="cmd-result-sub">{r.sub}</p>}
                  </div>
                </button>
              ))
            ) : query.length > 0 ? (
              <p className="cmd-empty">No results for &ldquo;{query}&rdquo;</p>
            ) : (
              <p className="cmd-empty">Start typing to search…</p>
            )}
          </div>

          <p className="cmd-hint">Press Escape to close</p>
        </div>
      </div>
    </>
  );
}
