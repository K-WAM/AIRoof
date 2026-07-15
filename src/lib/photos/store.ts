// Photo storage abstraction.
//
// Default driver = base64 in Firestore (free Spark plan, no Firebase Storage / Blaze required).
// Photos are split across two subcollections so list views stay ultra-light:
//   businesses/{id}/jobs/{jobId}/photos/{photoId}      → meta + ~240px thumbnail (loaded in grids)
//   businesses/{id}/jobs/{jobId}/photoBlobs/{photoId}  → full ~1280px image (loaded only on demand)
//
// To move to Firebase Storage later (once a client justifies Blaze), implement the same four
// functions against Storage and store a URL on the meta instead of thumbB64/fullB64.

import type { JobPhotoMeta } from "@/types/jobs";

export const MAX_PHOTOS_PER_JOB = 10;          // tunable
export const MAX_FULL_BYTES = 900_000;          // ~900 KB base64 cap (forgiving); under Firestore's 1 MiB doc limit

type DB = FirebaseFirestore.Firestore;

function photosCol(db: DB, businessId: string, jobId: string) {
  return db.collection(`businesses/${businessId}/jobs/${jobId}/photos`);
}
function blobsCol(db: DB, businessId: string, jobId: string) {
  return db.collection(`businesses/${businessId}/jobs/${jobId}/photoBlobs`);
}

export async function listPhotoMetas(db: DB, businessId: string, jobId: string): Promise<JobPhotoMeta[]> {
  const snap = await photosCol(db, businessId, jobId).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ photoId: d.id, ...d.data() })) as JobPhotoMeta[];
}

export async function getPhotoBlob(db: DB, businessId: string, jobId: string, photoId: string): Promise<string | null> {
  const doc = await blobsCol(db, businessId, jobId).doc(photoId).get();
  return doc.exists ? ((doc.data()?.fullB64 as string) ?? null) : null;
}

export async function putPhoto(
  db: DB,
  businessId: string,
  jobId: string,
  input: { label: string; thumbB64: string; fullB64: string; uploadedBy?: string; w?: number; h?: number }
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
  };
  await photosCol(db, businessId, jobId).doc(photoId).set(meta);
  await blobsCol(db, businessId, jobId).doc(photoId).set({ fullB64: input.fullB64 });
  return { photoId };
}

export async function deletePhoto(db: DB, businessId: string, jobId: string, photoId: string): Promise<void> {
  await Promise.all([
    photosCol(db, businessId, jobId).doc(photoId).delete(),
    blobsCol(db, businessId, jobId).doc(photoId).delete(),
  ]);
}

export async function setIncludeInReport(db: DB, businessId: string, jobId: string, photoId: string, include: boolean): Promise<void> {
  await photosCol(db, businessId, jobId).doc(photoId).update({ includeInReport: include });
}
