import { getPhotoBlobs, listPhotoMetas } from "@/lib/photos/store";
import type { JobPhotoMeta } from "@/types/jobs";

export const MAX_DOCUMENT_PHOTOS = 16;

export type LoadedDocumentPhoto = JobPhotoMeta & { fullB64: string };
export type DocumentPhotoResult = { photos: LoadedDocumentPhoto[] } | { error: string };

/**
 * Resolves a document selection only inside the supplied tenant/job path. Both the metadata and
 * full blob must still exist; a stale or foreign id is a client error, never silently omitted.
 */
export async function loadDocumentPhotos(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  jobId: string,
  photoIds: unknown,
  knownMetas?: JobPhotoMeta[],
): Promise<DocumentPhotoResult> {
  if (!Array.isArray(photoIds) || photoIds.some((id) => typeof id !== "string" || !id.trim())) {
    return { error: "Selected photo ids must be non-empty strings." };
  }
  if (photoIds.length > MAX_DOCUMENT_PHOTOS) {
    return { error: `A document can include at most ${MAX_DOCUMENT_PHOTOS} photos. Remove photos and try again.` };
  }
  if (new Set(photoIds).size !== photoIds.length) {
    return { error: "Selected photos must be unique." };
  }

  const metas = knownMetas ?? await listPhotoMetas(db, businessId, jobId);
  const byId = new Map(metas.map((photo) => [photo.photoId, photo]));
  if (photoIds.some((id) => !byId.has(id))) {
    return { error: "Selected photos must belong to this job and still exist." };
  }

  const blobs = await getPhotoBlobs(db, businessId, jobId, photoIds);
  if (photoIds.some((id) => !blobs[id])) {
    return { error: "One or more selected photos no longer exist." };
  }
  return { photos: photoIds.map((id) => ({ ...byId.get(id)!, fullB64: blobs[id] })) };
}
