// Where a record came from (owner, 2026-11-06): "categorize the data on the back end so that you can identify ...
// whether it's something that you made to fill a gap because we don't have this information, or whether it's
// something that is actual data that we received from them." Never mix the two.
//
// - "client":       came from the client: an export (Jobba CSV), an email, an onboarding form, or typed by their staff.
// - "luxor-sample": made up by Luxor to show a screen working where the client's data is missing. Every such record
//                   is listed and removable in one step: Admin → Clients → Edit → "Sample data"
//                   (GET/DELETE /api/admin/businesses/[businessId]/sample-data).
//
// Screens show a small "Example" tag on luxor-sample records so nobody mistakes them for the client's own data.
// Records written before 2026-11-06 carry no provenance; imported ones say so in their own fields (source: "jobba").

export type DataOrigin = "client" | "luxor-sample";

export interface Provenance {
  origin: DataOrigin;
  /** Where exactly, e.g. "jobba:Company contacts.csv", "jobba:vendors.csv", "onboarding:team", "luxor:demo-fill". */
  source: string;
  /** luxor-sample: what it stands in for and why, e.g. "Crew membership guessed for the demo; confirm in the Team form". */
  note?: string;
  /** ms */
  addedAt: number;
}

/** Tenant subcollections (businesses/{businessId}/<name>) that may hold luxor-sample records. The sample-data API scans
 *  exactly these with where("provenance.origin", "==", "luxor-sample"); add a name here when a new kind of record can
 *  be created as a sample. */
export const SAMPLE_CAPABLE_COLLECTIONS = ["staff", "vendors", "crews", "customers", "jobs", "appointments", "leads"] as const;
export type SampleCapableCollection = (typeof SAMPLE_CAPABLE_COLLECTIONS)[number];

export function isLuxorSample(record: { provenance?: Provenance | null } | null | undefined): boolean {
  return record?.provenance?.origin === "luxor-sample";
}
