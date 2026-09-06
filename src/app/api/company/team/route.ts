import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendTeamInviteEmail, type Branding } from "@/lib/notify";
import { TEAM_ROLES, type TeamRole } from "@/types/team";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

interface TeamMemberDoc {
  uid: string;
  businessId: string;
  email: string;
  role: TeamRole;
  active?: boolean;
  createdAt?: number;
}

// GET /api/company/team?businessId=xxx — list the business's team.
// Owner/superadmin only: this is account administration, not day-to-day work.
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection("businessUsers").where("businessId", "==", businessId).get();
  const members = snap.docs
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

  return NextResponse.json({ members });
}

// POST /api/company/team  body: { businessId, email, role }
// Invites a teammate in one call: creates (or reuses) their Firebase Auth
// user, writes the businessUsers doc, and emails them a branded
// password-reset link — no temp password to relay by hand, no second step.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { businessId, email, role } = body as { businessId?: string; email?: string; role?: string };

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (!email || typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
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

  const normalizedEmail = email.trim().toLowerCase();

  let uid: string;
  let existingUser: Awaited<ReturnType<typeof auth.getUserByEmail>> | null;
  try {
    existingUser = await auth.getUserByEmail(normalizedEmail);
  } catch {
    existingUser = null;
  }

  if (existingUser) {
    if (existingUser.customClaims?.superadmin === true) {
      return NextResponse.json(
        { error: "This email belongs to a platform administrator and can't be added as a team member." },
        { status: 409 }
      );
    }
    uid = existingUser.uid;
    const existingMemberSnap = await db.collection("businessUsers").doc(uid).get();
    const existingMember = existingMemberSnap.data() as Partial<TeamMemberDoc> | undefined;
    if (existingMember?.businessId && existingMember.businessId !== businessId) {
      return NextResponse.json(
        { error: "This email is already on another business's team." },
        { status: 409 }
      );
    }
    if (existingMember?.businessId === businessId && existingMember.active !== false) {
      return NextResponse.json({ error: "This person is already on your team." }, { status: 409 });
    }
    // Falls through to reactivate a previously-removed member, or bind a
    // stray Auth user (no prior businessUsers doc) to this business.
  } else {
    const created = await auth.createUser({
      email: normalizedEmail,
      password: generateTempPassword(),
      emailVerified: false,
    });
    uid = created.uid;
  }

  await db.collection("businessUsers").doc(uid).set(
    {
      uid,
      businessId,
      email: normalizedEmail,
      role,
      active: true,
      createdAt: Date.now(),
    },
    { merge: true }
  );

  const brand: Branding = {
    businessName: typeof business.businessName === "string" ? business.businessName : "Your Company",
    brandColor: typeof business.brandColor === "string" ? business.brandColor : undefined,
    logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : undefined,
    contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : undefined,
    contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : undefined,
  };

  let invite: { status: string; reason?: string };
  const resetLink = await auth.generatePasswordResetLink(normalizedEmail).catch((err: unknown) => {
    console.warn("Team invite reset-link generation failed:", (err as Error)?.message ?? err);
    return null;
  });

  if (resetLink) {
    try {
      const result = await sendTeamInviteEmail({ to: normalizedEmail, brand, role: role as TeamRole, resetLink });
      if (result.status === "delivered") {
        invite = { status: "sent" };
      } else if (result.status === "unconfigured") {
        invite = { status: "not_configured", reason: "Resend API key or FROM address not configured" };
      } else {
        invite = { status: "failed", reason: result.failureCode ?? "unknown" };
      }
    } catch (sendErr: unknown) {
      console.warn("Team invite email send failed:", (sendErr as Error)?.message ?? sendErr);
      invite = { status: "failed", reason: "email send threw an error" };
    }
  } else {
    invite = { status: "failed", reason: "Could not generate password reset link" };
  }

  return NextResponse.json({ success: true, uid, email: normalizedEmail, role, invite });
}
