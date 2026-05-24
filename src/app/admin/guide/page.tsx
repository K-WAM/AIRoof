"use client";

export default function AdminGuidePage() {
  return (
    <>
      <header className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Playbooks</h1>
          <p className="page-subtitle">
            Demo script and client onboarding guide. Print to PDF via browser File → Print.
          </p>
        </div>
        <a
          className="button primary"
          href="/guides/onboarding-guide.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full screen ↗
        </a>
      </header>

      <div className="panel" style={{ padding: 0, overflow: "hidden", borderRadius: 10 }}>
        <iframe
          src="/guides/onboarding-guide.html"
          style={{
            width: "100%",
            height: "calc(100vh - 160px)",
            border: "none",
            display: "block",
          }}
          title="Demo and Onboarding Guide"
        />
      </div>
    </>
  );
}
