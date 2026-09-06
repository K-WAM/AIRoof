import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { TEAM_ROLES, type TeamRole } from "@/types/team";

// PATCH /api/company/team/[uid]  body: { businessId, role?, active? }
// Changes a teammate's role and/or activates/deactivates their access.
// Owner/superadmin only. Always keeps at least one active owner on the
// business — nothing else guarded against locking every future login out.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;
  const body = await req.json().catch(() => ({}));
  const { businessId, role, active } = body as { businessId?: string; role?: string; active?: boolean };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (role !== undefined && !TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: `Role must be one of: ${TEAM_ROLES.join(", ")}` }, { status: 400 });
  }
  if (role === undefined && active === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const memberRef = db.collection("businessUsers").doc(uid);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists || memberSnap.data()?.businessId !== businessId) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
  const current = memberSnap.data() as { role: TeamRole; active?: boolean };
  const wasActiveOwner = current.role === "owner" && current.active !== false;
  const nextRole = (role as TeamRole | undefined) ?? current.role;
  const nextActive = active ?? current.active !== false;
  const losesOwnerAccess = wasActiveOwner && (nextRole !== "owner" || !nextActive);

  if (losesOwnerAccess) {
    const ownersSnap = await db
      .collection("businessUsers")
      .where("businessId", "==", businessId)
      .where("role", "==", "owner")
      .where("active", "==", true)
      .get();
    if (ownersSnap.size <= 1) {
      return NextResponse.json(
        { error: "Every business needs at least one active owner — promote another teammate first." },
        { status: 400 }
      );
    }
  }

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (role !== undefined) update.role = role;
  if (active !== undefined) update.active = active;
  await memberRef.update(update);

  return NextResponse.json({ ok: true });
}
