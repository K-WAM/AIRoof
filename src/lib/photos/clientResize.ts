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

// ── Logos (Phase 12, Phase 4 remainder) ─────────────────────────────────────
// A separate function, not a processPhoto option, because the two must never
// share a code path: photos always flatten to JPEG (fine — a job-site photo
// has no transparency to lose), a logo must NEVER be flattened to JPEG (the
// #1 way logo upload goes wrong is baking a white box behind a transparent
// mark) and an SVG must never touch a canvas at all (rasterizing a vector logo
// throws away the entire reason to have uploaded one).
import { MAX_LOGO_B64_BYTES } from "@/lib/branding/logo";

const MAX_LOGO_EDGE = 600;

function fileToB64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

export interface ProcessedLogo {
  b64: string;
  mimeType: "image/png" | "image/jpeg" | "image/svg+xml" | "image/webp";
  w?: number;
  h?: number;
}

export async function processLogo(file: File): Promise<ProcessedLogo> {
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    const b64 = await fileToB64(file);
    if (b64.length > MAX_LOGO_B64_BYTES) {
      throw new Error("That SVG is too large. Try simplifying it or exporting a smaller version.");
    }
    return { b64, mimeType: "image/svg+xml" };
  }

  const img = await loadImage(file);
  const { b64, w, h } = drawScaledPng(img, MAX_LOGO_EDGE);
  if (b64.length > MAX_LOGO_B64_BYTES) {
    throw new Error("This logo is too large. Try a smaller image or a simpler PNG.");
  }
  return { b64, mimeType: "image/png", w, h };
}

function drawScaledPng(img: HTMLImageElement, maxEdge: number): { b64: string; w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  // PNG, always — never JPEG. Preserves alpha; a transparent logo flattened to
  // JPEG bakes in an opaque box behind the mark, which is the single most
  // common way this exact feature goes wrong.
  return { b64: canvas.toDataURL("image/png").split(",")[1] ?? "", w, h };
}
