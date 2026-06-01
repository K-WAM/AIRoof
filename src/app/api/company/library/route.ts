import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { LibraryPricing } from "@/types/library";

const EMPTY: LibraryPricing = { materials: [], laborRates: [], documents: [] };

// GET /api/company/library?businessId=xxx
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection(`businesses/${businessId}/library`).doc("pricing").get();
  const library = snap.exists ? (snap.data() as LibraryPricing) : EMPTY;
  return NextResponse.json({ library });
}

// PUT /api/company/library  body: { businessId, materials?, laborRates?, defaultTaxRate?, documents? }
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { businessId, materials, laborRates, defaultTaxRate, documents } = body;
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (materials !== undefined) update.materials = materials;
  if (laborRates !== undefined) update.laborRates = laborRates;
  if (defaultTaxRate !== undefined) update.defaultTaxRate = defaultTaxRate;
  if (documents !== undefined) update.documents = documents;

  await db.collection(`businesses/${businessId}/library`).doc("pricing").set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
