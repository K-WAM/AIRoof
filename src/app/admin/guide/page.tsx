"use client";

import { useState } from "react";

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
];

export default function AdminGuidePage() {
  const [active, setActive] = useState("demo");
  const current = TABS.find((t) => t.id === active)!;

  return (
    <>
      <header className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Playbooks</h1>
          <p className="page-subtitle">{current.description}</p>
        </div>
        <a
          className="button primary"
          href={current.src}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full screen ↗
        </a>
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

      <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: 10 }}>
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
