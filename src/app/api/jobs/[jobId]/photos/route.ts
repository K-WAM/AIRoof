import { NextRequest, NextResponse } from "next/server";
import { resolveAuthor } from "@/lib/jobs/fieldInput";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyFieldAccess } from "@/lib/auth/verifyRole";
import { listPhotoMetas, putPhoto } from "@/lib/photos/store";

// GET /api/jobs/[jobId]/photos?businessId=xxx  → thumbnail metas only (light)
export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const photos = await listPhotoMetas(db, businessId, jobId);
  return NextResponse.json({ photos });
}

const VALID_PHASES = new Set(["before", "after", "other"]);

// POST /api/jobs/[jobId]/photos  — upload a photo (businessId-scoped, public field workers OK)
// body: { businessId, label, thumbB64, fullB64, uploadedBy?, w?, h?, phase? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const { businessId, label, thumbB64, fullB64, uploadedBy, w, h, phase } = body;

  if (!businessId || !thumbB64 || !fullB64) {
    return NextResponse.json({ error: "businessId, thumbB64, fullB64 required" }, { status: 400 });
  }
  if (!label?.trim()) return NextResponse.json({ error: "A description is required." }, { status: 400 });

  const gate = await verifyFieldAccess(req, businessId, { write: true });
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  // Who took it comes from the login (or the name typed on a field-QR link), never from the request body alone.
  const author = resolveAuthor(gate.user, uploadedBy);
  if ("error" in author) return NextResponse.json({ error: author.error }, { status: 400 });
  const result = await putPhoto(db, businessId, jobId, {
    label, thumbB64, fullB64, uploadedBy: author.name, w, h,
    phase: VALID_PHASES.has(phase) ? phase : undefined,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, photoId: result.photoId }, { status: 201 });
}
