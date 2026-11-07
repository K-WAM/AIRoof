"use client";

import { useCallback, useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { SampleRemovalPlan, SampleScan } from "@/lib/sampleData/scan";

const LABEL: Record<string, string> = {
  staff: "People", vendors: "Vendors", crews: "Crews", customers: "Customers", jobs: "Jobs", appointments: "Bookings", leads: "Leads",
};

/**
 * T-372: what in this client's account is the client's own data and what Luxor made up to show a screen working.
 * "Remove all samples" is a dry run first (the list in the dialog), then asks for the business id, then applies.
 * Wired into config/page.tsx by the integrator: <SampleDataPanel businessId={businessId} />.
 */
export function SampleDataPanel({ businessId }: { businessId: string }) {
  const [scan, setScan] = useState<SampleScan | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [plan, setPlan] = useState<SampleRemovalPlan | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/businesses/${encodeURIComponent(businessId)}/sample-data`;

  const load = useCallback(async () => {
    try {
      const response = await fetch(base);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not count the sample data.");
      setScan(data);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not count the sample data.");
    }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const sampleTotal = (scan?.rows.reduce((sum, row) => sum + row.sample, 0) ?? 0) + (scan?.staffCrewSamples ?? 0);

  async function openRemove() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(base, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not list the samples.");
      setPlan(data.plan);
      setTyped("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not list the samples.");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}?apply=1&confirm=${encodeURIComponent(typed)}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not remove the samples.");
      setPlan(null);
      setNotice("Samples removed. The client's own data was not touched.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the samples.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="sample-data" aria-labelledby="sample-data-title">
      <div className="panel-header">
        <h2 className="panel-title" id="sample-data-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FlaskConical size={16} strokeWidth={1.75} />
          Sample data
        </h2>
      </div>
      <div className="panel-body">
        <p style={{ margin: "0 0 12px", fontSize: 13 }}>
          <strong>Client data</strong> is what the client gave us or typed themselves. <strong>Luxor samples</strong> are made-up records we
          added so a screen is not empty; they show an &ldquo;Example&rdquo; tag and can all be removed here.
        </p>
        {error && <p role="alert" style={{ color: "var(--danger)", margin: "0 0 12px" }}>{error}</p>}
        {notice && <p role="status" style={{ color: "var(--accent)", margin: "0 0 12px" }}>{notice}</p>}
        {!scan && !error && <p className="helper-text">Counting…</p>}
        {scan && (
          <>
            <table className="sample-data-table">
              <thead><tr><th scope="col">Collection</th><th scope="col">Client data</th><th scope="col">Luxor samples</th><th scope="col">Not marked</th></tr></thead>
              <tbody>
                {scan.rows.map((row) => (
                  <tr key={row.collection}><th scope="row">{LABEL[row.collection] ?? row.collection}</th><td>{row.client}</td><td>{row.sample}</td><td>{row.unmarked}</td></tr>
                ))}
              </tbody>
            </table>
            {scan.staffCrewSamples > 0 && <p className="helper-text" style={{ marginTop: 8 }}>{scan.staffCrewSamples} crew assignment{scan.staffCrewSamples === 1 ? " is a" : "s are"} Luxor guess{scan.staffCrewSamples === 1 ? "" : "es"} (the people stay; only the guessed crew is cleared).</p>}
            <p style={{ margin: "12px 0 0" }}>
              <button type="button" className="button" style={{ minHeight: 44 }} disabled={busy || sampleTotal === 0} onClick={() => void openRemove()}>
                {busy ? "Checking…" : "Remove all samples"}
              </button>
              {sampleTotal === 0 && <span className="helper-text" style={{ marginLeft: 8 }}>No samples in this account.</span>}
            </p>
          </>
        )}
      </div>

      <Modal open={!!plan} onClose={() => setPlan(null)} title="Remove all samples">
        {plan && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>This removes only the records marked as Luxor samples. Nothing marked as client data or left unmarked is touched.</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {plan.collections.filter((entry) => entry.count > 0).map((entry) => (
                <li key={entry.collection}>
                  <strong>{LABEL[entry.collection] ?? entry.collection}: {entry.count}</strong>
                  <span className="helper-text" style={{ display: "block", overflowWrap: "anywhere" }}>{entry.ids.join(", ")}{entry.idsTruncated ? ", …" : ""}</span>
                </li>
              ))}
              {plan.staffCrewClears.count > 0 && (
                <li><strong>Guessed crews cleared on {plan.staffCrewClears.count} {plan.staffCrewClears.count === 1 ? "person" : "people"}</strong>
                  <span className="helper-text" style={{ display: "block", overflowWrap: "anywhere" }}>{plan.staffCrewClears.ids.join(", ")}{plan.staffCrewClears.idsTruncated ? ", …" : ""}</span></li>
              )}
            </ul>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Type the business id <code>{businessId}</code> to confirm
              <input aria-label="Business id" value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} style={{ minHeight: 44 }} />
            </label>
            {error && <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" className="button primary" style={{ minHeight: 44 }} disabled={busy || typed !== businessId} onClick={() => void apply()}>{busy ? "Removing…" : "Remove samples"}</button>
              <button type="button" className="button" style={{ minHeight: 44 }} disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
