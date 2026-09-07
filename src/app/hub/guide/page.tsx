"use client";

import { useState } from "react";
import { BookOpen, Download, ExternalLink } from "lucide-react";

const TABS = [
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
    description: "Vapi setup, portal provisioning, and go-live checklist.",
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

export default function AdminGuidePage() {
  const [active, setActive] = useState("demo");
  const current = TABS.find((t) => t.id === active)!;

  return (
    <>
      <header className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={20} strokeWidth={1.75} />
            Playbooks
          </h1>
          <p className="page-subtitle">{current.description}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              padding: "7px 16px",
              borderRadius: 6,
              border: "1px solid",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              background: active === tab.id ? "#0f172a" : "#fff",
              color: active === tab.id ? "#f1f5f9" : "#475569",
              borderColor: active === tab.id ? "#0f172a" : "#d7dde5",
              transition: "all 0.1s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="panel"
        style={{
          padding: 0,
          overflow: "hidden",
          borderRadius: 10,
          background: active === "pitch" ? "#111520" : undefined,
        }}
      >
        <iframe
          key={current.src}
          src={current.src}
          style={{
            width: "100%",
            height: "calc(100vh - 200px)",
            border: "none",
            display: "block",
          }}
          title={current.label}
        />
      </div>
    </>
  );
}
