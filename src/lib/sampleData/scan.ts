import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SAMPLE_CAPABLE_COLLECTIONS, type SampleCapableCollection } from "@/types/provenance";

// Sample data (T-372): records Luxor made up to show a screen working are marked provenance.origin "luxor-sample"
// (src/types/provenance.ts). This module counts them per collection, plans their removal (dry run) and removes them.
// It never touches a record that is not marked luxor-sample. Staff whose crew was a guess keep the person and lose
// only the guess (crewId, crewProvenance, crewLead).
//
// Sample WORK (T-376) can be worked on in a demo: a quote or invoice made on a sample job, a crew time hold from
// scheduling it, a field link sent for it, a time-clock punch on it, the "a job was made from this request" marker.
// Those are found through the sample job / booking / request they belong to and removed with it (findSampleDependents),
// so removing samples never leaves a document pointing at a job that is gone, or a crew hold that blocks real bookings.

const BATCH = 400;
/** The dry run lists at most this many ids per collection; apply always removes all of them. */
export const PLAN_ID_CAP = 200;

const col = (businessId: string, name: string) => `businesses/${businessId}/${name}`;

export interface SampleScanRow {
  collection: SampleCapableCollection;
  client: number;
  sample: number;
  /** Total minus the two above: written before provenance existed, or by code that does not mark it. */
  unmarked: number;
}

export interface SampleScan {
  rows: SampleScanRow[];
  /** Staff whose crew assignment (not the person) is a Luxor guess. */
  staffCrewSamples: number;
}

async function countOf(query: { count: () => { get: () => Promise<{ data: () => { count: number } }> } }): Promise<number> {
  return (await query.count().get()).data().count;
}

export async function scanSampleData(db: Firestore, businessId: string): Promise<SampleScan> {
  const rows = await Promise.all(SAMPLE_CAPABLE_COLLECTIONS.map(async (collection): Promise<SampleScanRow> => {
    const ref = db.collection(col(businessId, collection));
    const [total, client, sample] = await Promise.all([
      countOf(ref),
      countOf(ref.where("provenance.origin", "==", "client")),
      countOf(ref.where("provenance.origin", "==", "luxor-sample")),
    ]);
    return { collection, client, sample, unmarked: Math.max(0, total - client - sample) };
  }));
  const staffCrewSamples = await countOf(db.collection(col(businessId, "staff")).where("crewProvenance.origin", "==", "luxor-sample"));
  return { rows, staffCrewSamples };
}

export interface SampleRemovalPlan {
  collections: Array<{ collection: SampleCapableCollection; count: number; ids: string[]; idsTruncated: boolean }>;
  /** Staff who stay but lose a guessed crew (staff that are themselves samples are deleted instead). */
  staffCrewClears: { count: number; ids: string[]; idsTruncated: boolean };
  /** What was made from sample work during a demo and goes with it (T-376). */
  dependents: SampleDependentCounts;
}

/** Records that belong to a sample job, booking or request (T-376). Ids per tenant collection; field links are global. */
export interface SampleDependents {
  invoices: string[];
  quotes: string[];
  punches: string[];
  schedulingLocks: string[];
  requestJobs: string[];
  /** fieldJobLinkIndex doc ids (businessId__jobId) and fieldJobLinks doc ids. */
  fieldLinkIndex: string[];
  fieldLinks: string[];
}
export type SampleDependentCounts = Record<keyof SampleDependents, number>;

const DEPENDENT_KEYS = ["invoices", "quotes", "punches", "schedulingLocks", "requestJobs", "fieldLinkIndex", "fieldLinks"] as const;

function countsOf(dependents: SampleDependents): SampleDependentCounts {
  return Object.fromEntries(DEPENDENT_KEYS.map((key) => [key, dependents[key].length])) as SampleDependentCounts;
}

/** Every record that points at one of these sample jobs / bookings / requests. Equality queries only (automatic
 *  single-field indexes); sample work is a handful of records, so one query per id is cheap. */
export async function findSampleDependents(
  db: Firestore,
  businessId: string,
  ids: { jobs: string[]; appointments: string[]; leads: string[] },
): Promise<SampleDependents> {
  const biz = db.collection("businesses").doc(businessId);
  const matching = async (collection: string, field: string, values: string[]) => {
    const found = new Set<string>();
    for (const value of values) {
      for (const doc of (await biz.collection(collection).where(field, "==", value).get()).docs) found.add(doc.id);
    }
    return [...found];
  };
  const [invoices, quotes, punches, schedulingLocks, markersByJob] = await Promise.all([
    matching("invoices", "jobId", ids.jobs),
    matching("quotes", "jobId", ids.jobs),
    matching("punches", "jobId", ids.jobs),
    matching("schedulingLocks", "entityId", [...ids.jobs, ...ids.appointments]),
    matching("requestJobs", "jobId", ids.jobs),
  ]);
  const requestJobs = new Set(markersByJob);
  const markerIds = [...ids.appointments.map((id) => `appointment_${id}`), ...ids.leads.map((id) => `lead_${id}`)];
  if (markerIds.length) {
    for (const snap of await db.getAll(...markerIds.map((id) => biz.collection("requestJobs").doc(id)))) if (snap.exists) requestJobs.add(snap.id);
  }
  const fieldLinkIndex: string[] = [];
  const fieldLinks = new Set<string>();
  for (const jobId of ids.jobs) {
    const index = await db.collection("fieldJobLinkIndex").doc(`${businessId}__${jobId}`).get();
    if (index.exists) fieldLinkIndex.push(index.id);
    // Older links for the job (replaced when the field key rotated) still resolve to it: they go too.
    for (const doc of (await db.collection("fieldJobLinks").where("jobId", "==", jobId).get()).docs) {
      if (doc.data().businessId === businessId) fieldLinks.add(doc.id);
    }
  }
  return { invoices, quotes, punches, schedulingLocks, requestJobs: [...requestJobs], fieldLinkIndex, fieldLinks: [...fieldLinks] };
}

async function sampleIds(db: Firestore, businessId: string, collection: string, field: string): Promise<string[]> {
  const snap = await db.collection(col(businessId, collection)).where(field, "==", "luxor-sample").get();
  return snap.docs.map((doc) => doc.id);
}

async function planFull(db: Firestore, businessId: string) {
  const perCollection = await Promise.all(SAMPLE_CAPABLE_COLLECTIONS.map(async (collection) => ({
    collection, ids: await sampleIds(db, businessId, collection, "provenance.origin"),
  })));
  const idsOf = (name: SampleCapableCollection) => perCollection.find((entry) => entry.collection === name)?.ids ?? [];
  const staffSamples = new Set(idsOf("staff"));
  const crewGuesses = (await sampleIds(db, businessId, "staff", "crewProvenance.origin")).filter((id) => !staffSamples.has(id));
  const dependents = await findSampleDependents(db, businessId, { jobs: idsOf("jobs"), appointments: idsOf("appointments"), leads: idsOf("leads") });
  return { perCollection, crewGuesses, dependents };
}

export async function planSampleRemoval(db: Firestore, businessId: string): Promise<SampleRemovalPlan> {
  const { perCollection, crewGuesses, dependents } = await planFull(db, businessId);
  return {
    collections: perCollection.map(({ collection, ids }) => ({
      collection, count: ids.length, ids: ids.slice(0, PLAN_ID_CAP), idsTruncated: ids.length > PLAN_ID_CAP,
    })),
    staffCrewClears: { count: crewGuesses.length, ids: crewGuesses.slice(0, PLAN_ID_CAP), idsTruncated: crewGuesses.length > PLAN_ID_CAP },
    dependents: countsOf(dependents),
  };
}

export interface SampleRemovalResult {
  removed: Partial<Record<SampleCapableCollection, number>>;
  staffCrewCleared: number;
  /** Removed with the sample work they belonged to (T-376). */
  dependentsRemoved: SampleDependentCounts;
}

async function deleteAll(db: Firestore, refs: FirebaseFirestore.DocumentReference[]): Promise<void> {
  for (let start = 0; start < refs.length; start += BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + BATCH)) batch.delete(ref);
    await batch.commit();
  }
}

/** Deletes the luxor-sample documents (jobs with their subcollections), what was made from them, and clears guessed
 *  crews on staff. */
export async function applySampleRemoval(db: Firestore, businessId: string): Promise<SampleRemovalResult> {
  const { perCollection, crewGuesses, dependents } = await planFull(db, businessId);
  const removed: SampleRemovalResult["removed"] = {};

  // Dependents first: if a later step failed, nothing would be left pointing at a job that is already gone.
  const tenant = (name: string) => db.collection(col(businessId, name));
  await deleteAll(db, [
    ...dependents.invoices.map((id) => tenant("invoices").doc(id)),
    ...dependents.quotes.map((id) => tenant("quotes").doc(id)),
    ...dependents.punches.map((id) => tenant("punches").doc(id)),
    ...dependents.schedulingLocks.map((id) => tenant("schedulingLocks").doc(id)),
    ...dependents.requestJobs.map((id) => tenant("requestJobs").doc(id)),
    ...dependents.fieldLinkIndex.map((id) => db.collection("fieldJobLinkIndex").doc(id)),
    ...dependents.fieldLinks.map((id) => db.collection("fieldJobLinks").doc(id)),
  ]);

  for (const { collection, ids } of perCollection) {
    if (ids.length === 0) continue;
    if (collection === "jobs") {
      for (const id of ids) await db.recursiveDelete(db.collection(col(businessId, "jobs")).doc(id));
    } else {
      for (let start = 0; start < ids.length; start += BATCH) {
        const batch = db.batch();
        for (const id of ids.slice(start, start + BATCH)) batch.delete(db.collection(col(businessId, collection)).doc(id));
        await batch.commit();
      }
    }
    removed[collection] = ids.length;
  }

  for (let start = 0; start < crewGuesses.length; start += BATCH) {
    const batch = db.batch();
    for (const id of crewGuesses.slice(start, start + BATCH)) {
      batch.update(db.collection(col(businessId, "staff")).doc(id), {
        crewId: FieldValue.delete(), crewProvenance: FieldValue.delete(), crewLead: FieldValue.delete(), updatedAt: Date.now(),
      });
    }
    await batch.commit();
  }
  return { removed, staffCrewCleared: crewGuesses.length, dependentsRemoved: countsOf(dependents) };
}
