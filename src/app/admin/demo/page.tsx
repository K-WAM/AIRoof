"use client";

import { useState } from "react";

interface ApplyResult {
  ok?: boolean;
  firestoreUpdated?: boolean;
  vapiUpdated?: boolean;
  vapiError?: string;
  appliedGreeting?: string;
  reset?: boolean;
  error?: string;
}

export default function DemoCustomizePage() {
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState<"customize" | "reset" | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function customize(e: React.FormEvent) {
    e.preventDefault();
    setBusy("customize");
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo-customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), companyName: companyName.trim() }),
      });
      const data = (await res.json()) as ApplyResult;
      setResult(res.ok ? data : { error: data.error ?? "Failed" });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo-customize", { method: "DELETE" });
      const data = (await res.json()) as ApplyResult;
      setResult(res.ok ? data : { error: data.error ?? "Failed" });
      if (res.ok) {
        setEmail("");
        setCompanyName("");
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1 className="page-title">Demo Customizer</h1>
          <p className="page-subtitle">
            Personalize Alice for a prospect call. Updates Firestore and Alice&apos;s
            greeting on Vapi in one click.
          </p>
        </div>
      </header>

      <section style={{ maxWidth: 560, marginTop: "1.5rem" }}>
        <form onSubmit={customize} style={formStyle}>
          <div>
            <label style={labelStyle}>Prospect company name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Roofing"
              required
              disabled={!!busy}
              style={inputStyle}
            />
            <p style={hintStyle}>Alice will greet callers using this name.</p>
          </div>

          <div>
            <label style={labelStyle}>Prospect notification email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@acmeroofing.com"
              required
              disabled={!!busy}
              style={inputStyle}
            />
            <p style={hintStyle}>Booking + escalation emails go here during the demo.</p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="submit" disabled={!!busy} style={primaryBtnStyle(!!busy)}>
              {busy === "customize" ? "Applying…" : "Apply demo config"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={!!busy}
              style={secondaryBtnStyle(!!busy)}
            >
              {busy === "reset" ? "Resetting…" : "Reset to defaults"}
            </button>
          </div>
        </form>

        {result && (
          <div style={resultStyle(result.error ? "error" : "success")}>
            {result.error ? (
              <strong>Error: {result.error}</strong>
            ) : result.reset ? (
              <>
                <strong>✓ Reset to Apex Roofing defaults.</strong>
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>
                  Firestore updated. {result.vapiUpdated ? "Vapi assistant updated." : (result.vapiError ?? "")}
                </p>
              </>
            ) : (
              <>
                <strong>✓ Demo configured.</strong>
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>
                  Firestore updated. {result.vapiUpdated
                    ? "Alice greeting updated on Vapi."
                    : `Vapi update skipped: ${result.vapiError}`}
                </p>
                {result.appliedGreeting && (
                  <p style={{ margin: "0.6rem 0 0", padding: "0.6rem 0.8rem", background: "rgba(0,0,0,0.15)", borderRadius: 6, fontSize: "0.85rem", fontStyle: "italic" }}>
                    &ldquo;{result.appliedGreeting}&rdquo;
                  </p>
                )}
                <p style={{ margin: "0.8rem 0 0", fontSize: "0.85rem" }}>
                  Demo number: <strong>+1 (754) 283-7658</strong>
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section style={{ marginTop: "2.5rem", maxWidth: 560, fontSize: "0.85rem", opacity: 0.8 }}>
        <h3 style={{ fontSize: "1rem", marginBottom: "0.4rem" }}>Demo flow</h3>
        <ol style={{ paddingLeft: "1.2rem", lineHeight: 1.7 }}>
          <li>Enter prospect&apos;s company name and email above, click Apply.</li>
          <li>Have the prospect call <strong>+1 (754) 283-7658</strong>.</li>
          <li>Alice greets them as <em>their</em> company. They book an appointment with her.</li>
          <li>The booking email lands in their inbox in real time. Open their dashboard at <code>/company/dashboard</code> to show the captured lead.</li>
          <li>After the demo, click <strong>Reset to defaults</strong>.</li>
        </ol>
      </section>
    </>
  );
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
  padding: "1.5rem",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.85rem",
  fontWeight: 600,
  marginBottom: "0.4rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.8rem",
  fontSize: "0.95rem",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(0,0,0,0.25)",
  color: "inherit",
  boxSizing: "border-box",
};

const hintStyle: React.CSSProperties = {
  margin: "0.3rem 0 0",
  fontSize: "0.75rem",
  opacity: 0.65,
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.65rem 1.1rem",
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
    padding: "0.65rem 1.1rem",
    background: "transparent",
    color: "inherit",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.9rem",
  };
}

function resultStyle(kind: "success" | "error"): React.CSSProperties {
  return {
    marginTop: "1.25rem",
    padding: "0.9rem 1rem",
    background: kind === "error" ? "rgba(220,60,60,0.15)" : "rgba(60,180,90,0.15)",
    border: `1px solid ${kind === "error" ? "rgba(220,60,60,0.4)" : "rgba(60,180,90,0.4)"}`,
    borderRadius: 8,
    fontSize: "0.9rem",
  };
}
