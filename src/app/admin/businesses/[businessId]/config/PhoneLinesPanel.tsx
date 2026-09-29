"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { PhoneCall } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { LineStatus, PhoneLineView, SmsStatus } from "@/types/phoneLine";

// Phase 32 (T-171): one business's phone lines and their lifecycle, for Luxor operators.
// Draft → Provisioned → Connected → Test passed → Live → Retired. Go live and Retire always show the exact routing change
// first (a dry run) and need the number typed to confirm. This panel sits inside the config <form>, so its inputs have no
// `name` (they never join the config save) and Enter never submits that form.

const STATUS_LABEL: Record<LineStatus, string> = {
  draft: "Draft",
  provisioned: "Provisioned",
  connected: "Connected — not yet tested",
  test_passed: "Test call passed",
  live: "Live",
  retired: "Retired",
};

const SMS_LABEL: Record<SmsStatus, string> = {
  not_configured: "Texting off",
  pending_registration: "Texting waiting for carrier approval",
  ready: "Texting ready",
  blocked: "Texting blocked",
};

type Pending = { line: PhoneLineView; action: "go_live" | "retire"; preview: unknown } | null;

function stopEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.preventDefault();
}

export function PhoneLinesPanel({ businessId }: { businessId: string }) {
  const [lines, setLines] = useState<PhoneLineView[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newAcquisition, setNewAcquisition] = useState("new");
  const [testCallIds, setTestCallIds] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending>(null);
  const [typed, setTyped] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/phone-lines?businessId=${encodeURIComponent(businessId)}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { lines: PhoneLineView[] };
      setLines(body.lines);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);

  async function patch(line: PhoneLineView, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/phone-lines/${encodeURIComponent(line.lineId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: typeof result.error === "string" ? result.error : "That did not work — nothing changed." });
        return null;
      }
      return result as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  }

  async function run(line: PhoneLineView, body: Record<string, unknown>, done: string) {
    const result = await patch(line, body);
    if (result) {
      setMessage({ tone: "ok", text: done });
      await load();
    }
  }

  async function preview(line: PhoneLineView, action: "go_live" | "retire") {
    const result = await patch(line, { action, confirm: line.e164, dryRun: true });
    if (result) {
      setTyped("");
      setPending({ line, action, preview: result.routing });
    }
  }

  async function addLine() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/phone-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, phoneNumber: newNumber, acquisition: newAcquisition }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: typeof result.error === "string" ? result.error : "The line could not be added." });
        return;
      }
      setNewNumber("");
      setMessage({ tone: "ok", text: "Line added as a Draft." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="phone-lines-title">
      <div className="panel-header">
        <h2 className="panel-title" id="phone-lines-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <PhoneCall size={16} strokeWidth={1.75} />
          Phone lines
        </h2>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: 12 }}>
        <p className="helper-text" style={{ margin: 0 }}>
          A line goes live only after a test call to it shows up in this company&apos;s Calls. Go live and Retire show the
          exact routing change first. The shared demo numbers can never be added to a client.
        </p>

        {loadError && <p role="alert" style={{ margin: 0, color: "var(--danger)" }}>Couldn&apos;t load the lines. <button type="button" className="button small" onClick={() => void load()}>Retry</button></p>}
        {lines === null && !loadError && <p className="helper-text" style={{ margin: 0 }}>Loading lines…</p>}
        {lines?.length === 0 && <p style={{ margin: 0 }}>No line on record for this business yet.</p>}

        {lines?.map((line) => (
          <div key={line.lineId} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 12, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
              <strong>{line.display}</strong>
              <span>{line.country === "CA" ? "Canada" : "US"} · {line.purpose === "demo" ? "Shared demo line" : "Client line"}</span>
              <span className="status-pill">{STATUS_LABEL[line.status]}</span>
              <span className="helper-text">{SMS_LABEL[line.sms.status]}{line.sms.isDefaultSender ? " · default sender" : ""}</span>
            </div>
            <p className="helper-text" style={{ margin: 0 }}>
              Next: {line.nextStep}
              {line.lastTestAt ? ` · last test ${new Date(line.lastTestAt).toLocaleString()}` : ""}
              {line.provider ? ` · ${line.provider === "elevenlabs" ? "ElevenLabs" : "Vapi"}` : ""}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {(line.status === "draft" || line.status === "provisioned") && (
                <>
                  <button type="button" className="button small" disabled={busy} onClick={() => void run(line, { action: "mark_connected", provider: "elevenlabs" }, "Marked connected (ElevenLabs).")}>
                    Mark connected (ElevenLabs)
                  </button>
                  <button type="button" className="button small" disabled={busy} onClick={() => void run(line, { action: "mark_connected", provider: "vapi" }, "Marked connected (Vapi).")}>
                    Mark connected (Vapi)
                  </button>
                </>
              )}
              {(line.status === "connected" || line.status === "test_passed" || line.status === "live") && (
                <>
                  <label htmlFor={`test-${line.lineId}`} className="helper-text">Test call ID</label>
                  <input
                    id={`test-${line.lineId}`}
                    value={testCallIds[line.lineId] ?? ""}
                    onChange={(event) => setTestCallIds((current) => ({ ...current, [line.lineId]: event.target.value }))}
                    onKeyDown={stopEnter}
                    placeholder="call_elevenlabs_…"
                    style={{ minWidth: 220 }}
                  />
                  <button
                    type="button"
                    className="button small"
                    disabled={busy || !(testCallIds[line.lineId] ?? "").trim()}
                    onClick={() => void run(line, { action: "record_test", callId: (testCallIds[line.lineId] ?? "").trim() }, "Test call recorded.")}
                  >
                    Record test call
                  </button>
                </>
              )}
              {line.status === "test_passed" && (
                <button type="button" className="button primary small" disabled={busy} onClick={() => void preview(line, "go_live")}>Go live…</button>
              )}
              {line.status !== "retired" && line.purpose !== "demo" && (
                <button type="button" className="button small" disabled={busy} onClick={() => void preview(line, "retire")}>Retire…</button>
              )}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="new-line-number">Add a line</label>
            <input id="new-line-number" type="tel" value={newNumber} onChange={(event) => setNewNumber(event.target.value)} onKeyDown={stopEnter} placeholder="+1 (305) 555-0123" />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="new-line-acquisition">Obtained by</label>
            <select id="new-line-acquisition" value={newAcquisition} onChange={(event) => setNewAcquisition(event.target.value)}>
              <option value="new">New dedicated number</option>
              <option value="forward">Forwarding to a dedicated number</option>
              <option value="port_in">Port-in</option>
            </select>
          </div>
          <button type="button" className="button small" disabled={busy || !newNumber.trim()} onClick={() => void addLine()}>Add as Draft</button>
        </div>

        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} style={{ margin: 0, color: message.tone === "error" ? "var(--danger)" : "var(--success)" }}>
            {message.text}
          </p>
        )}
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === "go_live" ? `Go live: ${pending.line.display}` : `Retire: ${pending?.line.display ?? ""}`}
      >
        {pending && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>
              {pending.action === "go_live"
                ? "Calls to this number will be answered for this business. This is the exact routing change:"
                : "This number stops answering for this business. Past calls are kept. This is the exact routing change:"}
            </p>
            <pre style={{ margin: 0, padding: 10, background: "var(--surface-muted)", borderRadius: "var(--r-sm)", fontSize: 12, whiteSpace: "pre-wrap" }}>
              {JSON.stringify(pending.preview, null, 2)}
            </pre>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="confirm-line">Type {pending.line.e164} to confirm</label>
              <input id="confirm-line" value={typed} onChange={(event) => setTyped(event.target.value)} onKeyDown={stopEnter} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="button" onClick={() => setPending(null)}>Cancel</button>
              <button
                type="button"
                className="button primary"
                disabled={busy || typed.trim() !== pending.line.e164}
                onClick={async () => {
                  const { line, action } = pending;
                  setPending(null);
                  await run(line, { action, confirm: typed.trim(), dryRun: false }, action === "go_live" ? "Line is live." : "Line retired; routing restored.");
                }}
              >
                {pending.action === "go_live" ? "Go live" : "Retire line"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
