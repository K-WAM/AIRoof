/** Content placeholder for a deferred panel; keeps the tab bar and page header in place. */
export function PanelSkeleton({ label = "Loading panel", document = false }: { label?: string; document?: boolean }) {
  return <section role="status" aria-label={label} className="panel" style={{ padding: document ? 32 : 20, minHeight: document ? 540 : 320, marginBottom: 16 }}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" style={{ display: "grid", gap: 20 }}>
      <div className="skeleton" style={{ width: "45%", height: document ? 60 : 24, borderRadius: 6 }} />
      <div className="skeleton" style={{ width: "70%", height: 18, borderRadius: 4 }} />
      {[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: document ? 64 : 48, borderRadius: 6 }} />)}
      {document && <div className="skeleton" style={{ justifySelf: "end", width: "40%", height: 56, borderRadius: 6 }} />}
    </div>
  </section>;
}
