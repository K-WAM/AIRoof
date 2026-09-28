import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { invalidateCachedMember } from "@/lib/auth/memberCache";
import { CREW_MEMBER_ROLES, type TeamRole } from "@/types/team";
import type { Crew, CrewPerson } from "@/types/library";

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#dc2626", "#65a30d"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Finished work keeps its crew as history; everything else goes back to Unscheduled when its crew is removed. */
const FINISHED_JOB_STATUSES = new Set(["complete", "invoiced"]);

// GET /api/company/crews?businessId=xxx[&people=1]
// `people=1` adds the business's active team members who can be on a crew (owner/staff/crew — never a viewer),
// with the crew each one is on: the Library shows members per crew and the Calendar shows a member count.
// Names and titles only, never emails.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  // Was unauthenticated (only POST/PATCH/DELETE were gated) — crew names/emails/phones are
  // tenant data, not public; anyone who knew or guessed a businessId could read the roster.
  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const withPeople = req.nextUrl.searchParams.get("people") === "1";
  const [snap, peopleSnap] = await Promise.all([
    db.collection(`businesses/${businessId}/crews`).orderBy("createdAt", "asc").get(),
    withPeople ? db.collection("businessUsers").where("businessId", "==", businessId).get() : null,
  ]);
  const crews = snap.docs.map((d) => ({ crewId: d.id, ...d.data() })) as Crew[];
  if (!peopleSnap) return NextResponse.json({ crews });

  const people: CrewPerson[] = peopleSnap.docs.flatMap((d) => {
    const data = d.data();
    const role = data.role as TeamRole | undefined;
    if (data.active === false || !role || !CREW_MEMBER_ROLES.has(role)) return [];
    const email = typeof data.email === "string" ? data.email : "";
    return [{
      uid: d.id,
      name: typeof data.displayName === "string" && data.displayName.trim() ? data.displayName.trim() : email.split("@")[0] || "Teammate",
      role: role as CrewPerson["role"],
      ...(typeof data.trade === "string" ? { trade: data.trade } : {}),
      ...(typeof data.crewId === "string" ? { crewId: data.crewId } : {}),
    }];
  });
  return NextResponse.json({ crews, people });
}

// POST /api/company/crews  body: { businessId, name, email?, phone?, color? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, name, email, phone, color } = body;
  if (!businessId || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "businessId and name required" }, { status: 400 });
  }
  if (color !== undefined && (typeof color !== "string" || !HEX_COLOR.test(color))) {
    return NextResponse.json({ error: "color must be a hex color like #16a34a" }, { status: 400 });
  }

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const existing = await db.collection(`businesses/${businessId}/crews`).count().get();
  const crewId = `crew_${Date.now()}`;
  const crew: Crew = {
    crewId,
    name: name.trim(),
    email: typeof email === "string" ? email.trim() || undefined : undefined,
    phone: typeof phone === "string" ? phone.trim() || undefined : undefined,
    color: color || COLORS[existing.data().count % COLORS.length],
    active: true,
    createdAt: Date.now(),
  };
  await db.collection(`businesses/${businessId}/crews`).doc(crewId).set(crew);
  return NextResponse.json({ ok: true, crew }, { status: 201 });
}

type CrewPatch = { name?: string; email?: string; phone?: string; color?: string; active?: boolean };

/** Only these fields are editable — the body used to be written verbatim (createdAt, crewId, anything). */
function parseCrewPatch(body: Record<string, unknown>): { patch: CrewPatch; clear: Array<"email" | "phone"> } | { error: string } {
  const patch: CrewPatch = {};
  const clear: Array<"email" | "phone"> = [];
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return { error: "A crew needs a name" };
    patch.name = body.name.trim();
  }
  for (const key of ["email", "phone"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && typeof body[key] !== "string") return { error: `${key} must be text` };
    const value = typeof body[key] === "string" ? (body[key] as string).trim() : "";
    if (value) patch[key] = value;
    else clear.push(key);
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !HEX_COLOR.test(body.color)) return { error: "color must be a hex color like #16a34a" };
    patch.color = body.color;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return { error: "active must be true or false" };
    patch.active = body.active;
  }
  if (Object.keys(patch).length === 0 && clear.length === 0) return { error: "Nothing to update" };
  return { patch, clear };
}

// PATCH /api/company/crews  body: { businessId, crewId, name?, email?, phone?, color?, active? }
// Deactivating (active: false) keeps the crew and its history; its jobs show in the Calendar's Unscheduled list
// until moved, and the phone AI's same-time capacity (active crews) drops by one.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, crewId } = body as { businessId?: string; crewId?: string };
  if (!businessId || !crewId) return NextResponse.json({ error: "businessId and crewId required" }, { status: 400 });
  const parsed = parseCrewPatch(body as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const ref = db.collection(`businesses/${businessId}/crews`).doc(crewId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  await ref.update({
    ...parsed.patch,
    ...Object.fromEntries(parsed.clear.map((key) => [key, FieldValue.delete()])),
  });
  const updated = { ...(snap.data() as Crew), ...parsed.patch, crewId };
  for (const key of parsed.clear) delete updated[key];
  return NextResponse.json({ ok: true, crew: updated });
}

// DELETE /api/company/crews?businessId=xxx&crewId=yyy
// Removing a crew used to leave its jobs pointing at a crew that no longer existed — on neither a Calendar row nor
// the Unscheduled list, so they vanished. Now, in the same request: its unfinished jobs go back to Unscheduled, its
// assigned bookings go back to Unassigned, and its members come off it. Finished jobs keep the crew id as history.
// Old `crew:<id>` scheduling locks are left behind on purpose: nothing can be assigned to a deleted crew again, so
// no check ever reads them.
export async function DELETE(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  const crewId = req.nextUrl.searchParams.get("crewId");
  if (!businessId || !crewId) return NextResponse.json({ error: "businessId and crewId required" }, { status: 400 });

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const crewRef = businessRef.collection("crews").doc(crewId);
  const [crewSnap, jobsSnap, apptsSnap, membersSnap] = await Promise.all([
    crewRef.get(),
    businessRef.collection("jobs").where("assignedCrewId", "==", crewId).get(),
    businessRef.collection("appointments").where("assignedCrewId", "==", crewId).get(),
    db.collection("businessUsers").where("businessId", "==", businessId).where("crewId", "==", crewId).get(),
  ]);
  if (!crewSnap.exists) return NextResponse.json({ error: "Crew not found" }, { status: 404 });

  const now = Date.now();
  const writes: Array<(batch: WriteBatch) => void> = [];
  let unscheduledJobs = 0;
  for (const doc of jobsSnap.docs) {
    if (FINISHED_JOB_STATUSES.has(String(doc.data().status))) continue;
    unscheduledJobs += 1;
    writes.push((batch) => batch.update(doc.ref, {
      assignedCrewId: null, scheduledStart: null, scheduledEnd: null, crewConfirmed: false, updatedAt: now,
    }));
  }
  let unassignedBookings = 0;
  for (const doc of apptsSnap.docs) {
    if (doc.data().status === "cancelled") continue;
    unassignedBookings += 1;
    writes.push((batch) => batch.update(doc.ref, { assignedCrewId: FieldValue.delete(), updatedAt: now }));
  }
  for (const doc of membersSnap.docs) {
    writes.push((batch) => batch.update(doc.ref, { crewId: FieldValue.delete(), updatedAt: now }));
  }
  writes.push((batch) => batch.delete(crewRef));

  // Firestore batches cap at 500 writes; the crew delete is last, so a failure part-way never strands jobs.
  for (let index = 0; index < writes.length; index += 450) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + 450)) write(batch);
    await batch.commit();
  }
  for (const doc of membersSnap.docs) invalidateCachedMember(doc.id);

  return NextResponse.json({ ok: true, unscheduledJobs, unassignedBookings, membersCleared: membersSnap.size });
}
