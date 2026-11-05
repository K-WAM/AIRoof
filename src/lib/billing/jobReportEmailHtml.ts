import { documentPreheader } from "@/lib/documents/emailCopy";
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
import type { LetterTemplate, ReportLetterOptions } from "@/types/documentTemplate";
import { DEFAULT_LETTERS } from "@/lib/documents/letters";
import { completionLetter, isCompletion } from "@/lib/documents/completionLetter";
import { letterHtml } from "@/lib/documents/letterHtml";

export function buildJobReportEmailHtml(input: {
  business: LetterheadBusiness;
  reportDocument?: ReportLetterOptions;
  template?: LetterTemplate;
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
  quote?: Pick<JobQuote, "quoteId" | "status" | "lines" | "hideMaterials" | "hideLabor" | "priceMode" | "subtotal" | "sentAt" | "answeredAt"> | null;
}): string {
  const brand = resolveLetterhead(input.business, input.logos, "light", input.reportDocument?.logoId);
  const sections = reportSections(input.parsed, input.options);
  const tz = input.business.timezone ?? "America/New_York";
  const quoteSection = reportQuoteSection(input.quote, { ...input.options, priceMode: input.reportDocument?.priceMode }, (ms) => fmtDate(ms, tz));
  const meta: [string, string][] = [["Date", fmtDate(Date.now(), tz)], ["Reference", input.jobId]];
  if (input.billTo.address) meta.push(["Service at", input.billTo.address]);
  if (input.options?.showTechnicians && input.technicians?.length) meta.push(["Technicians", input.technicians.join(", ")]);
  const selectedFindings = (input.findings ?? []).filter((finding) => finding.includeInReport).map((finding) => ({ problem: finding.problem, solution: finding.solution, note: finding.note }));
  const photos = input.options?.showPhotos === false ? [] : input.photos ?? [];
  if (isCompletion(input.reportDocument)) {
    const kind = input.reportDocument!.layout as "inspection_completion" | "repair_completion";
    const letter = completionLetter({ jobId: input.jobId, title: input.title, address: input.billTo.address, clientName: input.billTo.name, reportDocument: input.reportDocument }, input.business, input.template ?? DEFAULT_LETTERS[kind], Date.now());
    return documentShell(letterheadBlock(brand, letter.title, meta) + billToBlock(input.billTo, "Prepared for") + letterHtml(letter) + (kind === "repair_completion" && input.reportDocument?.noCharge ? "<p>There is no charge.</p>" : "") + findingsBlock(selectedFindings) + photosBlock(photos) + footerBlock(brand), documentPreheader(brand.businessName ?? "", "Your document is ready to review."));
  }
  return documentShell(letterheadBlock(brand, "Report", meta) + billToBlock(input.billTo, "Prepared for") + narrativeBlock(stripHiddenFacts(input.narrative ?? "", input.options)) + findingsBlock(selectedFindings) + sectionsBlock(sections) + quoteSectionBlock(quoteSection, brand.brandColor) + photosBlock(photos) + footerBlock(brand), documentPreheader(brand.businessName ?? "", "Your document is ready to review."));
}
