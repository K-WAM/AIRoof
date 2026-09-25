"use client";

import Link from "next/link";

const BUSINESS_ID = "demo-roofing";

export function previewHref(page: string, businessId = BUSINESS_ID): string {
  return `/company/${page}?preview=${encodeURIComponent(businessId)}`;
}

const RUN = [
  { time: "0–2", action: "Hand them the number", say: "Call this. It's your receptionist.", plan: "You call on speaker.", href: previewHref("dashboard"), link: "Dashboard" },
  { time: "2–6", action: "Take the call", say: "Ask about tile or insurance, then book an inspection.", plan: "Use a scripted call.", href: previewHref("calls"), link: "Calls" },
  { time: "6–9", action: "Review the request", say: "Here's the transcript and booking. Confirm and create the job.", plan: "Use the seeded request.", href: previewHref("pipeline"), link: "Pipeline" },
  { time: "9–13", action: "Show a field update", say: "Marco reports cracked tiles and a split pipe boot by voice.", plan: "Open the worked job J-1001.", href: previewHref("jobs/J-1001"), link: "J-1001" },
  { time: "13–16", action: "Build the quote", say: "The findings become priced work from the Library.", plan: "Use print preview.", href: previewHref("jobs/J-1001"), link: "Quote" },
  { time: "16–18", action: "Show report and invoice", say: "The report explains the work; the invoice follows.", plan: "Use J-1001.", href: previewHref("jobs/J-1001"), link: "Job" },
  { time: "18–20", action: "Wrap up", say: "Keep your number and forward calls to your AI line.", plan: "Share the try page.", href: "/try/roofing", link: "Try page" },
];

export function DemoRunbook() {
  return (
    <section className="panel" aria-labelledby="demo-runbook-title" style={{ marginTop: "1.5rem" }}>
      <div className="panel-header"><h2 className="panel-title" id="demo-runbook-title">2 · Run the demo</h2></div>
      <div className="panel-body">
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {RUN.map((step, index) => (
            <li key={step.time} style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "12px 0", borderTop: index ? "1px solid var(--border)" : undefined }}>
              <span style={{ color: "var(--accent)", fontWeight: 700, minWidth: 48 }}>{step.time} min</span>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <strong>{index + 1}. {step.action}</strong>
                <p style={{ margin: "4px 0" }}>Say: “{step.say}”</p>
                <p style={{ margin: 0, color: "var(--text-muted)" }}>Plan B: {step.plan}</p>
              </div>
              <Link className="button small" href={step.href}>{step.link}</Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
