import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";

const limits = { name: 120, phone: 40, email: 254, address: 500, accessNotes: 2000 } as const;
type Field = keyof typeof limits;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ businessId: string; leadId: string }> }) {
  const { businessId, leadId } = await params;
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff"]);
  if ("error" in gate) return gate.error;
  if (gate.user.businessId !== businessId || !["owner", "staff"].includes(gate.user.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid details" }, { status: 400 });
  const values = body as Record<string, unknown>;
  if (Object.keys(values).some((key) => !Object.prototype.hasOwnProperty.call(limits, key))) return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  for (const [key, max] of Object.entries(limits)) {
    if (typeof values[key] !== "string" || (values[key] as string).length > max) return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
  }
  const clean = Object.fromEntries((Object.keys(limits) as Field[]).map((key) => [key, (values[key] as string).trim()])) as Record<Field, string>;
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  const digits = clean.phone.replace(/\D/g, "");
  if (clean.phone && (!/^[+()\d .-]+$/.test(clean.phone) || digits.length < 7 || digits.length > 15)) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const ref = db.collection("businesses").doc(businessId).collection("leads").doc(leadId);
  const found = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const old = snap.data() ?? {};
    const update: Record<string, unknown> = { callerName: clean.name, ...(old.callbackPhone ? { callbackPhone: clean.phone } : { callerPhone: clean.phone }), callerEmail: clean.email, address: clean.address, accessNotes: clean.accessNotes, updatedAt: Date.now(), editedBy: gate.user.uid };
    if (!old.asHeard) update.asHeard = { name: old.callerName ?? "", phone: old.callbackPhone || old.callerPhone || "", email: old.callerEmail ?? "", address: old.address ?? "" };
    tx.update(ref, update);
    return true;
  });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, contact: clean });
}
