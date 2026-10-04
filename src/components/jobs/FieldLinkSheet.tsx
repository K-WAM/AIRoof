"use client";

// "Send to a worker" (owner, 2026-10-04: textable or emailable, reusable, no posted QR). One box: type their phone
// or email, press Send. The job has ONE reusable link (POST /api/jobs/[jobId]/field-qr) — everyone on the job gets
// the same link and it keeps working every day until the office presses "Stop link".
//
// How a text goes out, most streamlined first: from the business's texting line when that is switched on; otherwise
// the office person's own Messages app opens with the text written (the worker sees a number they know). Email always
// goes from the app. The QR code stays for someone standing next to you, one tap away, not first.

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";

const RECENT_KEY = "fieldLinkRecent";

function readRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4) : []; } catch { return []; }
}
function rememberRecent(to: string) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([to, ...readRecent().filter((x) => x !== to)].slice(0, 4))); } catch { /* private mode */ }
}
const isPhoneDevice = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

type Status = { tone: "ok" | "error" | "info"; text: string; message?: string } | null;

export function FieldLinkSheet({ open, onClose, businessId, jobId, jobTitle, address }: {
  open: boolean;
  onClose: () => void;
  businessId: string;
  jobId: string;
  jobTitle: string;
  address?: string | null;
}) {
  const [to, setTo] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (open) { setRecent(readRecent()); setStatus(null); setQr(null); setTo(""); } }, [open]);

  async function call(method: "POST" | "DELETE", sendTo?: string) {
    const res = await fetch(`/api/jobs/${jobId}/field-qr`, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, ...(sendTo ? { sendTo } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.fieldUrl) setLink(data.fieldUrl);
    return { ok: res.ok, data };
  }

  async function send(target = to) {
    const value = target.trim();
    if (!value) { setStatus({ tone: "error", text: "Type their phone number or email." }); return; }
    setBusy(true); setStatus(null);
    try {
      const { ok, data } = await call("POST", value);
      if (data.sent === "invalid" || !ok) { setStatus({ tone: "error", text: data.sent === "invalid" ? "That doesn't look like a phone number or email." : (data.error ?? "Couldn't send. Try again.") }); return; }
      rememberRecent(value); setRecent(readRecent());
      if (data.sent === "email") setStatus({ tone: "ok", text: `Emailed to ${value}.` });
      else if (data.sent === "sms") setStatus({ tone: "ok", text: `Texted to ${value}.` });
      else if (data.sent === "use_phone") {
        if (isPhoneDevice()) {
          window.location.href = `sms:${value.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(data.message)}`;
          setStatus({ tone: "info", text: "Your Messages app opened with the text written. Press send." });
        } else {
          setStatus({ tone: "info", text: "Text this from your phone (the app can't text yet):", message: data.message });
        }
      } else setStatus({ tone: "error", text: "Couldn't send the email. Copy the link and send it yourself." });
    } catch {
      setStatus({ tone: "error", text: "No connection. Try again." });
    } finally { setBusy(false); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link box below stays selectable */ }
  }

  async function ensureLink(): Promise<string | null> {
    if (link) return link;
    const { data } = await call("POST");
    return data.fieldUrl ?? null;
  }

  async function showQr() {
    const url = await ensureLink();
    if (!url) { setStatus({ tone: "error", text: "Couldn't make the link. Try again." }); return; }
    // Dynamic import keeps `qrcode` out of the page bundle until someone asks for it.
    const { default: QRCode } = await import("qrcode");
    setQr(await QRCode.toDataURL(url, { width: 200, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } }));
  }

  async function stop() {
    if (!confirm("Stop this job's link? Anyone who has it can no longer add notes. You can send a new one.")) return;
    await call("DELETE");
    setLink(null); setQr(null);
    setStatus({ tone: "info", text: "Link stopped. Sending again makes a new one." });
  }

  const tone = status?.tone === "error" ? { color: "#b91c1c", bg: "#fef2f2" } : status?.tone === "ok" ? { color: "#15803d", bg: "#f0fdf4" } : { color: "#334155", bg: "#f8fafc" };

  return (
    <Modal open={open} onClose={onClose} title="Send this job to a worker">
      <div data-testid="field-link-sheet" style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)" }}>{jobTitle}</strong>{address ? ` · ${address}` : ""}<br />
          They open the link, type their name and log work. No app or account.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} style={{ display: "grid", gap: 8 }}>
          <label htmlFor="field-link-to" style={{ fontSize: 13, fontWeight: 600 }}>Their phone or email</label>
          <input id="field-link-to" data-testid="field-link-to" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off"
            placeholder="(305) 555-0101 or name@email.com" inputMode="email" style={{ minHeight: "var(--control-h, 44px)" }} />
          {recent.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} aria-label="Sent before">
              {recent.map((r) => <button key={r} type="button" className="button small" onClick={() => { setTo(r); void send(r); }}>{r}</button>)}
            </div>
          )}
          <button type="submit" className="button primary" disabled={busy} data-testid="field-link-send">{busy ? "Sending…" : "Send link"}</button>
        </form>
        {status && (
          <div role="status" data-testid="field-link-status" style={{ padding: "10px 12px", borderRadius: 8, background: tone.bg, color: tone.color, fontSize: 13, fontWeight: 600 }}>
            {status.text}
            {status.message && (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 400, color: "#334155" }}>{status.message}</span>
                <button type="button" className="button small" onClick={() => void copy(status.message!)}>{copied ? "Copied" : "Copy text"}</button>
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <button type="button" className="button small" onClick={async () => { const url = await ensureLink(); if (url) void copy(url); }}>{copied && !status?.message ? "Link copied" : "Copy link"}</button>
          <button type="button" className="button small" onClick={() => (qr ? setQr(null) : void showQr())}>{qr ? "Hide QR code" : "Show QR code"}</button>
          {link && <button type="button" onClick={() => void stop()} style={{ marginLeft: "auto", background: "none", border: "none", color: "#b91c1c", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Stop link</button>}
        </div>
        {qr && (
          <div style={{ textAlign: "center" }}>
            <img src={qr} alt="QR code for this job's link" width={200} height={200} style={{ borderRadius: 8, border: "1px solid var(--border)" }} />
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>For someone next to you: point their camera here.</p>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>Everyone on this job gets the same link. It works every day until you stop it.</p>
      </div>
    </Modal>
  );
}
