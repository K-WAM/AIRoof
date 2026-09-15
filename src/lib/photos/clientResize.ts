// Browser-only image compression. Produces a tiny thumbnail (for grids) and a
// capped full-resolution image (for lightbox + report). Keeps uploads fast and
// within the free-tier Firestore doc limit. No `data:` prefix on the returned strings.

import { MAX_FULL_BYTES } from "./store";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxEdge: number, quality: number): { b64: string; w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { b64: dataUrl.split(",")[1] ?? "", w, h };
}

export interface ProcessedPhoto {
  thumbB64: string;
  fullB64: string;
  w: number;
  h: number;
}

/**
 * Returns { thumb, full } base64. The full image is re-compressed at lower quality
 * if it exceeds the cap; if it still can't fit, throws a friendly error.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const img = await loadImage(file);

  const thumb = drawScaled(img, 240, 0.6);

  // Try progressively lower quality / size until under the cap. Phase 12/Phase 3 retuned this
  // ladder to TARGET ~400KB typical output (was ~900KB) so raising MAX_PHOTOS_PER_JOB 10 → 24
  // doesn't blow through the free Spark plan's 1GiB total as fast: shrink the edge length first
  // (1024 → 800) at a fixed quality before falling back to lowering quality too. MAX_FULL_BYTES
  // (900_000) is unchanged as the hard reject.
  const attempts: Array<[number, number]> = [[1024, 0.72], [800, 0.72], [800, 0.55], [640, 0.45]];
  let full = drawScaled(img, attempts[0][0], attempts[0][1]);
  for (const [edge, q] of attempts) {
    full = drawScaled(img, edge, q);
    if (full.b64.length <= MAX_FULL_BYTES) break;
  }
  if (full.b64.length > MAX_FULL_BYTES) {
    throw new Error("This photo is too large. Try a smaller or less detailed shot.");
  }

  return { thumbB64: thumb.b64, fullB64: full.b64, w: full.w, h: full.h };
}
