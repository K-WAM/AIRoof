"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBusinessId } from "@/hooks/useBusinessId";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import type { Job } from "@/types/jobs";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

type StatusFilter = "all" | "inspection" | "quoted" | "in_progress" | "invoiced" | "complete";

export default function JobsPage() {
  const businessId = useBusinessId();
  const tz = useBusinessTimezone();
  const searchParams = useSearchParams();
  const preview = searchParams?.get("preview");
  const previewSuffix = preview ? `?preview=${preview}` : "";
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Prefill from "Create Job" button on appointments page
  const prefillClientName = searchParams?.get("clientName") ?? "";
  const prefillClientPhone = searchParams?.get("clientPhone") ?? "";
  const prefillAddress = searchParams?.get("address") ?? "";
  const prefillServiceType = searchParams?.get("serviceType") ?? "";
  const prefillApptId = searchParams?.get("appointmentId") ?? "";

  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/jobs?businessId=${businessId}`)
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [businessId]);

  // Auto-open form when navigated from appointments "Create Job" button
  useEffect(() => {
    if (prefillApptId) setShowForm(true);
  }, [prefillApptId]);

  async function createJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          title: fd.get("title"),
          clientName: fd.get("clientName"),
          clientPhone: fd.get("clientPhone"),
          address: fd.get("address"),
          serviceType: fd.get("serviceType"),
          notes: fd.get("notes"),
          appointmentId: fd.get("appointmentId") || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobs((prev) => [data.job, ...prev]);
        setShowForm(false);
        setJustCreatedId(data.job.jobId);
        (e.target as HTMLFormElement).reset();
        setTimeout(() => setJustCreatedId(null), 4000);
      }
    } finally {
      setCreating(false);
    }
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: tz,
    });
  }

  if (loading) return <PageSkeleton rows={6} />;

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">Field jobs created from appointments or manually.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a className="button" href={`/field?businessId=${businessId}`} target="_blank" rel="noopener noreferrer">Field view ↗</a>
          <button className="button primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ New Job"}
          </button>
        </div>
      </header>

      {showForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <h2 className="panel-title">New Job</h2>
          </div>
          <div className="panel-body">
            <form onSubmit={createJob}>
              <div className="form-grid">
                <div className="field full">
                  <label>Job title *</label>
                  <input name="title" required placeholder="e.g. Roof inspection — 123 Main St" />
                </div>
                <div className="field">
                  <label>Client name</label>
                  <input name="clientName" defaultValue={prefillClientName} placeholder="John Smith" />
                </div>
                <div className="field">
                  <label>Client phone</label>
                  <input name="clientPhone" defaultValue={prefillClientPhone} placeholder="+1 (305) 555-0100" />
                </div>
                <div className="field full">
                  <label>Address</label>
                  <input name="address" defaultValue={prefillAddress} placeholder="123 Main St, Miami, FL" />
                </div>
                <div className="field">
                  <label>Service type</label>
                  <input name="serviceType" defaultValue={prefillServiceType} placeholder="Shingle replacement" />
                </div>
                <input type="hidden" name="appointmentId" value={prefillApptId} />
                <div className="field full">
                  <label>Notes</label>
                  <input name="notes" placeholder="Any additional context…" />
                </div>
              </div>
              <div className="button-row" style={{ marginTop: 16 }}>
                <button className="button primary" type="submit" disabled={creating}>
                  {creating ? "Creating…" : "Create Job"}
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
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="segmented-control" aria-label="Filter by status">
            {([
              { key: "all",         label: "All" },
              { key: "inspection",  label: "Inspection" },
              { key: "quoted",      label: "Quoted" },
              { key: "in_progress", label: "In Progress" },
              { key: "invoiced",    label: "Invoiced" },
              { key: "complete",    label: "Complete" },
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
            <p style={{ color: "#888", fontSize: 14 }}>No jobs yet. Create one above or use the &ldquo;Create Job&rdquo; button on an appointment.</p>
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
                {jobs
                  .filter((j) =>
                    statusFilter === "all" ||
                    (statusFilter === "inspection" ? (j.status === "inspection" || j.status === "open") : j.status === statusFilter)
                  )
                  .map((job) => (
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
        </section>
      )}
    </>
  );
}
