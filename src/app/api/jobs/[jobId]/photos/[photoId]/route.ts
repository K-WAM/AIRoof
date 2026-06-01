import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getPhotoBlob, deletePhoto, setIncludeInReport } from "@/lib/photos/store";

// GET .../photos/[photoId]?businessId=xxx  → full-resolution base64 (lazy, on demand)
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const fullB64 = await getPhotoBlob(db, businessId, jobId, photoId);
  if (!fullB64) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  return NextResponse.json({ fullB64 });
}

// PATCH .../photos/[photoId]  body: { businessId, includeInReport }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const { businessId, includeInReport } = await req.json();
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  await setIncludeInReport(db, businessId, jobId, photoId, !!includeInReport);
  return NextResponse.json({ ok: true });
}

// DELETE .../photos/[photoId]?businessId=xxx
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ jobId: string; photoId: string }> }) {
  const { jobId, photoId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  await deletePhoto(db, businessId, jobId, photoId);
  return NextResponse.json({ ok: true });
}
