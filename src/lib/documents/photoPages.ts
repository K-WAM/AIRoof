import type { JobPhotoMeta } from "@/types/jobs";

export type PhotoPageRow = { before?: JobPhotoMeta; after?: JobPhotoMeta };
export type PhotoPage = { rows: PhotoPageRow[] };

function ordered(photos: JobPhotoMeta[]) {
  return [...photos].sort((a, b) => (a.sort ?? a.createdAt) - (b.sort ?? b.createdAt));
}

/**
 * Builds the one Before | After document contract shared by quote, invoice, and report.
 * Explicit pairId links take precedence; old photos without them keep their existing positional
 * pairing, and anything left over is appended two per row.
 */
export function photoPages(photos: JobPhotoMeta[], { pairsPerPage = 4 }: { pairsPerPage?: number } = {}): PhotoPage[] {
  if (!Number.isInteger(pairsPerPage) || pairsPerPage < 1) throw new Error("pairsPerPage must be a positive integer");
  const all = ordered(photos);
  const before = all.filter((photo) => photo.phase === "before");
  const after = all.filter((photo) => photo.phase === "after");
  const explicitAfterByBefore = new Map<string, JobPhotoMeta>();
  const explicitlyPairedAfterIds = new Set<string>();
  for (const afterPhoto of after) {
    if (!afterPhoto.pairId) continue;
    const target = before.find((beforePhoto) => beforePhoto.photoId === afterPhoto.pairId);
    if (target && !explicitAfterByBefore.has(target.photoId)) {
      explicitAfterByBefore.set(target.photoId, afterPhoto);
      explicitlyPairedAfterIds.add(afterPhoto.photoId);
    }
  }

  const legacyAfter = after.filter((photo) => !photo.pairId);
  let legacyAfterIndex = 0;
  const rows: PhotoPageRow[] = [];
  const unpairedBefore: JobPhotoMeta[] = [];
  for (const beforePhoto of before) {
    const explicitAfter = explicitAfterByBefore.get(beforePhoto.photoId);
    if (explicitAfter) {
      rows.push({ before: beforePhoto, after: explicitAfter });
      continue;
    }
    const positionalAfter = legacyAfter[legacyAfterIndex++];
    if (positionalAfter) rows.push({ before: beforePhoto, after: positionalAfter });
    else unpairedBefore.push(beforePhoto);
  }

  const unpaired = ordered([
    ...unpairedBefore,
    ...legacyAfter.slice(legacyAfterIndex),
    ...after.filter((photo) => photo.pairId && !explicitlyPairedAfterIds.has(photo.photoId)),
    ...all.filter((photo) => !photo.phase || photo.phase === "other"),
  ]);
  for (let index = 0; index < unpaired.length; index += 2) rows.push({ before: unpaired[index], after: unpaired[index + 1] });

  return Array.from({ length: Math.ceil(rows.length / pairsPerPage) }, (_, index) => ({ rows: rows.slice(index * pairsPerPage, (index + 1) * pairsPerPage) }));
}
