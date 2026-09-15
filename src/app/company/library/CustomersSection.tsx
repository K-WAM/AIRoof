"use client";

import { useEffect, useMemo, useState } from "react";
import { useBusinessModules } from "@/hooks/useBusinessModules";
import { useBusinessTimezone } from "@/hooks/useBusinessTimezone";
import { matchesQuery } from "@/lib/customers/search";
import { fmtDay } from "@/lib/format";
import { Tooltip } from "@/components/ui/Tooltip";
import { StatusChip } from "@/components/ui/StatusChip";
import { Plus, Search, Users, X } from "lucide-react";
import type { CustomerSlim, Customer, CustomerKind } from "@/types/customer";
import type { Job } from "@/types/jobs";

interface Props {
  businessId: string | null;
  customers: CustomerSlim[];
  setCustomers: (c: CustomerSlim[]) => void;
  /** Land directly on one customer's detail (from CommandBar / a job's "View customer" link). */
  initialCustomerId?: string | null;
}

type DraftFields = {
  name: string; kind: CustomerKind; phone: string; email: string; address: string; notes: string;
};

const BLANK_DRAFT: DraftFields = { name: "", kind: "residential", phone: "", email: "", address: "", notes: "" };

export function CustomersSection({ businessId, customers, setCustomers, initialCustomerId }: Props) {
  const { vocab } = useBusinessModules();
  const tz = useBusinessTimezone();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialCustomerId ?? null);
  const [creating, setCreating] = useState(false);

  // Every keystroke filters the already-fetched slim list in memory — zero
  // network, sub-millisecond, which is the whole point of shipping the slim
  // list up front instead of querying Firestore per keystroke.
  const filtered = useMemo(() => {
    if (!query.trim()) return customers;
    return customers.filter((c) => matchesQuery(c, query));
  }, [customers, query]);

  const selected = customers.find((c) => c.customerId === selectedId) ?? null;

  function onCreated(customer: Customer) {
    setCustomers([{ customerId: customer.customerId, name: customer.name, kind: customer.kind, phone: customer.phone, address: customer.address, jobCount: customer.jobCount, lastJobAt: customer.lastJobAt }, ...customers]);
    setCreating(false);
    setSelectedId(customer.customerId);
  }

  function onUpdated(patch: Partial<CustomerSlim> & { customerId: string }) {
    setCustomers(customers.map((c) => (c.customerId === patch.customerId ? { ...c, ...patch } : c)));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 16, alignItems: "start" }} className="customers-grid">
      <section className="panel" style={{ minWidth: 0 }}>
        <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={16} strokeWidth={1.75} />
            {vocab.customerNounPlural} ({customers.length})
          </h2>
          <Tooltip content={`New ${vocab.customerNoun.toLowerCase()}`}>
            <button
              type="button"
              className="button small primary"
              onClick={() => { setCreating(true); setSelectedId(null); }}
              aria-label={`New ${vocab.customerNoun.toLowerCase()}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Plus size={13} strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", position: "relative" }}>
            <Search size={14} strokeWidth={1.75} style={{ position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${vocab.customerNounPlural.toLowerCase()} or phone…`}
              style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}
              autoComplete="off"
            />
          </div>
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "16px 14px", fontSize: 13, color: "#94a3b8" }}>
                {customers.length === 0
                  ? `No ${vocab.customerNounPlural.toLowerCase()} yet. Add your first with the + button above.`
                  : `No match for "${query}".`}
              </p>
            ) : (
              filtered.slice(0, 200).map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => { setSelectedId(c.customerId); setCreating(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                    background: selectedId === c.customerId ? "#f0f9ff" : "transparent",
                    border: "none", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{c.jobCount} {c.jobCount === 1 ? vocab.jobNoun.toLowerCase() : vocab.jobNounPlural.toLowerCase()}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{[c.phone, c.address].filter(Boolean).join(" · ") || "No contact info"}</div>
                </button>
              ))
            )}
            {filtered.length > 200 && (
              <p style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>Showing the first 200 of {filtered.length} matches — refine your search.</p>
            )}
          </div>
        </div>
      </section>

      {creating ? (
        <CustomerDetail
          businessId={businessId}
          customerId={null}
          vocabCustomerNoun={vocab.customerNoun}
          tz={tz}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
          onUpdated={onUpdated}
        />
      ) : selected ? (
        <CustomerDetail
          businessId={businessId}
          customerId={selected.customerId}
          vocabCustomerNoun={vocab.customerNoun}
          tz={tz}
          onClose={() => setSelectedId(null)}
          onCreated={onCreated}
          onUpdated={onUpdated}
        />
      ) : (
        <section className="panel">
          <div className="panel-body" style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8" }}>
            <Users size={28} strokeWidth={1.5} style={{ marginBottom: 8, opacity: 0.6 }} />
            <p style={{ fontSize: 13.5, margin: 0 }}>
              Select a {vocab.customerNoun.toLowerCase()} to see their {vocab.jobNounPlural.toLowerCase()}, or add a new one.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

// ── Detail / create panel ──────────────────────────────────────────────────
function CustomerDetail({
  businessId, customerId, vocabCustomerNoun, tz, onClose, onCreated, onUpdated,
}: {
  businessId: string | null;
  customerId: string | null; // null = create mode
  vocabCustomerNoun: string;
  tz: string;
  onClose: () => void;
  onCreated: (c: Customer) => void;
  onUpdated: (patch: Partial<CustomerSlim> & { customerId: string }) => void;
}) {
  const isCreate = customerId === null;
  const [loading, setLoading] = useState(!isCreate);
  const [loadError, setLoadError] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [draft, setDraft] = useState<DraftFields>(BLANK_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const activeKey = customerId ?? "__create__";
  if (activeKey !== loadedFor) {
    // Synchronous reset when the selection changes — avoids a one-frame
    // flash of the previous customer's data before the effect below runs.
    setLoadedFor(activeKey);
    setError(null);
    if (isCreate) {
      setDraft(BLANK_DRAFT);
      setCustomer(null);
      setJobs([]);
      setLoading(false);
    } else {
      setLoading(true);
      setLoadError(false);
    }
  }

  useEffect(() => {
    if (isCreate || !businessId || !customerId) return;
    let cancelled = false;
    fetch(`/api/company/customers/${customerId}?businessId=${businessId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => {
        if (cancelled) return;
        setCustomer(d.customer);
        setJobs(d.jobs ?? []);
        setDraft({
          name: d.customer.name ?? "", kind: d.customer.kind ?? "residential",
          phone: d.customer.phone ?? "", email: d.customer.email ?? "",
          address: d.customer.address ?? "", notes: d.customer.notes ?? "",
        });
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isCreate, businessId, customerId]);

  async function save() {
    if (!businessId || !draft.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (isCreate) {
        const res = await fetch("/api/company/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, ...draft }),
        });
        const data = await res.json();
        if (res.status === 409 && data.customerId) {
          throw new Error(`A matching ${vocabCustomerNoun.toLowerCase()} already exists (${data.customerId}). Search for them instead of creating a duplicate.`);
        }
        if (!res.ok || !data.customer) throw new Error("Creation failed");
        onCreated(data.customer as Customer);
      } else {
        const res = await fetch(`/api/company/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, ...draft }),
        });
        if (!res.ok) throw new Error("Update failed");
        onUpdated({ customerId: customerId!, name: draft.name, kind: draft.kind, phone: draft.phone || undefined, address: draft.address || undefined });
        setCustomer((c) => (c ? { ...c, ...draft, phone: draft.phone || undefined, address: draft.address || undefined } : c));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="panel"><div className="panel-body" style={{ color: "#94a3b8", fontSize: 13 }}>Loading…</div></section>;
  }
  if (loadError) {
    return <section className="panel"><div className="panel-body" style={{ color: "var(--danger)", fontSize: 13 }}>Could not load this {vocabCustomerNoun.toLowerCase()}.</div></section>;
  }

  return (
    <section className="panel">
      <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="panel-title">{isCreate ? `New ${vocabCustomerNoun}` : customer?.name}</h2>
        <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex" }}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="panel-body">
        {error && <p role="alert" style={{ color: "var(--danger)", marginTop: 0, fontSize: 13 }}>{error}</p>}

        <div className="form-grid">
          <div className="field full">
            <label>{vocabCustomerNoun} name *</label>
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Jane Smith, or Walmart #2291 — Facilities" />
          </div>
          <div className="field">
            <label>Type</label>
            <div className="segmented-control">
              {(["residential", "commercial"] as CustomerKind[]).map((k) => (
                <button key={k} type="button" className="segment" aria-pressed={draft.kind === k} onClick={() => setDraft((d) => ({ ...d, kind: k }))}>
                  {k === "residential" ? "Residential" : "Commercial"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="+1 (305) 555-0100" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={draft.email} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} placeholder="name@company.com" />
          </div>
          <div className="field full">
            <label>Address</label>
            <input value={draft.address} onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))} placeholder="123 Main St, Miami, FL" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Gate code, preferred contact time, anything worth remembering…" />
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 14 }}>
          <button className="button primary" onClick={save} disabled={saving || !draft.name.trim()}>
            {saving ? "Saving…" : isCreate ? `Add ${vocabCustomerNoun.toLowerCase()}` : "Save changes"}
          </button>
        </div>

        {!isCreate && (
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 10px" }}>
              Jobs ({jobs.length})
            </h3>
            {jobs.length === 0 ? (
              <p style={{ fontSize: 13, color: "#94a3b8" }}>No jobs linked to this {vocabCustomerNoun.toLowerCase()} yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {jobs.map((j) => (
                  <a
                    key={j.jobId}
                    href={`/company/jobs/${j.jobId}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: "monospace", color: "#64748b", marginRight: 6 }}>{j.jobId}</span>
                        {j.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8" }}>{fmtDay(j.createdAt, tz)}</div>
                    </div>
                    <StatusChip status={j.status} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
