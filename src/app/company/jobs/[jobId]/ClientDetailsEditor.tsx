"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Job } from "@/types/jobs";

type ClientFields = Pick<Job, "clientName" | "clientPhone" | "clientEmail" | "address">;

/**
 * The job header's customer lines, with an Edit form for the office. The address the AI took on the call is the quote's
 * and invoice's bill-to, so it must be fixable here; one save also updates the customer record and any draft quote or
 * invoice (PATCH /api/jobs/[jobId]/client). Locked once the invoice has been sent.
 */
export function ClientDetailsEditor({ job, businessId, canEdit, locked, onSaved }: {
  job: Job;
  businessId: string;
  canEdit: boolean;
  locked: boolean;
  onSaved: (client: ClientFields) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setForm({ name: job.clientName ?? "", phone: job.clientPhone ?? "", email: job.clientEmail ?? "", address: job.address ?? "" });
    setError("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(job.jobId)}/client`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the customer details");
      onSaved(data.client as ClientFields);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the customer details");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => (
      <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
        {label}
        <input type={type} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
          style={{ padding: "8px 10px", fontSize: 14 }} />
      </label>
    );
    return (
      <div style={{ display: "grid", gap: 8, maxWidth: 520, margin: "6px 0 2px" }}>
        {field("name", "Customer name")}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {field("phone", "Phone", "tel")}
          {field("email", "Email", "email", "for quotes and invoices")}
        </div>
        {field("address", "Address (bill-to and service address)", "text", "Street, city, state ZIP")}
        {error && <p role="alert" style={{ margin: 0, color: "var(--danger, #b91c1c)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className="button" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Also updates this customer&apos;s record and any draft quote or invoice.</p>
      </div>
    );
  }

  return (
    <>
      {job.address && <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>{job.address}</p>}
      <p style={{ fontSize: 13, color: "#94a3b8", margin: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {job.clientName && <span>{job.clientName}{job.clientPhone ? ` · ${job.clientPhone}` : ""}{job.clientEmail ? ` · ${job.clientEmail}` : ""}</span>}
        {canEdit && (locked
          ? <span title="The invoice has been sent, so these details are locked">🔒 Customer details locked</span>
          : <button type="button" className="button small" onClick={open} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Pencil size={12} strokeWidth={1.75} /> Edit customer details
            </button>)}
      </p>
    </>
  );
}
