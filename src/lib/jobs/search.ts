// Pure, unit-tested client-side filter for the Jobs list search box. Same
// "forgiving, punctuation/case-insensitive substring, no network round trip"
// approach as src/lib/customers/search.ts's matchesQuery() — a query like
// "1004" must match a job whose id is "J-1004" without the searcher having to
// type the dash or the leading letter.
import type { Job } from "@/types/jobs";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Client-side instant filter — matches a query against a job's id/title/client/address/service type. */
export function matchesJobSearch(job: Job, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  const haystack = normalize(
    [job.jobId, job.title, job.clientName, job.address, job.serviceType].filter(Boolean).join(" ")
  );
  if (haystack.includes(q)) return true;

  // A query with 3+ digits also matches on phone number, ignoring formatting.
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3 && (job.clientPhone ?? "").replace(/\D/g, "").includes(digits)) return true;

  return false;
}
