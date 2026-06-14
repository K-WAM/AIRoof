"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  HardHat,
  Wind,
  Leaf,
  Smile,
  Building,
  Hammer,
  Presentation,
  ExternalLink,
  Copy,
  Phone,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";

type Step = "pick" | "prospect" | "launch";

interface ApplyResult {
  ok?: boolean;
  firestoreUpdated?: boolean;
  vapiUpdated?: boolean;
  vapiError?: string;
  appliedGreeting?: string;
  reset?: boolean;
  error?: string;
  businessId?: string;
  demoUrl?: string;
  phone?: string;
  verticalId?: string;
  label?: string;
  agentName?: string;
}

const VERTICAL_ICONS: Record<VerticalId, LucideIcon> = {
  roofing: HardHat,
  hvac: Wind,
  landscaping: Leaf,
  dental: Smile,
  "property-management": Building,
  "general-contractors": Hammer,
};

// Field-service verticals get a field QR; others get a dashboard QR
const FIELD_SERVICE_VERTICALS: Set<VerticalId> = new Set([
  "roofing",
  "hvac",
  "landscaping",
  "general-contractors",
]);

// Phone numbers for voice-ready verticals — add entry when Vapi assistant is provisioned
const VERTICAL_PHONE: Partial<Record<VerticalId, string>> = {
  roofing: "+1 (754) 283-7658",
};

const ORDERED_VERTICALS = Object.values(VERTICAL_TEMPLATES) as (typeof VERTICAL_TEMPLATES)[VerticalId][];

export default function DemoStudioPage() {
  const [step, setStep] = useState<Step>("pick");
  const [selectedId, setSelectedId] = useState<VerticalId | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"launch" | "reset" | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState<"phone" | "script" | "link" | null>(null);

  const selected = selectedId ? VERTICAL_TEMPLATES[selectedId] : null;

  // Regenerate QR whenever demoUrl/businessId changes
  useEffect(() => {
    if (!result?.businessId) return;
    const isFieldService = selectedId && FIELD_SERVICE_VERTICALS.has(selectedId);
    const qrUrl = isFieldService
      ? `https://ai-roof.vercel.app/field?businessId=${result.businessId}`
      : (result.demoUrl ?? "");
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 220, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [result?.businessId, result?.demoUrl, selectedId]);

  function pickVertical(id: VerticalId) {
    setSelectedId(id);
    setStep("prospect");
    setResult(null);
    setQrDataUrl("");
  }

  function changeVertical() {
    setStep("pick");
    setResult(null);
    setQrDataUrl("");
  }

  async function launch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy("launch");
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo-customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), companyName: companyName.trim(), verticalId: selectedId }),
      });
      const data = (await res.json()) as ApplyResult;
      if (res.ok && data.ok) {
        setResult(data);
        setStep("launch");
      } else {
        setResult({ error: data.error ?? "Failed to configure demo" });
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  async function resetDemo() {
    if (!selectedId) return;
    setBusy("reset");
    try {
      await fetch(`/api/admin/demo-customize?verticalId=${selectedId}`, { method: "DELETE" });
      setStep("pick");
      setSelectedId(null);
      setCompanyName("");
      setEmail("");
      setResult(null);
      setQrDataUrl("");
    } catch {
      // silent — reset is best-effort
    } finally {
      setBusy(null);
    }
  }

  function copyToClipboard(text: string, key: "phone" | "script" | "link") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // The demo runs on one universal live line — the API returns its number for every
  // vertical (the line reconfigures to whatever you launched).
  const phone = result?.phone ?? (selectedId ? VERTICAL_PHONE[selectedId] : undefined);
  const isFieldService = selectedId ? FIELD_SERVICE_VERTICALS.has(selectedId) : false;
  const fieldUrl = result?.businessId
    ? `https://ai-roof.vercel.app/field?businessId=${result.businessId}`
    : "";
  const qrTargetUrl = isFieldService ? fieldUrl : (result?.demoUrl ?? "");

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="page-header" style={{ alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Presentation size={20} strokeWidth={1.75} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <h1 className="page-title" style={{ margin: 0 }}>Demo Studio</h1>
          </div>
          <p className="page-subtitle">
            Pick an industry, personalize, and launch — under 60 seconds.
          </p>
        </div>
      </header>

      {/* ── Section 1: Vertical Picker ─────────────────────────── */}
      <section style={{ marginTop: "1.75rem" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.9rem" }}>
          1 · Choose an industry
        </p>
        <div style={cardGridStyle}>
          {ORDERED_VERTICALS.map((vertical) => {
            const Icon = VERTICAL_ICONS[vertical.verticalId];
            const isSelected = selectedId === vertical.verticalId;
            return (
              <button
                key={vertical.verticalId}
                onClick={() => pickVertical(vertical.verticalId)}
                style={verticalCardStyle(isSelected, vertical.color)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Icon size={22} strokeWidth={1.75} color={vertical.color} />
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{vertical.label}</span>
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {vertical.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Section 2: Prospect Form ───────────────────────────── */}
      <section style={{ marginTop: "2rem", display: step === "pick" ? "none" : "block" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "0.9rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: 0 }}>
            2 · Enter prospect info
          </p>
          <button onClick={changeVertical} style={ghostLinkStyle}>
            ← Change industry
          </button>
        </div>

        {selected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem", padding: "0.55rem 0.9rem", background: `${selected.color}18`, border: `1px solid ${selected.color}40`, borderRadius: 8, width: "fit-content" }}>
            {(() => { const Icon = VERTICAL_ICONS[selected.verticalId]; return <Icon size={15} strokeWidth={1.75} color={selected.color} />; })()}
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: selected.color }}>{selected.label}</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>· {selected.agentName} is your agent</span>
          </div>
        )}

        <form onSubmit={launch} style={formStyle}>
          <div style={fieldRowStyle}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prospect company name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={selected ? `e.g. "Acme ${selected.label}"` : "Acme Corp"}
                required
                disabled={!!busy}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Notification email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                required
                disabled={!!busy}
                style={inputStyle}
              />
            </div>
          </div>

          {result?.error && (
            <div style={alertStyle("error")}>{result.error}</div>
          )}

          <div>
            <button type="submit" disabled={!!busy} style={primaryBtnStyle(!!busy)}>
              {busy === "launch" ? "Launching…" : "Launch demo →"}
            </button>
          </div>
        </form>
      </section>

      {/* ── Section 3: Launch Panel ────────────────────────────── */}
      {step === "launch" && result?.ok && selected && (
        <section style={{ marginTop: "2rem" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.9rem" }}>
            3 · Demo ready
          </p>

          <div style={launchGridStyle}>
            {/* Col 1 — Call */}
            <div style={panelStyle}>
              <p style={panelLabelStyle}>
                <Phone size={13} strokeWidth={1.75} />
                Voice demo
              </p>
              {phone ? (
                <>
                  <p style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0.5rem 0 0.75rem", letterSpacing: "0.02em" }}>
                    {phone}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => copyToClipboard(phone.replace(/\D/g, "").replace(/^/, "+"), "phone")}
                      style={iconBtnStyle}
                    >
                      <Copy size={13} strokeWidth={1.75} />
                      {copied === "phone" ? "Copied!" : "Copy number"}
                    </button>
                    <a
                      href={`tel:${phone.replace(/\D/g, "").replace(/^1/, "+1")}`}
                      style={{ ...iconBtnStyle, textDecoration: "none" }}
                    >
                      <Phone size={13} strokeWidth={1.75} />
                      Call now
                    </a>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
                    Have the prospect call this number. {result?.agentName ?? selected.agentName} will greet them as <em>{companyName}</em>.
                  </p>
                </>
              ) : (
                <>
                  <div style={pendingChipStyle}>
                    ◐ Phone line: pending
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem", lineHeight: 1.5 }}>
                    {selected.agentName} is fully industry-ready for {selected.label} — there&apos;s just no demo phone number connected yet. Show the dashboard demo (fully live); connect a Vapi number to make this vertical callable.
                  </p>
                </>
              )}
            </div>

            {/* Col 2 — Dashboard + QR */}
            <div style={panelStyle}>
              <p style={panelLabelStyle}>
                <ExternalLink size={13} strokeWidth={1.75} />
                Dashboard preview
              </p>
              <a
                href={result.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={dashboardBtnStyle(selected.color)}
              >
                Open {selected.shortLabel} dashboard →
              </a>
              <div style={{ marginTop: "1.25rem" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.7rem" }}>
                  {isFieldService ? "Field update QR — have prospect scan to try voice updates" : "Dashboard QR — scan to open on mobile"}
                </p>
                <div style={{
                  display: "inline-flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "16px 18px",
                  background: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
                }}>
                  {qrDataUrl
                    ? <img src={qrDataUrl} alt="Demo QR code" style={{ width: 160, height: 160, display: "block" }} />
                    : <div style={{ width: 160, height: 160, background: "#f1f5f9", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#94a3b8" }}>Generating…</div>
                  }
                </div>
                {qrTargetUrl && (
                  <button
                    onClick={() => copyToClipboard(qrTargetUrl, "link")}
                    style={{ ...ghostLinkStyle, marginTop: 8, display: "block" }}
                  >
                    {copied === "link" ? "Copied!" : "Copy link"}
                  </button>
                )}
              </div>
            </div>

            {/* Col 3 — Sample script */}
            <div style={panelStyle}>
              <p style={panelLabelStyle}>What to say</p>
              <blockquote style={{
                margin: "0.5rem 0 0.75rem",
                padding: "0.8rem 1rem",
                borderLeft: `3px solid ${selected.color}`,
                background: `${selected.color}10`,
                borderRadius: "0 6px 6px 0",
                fontStyle: "italic",
                fontSize: "0.88rem",
                lineHeight: 1.6,
                color: "var(--text)",
              }}>
                &ldquo;{selected.sampleCallerScript}&rdquo;
              </blockquote>
              <button
                onClick={() => copyToClipboard(selected.sampleCallerScript, "script")}
                style={iconBtnStyle}
              >
                <Copy size={13} strokeWidth={1.75} />
                {copied === "script" ? "Copied!" : "Copy script"}
              </button>

              {result.appliedGreeting && (
                <div style={{ marginTop: "1.25rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Applied greeting</p>
                  <p style={{ fontSize: "0.83rem", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
                    &ldquo;{result.appliedGreeting}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reset */}
          <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={resetDemo} disabled={!!busy} style={secondaryBtnStyle(!!busy)}>
              <RotateCcw size={14} strokeWidth={1.75} />
              {busy === "reset" ? "Resetting…" : "Reset demo"}
            </button>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: 12 }}>
              Restores {selected.label} demo to default data.
            </span>
          </div>
        </section>
      )}
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

function verticalCardStyle(selected: boolean, color: string): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "1rem 1.1rem",
    borderRadius: 10,
    background: selected ? `${color}14` : "rgba(255,255,255,0.03)",
    border: selected ? `2px solid ${color}` : "1px solid rgba(255,255,255,0.09)",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
    width: "100%",
    color: "inherit",
  };
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1.25rem 1.4rem",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
  maxWidth: 680,
};

const fieldRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.82rem",
  fontWeight: 600,
  marginBottom: "0.35rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.58rem 0.8rem",
  fontSize: "0.92rem",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.22)",
  color: "inherit",
  boxSizing: "border-box",
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.62rem 1.2rem",
    background: disabled ? "#555" : "#3a7afe",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: "0.9rem",
  };
}

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "0.55rem 1rem",
    background: "transparent",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.85rem",
    opacity: disabled ? 0.5 : 1,
  };
}

const ghostLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--text-muted)",
  fontSize: "0.82rem",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

function alertStyle(kind: "error" | "success"): React.CSSProperties {
  return {
    padding: "0.7rem 0.9rem",
    background: kind === "error" ? "rgba(220,60,60,0.15)" : "rgba(60,180,90,0.15)",
    border: `1px solid ${kind === "error" ? "rgba(220,60,60,0.4)" : "rgba(60,180,90,0.4)"}`,
    borderRadius: 7,
    fontSize: "0.85rem",
  };
}

const launchGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
};

const panelStyle: React.CSSProperties = {
  padding: "1.1rem 1.25rem",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
};

const panelLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  margin: "0 0 0.25rem",
};

const pendingChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginTop: "0.6rem",
  padding: "0.3rem 0.75rem",
  background: "rgba(217, 119, 6, 0.15)",
  border: "1px solid rgba(217, 119, 6, 0.4)",
  borderRadius: 20,
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#d97706",
};

function dashboardBtnStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: "0.5rem",
    padding: "0.6rem 1rem",
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontWeight: 600,
    fontSize: "0.88rem",
    textDecoration: "none",
    cursor: "pointer",
  };
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "0.4rem 0.75rem",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: "0.8rem",
  color: "inherit",
  textDecoration: "none",
};
