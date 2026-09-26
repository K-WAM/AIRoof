"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import type { Job } from "@/types/jobs";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { Briefcase, ExternalLink, FilePlus, Plus, Search } from "lucide-react";
import { useQuickAddRefresh } from "@/lib/events/quickAdd";
import { matchesJobSearch } from "@/lib/jobs/search";

type StatusFilter = "all" | "inspection" | "quoted" | "in_progress" | "invoiced" | "complete";

export default function JobsPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const { vocab } = useBusinessModules();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Prefill from the Pipeline's "Create <jobNoun>" buttons (appointments and
  // leads share this one handshake — see src/lib/pipeline/jobPrefill.ts).
  const prefillClientName = searchParams?.get("clientName") ?? "";
  const prefillClientPhone = searchParams?.get("clientPhone") ?? "";
  const prefillAddress = searchParams?.get("address") ?? "";
  const prefillServiceType = searchParams?.get("serviceType") ?? "";
  const prefillApptId = searchParams?.get("appointmentId") ?? "";
  const prefillLeadId = searchParams?.get("leadId") ?? "";
  const prefillNotes = searchParams?.get("notes") ?? "";

  // Lifted to controlled state (unlike the rest of the form, read via
  // FormData on submit) so the customer combobox can drive them: picking an
  // existing customer fills phone/address and remembers customerId; typing a
  // novel name leaves customerId null and gets resolved in the background
  // after the job is created (see createJob below).
  const [clientName, setClientName] = useState(prefillClientName);
  const [clientPhone, setClientPhone] = useState(prefillClientPhone);
  const [address, setAddress] = useState(prefillAddress);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const fetchJobs = useCallback(async (before?: number) => {
    if (!businessId) return;
    if (before !== undefined) setLoadingOlder(true);
    fetch(`/api/jobs?businessId=${encodeURIComponent(businessId)}${statusFilter !== "all" ? `&status=${statusFilter}` : ""}${before !== undefined ? `&before=${before}` : ""}`)
      .then((r) => {
        if (!r.ok) throw new Error("Jobs request failed");
        return r.json();
      })
      .then((d) => {
        setJobs((current) => before === undefined ? (d.jobs ?? []) : [...new Map([...current, ...(d.jobs ?? [])].map((job: Job) => [job.jobId, job])).values()]);
        setHasMore(Boolean(d.hasMore));
        setNextBefore(typeof d.nextBefore === "number" ? d.nextBefore : null);
        setLoadError(false);
      })
      .catch(() => before === undefined ? setLoadError(true) : setActionError("Older jobs could not be loaded. Try again."))
      .finally(() => { setLoading(false); setLoadingOlder(false); });
  }, [businessId, statusFilter]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Picks up a job created via the global quick-add while sitting on this page.
  useQuickAddRefresh("job", fetchJobs);

  // Auto-open form when navigated from Pipeline's "Create <jobNoun>" buttons
  // (appointmentId = appointment provenance, leadId = lead provenance).
  useEffect(() => {
    if (prefillApptId || prefillLeadId) setShowForm(true);
  }, [prefillApptId, prefillLeadId]);

  async function createJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setActionError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          title: fd.get("title"),
          clientName: clientName.trim() || undefined,
          clientPhone: clientPhone.trim() || undefined,
          address: address.trim() || undefined,
          customerId: selectedCustomerId ?? undefined,
          serviceType: fd.get("serviceType"),
          notes: fd.get("notes"),
          appointmentId: fd.get("appointmentId") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.job) throw new Error("Job creation failed");
      setJobs((prev) => [data.job, ...prev]);
      setShowForm(false);
      setJustCreatedId(data.job.jobId);
      (e.target as HTMLFormElement).reset();

      // A novel name (no existing customer picked) — find-or-create and
      // link it in the background. The job is already created and visible
      // above; this never blocks or can fail the create flow itself.
      if (!selectedCustomerId && clientName.trim() && businessId) {
        fetch("/api/company/customers/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId, jobId: data.job.jobId,
            name: clientName.trim(), phone: clientPhone.trim() || undefined, address: address.trim() || undefined,
          }),
        }).catch(() => {});
      }

      setClientName(""); setClientPhone(""); setAddress(""); setSelectedCustomerId(null);
      setTimeout(() => setJustCreatedId(null), 4000);
    } catch {
      setActionError("The job could not be created. Review the form and try again.");
    } finally {
      setCreating(false);
    }
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: tz,
    });
  }

  const visibleJobs = jobs
    .filter((j) =>
      statusFilter === "all" ||
      (statusFilter === "inspection" ? (j.status === "inspection" || j.status === "open") : j.status === statusFilter)
    )
    .filter((j) => matchesJobSearch(j, query));

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="Jobs could not be loaded. No job data is being shown."
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Briefcase size={20} strokeWidth={1.75} />
            Jobs
          </h1>
          <p className="page-subtitle">Field jobs created from appointments or manually.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {businessId && <a className="button" href={`/api/jobs/export?businessId=${encodeURIComponent(businessId)}`}>Export CSV</a>}
          <a className="button" href={`/field?businessId=${businessId}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ExternalLink size={15} strokeWidth={1.75} />
            Field view
          </a>
          <button className="button primary" onClick={() => setShowForm((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {!showForm && <Plus size={15} strokeWidth={1.75} />}
            {showForm ? "Cancel" : `New ${vocab.jobNoun}`}
          </button>
        </div>
      </header>

      {actionError && (
        <div role="alert" style={{ marginBottom: 16, color: "var(--danger)" }}>
          {actionError}
        </div>
      )}

      {showForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FilePlus size={16} strokeWidth={1.75} />
              New {vocab.jobNoun}
            </h2>
          </div>
          <div className="panel-body">
            <form onSubmit={createJob}>
              <div className="form-grid">
                <div className="field full">
                  <label>{vocab.jobNoun} title *</label>
                  <input name="title" required placeholder={vocab.jobTitlePlaceholder} />
                </div>
                <div className="field">
                  <CustomerCombobox
                    businessId={businessId}
                    label={`${vocab.customerNoun} name`}
                    value={clientName}
                    onChangeText={setClientName}
                    onSelect={(c) => {
                      setSelectedCustomerId(c.customerId);
                      if (c.phone) setClientPhone(c.phone);
                      if (c.address) setAddress(c.address);
                    }}
                    onClearSelection={() => setSelectedCustomerId(null)}
                    placeholder="John Smith, or start typing to find an existing one"
                  />
                </div>
                <div className="field">
                  <label>{vocab.customerNoun} phone</label>
                  <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+1 (305) 555-0100" />
                </div>
                <div className="field full">
                  <label>Address</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Miami, FL" />
                </div>
                <div className="field">
                  <label>Service type</label>
                  <input name="serviceType" defaultValue={prefillServiceType} placeholder={vocab.serviceTypePlaceholder} />
                </div>
                <input type="hidden" name="appointmentId" value={prefillApptId} />
                <div className="field full">
                  <label>Notes</label>
                  <input name="notes" defaultValue={prefillNotes} placeholder="Any additional context…" />
                </div>
              </div>
              <div className="button-row" style={{ marginTop: 16 }}>
                <button className="button primary" type="submit" disabled={creating} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <FilePlus size={15} strokeWidth={1.75} />
                  {creating ? "Creating…" : `Create ${vocab.jobNoun}`}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {justCreatedId && (
        <div style={{
          marginBottom: 12, padding: "10px 16px", background: "#f0fdf4",
          border: "1px solid #86efac", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 14,
        }}>
          <span style={{ color: "#15803d", fontWeight: 700 }}>✓ Job {justCreatedId} created</span>
          <a href={`/company/jobs/${justCreatedId}${previewSuffix}`} className="button" style={{ fontSize: 12, padding: "4px 12px" }}>
            View →
          </a>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="toolbar" style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ position: "relative", maxWidth: 340 }}>
            <Search size={14} strokeWidth={1.75} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search jobs, clients, addresses, phone…"
              aria-label="Search jobs"
              autoComplete="off"
              style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
            />
          </div>
          <div className="segmented-control" aria-label="Filter by status">
            {([
              // Named for the NEXT ACTION so the list doubles as a to-do list (keys stay the stored statuses).
              { key: "all",         label: "All" },
              { key: "inspection",  label: "Needs quote" },
              { key: "quoted",      label: "Quote sent" },
              { key: "in_progress", label: "In progress" },
              { key: "complete",    label: "Ready to invoice" },
              { key: "invoiced",    label: "Invoiced" },
            ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => {
              const count = key === "all"
                ? jobs.length
                : key === "inspection"
                ? jobs.filter((j) => j.status === "inspection" || j.status === "open").length
                : jobs.filter((j) => j.status === key).length;
              return (
                <button
                  key={key}
                  className="segment"
                  type="button"
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter(key)}
                >
                  {label} <span style={{ opacity: 0.6, fontSize: 11 }}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <section className="panel">
          <div className="panel-body">
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: "0 0 12px" }}>
              No {vocab.jobNounPlural.toLowerCase()} yet. When someone calls, confirm their request in Pipeline and the {vocab.jobNoun.toLowerCase()} is created for you — or start one yourself.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="button primary" href={`/company/pipeline${previewSuffix}`}>Go to Pipeline</a>
              <button type="button" className="button" onClick={() => setShowForm(true)}>New {vocab.jobNoun}</button>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Job ID</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Title</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Client</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Status</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Created</th>
                  <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleJobs.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "20px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                      {query.trim() ? `No jobs match "${query}".` : "No jobs match this filter."}
                      {query.trim() && hasMore && nextBefore !== null && <button type="button" className="button small" disabled={loadingOlder} onClick={() => fetchJobs(nextBefore)} style={{ marginLeft: 8 }}>{loadingOlder ? "Searching…" : "Search older jobs"}</button>}
                    </td>
                  </tr>
                )}
                {visibleJobs.map((job) => (
                  <tr
                    key={job.jobId}
                    onClick={() => { window.location.href = `/company/jobs/${job.jobId}${previewSuffix}`; }}
                    style={{ borderBottom: "1px solid #f1f5f9", background: job.jobId === justCreatedId ? "#f0fdf4" : undefined, transition: "background 0.1s", cursor: "pointer" }}
                    onMouseEnter={(e) => { if (job.jobId !== justCreatedId) (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = job.jobId === justCreatedId ? "#f0fdf4" : ""; }}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>
                      {job.jobId}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600 }}>{job.title}</div>
                      {job.address && <div style={{ fontSize: 12, color: "#64748b" }}>{job.address}</div>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {job.clientName ?? <span style={{ color: "#94a3b8" }}>—</span>}
                      {job.clientPhone && <div style={{ fontSize: 12, color: "#64748b" }}>{job.clientPhone}</div>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusChip status={job.status} />
                    </td>
                    <td style={{ padding: "12px 16px", color: "#64748b", fontSize: 13 }}>
                      {formatDate(job.createdAt)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <a
                        href={`/company/jobs/${job.jobId}${previewSuffix}`}
                        className="button"
                        style={{ fontSize: 12, padding: "4px 12px" }}
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && nextBefore !== null && <div style={{ padding: 16, textAlign: "center" }}><button type="button" className="button" disabled={loadingOlder} onClick={() => fetchJobs(nextBefore)}>{loadingOlder ? "Loading…" : "Load older jobs"}</button></div>}
        </section>
      )}
    </>
  );
}
