// Read-only Pay now preview for either company (Roof Doctors review, 2026-11-05). Screen only: never printed or
// emailed. The link opens /api/jobs/[jobId]/invoice/pay-preview, the customer's pay page with its buttons switched off.
export function PayNowPreview({ businessId, jobId, invoiceId }: { businessId: string; jobId: string; invoiceId: string }) {
  const href = `/api/jobs/${encodeURIComponent(jobId)}/invoice/pay-preview?businessId=${encodeURIComponent(businessId)}&invoiceId=${encodeURIComponent(invoiceId)}`;
  return (
    <div className="no-print" data-testid="pay-now-preview" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span className="button primary" aria-hidden="true" style={{ opacity: 0.55, pointerEvents: "none" }}>Pay now</span>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Preview of the customer&apos;s Pay now button.{" "}
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline" }}>Open the pay page preview</a>
      </span>
    </div>
  );
}
