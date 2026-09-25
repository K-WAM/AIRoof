// Photo storage abstraction.
//
// Default driver = base64 in Firestore (free Spark plan, no Firebase Storage / Blaze required).
// Photos are split across two subcollections so list views stay ultra-light:
//   businesses/{id}/jobs/{jobId}/photos/{photoId}      → meta + ~240px thumbnail (loaded in grids)
//   businesses/{id}/jobs/{jobId}/photoBlobs/{photoId}  → full ~1280px image (loaded only on demand)
//
// To move to Firebase Storage later (once a client justifies Blaze), implement the same four
// functions against Storage and store a URL on the meta instead of thumbB64/fullB64.

import type { JobPhotoMeta, PhotoPhase } from "@/types/jobs";

// Raised 10 → 24 (Phase 12, Phase 3) — exported so the UI can show "18 of 24". Paired with
// tightening processPhoto's typical output size (see clientResize.ts) so the free Spark plan's
// 1GiB total doesn't collapse the effective per-tenant job count: 24 × 900KB (the old typical
// size) would cap a whole business at ~46 maxed-out jobs, but 24 × ~400KB (the new target) keeps
// that closer to ~100. MAX_FULL_BYTES stays the hard reject either way.
export const MAX_PHOTOS_PER_JOB = 24;
export const MAX_FULL_BYTES = 900_000;          // ~900 KB base64 cap (forgiving); under Firestore's 1 MiB doc limit

function deriveOrientation(w?: number, h?: number): "portrait" | "landscape" | "square" | undefined {
  if (!w || !h) return undefined;
  if (w === h) return "square";
  return w > h ? "landscape" : "portrait";
}

type DB = FirebaseFirestore.Firestore;

function photosCol(db: DB, businessId: string, jobId: string) {
  return db.collection(`businesses/${businessId}/jobs/${jobId}/photos`);
}
function blobsCol(db: DB, businessId: string, jobId: string) {
  return db.collection(`businesses/${businessId}/jobs/${jobId}/photoBlobs`);
}

export async function listPhotoMetas(db: DB, businessId: string, jobId: string): Promise<JobPhotoMeta[]> {
  const snap = await photosCol(db, businessId, jobId).orderBy("createdAt", "asc").get();
  const metas = snap.docs.map((d) => ({ photoId: d.id, ...d.data() })) as JobPhotoMeta[];
  // `sort` is sparse (only a drag-reorder ever writes it) — fall back to upload order.
  return metas.sort((a, b) => (a.sort ?? a.createdAt) - (b.sort ?? b.createdAt));
}

export async function getPhotoBlob(db: DB, businessId: string, jobId: string, photoId: string): Promise<string | null> {
  const doc = await blobsCol(db, businessId, jobId).doc(photoId).get();
  return doc.exists ? ((doc.data()?.fullB64 as string) ?? null) : null;
}

/** Batched full-res fetch — kills the N+1 of fetching each report/lightbox photo one at a time. */
export async function getPhotoBlobs(
  db: DB,
  businessId: string,
  jobId: string,
  photoIds: string[],
): Promise<Record<string, string>> {
  if (photoIds.length === 0) return {};
  const col = blobsCol(db, businessId, jobId);
  const docs = await db.getAll(...photoIds.map((id) => col.doc(id)));
  const out: Record<string, string> = {};
  for (const doc of docs) {
    const fullB64 = doc.data()?.fullB64;
    if (doc.exists && typeof fullB64 === "string") out[doc.id] = fullB64;
  }
  return out;
}

/** Best-effort: lets the office job page notice a new/removed photo with its one-document poll (see the job page). */
async function touchJob(db: DB, businessId: string, jobId: string): Promise<void> {
  try {
    await db.collection(`businesses/${businessId}/jobs`).doc(jobId).update({ updatedAt: Date.now() });
  } catch {
    /* the photo itself is saved; a failed touch only delays the office view until its next full load */
  }
}

export async function putPhoto(
  db: DB,
  businessId: string,
  jobId: string,
  input: { label: string; thumbB64: string; fullB64: string; uploadedBy?: string; w?: number; h?: number; phase?: PhotoPhase }
): Promise<{ photoId: string } | { error: string }> {
  const existing = await photosCol(db, businessId, jobId).count().get();
  if (existing.data().count >= MAX_PHOTOS_PER_JOB) {
    return { error: `Limit reached — max ${MAX_PHOTOS_PER_JOB} photos per job.` };
  }
  if (input.fullB64.length > MAX_FULL_BYTES) {
    return { error: "Photo is too large even after compression. Try a smaller shot." };
  }
  if (!input.label?.trim()) return { error: "A description is required." };

  const photoId = `ph_${Date.now()}`;
  const meta: JobPhotoMeta = {
    photoId,
    label: input.label.trim(),
    uploadedBy: input.uploadedBy,
    createdAt: Date.now(),
    includeInReport: false,
    thumbB64: input.thumbB64,
    w: input.w,
    h: input.h,
    ...(input.phase ? { phase: input.phase } : {}),
    ...(deriveOrientation(input.w, input.h) ? { orientation: deriveOrientation(input.w, input.h) } : {}),
  };
  await photosCol(db, businessId, jobId).doc(photoId).set(meta);
  await blobsCol(db, businessId, jobId).doc(photoId).set({ fullB64: input.fullB64 });
  await touchJob(db, businessId, jobId);
  return { photoId };
}

export async function deletePhoto(db: DB, businessId: string, jobId: string, photoId: string): Promise<void> {
  await Promise.all([
    photosCol(db, businessId, jobId).doc(photoId).delete(),
    blobsCol(db, businessId, jobId).doc(photoId).delete(),
  ]);
  await touchJob(db, businessId, jobId);
}

export async function setIncludeInReport(db: DB, businessId: string, jobId: string, photoId: string, include: boolean): Promise<void> {
  await photosCol(db, businessId, jobId).doc(photoId).update({ includeInReport: include });
}

/** Patch a photo's editable meta fields (label/phase/sort) — the crew-editable subset that
 *  doesn't require staff/owner (see the PATCH route's permission split). */
export async function updatePhotoMeta(
  db: DB,
  businessId: string,
  jobId: string,
  photoId: string,
  patch: Partial<Pick<JobPhotoMeta, "label" | "phase" | "sort">>,
): Promise<void> {
  const clean: Record<string, unknown> = {};
  if (patch.label !== undefined) clean.label = patch.label.trim();
  if (patch.phase !== undefined) clean.phase = patch.phase;
  if (patch.sort !== undefined) clean.sort = patch.sort;
  if (Object.keys(clean).length === 0) return;
  await photosCol(db, businessId, jobId).doc(photoId).update(clean);
}
