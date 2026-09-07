import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { TEAM_ROLES, type TeamRole } from "@/types/team";
import { countActiveTeamMembers, inviteTeamMember, DEFAULT_SEAT_LIMIT } from "@/lib/team/invite";

interface TeamMemberDoc {
  uid: string;
  businessId: string;
  email: string;
  role: TeamRole;
  active?: boolean;
  createdAt?: number;
}

// GET /api/company/team?businessId=xxx — list the business's team + its seat limit.
// Owner/superadmin only: this is account administration, not day-to-day work.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const [teamSnap, bizSnap] = await Promise.all([
    db.collection("businessUsers").where("businessId", "==", businessId).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);

  const members = teamSnap.docs
    .map((d) => {
      const data = d.data() as Partial<TeamMemberDoc>;
      return {
        uid: d.id,
        email: data.email ?? "",
        role: (data.role as TeamRole) ?? "viewer",
        active: data.active !== false,
        createdAt: data.createdAt ?? 0,
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);

  const seatLimit = (bizSnap.data()?.seatLimit as number | undefined) ?? DEFAULT_SEAT_LIMIT;

  return NextResponse.json({ members, seatLimit });
}

// POST /api/company/team  body: { businessId, email, role }
// Invites a teammate in one call: creates (or reuses) their Firebase Auth
// user, writes the businessUsers doc, and emails them a branded
// password-reset link — no temp password to relay by hand, no second step.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, email, role } = body as { businessId?: string; email?: string; role?: string };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!role || !TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: `Role must be one of: ${TEAM_ROLES.join(", ")}` }, { status: 400 });
  }

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const auth = getAdminAuth();
  const db = getAdminFirestore();
  if (!auth || !db) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const bizSnap = await db.collection("businesses").doc(businessId).get();
  if (!bizSnap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });
  const business = bizSnap.data()!;

  const seatLimit = (business.seatLimit as number | undefined) ?? DEFAULT_SEAT_LIMIT;
  const activeCount = await countActiveTeamMembers(db, businessId);
  if (activeCount >= seatLimit) {
    return NextResponse.json(
      { error: `Seat limit reached (${activeCount}/${seatLimit}). Raise the seat limit in Client Config to add more.` },
      { status: 409 }
    );
  }

  const outcome = await inviteTeamMember({ db, auth, businessId, business, email, role });

  if (outcome.status === "invalid") {
    return NextResponse.json({ error: outcome.reason }, { status: 400 });
  }
  if (outcome.status === "conflict") {
    return NextResponse.json({ error: outcome.reason }, { status: 409 });
  }
  if (outcome.status === "already_member") {
    return NextResponse.json({ error: "This person is already on your team." }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    uid: outcome.uid,
    email: outcome.email,
    role: outcome.role,
    invite: outcome.inviteEmail,
  });
}
