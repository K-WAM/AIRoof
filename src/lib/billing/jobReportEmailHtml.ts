import type { LetterheadBusiness } from "@/lib/documents/letterhead";
import { resolveLetterhead, escapeHtml } from "@/lib/documents/letterhead";
import { billToBlock, documentShell, findingsBlock, footerBlock, letterheadBlock, narrativeBlock, sectionsBlock } from "@/lib/documents/emailBlocks";
import { pairReportPhotos, reportSections, type ReportPhoto } from "@/lib/documents/report";
import type { DocumentOptions } from "@/types/documentOptions";
import type { ParsedUpdate } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";
import type { JobFinding } from "@/types/workCatalog";

export function buildJobReportEmailHtml(input: {
  business: LetterheadBusiness;
  logos: LibraryLogo[];
  jobId: string;
  title: string;
  billTo: { name: string; address?: string; phone?: string };
  parsed?: ParsedUpdate;
  findings?: JobFinding[];
  narrative?: string;
  options?: Partial<DocumentOptions>;
  technicians?: string[];
  photos?: ReportPhoto[];
}): string {
  const brand = resolveLetterhead(input.business, input.logos);
  const sections = reportSections(input.parsed, input.options);
  const meta: [string, string][] = [["Date", new Date().toLocaleDateString("en-US")], ["Reference", input.jobId]];
  if (input.billTo.address) meta.push(["Service at", input.billTo.address]);
  if (input.options?.showTechnicians && input.technicians?.length) meta.push(["Technicians", input.technicians.join(", ")]);
  const selectedFindings = (input.findings ?? []).filter((finding) => finding.includeInReport).map((finding) => ({ problem: finding.problem, solution: finding.solution }));
  const photos = input.options?.showPhotos === false ? [] : input.photos ?? [];
  const { pairs, other } = pairReportPhotos(photos);
  const image = (photo: ReportPhoto | undefined, heading: string) => photo ? `<td style="width:50%;padding:6px;vertical-align:top"><strong style="font-size:11px;color:#475569">${heading}</strong><img src="data:image/jpeg;base64,${photo.fullB64}" alt="${escapeHtml(photo.label)}" style="display:block;width:100%;margin-top:5px;border:1px solid #e2e8f0;border-radius:6px"/><div style="font-size:12px;color:#475569;margin-top:4px">${escapeHtml(photo.label)}</div></td>` : "<td style=\"width:50%;padding:6px\"></td>";
  const pairedPhotos = pairs.length ? `<section style="margin-top:24px"><h3 style="font-size:13px">Photo documentation</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px">Problem</th><th style="text-align:left;padding:6px">Corrective action</th></tr></thead><tbody>${pairs.map((pair) => `<tr>${image(pair.before, "Problem")}${image(pair.after, "Corrective action")}</tr>`).join("")}</tbody></table></section>` : "";
  const otherPhotos = other.length ? `<section style="margin-top:24px"><h3 style="font-size:13px">Photo documentation</h3>${other.map((photo) => `<div style="margin:10px 0"><img src="data:image/jpeg;base64,${photo.fullB64}" alt="${escapeHtml(photo.label)}" style="max-width:100%;border:1px solid #e2e8f0;border-radius:6px"/><div style="font-size:12px;color:#475569">${escapeHtml(photo.label)}</div></div>`).join("")}</section>` : "";
  return documentShell(letterheadBlock(brand, "Report", meta) + billToBlock(input.billTo) + narrativeBlock(input.narrative) + findingsBlock(selectedFindings) + sectionsBlock(sections) + pairedPhotos + otherPhotos + footerBlock(brand));
}
