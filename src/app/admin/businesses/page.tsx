"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { PageError } from "@/components/ui/PageError";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { loadBusinesses, type BizRow } from "./loadBusinesses";
import { DEMO_BUSINESS_IDS, type EffectiveAccountPurpose } from "@/lib/accounts/purpose";
import type { PhoneLineView } from "@/types/phoneLine";
import { NewClientModal } from "./NewClientModal";
import { SyncPersonasPanel } from "./SyncPersonasPanel";
import { Building2, ExternalLink, Pencil, Plus } from "lucide-react";

/**
 * Contracts C-A (account purpose, computed by the server: demo tenants are derived, missing = "unclassified") and
 * C-B (phone-line registry).
 */
type AccountPurpose = EffectiveAccountPurpose;

interface AdminBizRow extends BizRow {
  accountPurpose?: string | null;
  voiceProvider?: "vapi" | "elevenlabs" | null;
  phoneNumber?: string;
  contactPhone?: string;
  elevenlabs?: { phoneNumber?: string; extraPhoneNumbers?: string[] };
}


type Filter = "clients" | "demo" | "archived";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "clients", label: "Clients" },
  { id: "demo", label: "Demo & test" },
  { id: "archived", label: "Archived" },
];

function effectivePurpose(row: AdminBizRow): AccountPurpose {
  // The server already derives "demo"; this guard only covers a row loaded before that field existed.
  if (DEMO_BUSINESS_IDS.has(row.businessId)) return "demo";
  const p = row.accountPurpose;
  if (p === "client" || p === "demo" || p === "test" || p === "archived") return p;
  return "unclassified";
}

function purposeLabel(purpose: AccountPurpose): string {
  switch (purpose) {
    case "client": return "Client";
    case "demo": return "Demo";
    case "test": return "Test";
    case "archived": return "Archived";
    default: return "Needs classifying";
  }
}

function voiceProviderLabel(row: AdminBizRow): string {
  if (row.voiceProvider === "elevenlabs") return "ElevenLabs";
  if (row.voiceProvider === "vapi") return "Vapi";
  return "None";
}

function lineStatusWords(status: PhoneLineView["status"]): string {
  switch (status) {
    case "draft": return "Draft — Luxor connects this line";
    case "provisioned": return "Provisioned — awaiting app connection";
    case "connected": return "Connected — not yet tested";
    case "test_passed": return "Test passed";
    case "live": return "Live";
    case "retired": return "Retired";
    default: return "Status unavailable";
  }
}

function fallbackNumber(row: AdminBizRow): string | null {
  return row.phoneNumber ?? row.contactPhone ?? row.elevenlabs?.phoneNumber ?? null;
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<AdminBizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("clients");
  // null = the phone-line API is unavailable; never render Ready/Live from guesswork.
  const [lines, setLines] = useState<PhoneLineView[] | null>(null);

  function reload() {
    setLoading(true);
    void loadBusinesses().then((result) => {
      if (result.status === "error") {
        setLoadError(true);
      } else {
        setBusinesses(result.businesses as AdminBizRow[]);
        setLoadError(false);
      }
      setLoading(false);
    });
  }

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/phone-lines")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((data: { lines?: PhoneLineView[] }) => { if (!cancelled) setLines(Array.isArray(data.lines) ? data.lines : []); })
      .catch(() => { if (!cancelled) setLines(null); });
    return () => { cancelled = true; };
  }, []);

  const linesByBusiness = useMemo(() => {
    const map = new Map<string, PhoneLineView>();
    if (lines) for (const line of lines) if (!map.has(line.businessId)) map.set(line.businessId, line);
    return map;
  }, [lines]);

  const withPurpose = businesses.map((row) => ({ row, purpose: effectivePurpose(row) }));

  const visible = withPurpose.filter(({ purpose }) => {
    if (filter === "clients") return purpose === "client" || purpose === "unclassified";
    if (filter === "demo") return purpose === "demo" || purpose === "test";
    return purpose === "archived";
  });

  const clientCount = withPurpose.filter(({ purpose }) => purpose === "client" || purpose === "unclassified").length;
  const demoTestCount = withPurpose.filter(({ purpose }) => purpose === "demo" || purpose === "test").length;
  const linesLive = lines ? lines.filter((line) => line.status === "live").length : null;
  const needsAttention = lines
    ? withPurpose.filter(({ row, purpose }) => {
        if (purpose !== "client" && purpose !== "unclassified") return false;
        const line = linesByBusiness.get(row.businessId);
        return !line || (line.status !== "live" && line.status !== "test_passed");
      }).length
    : withPurpose.filter(({ purpose }) => purpose === "unclassified").length;

  const vapiEligible = withPurpose.filter(
    ({ row }) => row.voiceProvider === "vapi" && Boolean(row.vapiAssistantId)
  );

  if (loading) return <PageSkeleton rows={6} />;
  if (loadError) {
    return (
      <PageError
        message="Client accounts could not be loaded, so no tenant data is being shown."
        onRetry={reload}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <Building2 size={20} strokeWidth={1.75} />
            Clients
          </h1>
          <p className="page-subtitle">
            Every tenant on the platform. Click Edit to configure an agent, Preview to see the client view.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center", alignSelf: "flex-start" }}>
          <Link href="/hub/onboarding" className="button" style={{ fontSize: 13 }}>
            Advanced setup
          </Link>
          <button
            type="button"
            className="button primary"
            onClick={() => setNewClientOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-1)" }}
          >
            <Plus size={15} strokeWidth={1.75} />
            + Client
          </button>
        </div>
      </header>

      <NewClientModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onCreated={reload}
      />

      <section className="metric-grid" aria-label="Client summary" style={{ marginBottom: "var(--sp-5)" }}>
        <article className="metric">
          <p className="metric-label">Clients</p>
          <p className="metric-value">{clientCount}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Lines live</p>
          <p className="metric-value">{linesLive === null ? "—" : linesLive}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Needs attention</p>
          <p className="metric-value">{needsAttention}</p>
        </article>
        <article className="metric">
          <p className="metric-label">Demo &amp; test</p>
          <p className="metric-value">{demoTestCount}</p>
        </article>
      </section>

      {lines === null && (
        <InlineNotice message="Phone line status is unavailable — showing each client's own number, marked not verified." />
      )}

      <section className="panel" aria-labelledby="biz-list-title">
        <div className="panel-header" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="panel-title" id="biz-list-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
            <Building2 size={16} strokeWidth={1.75} />
            {FILTERS.find((f) => f.id === filter)?.label} · {visible.length}
          </h2>
          <div className="filter-chips" role="group" aria-label="Filter clients">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="filter-chip"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {visible.length === 0 ? (
            <p style={{ padding: "var(--sp-5)", color: "var(--text-muted)", fontSize: 14 }}>
              {filter === "clients"
                ? "No client accounts in this view. Click “+ Client” to onboard one."
                : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} accounts.`}
            </p>
          ) : (
            <table className="business-table" data-responsive>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Industry</th>
                  <th>Purpose</th>
                  <th>Phone line</th>
                  <th>Voice provider</th>
                  <th>Connection</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, purpose }) => {
                  const line = linesByBusiness.get(row.businessId);
                  const fallback = fallbackNumber(row);
                  return (
                    <tr
                      key={row.businessId}
                      onClick={() => { window.location.href = `/admin/businesses/${row.businessId}/config`; }}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <p className="business-name">{row.businessName}</p>
                        <p className="business-id">{row.businessId}</p>
                      </td>
                      <td data-label="Industry" style={{ textTransform: "capitalize" }}>{row.industry}</td>
                      <td data-label="Purpose">
                        <span className={`purpose-badge purpose-badge--${purpose}`}>
                          {purposeLabel(purpose)}
                        </span>
                      </td>
                      <td data-label="Phone line">
                        {line ? (
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{line.display}</span>
                        ) : lines === null ? (
                          <>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fallback ?? "No number on record"}</span>
                            <span className="cell-note">not verified</span>
                          </>
                        ) : (
                          <span className="cell-note">No line on record — Luxor sets this up</span>
                        )}
                      </td>
                      <td data-label="Voice provider">{voiceProviderLabel(row)}</td>
                      <td data-label="Connection">
                        {lines === null ? (
                          <span className="cell-note">Status unavailable</span>
                        ) : line ? (
                          lineStatusWords(line.status)
                        ) : (
                          <span className="cell-note">Not set up</span>
                        )}
                      </td>
                      <td data-label="Actions" style={{ display: "flex", gap: "var(--sp-1)" }} onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/admin/businesses/${row.businessId}/config`}
                          className="button"
                          style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                          Edit
                        </Link>
                        <a
                          href={`/company/dashboard?preview=${row.businessId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="button"
                          style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5 }}
                        >
                          <ExternalLink size={13} strokeWidth={1.75} />
                          Preview
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <details className="advanced-disclosure" style={{ marginTop: "var(--sp-5)" }}>
        <summary>
          Advanced · Vapi assistants ({vapiEligible.length} eligible)
        </summary>
        <p className="advanced-disclosure-note">
          Only tenants answered by Vapi with an assistant id: {vapiEligible.map(({ row }) => row.businessName).join(", ") || "none"}.
        </p>
        <SyncPersonasPanel />
      </details>
    </>
  );
}
