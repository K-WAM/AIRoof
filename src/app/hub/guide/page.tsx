"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, Download, ExternalLink } from "lucide-react";
import { getAppUrl } from "@/lib/config/appUrl";

const FULL_TABS = [
  {
    id: "demo",
    label: "Demo Playbook",
    src: "/guides/onboarding-guide.html#part-1",
    description: "Pitch script, ROI numbers, and live demo walkthrough.",
  },
  {
    id: "onboarding",
    label: "Client Onboarding",
    src: "/guides/onboarding-guide.html#part-2",
    description: "Portal setup, phone lines and go-live checklist.",
  },
  {
    id: "field",
    label: "Field Operations",
    src: "/guides/field-operations-guide.html",
    description: "Job creation, field crew voice updates, report and invoice generation.",
  },
  {
    id: "pitch",
    label: "Pitch Deck",
    src: "/guides/pitch-deck.html",
    description: "2-page printable pitch deck — open full screen, then print → Save as PDF.",
  },
];

interface QuickStep {
  title: string;
  expects: string;
  /** In-app deep link; the absolute URL is built with getAppUrl(). */
  path: string;
}

const QUICK_STEPS: QuickStep[] = [
  {
    title: "Choose the prospect and industry",
    expects: "Demo Studio is loaded and the industry matches the prospect.",
    path: "/hub/demo",
  },
  {
    title: "Launch the demo",
    expects: "The demo line and greeting update to this prospect's company.",
    path: "/hub/demo",
  },
  {
    title: "Call the demo line",
    expects: "The AI answers as their company and books an inspection like a receptionist.",
    path: "/try/roofing",
  },
  {
    title: "Open Calls / Pipeline",
    expects: "The call shows up as a request with its transcript and intake details.",
    path: "/company/calls?preview=demo-roofing",
  },
  {
    title: "Open the prepared job",
    expects: "Job J-1001 opens with the seeded photos and findings.",
    path: "/company/jobs/J-1001?preview=demo-roofing",
  },
  {
    title: "Show Field",
    expects: "The technician screen shows the same job, ready for a voice update.",
    path: "/company/field?preview=demo-roofing",
  },
  {
    title: "Show Quote / Invoice",
    expects: "The priced quote and invoice render the same numbers the customer would receive.",
    path: "/company/jobs/J-1001?preview=demo-roofing&tab=quote",
  },
];

function QuickDemoGuide() {
  const appUrl = getAppUrl();
  return (
    <section className="panel" aria-labelledby="quick-demo-title">
      <div className="panel-header">
        <h2 className="panel-title" id="quick-demo-title">Run a demo in 5 minutes</h2>
      </div>
      <div className="panel-body">
        <p style={{ margin: "0 0 var(--sp-4)", color: "var(--text-muted)", fontSize: 14 }}>
          One path, seven steps. Each step says what you should see; if it doesn&apos;t, use the
          &ldquo;If this fails&rdquo; link.
        </p>
        <ol className="demo-steps">
          {QUICK_STEPS.map((step, index) => (
            <li key={step.title} className="demo-step">
              <span className="demo-step-num">{index + 1}</span>
              <div className="demo-step-body">
                <p className="demo-step-title">{step.title}</p>
                <p className="demo-step-expects"><strong>Expected:</strong> {step.expects}</p>
                <div className="demo-step-links">
                  <a className="button small" href={`${appUrl}${step.path}`}>{step.title} ↗</a>
                  <a className="demo-step-fail" href={`${appUrl}/guides/onboarding-guide.html`}>If this fails</a>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FullPlaybook() {
  const [active, setActive] = useState("demo");
  const current = FULL_TABS.find((t) => t.id === active)!;

  return (
    <section aria-label="Full playbook">
      <header className="page-header" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <p className="page-subtitle">{current.description}</p>
        </div>
        <div className="hub-guide-actions" style={{ display: "flex", gap: "var(--sp-2)" }}>
          {active === "pitch" && (
            <a
              className="button"
              href="/Luxor-AI-Pitch.pptx"
              download="Luxor-AI-Pitch.pptx"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Download size={15} strokeWidth={1.75} />
              Download PPTX
            </a>
          )}
          <a
            className="button primary"
            href={current.src}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ExternalLink size={15} strokeWidth={1.75} />
            {active === "pitch" ? "Open → Print as PDF" : "Open full screen"}
          </a>
        </div>
      </header>

      <div className="hub-guide-tabs" role="tablist" aria-label="Playbook sections" style={{ display: "flex", gap: "var(--sp-1)", marginBottom: "var(--sp-3)" }}>
        {FULL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className="filter-chip"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel hub-guide-frame" style={{ padding: 0, overflow: "hidden", borderRadius: "var(--r-md)", background: active === "pitch" ? "var(--text)" : undefined }}>
        <iframe
          key={current.src}
          src={current.src}
          style={{ width: "100%", height: "calc(100vh - 200px)", border: "none", display: "block" }}
          title={current.label}
        />
      </div>
    </section>
  );
}

export default function AdminGuidePage() {
  const [tab, setTab] = useState<"quick" | "full">("quick");

  const tabs: Array<{ id: "quick" | "full"; label: string; content: ReactNode }> = [
    { id: "quick", label: "Run a demo in 5 minutes", content: <QuickDemoGuide /> },
    { id: "full", label: "Full playbook (20-minute deep dive)", content: <FullPlaybook /> },
  ];
  const active = tabs.find((t) => t.id === tab)!;

  return (
    <>
      <header className="page-header" style={{ marginBottom: "var(--sp-4)" }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <BookOpen size={20} strokeWidth={1.75} />
            Playbooks
          </h1>
          <p className="page-subtitle">Run a 5-minute demo, or open the full 20-minute playbook.</p>
        </div>
      </header>

      <div className="hub-guide-tabs" role="tablist" aria-label="Playbook" style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="filter-chip"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active.content}
    </>
  );
}
