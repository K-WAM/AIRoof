"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Phone } from "lucide-react";

// A scannable "run a demo" checklist that lives at the top of Demo Studio. Deliberately static content: it tells the
// operator WHAT to do and in what order, and links straight to the pages a prospect should see afterwards. Facts here
// (numbers, tenants) mirror docs/NEXT_SESSION.md — update both when a demo line changes.

export const ELEVENLABS_DEMO = {
  label: "Human-voice line (ElevenLabs)",
  phoneDisplay: "+1 (689) 204-2643",
  tel: "+16892042643",
  businessId: "carlita-elevenlabs-test",
  note: "Roofing only. Change name/greeting in Admin → Clients → Edit.",
};
export const VAPI_DEMO = {
  label: "Any-industry line (Vapi)",
  phoneDisplay: "+1 (754) 283-7658",
  tel: "+17542837658",
  businessId: "demo-roofing",
  note: "Launch any of the 13 industries below — the line switches within a minute.",
};

export function previewHref(page: string, businessId: string): string {
  return `/company/${page}?preview=${encodeURIComponent(businessId)}`;
}

const RESULT_PAGES: Array<{ page: string; label: string }> = [
  { page: "pipeline", label: "Pipeline" },
  { page: "calls", label: "Calls" },
  { page: "calendar", label: "Calendar" },
  { page: "jobs", label: "Jobs" },
];

const STORAGE_KEY = "demoRunbookChecks";

function readChecks(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeChecks(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / blocked storage: the checklist just doesn't persist */
  }
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: n === 1 ? "none" : "1px solid var(--border, #e2e8f0)" }}>
      <span
        aria-hidden
        style={{ flex: "0 0 26px", height: 26, borderRadius: 13, background: "var(--accent)", color: "#fff", fontWeight: 700, fontSize: 13, display: "grid", placeItems: "center" }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: "0 0 4px", fontWeight: 700 }}>{title}</p>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{children}</div>
      </div>
    </li>
  );
}

function Check({ id, label, checks, toggle }: { id: string; label: string; checks: Record<string, boolean>; toggle: (id: string) => void }) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "2px 0" }}>
      <input type="checkbox" checked={!!checks[id]} onChange={() => toggle(id)} style={{ marginTop: 3 }} />
      <span>{label}</span>
    </label>
  );
}

function LineCard({ line }: { line: typeof ELEVENLABS_DEMO | typeof VAPI_DEMO }) {
  return (
    <div style={{ flex: "1 1 260px", border: "1px solid var(--border, #e2e8f0)", borderRadius: 10, padding: 12 }}>
      <p style={{ margin: "0 0 2px", fontWeight: 700 }}>{line.label}</p>
      <a href={`tel:${line.tel}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 18, fontWeight: 700 }}>
        <Phone size={16} strokeWidth={1.75} /> {line.phoneDisplay}
      </a>
      <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--text-muted)" }}>{line.note}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {RESULT_PAGES.map((r) => (
          <a
            key={r.page}
            className="button small"
            href={previewHref(r.page, line.businessId)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {r.label} <ExternalLink size={12} strokeWidth={1.75} />
          </a>
        ))}
      </div>
    </div>
  );
}

export function DemoRunbook() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(true);
  useEffect(() => setChecks(readChecks()), []);

  function toggle(id: string) {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      writeChecks(next);
      return next;
    });
  }

  return (
    <section className="panel" aria-labelledby="demo-runbook-title" style={{ marginTop: "1.25rem" }}>
      <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="panel-title" id="demo-runbook-title">Run a demo in 5 minutes</h2>
        <button type="button" className="button small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="panel-body">
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <Step n={1} title="Before they arrive (2 min)">
              <Check id="sync" label="Recording notice applied — Admin → Clients → Sync live phone assistants → Preview → Apply" checks={checks} toggle={toggle} />
              <Check id="twilio" label="Twilio account upgraded (otherwise callers hear a trial message on the human-voice line)" checks={checks} toggle={toggle} />
              <Check id="window" label="Open the app in a second window so they see results appear live" checks={checks} toggle={toggle} />
            </Step>
            <Step n={2} title="Pick the line">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                <LineCard line={ELEVENLABS_DEMO} />
                <LineCard line={VAPI_DEMO} />
              </div>
            </Step>
            <Step n={3} title="Have them call — say this">
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>English: “I’d like a roof inspection tomorrow at 8, my name is ___, there’s a small leak at ___.”</li>
                <li>Spanish: “Hola, necesito que revisen mi techo, tengo una gotera.” (the AI switches language by itself)</li>
                <li>Give: name, callback number, address, what’s wrong, preferred time. Emergency test: “Water is coming through my ceiling.”</li>
              </ul>
            </Step>
            <Step n={4} title="Show what the call produced (about 1 minute each)">
              <p style={{ margin: 0 }}>
                <strong>Pipeline</strong> (the new request) → <strong>Calls</strong> (transcript + recording) → <strong>Calendar</strong> (drag it onto a crew) → <strong>Jobs</strong> (create the job from the request).
                Use the buttons on the line you called (step 2) — they open the right business in a new tab.
              </p>
            </Step>
            <Step n={5} title="Field, invoice, quote, report">
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Open the job → <strong>Field QR</strong> → scan with a phone → hold to speak, in English or Spanish: “Usé doce paquetes de tejas, Carlos trabajó ocho horas, encontré una grieta en el respiradero.”</li>
                <li>Job tabs: Timeline / Materials / Labor / Issues / Photos / Findings → <strong>Invoice</strong> (Hide materials works here), <strong>Quote</strong>, <strong>Report</strong>.</li>
              </ul>
            </Step>
            <Step n={6} title="Wrap up (be straight about what’s not live yet)">
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Send them the self-serve link: <code>/try/&lt;industry&gt;</code> (tap-to-call + read-only “See it in the real app”).</li>
                <li>Quotes and invoices have <strong>no online payment/acceptance</strong> yet. Use the Review request card in Pipeline/Calls to confirm or decline a request. Recording-notice wording is a draft pending counsel review.</li>
                <li>Tick <em>Exit demo</em> in the banner, or use <strong>Reset</strong> at the bottom of this page, before the next prospect.</li>
              </ul>
            </Step>
          </ol>
        </div>
      )}
    </section>
  );
}
