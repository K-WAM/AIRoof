import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { listPhotoMetas, MAX_PHOTOS_PER_JOB } from "@/lib/photos/store";

// PATCH /api/jobs/[jobId]/photos/order body: { businessId, order: string[] }
// Office-only: field QR grants can edit individual photo labels but must never reorder the
// customer-facing documentation set.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const { businessId, order } = await req.json();
  if (!businessId || !Array.isArray(order) || order.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "businessId and order are required" }, { status: 400 });
  }
  if (order.length > MAX_PHOTOS_PER_JOB || new Set(order).size !== order.length) {
    return NextResponse.json({ error: `order must contain at most ${MAX_PHOTOS_PER_JOB} unique photo ids` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const photos = await listPhotoMetas(db, businessId, jobId);
  const ownPhotoIds = new Set(photos.map((photo) => photo.photoId));
  if (order.some((id) => !ownPhotoIds.has(id))) {
    return NextResponse.json({ error: "Every photo in order must belong to this job" }, { status: 400 });
  }

  const batch = db.batch();
  const photosPath = db.collection(`businesses/${businessId}/jobs/${jobId}/photos`);
  order.forEach((photoId, index) => batch.update(photosPath.doc(photoId), { sort: index * 1000 }));
  await batch.commit();
  return NextResponse.json({ ok: true });
}
