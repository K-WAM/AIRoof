import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole, verifyFieldAccess } from "@/lib/auth/verifyRole";
import { getPhotoBlob, deletePhoto, listPhotoMetas, setIncludeInReport, updatePhotoMeta } from "@/lib/photos/store";

const VALID_PHASES = new Set(["before", "after", "other"]);

// GET .../photos/[photoId]?businessId=xxx  → full-resolution base64 (lazy, on demand)
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const fullB64 = await getPhotoBlob(db, businessId, jobId, photoId);
  if (!fullB64) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.json({ fullB64 });
}

// PATCH .../photos/[photoId]  body: { businessId, includeInReport? } and/or { label?, phase?, sort? }
// Split by field, not by route: the crew who took a photo must be able to fix its own label/phase
// (verifyFieldAccess covers a QR crew member too), but only staff/owner can decide what goes on a
// customer-facing report (includeInReport).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const { businessId, includeInReport, label, phase, pairId, sort } = await req.json();
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  if (includeInReport !== undefined) {
    const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
    if ("error" in gate) return gate.error;
    await setIncludeInReport(db, businessId, jobId, photoId, !!includeInReport);
  }

  if (label !== undefined || phase !== undefined || pairId !== undefined || sort !== undefined) {
    const gate = await verifyFieldAccess(req, businessId, { write: true });
    if ("error" in gate) return gate.error;
    if (phase !== undefined && !VALID_PHASES.has(phase)) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }
    if (sort !== undefined && (typeof sort !== "number" || !Number.isFinite(sort))) {
      return NextResponse.json({ error: "sort must be a finite number" }, { status: 400 });
    }
    if (pairId !== undefined) {
      if (pairId !== null && (typeof pairId !== "string" || !pairId.trim())) {
        return NextResponse.json({ error: "pairId must be a photo id or null" }, { status: 400 });
      }
      const photos = await listPhotoMetas(db, businessId, jobId);
      const photo = photos.find((item) => item.photoId === photoId);
      if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
      if (pairId !== null) {
        const pairedBefore = photos.find((item) => item.photoId === pairId);
        if (!pairedBefore || pairId === photoId || (phase ?? photo.phase ?? "other") !== "after" || pairedBefore.phase !== "before") {
          return NextResponse.json({ error: "An After photo can only pair with a Before photo from this job" }, { status: 400 });
        }
      }
    }
    await updatePhotoMeta(db, businessId, jobId, photoId, {
      ...(label !== undefined ? { label } : {}),
      ...(phase !== undefined ? { phase } : {}),
      ...(pairId !== undefined ? { pairId } : {}),
      ...(sort !== undefined ? { sort } : {}),
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE .../photos/[photoId]?businessId=xxx — staff only
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  await deletePhoto(db, businessId, jobId, photoId);
  return NextResponse.json({ ok: true });
}
