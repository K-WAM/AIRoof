import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { invalidateCachedMember } from "@/lib/auth/memberCache";
import { TEAM_ROLES, TRADE_TITLES, type TeamRole, type TradeTitle } from "@/types/team";

// PATCH /api/company/team/[uid]  body: { businessId, role?, active?, trade?, displayName?, crewId? }
// Changes a teammate's role, title, and/or activates/deactivates their access.
// Owner/superadmin only. Always keeps at least one active owner on the
// business — nothing else guarded against locking every future login out.
// trade/displayName/crewId carry no permissions (see src/types/team.ts) so
// they skip the last-owner guard entirely — only role/active can trip it.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;
  const body = await req.json().catch(() => ({}));
  const { businessId, role, active, trade, displayName, crewId } = body as {
    businessId?: string; role?: string; active?: boolean; trade?: string | null; displayName?: string | null; crewId?: string | null;
  };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (role !== undefined && !TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: `Role must be one of: ${TEAM_ROLES.join(", ")}` }, { status: 400 });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }
  if (trade != null && !TRADE_TITLES.includes(trade as TradeTitle)) {
    return NextResponse.json({ error: `Title must be one of: ${TRADE_TITLES.join(", ")}` }, { status: 400 });
  }
  if (role === undefined && active === undefined && trade === undefined && displayName === undefined && crewId === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const auth = active === undefined ? null : getAdminAuth();
  if (active !== undefined && !auth) return NextResponse.json({ error: "Auth unavailable" }, { status: 503 });

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
  if (active !== undefined) {
    update.active = active;
    update.lockedAt = active ? null : Date.now();
    update.lockedBy = active ? null : gate.user.uid;
  }
  // null clears the field (e.g. "no title set" / unassign the crew) — undefined leaves it alone.
  if (trade !== undefined) update.trade = trade === null ? FieldValue.delete() : trade;
  if (displayName !== undefined) update.displayName = displayName === null ? FieldValue.delete() : displayName;
  if (crewId !== undefined) update.crewId = crewId === null ? FieldValue.delete() : crewId;
  if (active === true) await auth!.updateUser(uid, { disabled: false });
  await memberRef.update(update);
  invalidateCachedMember(uid);
  if (active === false) {
    await auth!.updateUser(uid, { disabled: true });
    await auth!.revokeRefreshTokens(uid);
  }

  return NextResponse.json({ ok: true });
}
