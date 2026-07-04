"use client";

import React, { useEffect, useState, useCallback } from "react";
import { PageSkeleton } from "@/components/ui/PageSkeleton";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceTemplate {
  templateId: string;
  name: string;
  lineItems: LineItem[];
  notes?: string;
}

interface LuxorInvoice {
  invoiceId: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: string;
  lineItems: LineItem[];
  notes: string;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: "draft" | "sent" | "paid";
  dueDate: string;
  createdAt: number;
  sentAt?: number;
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft:  { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", color: "#64748b" },
  sent:   { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#dbeafe", color: "#1e40af" },
  paid:   { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#dcfce7", color: "#166534" },
};

function blankItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0, total: 0 };
}

function calcItem(item: LineItem): LineItem {
  return { ...item, total: item.quantity * item.unitPrice };
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<LuxorInvoice[]>([]);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null); // null = new
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([blankItem()]);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("Net 30. Payment due within 30 days of invoice date.");
  const [templateName, setTemplateName] = useState("");

  // Action state
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    const [inv, tmpl] = await Promise.all([
      fetch("/api/admin/invoices").then(r => r.json()),
      fetch("/api/admin/invoice-templates").then(r => r.json()),
    ]);
    setInvoices(inv.invoices ?? []);
    setTemplates(tmpl.templates ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived totals
  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * taxRate / 100;
  const total = subtotal + taxAmount;

  function loadInvoice(inv: LuxorInvoice) {
    setEditingId(inv.invoiceId);
    setClientName(inv.clientName ?? "");
    setClientEmail(inv.clientEmail ?? "");
    setClientAddress(inv.clientAddress ?? "");
    setDueDate(inv.dueDate ?? "");
    setLineItems(inv.lineItems?.length ? inv.lineItems : [blankItem()]);
    setTaxRate(inv.taxRate ?? 0);
    setNotes(inv.notes ?? "");
    setSendEmail(inv.clientEmail ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function newInvoice() {
    setEditingId(null);
    setClientName(""); setClientEmail(""); setClientAddress("");
    const d = new Date(); d.setDate(d.getDate() + 30);
    setDueDate(d.toISOString().split("T")[0]);
    setLineItems([blankItem()]); setTaxRate(0);
    setNotes("Net 30. Payment due within 30 days of invoice date.");
    setSendEmail("");
  }

  function applyTemplate(templateId: string) {
    const tmpl = templates.find(t => t.templateId === templateId);
    if (!tmpl) return;
    setLineItems(tmpl.lineItems?.length ? tmpl.lineItems : [blankItem()]);
    if (tmpl.notes) setNotes(tmpl.notes);
  }

  function updateItem(i: number, field: keyof LineItem, value: string) {
    setLineItems(rows => rows.map((row, idx) => {
      if (idx !== i) return row;
      const updated = { ...row, [field]: field === "description" ? value : parseFloat(value) || 0 };
      return calcItem(updated);
    }));
  }

  function addItem() { setLineItems(r => [...r, blankItem()]); }
  function removeItem(i: number) { setLineItems(r => r.filter((_, idx) => idx !== i)); }

  async function save() {
    setSaving(true);
    try {
      const payload = { clientName, clientEmail, clientAddress, dueDate, lineItems, taxRate, notes, subtotal, taxAmount, total };
      if (editingId) {
        await fetch(`/api/admin/invoices/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        showToast("Invoice saved.");
      } else {
        const res = await fetch("/api/admin/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        setEditingId(data.invoice.invoiceId);
        showToast(`Invoice ${data.invoice.invoiceId} created.`);
      }
      await load();
    } finally { setSaving(false); }
  }

  async function send() {
    if (!editingId) { await save(); return; }
    setSending(true);
    try {
      await fetch(`/api/admin/invoices/${editingId}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: sendEmail }) });
      showToast(`Invoice sent to ${sendEmail}.`);
      await load();
    } finally { setSending(false); }
  }

  async function markPaid() {
    if (!editingId) return;
    setMarkingPaid(true);
    try {
      await fetch(`/api/admin/invoices/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) });
      showToast("Marked as paid.");
      await load();
    } finally { setMarkingPaid(false); }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await fetch("/api/admin/invoice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateName.trim(), lineItems, notes }) });
      setTemplateName("");
      showToast(`Template "${templateName}" saved.`);
      await load();
    } finally { setSavingTemplate(false); }
  }

  async function deleteTemplate(templateId: string) {
    await fetch("/api/admin/invoice-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId }) });
    await load();
  }

  const currentInvoice = editingId ? invoices.find(i => i.invoiceId === editingId) : null;

  if (loading) return <PageSkeleton rows={5} />;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {toast && (
        <div className="no-print" style={{ position: "fixed", bottom: 24, right: 24, background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      <header className="page-header no-print">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Create and send Luxor-branded invoices to client businesses.</p>
        </div>
        <button className="button primary" onClick={newInvoice}>+ New Invoice</button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        {/* ── Invoice Editor ── */}
        <div>
          {/* Editor header */}
          <div className="panel no-print" style={{ marginBottom: 20 }}>
            <div className="panel-header">
              <h2 className="panel-title">{editingId ? `Editing ${editingId}` : "New Invoice"}</h2>
              {currentInvoice && <span style={STATUS_STYLE[currentInvoice.status]}>{currentInvoice.status}</span>}
            </div>
            <div className="panel-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div className="field">
                  <label>Client name</label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Apex Roofing" />
                </div>
                <div className="field">
                  <label>Client email</label>
                  <input type="email" value={clientEmail} onChange={e => { setClientEmail(e.target.value); setSendEmail(e.target.value); }} placeholder="owner@example.com" />
                </div>
                <div className="field">
                  <label>Address (optional)</label>
                  <input value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="123 Main St, Miami FL" />
                </div>
                <div className="field">
                  <label>Due date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {/* Template selector */}
              {templates.length > 0 && (
                <div className="field" style={{ marginBottom: 16 }}>
                  <label>Load template</label>
                  <select defaultValue="" onChange={e => applyTemplate(e.target.value)}>
                    <option value="" disabled>Select a template…</option>
                    {templates.map(t => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Printable invoice document */}
          <div id="invoice-print" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "40px 48px", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            {/* Invoice header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, paddingBottom: 24, borderBottom: "2px solid #0f172a" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 24, color: "#0f172a", letterSpacing: "-0.02em" }}>Luxor AI</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Luxor Developments LLC</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8, lineHeight: 1.7 }}>
                  Vancouver, BC<br />
                  connect@luxordev.com
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3b82f6", marginBottom: 4 }}>Invoice</div>
                <div style={{ fontWeight: 800, fontSize: 26, color: "#0f172a" }}>{editingId ?? "Draft"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, lineHeight: 1.7 }}>
                  Date: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}<br />
                  Due: {dueDate ? new Date(dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Net 30"}
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>Bill To</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{clientName || <span style={{ color: "#94a3b8" }}>Client name</span>}</div>
              {clientEmail && <div style={{ fontSize: 13, color: "#64748b" }}>{clientEmail}</div>}
              {clientAddress && <div style={{ fontSize: 13, color: "#64748b" }}>{clientAddress}</div>}
            </div>

            {/* Line items */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>Description</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", width: 72 }}>Qty</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", width: 100 }}>Unit Price</th>
                  <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#64748b", width: 100 }}>Total</th>
                  <th className="no-print" style={{ width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <input value={item.description} onChange={e => updateItem(i, "description", e.target.value)} placeholder="AI receptionist — monthly subscription" style={inlineInput} className="no-print" />
                      <span className="print-only" style={{ fontSize: 13 }}>{item.description}</span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <input value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} style={{ ...inlineInput, width: 56, textAlign: "right" }} className="no-print" />
                      <span className="print-only">{item.quantity}</span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      $<input value={item.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} style={{ ...inlineInput, width: 72, textAlign: "right" }} className="no-print" />
                      <span className="print-only">${item.unitPrice.toFixed(2)}</span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>${item.total.toFixed(2)}</td>
                    <td className="no-print" style={{ padding: "8px 4px", textAlign: "center" }}>
                      <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="no-print" onClick={addItem} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "4px 12px 0" }}>+ Add line item</button>

            {/* Totals */}
            <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 16, marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <table style={{ fontSize: 13, minWidth: 260 }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "4px 16px 4px 0", color: "#64748b" }}>Subtotal</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>${subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 16px 4px 0", color: "#64748b" }}>
                        Tax (
                        <input value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} style={{ width: 32, border: "none", borderBottom: "1px dashed #cbd5e1", textAlign: "center", fontSize: 13, color: "#1e293b", padding: "0 2px", background: "transparent" }} className="no-print" />
                        <span className="print-only">{taxRate}</span>
                        %)
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>${taxAmount.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: "2px solid #0f172a" }}>
                      <td style={{ padding: "10px 16px 4px 0", fontWeight: 800, fontSize: 15 }}>Total Due</td>
                      <td style={{ textAlign: "right", fontWeight: 800, fontSize: 20, color: "#0f172a", paddingTop: 10 }}>${total.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 6 }}>Notes & Payment Terms</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ width: "100%", fontSize: 13, color: "#475569", border: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, background: "transparent" }} className="no-print" />
              <p className="print-only" style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>{notes}</p>
            </div>

            <div style={{ marginTop: 24, fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
              Luxor Developments LLC · connect@luxordev.com · Vancouver, BC
            </div>
          </div>

          {/* Action bar */}
          <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
            <button className="button primary" onClick={save} disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save invoice"}</button>
            <input type="email" value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="Send to email…" style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, width: 220 }} />
            <button className="button" onClick={send} disabled={sending || !sendEmail}>{sending ? "Sending…" : "Send invoice"}</button>
            <button className="button" onClick={() => window.print()}>⬇ Download PDF</button>
            {currentInvoice?.status !== "paid" && editingId && (
              <button className="button" onClick={markPaid} disabled={markingPaid} style={{ color: "#166534" }}>{markingPaid ? "…" : "Mark paid"}</button>
            )}
          </div>

          {/* Save as template */}
          <div className="no-print" style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Save as template…" style={{ padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, width: 200 }} />
            <button className="button" onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()}>{savingTemplate ? "…" : "Save template"}</button>
          </div>
        </div>

        {/* ── Sidebar: Invoice list + Templates ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Invoice list */}
          <section className="panel no-print">
            <div className="panel-header">
              <h2 className="panel-title">Invoices ({invoices.length})</h2>
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              {invoices.length === 0 ? (
                <p style={{ padding: 16, fontSize: 13, color: "#64748b" }}>No invoices yet.</p>
              ) : (
                <div>
                  {invoices.map(inv => (
                    <div key={inv.invoiceId} onClick={() => loadInvoice(inv)} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: editingId === inv.invoiceId ? "#f0f9ff" : undefined }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{inv.invoiceId}</span>
                        <span style={STATUS_STYLE[inv.status]}>{inv.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{inv.clientName || "—"}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>${Number(inv.total ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Templates */}
          {templates.length > 0 && (
            <section className="panel no-print">
              <div className="panel-header">
                <h2 className="panel-title">Templates</h2>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                {templates.map(t => (
                  <div key={t.templateId} style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => applyTemplate(t.templateId)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#1e293b", padding: 0, textAlign: "left" }}>
                      {t.name}
                    </button>
                    <button onClick={() => deleteTemplate(t.templateId)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 0 }}>×</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

const inlineInput: React.CSSProperties = {
  border: "none",
  borderBottom: "1px dashed #cbd5e1",
  background: "transparent",
  fontSize: 13,
  color: "#1e293b",
  padding: "2px 4px",
  width: "100%",
  fontFamily: "inherit",
  outline: "none",
};
