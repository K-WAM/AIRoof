// Batched full-res photo fetch (Phase 12, Phase 3) — kills the N+1 where the lightbox/report
// previously fired one GET per photo. GET ?ids=ph_1,ph_2,... → { blobs: { [photoId]: fullB64 } }
// via a single db.getAll() round trip.

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { getPhotoBlobs } from "@/lib/photos/store";
import { jsonWithCache } from "@/lib/http/cache";

export const maxDuration = 30;

const MAX_IDS = 12;

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  const idsParam = req.nextUrl.searchParams.get("ids");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!idsParam) return NextResponse.json({ error: "ids required" }, { status: 400 });

  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Too many ids — max ${MAX_IDS} per request` }, { status: 400 });
  }

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const blobs = await getPhotoBlobs(db, businessId, jobId, ids);
  // Blob docs are immutable after write (label/phase/sort live on the meta doc, never the blob),
  // so the "immutable" tier's aggressive private caching is unambiguously correct here.
  return jsonWithCache({ blobs }, "immutable");
}
