import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import type { Crew } from "@/types/library";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#65a30d"];

// GET /api/company/crews?businessId=xxx
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection(`businesses/${businessId}/crews`).orderBy("createdAt", "asc").get();
  const crews = snap.docs.map((d) => ({ crewId: d.id, ...d.data() })) as Crew[];
  return NextResponse.json({ crews });
}

// POST /api/company/crews  body: { businessId, name, email?, phone?, color? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { businessId, name, email, phone, color } = body;
  if (!businessId || !name?.trim()) return NextResponse.json({ error: "businessId and name required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const existing = await db.collection(`businesses/${businessId}/crews`).count().get();
  const crewId = `crew_${Date.now()}`;
  const crew: Crew = {
    crewId,
    name: name.trim(),
    email: email?.trim() || undefined,
    phone: phone?.trim() || undefined,
    color: color || COLORS[existing.data().count % COLORS.length],
    active: true,
    createdAt: Date.now(),
  };
  await db.collection(`businesses/${businessId}/crews`).doc(crewId).set(crew);
  return NextResponse.json({ ok: true, crew }, { status: 201 });
}

// PATCH /api/company/crews  body: { businessId, crewId, ...fields }
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { businessId, crewId, ...fields } = body;
  if (!businessId || !crewId) return NextResponse.json({ error: "businessId and crewId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  delete fields.crewId;
  await db.collection(`businesses/${businessId}/crews`).doc(crewId).update(fields);
  return NextResponse.json({ ok: true });
}

// DELETE /api/company/crews?businessId=xxx&crewId=yyy
export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const crewId = req.nextUrl.searchParams.get("crewId");
  if (!businessId || !crewId) return NextResponse.json({ error: "businessId and crewId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  await db.collection(`businesses/${businessId}/crews`).doc(crewId).delete();
  return NextResponse.json({ ok: true });
}
