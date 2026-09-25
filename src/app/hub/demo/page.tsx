"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { DEMO_LINE_PHONE, VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";
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

  async function refresh() {
    const response = await fetch("/api/admin/demo-customize");
    setLine(await response.json() as LineState);
  }

  useEffect(() => { void refresh().catch(() => setLine({ error: "Could not load demo line" })); }, []);
  useEffect(() => {
    try { setTestPhone(window.localStorage.getItem("demoStudioTestPhone") ?? ""); } catch { /* storage unavailable */ }
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
  const missing = line.configured && Object.entries(line.configured).filter(([, ready]) => !ready).map(([name]) => name);

  return (
    <main style={{ maxWidth: 940, margin: "0 auto", padding: "1rem", overflowWrap: "anywhere" }}>
      <header className="page-header"><div><h1 className="page-title">Demo Studio</h1><p className="page-subtitle">Set up a roofing prospect and run the 20-minute demo.</p></div></header>

      <section className="panel" aria-label="Demo line status">
        <div className="panel-body">
          <a href={`tel:${dial.replace(/[^+\d]/g, "")}`} style={{ fontSize: "clamp(1.3rem, 6vw, 2rem)", fontWeight: 700, color: "var(--accent)" }}>{dial || "Line pending"}</a>
          <p style={{ margin: "0.5rem 0" }}>Currently: <strong>{line.businessName || "Loading"}</strong> · {VERTICAL_TEMPLATES[(line.industry as VerticalId) || "roofing"]?.label || line.industry}</p>
          <p role="status" style={{ color: line.lineReady ? "var(--c-success-fg)" : "var(--c-danger-fg)", fontWeight: 700 }}>
            {line.lineReady ? "Ready" : line.lineError || "Checking line…"}
          </p>
          {missing?.length ? <p>Missing configuration: {missing.join(", ")}</p> : null}
          <p>Last call: {line.lastCallAt ? new Date(line.lastCallAt).toLocaleString() : "None yet"}</p>
          {line.greetingPreview && <blockquote style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 12, margin: "0.75rem 0" }}>“{line.greetingPreview}”</blockquote>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <div className="panel-header"><h2 className="panel-title">1 · Set up the prospect</h2></div>
        <div className="panel-body">
          <p>Roofing is selected. <button type="button" className="button small" onClick={() => setChangeIndustry((old) => !old)}>Change industry</button></p>
          {changeIndustry && <label>Industry <select value={verticalId} onChange={(e) => setVerticalId(e.target.value as VerticalId)}>
            {Object.values(VERTICAL_TEMPLATES).map((vertical) => <option key={vertical.verticalId} value={vertical.verticalId}>{vertical.label}</option>)}
          </select></label>}
          <form onSubmit={launch} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 12 }}>
            <label>Company<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Test Roofing Co" /></label>
            <label>Owner name<input value={contactName} onChange={(e) => setContactName(e.target.value)} /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Phone<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label>City / service area<input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} /></label>
            <label>Logo (PNG, JPEG, WebP)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} />
              {logoDataUrl && <img src={logoDataUrl} alt="Logo preview" style={{ display: "block", maxWidth: 120, maxHeight: 70, objectFit: "contain" }} />}
            </label>
            <div style={{ gridColumn: "1 / -1" }}><button className="button primary" type="submit" disabled={busy}>{busy ? "Launching…" : "Launch demo"}</button></div>
          </form>
          {line.error && <p role="alert" style={{ color: "var(--c-danger-fg)" }}>{line.error}</p>}
          {launched && <div style={{ marginTop: 16 }}>
            <p><strong>Next caller greeting:</strong> {line.greetingPreview}</p>
            <label>Your phone for the test call<input type="tel" value={testPhone} onChange={(event) => setTestPhone(event.target.value)} /></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="button primary" type="button" disabled={busy || testPhone.trim().length < 7} onClick={testCall}>Test call</button>
              <Link className="button" href={preview("dashboard")}>Open dashboard</Link>
              {fieldUrl && <a className="button" href={fieldUrl} title="Opens the technician screen on THIS device. To scan it with a phone, open a job and press Field QR.">Open field screen here</a>}
              <Link className="button" href={`/try/${verticalId}`}>Try page</Link>
            </div>
            {testCallStatus && <p role="status">{testCallStatus}</p>}
          </div>}
        </div>
      </section>

      <DemoRunbook />

      <section className="panel" style={{ marginTop: "1.5rem" }}>
        <div className="panel-header"><h2 className="panel-title">3 · Reset</h2></div>
        <div className="panel-body">
          <p>Back up and clear the demo before the next prospect.</p>
          <button className="button" type="button" onClick={() => setShowReset(true)}>Reset demo</button>
          {showReset && <div style={{ marginTop: 12 }}>
            <label>Type RESET to confirm <input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="button" type="button" disabled={confirm !== "RESET" || busy} onClick={reset}>Confirm reset</button>
              <button className="button" type="button" onClick={() => { setShowReset(false); setConfirm(""); }}>Cancel</button>
            </div>
          </div>}
        </div>
      </section>
    </main>
  );
}
