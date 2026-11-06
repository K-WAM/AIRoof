"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { DocumentStyle } from "@/lib/documents/documentStyle";

const OPTIONS: Array<{ value: DocumentStyle; title: string; body: string }> = [
  { value: "standard", title: "Standard", body: "Clean and modern: logo and name on top, totals in one box." },
  { value: "classic", title: "Classic letterhead", body: "Like a contractor's paper invoice: logo with address and license, title in your brand colour, boxed item table, Subtotal / Sales Tax / Total Due, license and website at the bottom." },
];

/**
 * Library → Branding: how every quote, report and invoice looks (BusinessConfig.documentStyle). Lives beside the
 * logos because it is the same decision (what the customer's paper looks like). Owner or platform only; everyone
 * else sees which look is on.
 */
export function DocumentStyleSection({ businessId, readOnly = false }: { businessId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const canEdit = !readOnly && (user?.role === "owner" || !!user?.superadmin);
  const [style, setStyle] = useState<DocumentStyle | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/company/settings?businessId=${businessId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { documentStyle?: DocumentStyle }) => { if (active) setStyle(data.documentStyle === "classic" ? "classic" : "standard"); })
      .catch(() => { if (active) setMessage({ ok: false, text: "Could not load the document look. Reload this page to try again." }); });
    return () => { active = false; };
  }, [businessId]);

  async function choose(next: DocumentStyle) {
    if (!canEdit || next === style || saving) return;
    const previous = style;
    setStyle(next); setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/company/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessId, documentStyle: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save the document look.");
      setMessage({ ok: true, text: "Saved. Open any quote, report or invoice to see it." });
    } catch (error) {
      setStyle(previous);
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save the document look." });
    } finally { setSaving(false); }
  }

  return <section className="panel" aria-label="Document look" data-testid="document-style-section">
    <div className="panel-header">
      <h2 className="panel-title" style={{ display: "flex", alignItems: "center", gap: 6 }}><FileText size={16} strokeWidth={1.75} aria-hidden="true" />Document look</h2>
    </div>
    <div className="panel-body">
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--text-muted)" }}>How every quote, report and invoice looks to your customers. The logo above goes on both.</p>
      <div role="radiogroup" aria-label="Document look" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {OPTIONS.map((option) => {
          const selected = style === option.value;
          return <label key={option.value} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 10, border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`, background: selected ? "var(--accent-soft)" : "#fff", cursor: canEdit ? "pointer" : "default" }}>
            <input type="radio" name="document-style" value={option.value} checked={selected} disabled={!canEdit || saving || style === null} onChange={() => void choose(option.value)} style={{ marginTop: 3 }} />
            <span><strong style={{ display: "block", fontSize: 14 }}>{option.title}</strong><span style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45 }}>{option.body}</span></span>
          </label>;
        })}
      </div>
      {!canEdit && <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-muted)" }}>Only the owner can change this.</p>}
      {message && <p role={message.ok ? "status" : "alert"} style={{ margin: "10px 0 0", fontSize: 13, color: message.ok ? "#15803d" : "#b91c1c" }}>{message.text}</p>}
    </div>
  </section>;
}
