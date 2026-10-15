import type { Job } from "@/types/jobs";
import type { BusinessConfig } from "@/types";
import { DocumentPreview } from "@/lib/documents/DocumentPreview";
import { resolveLetterhead } from "@/lib/documents/letterhead";

/** Read-only, local previews of this trial's actual field data. No generation, invented prices or sending. */
export function PrivateDemoDocuments({ job, business, kind }: { job: Job; business: BusinessConfig | null; kind: "quote" | "report" | "invoice" }) {
  const title = { quote: "Quote", report: "Report", invoice: "Invoice" }[kind];
  const issues = [...(job.findings ?? []).map((f) => f.problem), ...(job.parsed?.issues ?? []).map((i) => i.description)];
  const findings = [...new Set(issues)].filter(Boolean);
  const materials = (job.parsed?.materials ?? []).map((m) => `${m.quantity ?? "Quantity not recorded:"} ${m.unit || ""} ${m.item}`.replace(/ +/g, " ").trim());
  const labor = (job.parsed?.labor ?? []).map((l) => `${l.description}: ${l.hours === undefined ? "hours not recorded" : `${l.hours} hours`}`);
  const hasData = findings.length + materials.length + labor.length > 0;
  return <section data-testid={`private-demo-${kind}`} style={{ marginBottom: 20 }}>
    <p style={{ lineHeight: 1.5, color: "var(--text-muted)", fontSize: 13 }}><strong>{title} Preview</strong> · From your demo job. {kind === "report" ? "The office reviews the report before sending." : "Prices and final approval are set by the office."} Nothing has been sent.</p>
    {!hasData && <p>Add a voice update to see its findings, materials and labor here.</p>}
    <DocumentPreview title={title} brand={resolveLetterhead({ businessName: business?.businessName || "Your Roofing Business", brandColor: business?.brandColor })}
      meta={[["Job", job.jobId], ["Status", "Demo preview — not sent"]]}
      billTo={{ name: job.clientName || "Demo Customer", address: job.address }} partyLabel="Prepared for"
      sections={[
        ...(findings.length ? [{ title: "Findings Reported by Crew", lines: findings }] : []),
        ...(materials.length ? [{ title: "Materials", lines: materials }] : []),
        ...(labor.length ? [{ title: "Labor", lines: labor }] : []),
        ...(hasData && kind !== "report" ? [{ title: "Pricing", lines: ["Pending office pricing and approval."] }] : []),
      ]}
    />
  </section>;
}
