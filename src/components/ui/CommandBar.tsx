"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ExampleTag } from "@/components/ui/ExampleTag";
import { isLuxorSample, type Provenance } from "@/types/provenance";

interface Result {
  type: "lead" | "job" | "appt" | "customer";
  id: string;
  name: string;
  sub: string;
  href: string;
  /** A record Luxor made up to show the screen working (T-376) — shown with the Example tag. */
  sample?: boolean;
}

const sampleRow = (row: Record<string, unknown>) => isLuxorSample(row as { provenance?: Provenance | null });

/** A failed fetch and an empty result set are different states (T-158). */
type SearchStatus = "idle" | "searching" | "ready" | "error";

function pipelineHref(previewSuffix: string, tab: "leads" | "appointments", idKey: "lead" | "appt", id: string) {
  const base = previewSuffix ? previewSuffix + "&" : "?";
  return `/company/pipeline${base}tab=${tab}&${idKey}=${id}`;
}

function buildResults(
  previewSuffix: string,
  leadsData: { leads?: Array<Record<string, unknown>> },
  jobsData: { jobs?: Array<Record<string, unknown>> },
  apptsData: { appointments?: Array<Record<string, unknown>> },
  customersData: { customers?: Array<Record<string, unknown>> },
): Result[] {
  const results: Result[] = [];

  for (const l of leadsData.leads ?? []) {
    const id = String(l.leadId ?? "");
    results.push({
      type: "lead",
      id,
      name: String(l.callerName ?? l.callerPhone ?? "Unknown caller"),
      sub: String(l.serviceRequested ?? l.address ?? l.status ?? ""),
      href: pipelineHref(previewSuffix, "leads", "lead", id),
      sample: sampleRow(l),
    });
  }

  for (const a of apptsData.appointments ?? []) {
    const id = String(a.appointmentId ?? "");
    results.push({
      type: "appt",
      id,
      name: String(a.callerName ?? a.callerPhone ?? "Unknown caller"),
      sub: String(a.serviceType ?? a.address ?? ""),
      href: pipelineHref(previewSuffix, "appointments", "appt", id),
      sample: sampleRow(a),
    });
  }

  for (const j of jobsData.jobs ?? []) {
    const id = String(j.jobId ?? "");
    results.push({
      type: "job",
      id,
      name: `${id} — ${String(j.title ?? "")}`,
      sub: String(j.clientName ?? j.address ?? ""),
      href: `/company/jobs/${id}${previewSuffix}`,
      sample: sampleRow(j),
    });
  }

  for (const c of customersData.customers ?? []) {
    const id = String(c.customerId ?? "");
    const jobCount = Number(c.jobCount ?? 0);
    results.push({
      type: "customer",
      id,
      name: String(c.name ?? ""),
      sub: [c.phone, jobCount ? `${jobCount} job${jobCount === 1 ? "" : "s"}` : null]
        .filter(Boolean)
        .join(" · "),
      href: `/company/customers${previewSuffix ? previewSuffix + "&" : "?"}customerId=${id}`,
    });
  }

  return results;
}

export function CommandBar({ header = false }: { header?: boolean }) {
  const businessId = useBusinessId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const previewSuffix = searchParams?.get("preview") ? `?preview=${searchParams.get("preview")}` : "";
  // Products (src/lib/products): only search what this client bought — the server refuses the rest.
  const { isEnabled, vocab } = useBusinessModules();
  const hasCalls = isEnabled("calls");
  const hasJobs = isEnabled("jobs");
  const searchName = `Search requests, calls, ${hasJobs ? vocab.jobNounPlural.toLowerCase() : "bookings"} and ${vocab.customerNounPlural.toLowerCase()}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [fetched, setFetched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const titleId = useId();
  const listboxId = useId();

  useFocusTrap(open, boxRef, { onEscape: close, initialFocus: "field" });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const editing = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable=true]");
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !editing && !e.altKey && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchData = useCallback(() => {
    if (!businessId || inFlight.current) return;
    inFlight.current = true;
    setStatus("searching");
    // Same four read endpoints and the same auth as before (T-071) — no extra data. A product the client doesn't
    // have is simply not searched (an empty list), never a failed search.
    const skip = Promise.resolve(null);
    Promise.all([
      hasCalls ? fetch(`/api/businesses/${businessId}/leads`) : skip,
      hasJobs ? fetch(`/api/jobs?businessId=${businessId}`) : skip,
      hasCalls ? fetch(`/api/businesses/${businessId}/appointments?order=desc`) : skip,
      fetch(`/api/company/customers?businessId=${businessId}`),
    ])
      .then(async ([leadsRes, jobsRes, apptsRes, customersRes]) => {
        if (![leadsRes, jobsRes, apptsRes, customersRes].every((r) => !r || r.ok)) {
          throw new Error("Search request failed");
        }
        const read = (r: Response | null) => (r ? r.json().catch(() => ({})) : Promise.resolve({}));
        const [leadsData, jobsData, apptsData, customersData] = await Promise.all([leadsRes, jobsRes, apptsRes, customersRes].map(read));
        setAllResults(buildResults(previewSuffix, leadsData, jobsData, apptsData, customersData));
        setFetched(true);
        setStatus("ready");
      })
      .catch(() => setStatus("error"))
      .finally(() => { inFlight.current = false; });
  }, [businessId, previewSuffix, hasCalls, hasJobs]);

  useEffect(() => {
    if (open && !fetched && businessId) fetchData();
  }, [open, fetched, businessId, fetchData]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q.length < 1
        ? []
        : allResults
            .filter(
              (r) =>
                r.name.toLowerCase().includes(q) ||
                r.sub.toLowerCase().includes(q) ||
                r.id.toLowerCase().includes(q)
            )
            .slice(0, 8),
    [q, allResults]
  );

  useEffect(() => { setActiveIndex(0); }, [query]);

  const active = filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);
  const activeOptionId = active >= 0 ? `${listboxId}-opt-${active}` : undefined;

  function close() {
    setOpen(false);
    setQuery("");
  }

  function navigate(href: string) {
    close();
    router.push(href);
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (active >= 0) {
        e.preventDefault();
        navigate(filtered[active].href);
      }
    }
  }

  function statusText(): string {
    if (status === "searching") return "Searching…";
    if (status === "error") return "Search failed";
    if (q.length === 0) return `Type to ${searchName.toLowerCase()}`;
    if (filtered.length === 0) return `No matches for “${query}”`;
    return `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
  }

  const TYPE_LABEL = { lead: "Request", job: vocab.jobNoun, appt: "Booking", customer: vocab.customerNoun };

  return (
    <>
      {header && <input className="cmd-header-field" type="search" aria-label="Search" aria-haspopup="dialog"
        placeholder={`${searchName}…  /`} value="" onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => { if (event.key === "Enter") setOpen(true); }} />}
      <button
        className={`cmd-trigger${header ? " cmd-header-icon" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-haspopup="dialog"
      >
        <Search size={18} aria-hidden="true" /><span className={header ? "sr-only" : undefined}>Search</span>
        <span className="cmd-kbd" aria-hidden="true">⌘K</span>
      </button>

      {open && (
        <div className="cmd-overlay open" onClick={close}>
          <div
            ref={boxRef}
            className="cmd-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={titleId} className="sr-only">Search</h2>
            <div className="cmd-input-row">
              <span className="cmd-search-icon" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                className="cmd-input"
                role="combobox"
                aria-label={searchName}
                aria-expanded="true"
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder={`${searchName}…`}
              />
              {query && (
                <button
                  type="button"
                  className="cmd-clear"
                  aria-label="Clear search"
                  onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                >
                  ✕
                </button>
              )}
            </div>

            <div
              className="cmd-results"
              id={listboxId}
              role="listbox"
              aria-label="Search results"
            >
              {filtered.map((r, i) => (
                <div
                  key={r.type + r.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`cmd-result${i === active ? " cmd-result--active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => navigate(r.href)}
                >
                  <span className={`cmd-type cmd-type--${r.type}`}>{TYPE_LABEL[r.type]}</span>
                  <div className="cmd-result-body">
                    <p className="cmd-result-name"><span className="cmd-result-text">{r.name}</span>{r.sample && <ExampleTag />}</p>
                    {r.sub && <p className="cmd-result-sub">{r.sub}</p>}
                  </div>
                </div>
              ))}
            </div>

            <div className="cmd-footer">
              <span className="cmd-hint">Press Escape to close</span>
              <span className="cmd-status" role="status" aria-live="polite">
                {statusText()}
                {status === "error" && (
                  <button type="button" className="cmd-retry" onClick={() => fetchData()}>
                    Retry
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
