import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SAMPLE_CAPABLE_COLLECTIONS, type SampleCapableCollection } from "@/types/provenance";

// Sample data (T-372): records Luxor made up to show a screen working are marked provenance.origin "luxor-sample"
// (src/types/provenance.ts). This module counts them per collection, plans their removal (dry run) and removes them.
// It never touches a record that is not marked luxor-sample. Staff whose crew was a guess keep the person and lose
// only the guess (crewId, crewProvenance, crewLead).

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
}

async function sampleIds(db: Firestore, businessId: string, collection: string, field: string): Promise<string[]> {
  const snap = await db.collection(col(businessId, collection)).where(field, "==", "luxor-sample").get();
  return snap.docs.map((doc) => doc.id);
}

async function planFull(db: Firestore, businessId: string) {
  const perCollection = await Promise.all(SAMPLE_CAPABLE_COLLECTIONS.map(async (collection) => ({
    collection, ids: await sampleIds(db, businessId, collection, "provenance.origin"),
  })));
  const staffSamples = new Set(perCollection.find((entry) => entry.collection === "staff")?.ids ?? []);
  const crewGuesses = (await sampleIds(db, businessId, "staff", "crewProvenance.origin")).filter((id) => !staffSamples.has(id));
  return { perCollection, crewGuesses };
}

export async function planSampleRemoval(db: Firestore, businessId: string): Promise<SampleRemovalPlan> {
  const { perCollection, crewGuesses } = await planFull(db, businessId);
  return {
    collections: perCollection.map(({ collection, ids }) => ({
      collection, count: ids.length, ids: ids.slice(0, PLAN_ID_CAP), idsTruncated: ids.length > PLAN_ID_CAP,
    })),
    staffCrewClears: { count: crewGuesses.length, ids: crewGuesses.slice(0, PLAN_ID_CAP), idsTruncated: crewGuesses.length > PLAN_ID_CAP },
  };
}

export interface SampleRemovalResult {
  removed: Partial<Record<SampleCapableCollection, number>>;
  staffCrewCleared: number;
}

/** Deletes the luxor-sample documents (jobs with their subcollections) and clears guessed crews on staff. */
export async function applySampleRemoval(db: Firestore, businessId: string): Promise<SampleRemovalResult> {
  const { perCollection, crewGuesses } = await planFull(db, businessId);
  const removed: SampleRemovalResult["removed"] = {};

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
  return { removed, staffCrewCleared: crewGuesses.length };
}
