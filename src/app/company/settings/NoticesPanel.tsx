"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { ApprovalStatus, EffectiveNotice } from "@/lib/documents/notices";
import type { NoticeDoc } from "@/lib/documents/legalNotices";

interface NoticesView {
  notices: EffectiveNotice[];
  approval: { approved: boolean; status: ApprovalStatus; approvedAt: number | null; blockingIds: string[] };
}

type Draft = Record<string, { enabled: boolean; text: string; showOn: NoticeDoc[] }>;

const STATUS_COPY: Record<ApprovalStatus, { tone: "ok" | "warn"; text: string }> = {
  approved: { tone: "ok", text: "Approved. These notices print on customer quotes and invoices." },
  never: { tone: "warn", text: "Not approved yet. Nothing below prints on any customer document until you approve it." },
  changed: { tone: "warn", text: "The wording changed since it was approved, so it is switched off again. Approve it once you have reviewed the new wording." },
  "draft-markers": { tone: "warn", text: "Some wording is still a draft placeholder. Replace it with your attorney's wording, or switch that notice off, before approving." },
};

const DOC_LABEL: Record<NoticeDoc, string> = { quote: "Quotes", invoice: "Invoices" };

/**
 * Settings → "Terms & notices". Owner/superadmin only (legal wording). The Florida wording ships as DRAFT: nothing prints until the
 * owner has had it reviewed and ticks approve, and any later edit withdraws the approval (documents/notices.ts).
 */
export function NoticesPanel({ businessId }: { businessId: string }) {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || !!user?.superadmin;
  const [view, setView] = useState<NoticesView | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  const adopt = useCallback((next: NoticesView) => {
    setView(next);
    setDraft(Object.fromEntries(next.notices.map((n) => [n.id, { enabled: n.enabled, text: n.text, showOn: n.appliesTo }])));
    setDirty(false);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    fetch(`/api/company/settings/document-notices?businessId=${encodeURIComponent(businessId)}`)
      .then((res) => { if (!res.ok) throw new Error("load failed"); return res.json() as Promise<NoticesView>; })
      .then((next) => { if (live) adopt(next); })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [allowed, businessId, adopt]);

  if (!allowed) return null;

  async function put(body: Record<string, unknown>, done: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/company/settings/document-notices", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(typeof data.error === "string" ? data.error : "Couldn't save. Try again."); return; }
      adopt(data as NoticesView);
      setMessage(done);
    } catch { setError("Couldn't save. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  const overrides = () => Object.fromEntries(Object.entries(draft).map(([id, value]) => [id, value]));
  const update = (id: string, patch: Partial<Draft[string]>) => { setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } })); setDirty(true); setMessage(""); };
  const status = view ? STATUS_COPY[view.approval.status] : null;
  const blocking = new Set(view?.approval.blockingIds ?? []);

  return (
    <section className="panel" id="terms-notices">
      <div className="panel-header"><h2 className="panel-title">Terms &amp; notices</h2></div>
      <div className="panel-body">
        <div role="note" style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 12 }}>
          <strong>DRAFT wording. Attorney review required.</strong> These Florida notices are starting points, not legal advice. They stay off your documents until you have had them reviewed and approve them below.
        </div>
        {loadFailed && <p role="alert" style={{ color: "#b91c1c" }}>Couldn&apos;t load the notices. Refresh the page to try again.</p>}
        {!view && !loadFailed && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}
        {view && status && <>
          <p role="status" style={{ fontSize: 13, fontWeight: 600, color: status.tone === "ok" ? "#15803d" : "#92400e" }}>{status.text}</p>
          <div style={{ display: "grid", gap: 14 }}>
            {view.notices.map((notice) => {
              const value = draft[notice.id];
              if (!value) return null;
              return (
                <div key={notice.id} style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, padding: 12, display: "grid", gap: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={value.enabled} onChange={(event) => update(notice.id, { enabled: event.target.checked })} />
                    {notice.title}
                    {notice.statutory && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>Residential jobs over ${notice.thresholdUsd?.toLocaleString("en-US")} only</span>}
                  </label>
                  <textarea aria-label={`${notice.title} wording`} rows={4} value={value.text} disabled={!value.enabled} style={{ width: "100%" }}
                    onChange={(event) => update(notice.id, { text: event.target.value })} />
                  {blocking.has(notice.id) && value.enabled && <small style={{ color: "#92400e" }}>Still contains a [DRAFT placeholder. Replace it or switch this notice off.</small>}
                  {!notice.statutory && <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                    <span style={{ color: "var(--text-muted)" }}>Show on:</span>
                    {(["quote", "invoice"] as NoticeDoc[]).map((doc) => (
                      <label key={doc} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" disabled={!value.enabled} checked={value.showOn.includes(doc)}
                          onChange={(event) => { const next = event.target.checked ? [...value.showOn, doc] : value.showOn.filter((d) => d !== doc); if (next.length) update(notice.id, { showOn: next }); }} />
                        {DOC_LABEL[doc]}
                      </label>
                    ))}
                  </div>}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Use {"{businessName}"} and {"{licenseNumber}"} in the wording.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="button" type="button" disabled={busy || !dirty} onClick={() => void put({ notices: overrides() }, "Wording saved. Approve it to put it on documents.")}>Save wording</button>
            <button className="button primary" type="button" disabled={busy || dirty || view.approval.status === "approved" || view.approval.status === "draft-markers"}
              title={dirty ? "Save your changes first" : undefined}
              onClick={() => { if (window.confirm("Confirm that a qualified professional has reviewed this wording. It will then print on your customers' quotes and invoices.")) void put({ approve: true }, "Approved. These notices now print on quotes and invoices."); }}>
              I have had these reviewed
            </button>
          </div>
          {message && <p role="status" style={{ fontSize: 13, color: "#15803d" }}>{message}</p>}
          {error && <p role="alert" style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>}
        </>}
      </div>
    </section>
  );
}
