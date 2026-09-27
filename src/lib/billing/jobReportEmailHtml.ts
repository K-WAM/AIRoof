import type { LetterheadBusiness } from "@/lib/documents/letterhead";
import { resolveLetterhead } from "@/lib/documents/letterhead";
import { billToBlock, documentShell, findingsBlock, footerBlock, letterheadBlock, narrativeBlock, photosBlock, quoteSectionBlock, sectionsBlock } from "@/lib/documents/emailBlocks";
import { reportSections, stripHiddenFacts } from "@/lib/documents/report";
import { reportQuoteSection } from "@/lib/documents/reportQuote";
import { fmtDate } from "@/lib/format";
import type { DocumentOptions } from "@/types/documentOptions";
import type { JobPhotoMeta, ParsedUpdate } from "@/types/jobs";
import type { LibraryLogo } from "@/types/library";
import type { JobQuote } from "@/types/quote";
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
  photos?: Array<JobPhotoMeta & { fullB64: string }>;
  /** The job's quote, loaded server-side. Only used when options.includeQuote is on AND it was sent/accepted (reportQuote.ts). */
  quote?: Pick<JobQuote, "quoteId" | "status" | "lines" | "hideMaterials" | "hideLabor" | "sentAt" | "answeredAt"> | null;
}): string {
  const brand = resolveLetterhead(input.business, input.logos);
  const sections = reportSections(input.parsed, input.options);
  const tz = input.business.timezone ?? "America/New_York";
  const quoteSection = reportQuoteSection(input.quote, input.options, (ms) => fmtDate(ms, tz));
  const meta: [string, string][] = [["Date", fmtDate(Date.now(), tz)], ["Reference", input.jobId]];
  if (input.billTo.address) meta.push(["Service at", input.billTo.address]);
  if (input.options?.showTechnicians && input.technicians?.length) meta.push(["Technicians", input.technicians.join(", ")]);
  const selectedFindings = (input.findings ?? []).filter((finding) => finding.includeInReport).map((finding) => ({ problem: finding.problem, solution: finding.solution }));
  const photos = input.options?.showPhotos === false ? [] : input.photos ?? [];
  return documentShell(letterheadBlock(brand, "Report", meta) + billToBlock(input.billTo, "Prepared for") + narrativeBlock(stripHiddenFacts(input.narrative ?? "", input.options)) + findingsBlock(selectedFindings) + sectionsBlock(sections) + quoteSectionBlock(quoteSection, brand.brandColor) + photosBlock(photos) + footerBlock(brand));
}
