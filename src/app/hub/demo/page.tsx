"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { DEMO_LINE_PHONE, VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";
import type { PhoneLineView } from "@/types/phoneLine";
import { DemoRunbook } from "./DemoRunbook";

interface LineState {
  businessName?: string;
  industry?: string;
  phone?: string;
  lineReady?: boolean;
  lineError?: string;
  greetingPreview?: string;
  lastCallAt?: number | null;
  seededAt?: number | null;
  configured?: { elevenLabsApiKey: boolean; elevenLabsToolSecret: boolean; elevenLabsWebhookSecret: boolean };
  ok?: boolean;
  error?: string;
  demoUrl?: string;
  fieldUrl?: string;
}


const BUSINESS_ID = "demo-roofing";
const preview = (path: string) => `/company/${path}?preview=${BUSINESS_ID}`;

// The two demo numbers we own. A number with no registry record still shows — as "not connected in the app yet" —
// so a line that was bought but never wired up (the Canadian line, 2026-09-29) can't silently disappear.
const FALLBACK_DEMO_LINES = [
  { e164: "+16892042643", display: "+1 (689) 204-2643", country: "US" as const },
  { e164: "+17789079769", display: "+1 (778) 907-9769", country: "CA" as const },
];

function statusWords(status: PhoneLineView["status"]): string {
  switch (status) {
    case "live": return "Live";
    case "test_passed": return "Test passed";
    case "connected": return "Connected — not yet tested";
    case "provisioned": return "Provisioned — awaiting app connection";
    case "draft": return "Draft — Luxor connects this line";
    case "retired": return "Retired";
    default: return "Status unavailable";
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button small"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }).catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function DemoStudioPage() {
  const [line, setLine] = useState<LineState>({});
  const [verticalId, setVerticalId] = useState<VerticalId>("roofing");
  const [changeIndustry, setChangeIndustry] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [fieldUrl, setFieldUrl] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testCallStatus, setTestCallStatus] = useState("");
  // null until the phone-lines API answers; never invent Ready/Live from this.
  const [lines, setLines] = useState<PhoneLineView[] | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/demo-customize");
    setLine(await response.json() as LineState);
  }

  useEffect(() => { void refresh().catch(() => setLine({ error: "Could not load demo line" })); }, []);
  useEffect(() => {
    try { setTestPhone(window.localStorage.getItem("demoStudioTestPhone") ?? ""); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/phone-lines?businessId=${BUSINESS_ID}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((data: { lines?: PhoneLineView[] }) => { if (!cancelled) setLines(Array.isArray(data.lines) ? data.lines : []); })
      .catch(() => { if (!cancelled) setLines(null); });
    return () => { cancelled = true; };
  }, []);

  function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLine((old) => ({ ...old, error: "Choose a PNG, JPEG or WebP logo" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  async function launch(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/demo-customize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verticalId, companyName, contactName, email, phone, serviceArea, logoDataUrl: logoDataUrl || undefined }),
      });
      const result = await response.json() as LineState;
      if (!response.ok || !result.ok) throw new Error(result.error || "Launch failed");
      setLine((old) => ({ ...old, ...result, businessName: companyName || `${VERTICAL_TEMPLATES[verticalId].label} Demo`, industry: verticalId }));
      setFieldUrl(result.fieldUrl ?? "");
      setLaunched(true);
      void refresh().catch(() => {});
    } catch (error) {
      setLine((old) => ({ ...old, error: error instanceof Error ? error.message : "Launch failed" }));
    } finally { setBusy(false); }
  }

  async function reset() {
    if (confirm !== "RESET") return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/demo-customize", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }),
      });
      const result = await response.json() as LineState;
      if (!response.ok || !result.ok) throw new Error(result.error || "Reset failed");
      setLaunched(false); setShowReset(false); setConfirm(""); setLogoDataUrl("");
      await refresh();
    } catch (error) {
      setLine((old) => ({ ...old, error: error instanceof Error ? error.message : "Reset failed" }));
    } finally { setBusy(false); }
  }

  async function testCall() {
    setBusy(true); setTestCallStatus("");
    try {
      try { window.localStorage.setItem("demoStudioTestPhone", testPhone); } catch { /* storage unavailable */ }
      const response = await fetch("/api/admin/demo-customize/test-call", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: testPhone }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Test call failed");
      setTestCallStatus("Calling now…");
    } catch (error) {
      setTestCallStatus(error instanceof Error ? error.message : "Test call failed");
    } finally { setBusy(false); }
  }

  const dial = line.phone || DEMO_LINE_PHONE.roofing || "";
  const missing = line.configured ? Object.entries(line.configured).filter(([, ready]) => !ready).map(([name]) => name) : [];
  const callingReady = Boolean(line.configured) && missing.length === 0;

  return (
    <main className="hub-demo-page" style={{ maxWidth: 940, margin: "0 auto", padding: "var(--sp-4)", overflowWrap: "anywhere" }}>
      <header className="page-header">
        <div>
          <h1 className="page-title">Demo Studio</h1>
          <p className="page-subtitle">
            Set up a roofing prospect and run a 5-minute demo.{" "}
            <Link href="/hub/guide">20-minute deep dive (optional)</Link>
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="run-demo-title">
        <div className="panel-header"><h2 className="panel-title" id="run-demo-title">Run a demo</h2></div>
        <div className="panel-body">
          <p style={{ margin: "0 0 var(--sp-3)" }}>
            Roofing is selected.{" "}
            <button type="button" className="button small" onClick={() => setChangeIndustry((old) => !old)}>Change industry</button>
          </p>
          {changeIndustry && (
            <label className="field" style={{ marginBottom: "var(--sp-3)", maxWidth: 280, display: "grid" }}>
              Industry
              <select value={verticalId} onChange={(e) => setVerticalId(e.target.value as VerticalId)}>
                {Object.values(VERTICAL_TEMPLATES).map((vertical) => <option key={vertical.verticalId} value={vertical.verticalId}>{vertical.label}</option>)}
              </select>
            </label>
          )}
          <form onSubmit={launch} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "var(--sp-3)" }}>
            <label className="field">Company<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Test Roofing Co" /></label>
            <label className="field">Owner name<input value={contactName} onChange={(e) => setContactName(e.target.value)} /></label>
            <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field">Their business phone <small style={{ color: "var(--text-muted)" }}>(optional — printed on their quotes and invoices; the AI never calls it)</small><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label className="field">City / service area<input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} /></label>
            <label className="field">Logo (PNG, JPEG, WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} />
              {logoDataUrl && <img src={logoDataUrl} alt="Logo preview" style={{ display: "block", maxWidth: 120, maxHeight: 70, objectFit: "contain" }} />}
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <button className="button primary" type="submit" disabled={busy}>{busy ? "Launching…" : "Launch demo"}</button>
            </div>
          </form>
          {!callingReady && line.configured && (
            <p role="status" style={{ margin: "var(--sp-3) 0 0", color: "var(--c-danger-fg)", fontWeight: 700 }}>
              Demo calling isn&apos;t ready — <a href="#demo-advanced">open connection details</a>
            </p>
          )}
          {line.error && <p role="alert" style={{ color: "var(--c-danger-fg)" }}>{line.error}</p>}
          {launched && (
            <div style={{ marginTop: "var(--sp-4)" }}>
              <p><strong>Next caller greeting:</strong> {line.greetingPreview}</p>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-1)" }}><strong>Prospects call {dial || "the demo number"}</strong> — you never need their number.</p>
              <label className="field">Your own cell, to hear it first <small style={{ color: "var(--text-muted)" }}>(Test call rings YOU from the demo line so you can hear the AI answer as this company; remembered on this device)</small><input type="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="Your mobile number" /></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                <button className="button primary" type="button" disabled={busy || testPhone.trim().length < 7} onClick={testCall}>Test call</button>
                <Link className="button" href={preview("dashboard")}>Open dashboard</Link>
                {fieldUrl && <a className="button" href={fieldUrl} title="Opens the technician screen on THIS device. To scan it with a phone, open a job and press Field QR.">Open field screen here</a>}
                <Link className="button" href={`/try/${verticalId}`}>Try page</Link>
              </div>
              {testCallStatus && <p role="status">{testCallStatus}</p>}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="demo-lines-title" style={{ marginTop: "var(--sp-5)" }}>
        <h2 className="panel-title" id="demo-lines-title" style={{ marginBottom: "var(--sp-3)" }}>Demo lines</h2>
        <div className="demo-line-grid">
          {lines === null
            ? FALLBACK_DEMO_LINES.map((fallback) => (
                <article className="panel demo-line-card" key={fallback.e164}>
                  <p className="demo-line-number">{fallback.display}</p>
                  <p className="demo-line-meta">{fallback.country} · Status unavailable</p>
                  <p className="demo-line-note">Set up the phone-line registry to see the live status.</p>
                </article>
              ))
            : [
              ...FALLBACK_DEMO_LINES.filter((fallback) => !lines.some((l) => l.e164 === fallback.e164)).map((fallback) => (
                <article className="panel demo-line-card" key={fallback.e164}>
                  <p className="demo-line-number">{fallback.display}</p>
                  <p className="demo-line-meta">{fallback.country} · Not connected in the app yet</p>
                  <p className="demo-line-note">Add it under Configure → Phone lines for demo-roofing, then record a test call.</p>
                </article>
              )),
              ...lines.map((l) => {
                  const dialable = l.status === "test_passed" || l.status === "live";
                  return (
                    <article className="panel demo-line-card" key={l.lineId}>
                      <p className="demo-line-number">{l.display}</p>
                      <p className="demo-line-meta">{l.country} · {statusWords(l.status)}</p>
                      <p className="demo-line-note">
                        {l.lastTestAt ? `Last test: ${new Date(l.lastTestAt).toLocaleString()}` : "Not tested yet"}
                        {l.nextStep ? ` · ${l.nextStep}` : ""}
                      </p>
                      {dialable && (
                        <div className="demo-line-actions">
                          <a className="button small" href={`tel:${l.e164.replace(/[^+\d]/g, "")}`}>Dial</a>
                          <CopyButton value={l.e164} />
                        </div>
                      )}
                    </article>
                  );
                }),
            ]}
        </div>
        <p className="demo-line-note" style={{ marginTop: "var(--sp-3)" }}>
          Dial and Copy appear only once the line is tested or live — never for a number we haven&apos;t verified.
        </p>
      </section>

      <DemoRunbook />

      <section className="panel" style={{ marginTop: "var(--sp-5)" }} aria-labelledby="reset-title">
        <div className="panel-header"><h2 className="panel-title" id="reset-title">Reset</h2></div>
        <div className="panel-body">
          <p>Back up and clear the demo before the next prospect. This is separate from launching a demo and only affects the allowlisted demo tenant.</p>
          <button className="button" type="button" onClick={() => setShowReset(true)}>Reset demo</button>
          {showReset && (
            <div style={{ marginTop: "var(--sp-3)" }}>
              <label className="field">Type RESET to confirm <input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
              <div style={{ display: "flex", gap: "var(--sp-2)", marginTop: "var(--sp-2)" }}>
                <button className="button" type="button" disabled={confirm !== "RESET" || busy} onClick={reset}>Confirm reset</button>
                <button className="button" type="button" onClick={() => { setShowReset(false); setConfirm(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <details className="advanced-disclosure" id="demo-advanced" style={{ marginTop: "var(--sp-5)" }}>
        <summary>Advanced diagnostics</summary>
        <p className="advanced-disclosure-note">
          Configuration read from this environment. Key names only — never paste values here.
        </p>
        <ul className="demo-diag-list">
          {(Object.entries(line.configured ?? {}) as Array<[string, boolean]>).map(([name, ready]) => (
            <li key={name}><code>{name}</code>: {ready ? "set" : "missing"}</li>
          ))}
          {!line.configured && <li>Configuration not loaded.</li>}
          {line.lineError && <li>Line error: {line.lineError}</li>}
        </ul>
      </details>
    </main>
  );
}
