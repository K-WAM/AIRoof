// Reusable full-page loading skeleton — replaces bare "Loading…" text across
// company/admin pages so a slow connection reads as "working" instead of "stuck".
export function PageSkeleton({
  metrics = 0,
  rows = 4,
}: {
  /** Number of metric tiles to show at the top (dashboard-style pages). 0 = skip. */
  metrics?: number;
  /** Number of list-row placeholders. */
  rows?: number;
}) {
  return (
    <div className="skeleton-page">
      <div className="skeleton skeleton-header" />
      <div className="skeleton skeleton-subheader" />
      {metrics > 0 && (
        <div className="skeleton-metric-grid">
          {Array.from({ length: metrics }).map((_, i) => (
            <div key={i} className="skeleton skeleton-metric" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}
