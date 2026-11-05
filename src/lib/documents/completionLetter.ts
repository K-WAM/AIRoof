import type { Job } from "@/types/jobs";
import type { LetterTemplate, ReportLetterOptions } from "@/types/documentTemplate";
import type { LetterheadBusiness } from "./letterhead";
import { renderLetter } from "./letters";
import { fmtDate } from "@/lib/format";

export function isCompletion(options?: ReportLetterOptions): boolean {
  return options?.layout === "inspection_completion" || options?.layout === "repair_completion";
}
/** No price values are passed, even if a saved report includes a quote. */
export function completionLetter(job: Pick<Job, "jobId" | "clientName" | "address" | "title" | "reportDocument">, business: LetterheadBusiness, template: LetterTemplate, now: number) {
  const fields = job.reportDocument ?? {};
  return renderLetter(template, { date: fmtDate(now, business.timezone ?? "America/New_York"), "customer.name": job.clientName,
    attention: fields.attention, billTo: job.address, serviceAt: job.address, workOrder: job.jobId, poNumber: fields.poNumber,
    description: job.title, locations: fields.locations ?? job.address, approvalDate: fields.approvalDate,
    "business.name": business.businessName, "business.license": business.licenseNumber, "signer.name": template.signer?.name, "signer.title": template.signer?.title,
  }, { includeOptional: template.sections.filter(s => s.defaultOn).map(s => s.id) });
}
