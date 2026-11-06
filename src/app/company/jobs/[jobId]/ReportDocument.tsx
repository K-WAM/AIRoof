"use client";
import type { Job, JobPhotoMeta } from "@/types/jobs";
import type { BusinessConfig } from "@/types";
import type { LibraryLogo } from "@/types/library";
import type { JobQuote } from "@/types/quote";
import { useFormat } from "@/hooks/useFormat";
import { useLetterTemplates } from "@/lib/documents/useLetterTemplates";
import { completionLetter, isCompletion } from "@/lib/documents/completionLetter";
import { LetterBody } from "@/lib/documents/LetterBody";
import { LazyDocumentPreview as DocumentPreview } from "@/lib/documents/LazyDocumentPreview";
import { normalizeDocumentOptions, type DocumentOptions } from "@/types/documentOptions";
import { reportSections, stripHiddenFacts } from "@/lib/documents/report";
import { reportQuoteSection } from "@/lib/documents/reportQuote";
import { documentLetterhead } from "@/lib/companies/documentLetterhead";
import { resolveDocumentCompany } from "@/lib/companies/companies";

export function ReportDocument({ job, jobId, businessConfig, logos, reportNotes, reportOptions, reportTechnicians, reportPhotos, quote }: {
  job: Job;
  jobId: string;
  businessConfig: BusinessConfig | null;
  logos: LibraryLogo[];
  reportNotes: string;
  reportOptions: Partial<DocumentOptions>;
  reportTechnicians: string[];
  reportPhotos: Array<JobPhotoMeta & { fullB64: string }>;
  quote: JobQuote | null;
}) {
  const { fmtDate } = useFormat();
  const { templates, error: letterError } = useLetterTemplates(isCompletion(job.reportDocument));
  const options = normalizeDocumentOptions(reportOptions);
  const sections = reportSections(job.parsed, options);
  const brand = documentLetterhead(businessConfig ?? {}, resolveDocumentCompany(businessConfig, { documentCompanyId: job.reportDocument?.companyId, jobCompanyId: job.companyId, documentStatus: job.reportDocument?.sentAt ? "sent" : "draft" }), logos, job.reportDocument?.logoId);
  const meta: [string, string][] = [["Date", fmtDate(Date.now())], ["Reference", jobId]];
  // Opt-in, price-bearing: null (nothing shown) unless "Include the quote" is on and the quote was sent or accepted.
  const quoteSection = reportQuoteSection(quote, { ...options, priceMode: job.reportDocument?.priceMode }, fmtDate);
  if (job.address) meta.push(["Service at", job.address]);
  if (options.showTechnicians && reportTechnicians.length) meta.push(["Technicians", reportTechnicians.join(", ")]);
  const findings = (job.findings ?? []).filter((finding) => finding.includeInReport).map((finding) => ({ category: finding.category, problem: finding.problem, solution: finding.solution, note: finding.note }));
  if (isCompletion(job.reportDocument)) {
    const kind = job.reportDocument!.layout as "inspection_completion" | "repair_completion";
    const letter = completionLetter(job, brand, templates[kind], Date.now(), quote);
    // A completion notice names the work and the order it closes, like the contractor's own notice (2026-11-06).
    const noticeMeta: [string, string][] = [
      ...meta.map(([key, value]) => (key === "Reference" ? [key, `Work order ${jobId}`] : [key, value]) as [string, string]),
      ...(job.title ? [["Description", job.title] as [string, string]] : []),
      ...(job.reportDocument?.poNumber ? [["PO number", job.reportDocument.poNumber] as [string, string]] : []),
    ];
    return <>{letterError && <p className="no-print" role="alert">{letterError}</p>}{letter.missing.length > 0 && <p className="no-print">Unfilled letter fields: {letter.missing.join(", ")}</p>}<DocumentPreview className="report-doc" title={letter.title} brand={brand} meta={noticeMeta} billTo={{ name: job.clientName ?? "", address: job.address }} partyLabel="Customer" findingSections={job.reportDocument?.showFindingSections !== false} findings={findings} photos={options.showPhotos ? reportPhotos : []}><LetterBody letter={letter} />{kind === "repair_completion" && job.reportDocument?.noCharge && <p>There is no charge.</p>}</DocumentPreview></>;
  }
  return <DocumentPreview className="report-doc" title="Report" brand={brand} meta={meta}
    billTo={{ name: job.clientName ?? "", address: job.address, phone: job.clientPhone }} partyLabel="Prepared for"
    narrative={stripHiddenFacts(reportNotes, options)}
    findingSections={job.reportDocument?.showFindingSections !== false} findings={findings} sections={sections} quoteSection={quoteSection}
    photos={options.showPhotos ? reportPhotos : []} />;
}

