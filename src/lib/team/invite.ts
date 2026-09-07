import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { sendTeamInviteEmail, type Branding } from "@/lib/notify";
import { TEAM_ROLES, type TeamRole } from "@/types/team";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export interface TeamMemberDoc {
  uid: string;
  businessId: string;
  email: string;
  role: TeamRole;
  active?: boolean;
  createdAt?: number;
}

export type InviteOutcome =
  | { status: "invited"; uid: string; email: string; role: TeamRole; inviteEmail: { status: string; reason?: string } }
  | { status: "already_member"; email: string; reason: string }
  | { status: "conflict"; email: string; reason: string }
  | { status: "invalid"; email: string; reason: string };

/**
 * Find-or-create the Firebase Auth user, upsert their businessUsers doc, and
 * email a branded password-reset invite. The one place this logic lives —
 * both POST /api/company/team (single invite) and POST /api/company/team/bulk
 * (CSV import) call this per row so validation/creation never drifts between
 * the two paths.
 */
export async function inviteTeamMember(opts: {
  db: Firestore;
  auth: Auth;
  businessId: string;
  business: Record<string, unknown>;
  email: string;
  role: string;
}): Promise<InviteOutcome> {
  const { db, auth, businessId, business, role } = opts;
  const trimmedEmail = opts.email.trim();

  if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
    return { status: "invalid", email: trimmedEmail, reason: "Not a valid email address" };
  }
  if (!TEAM_ROLES.includes(role as TeamRole)) {
    return { status: "invalid", email: trimmedEmail, reason: `Role must be one of: ${TEAM_ROLES.join(", ")}` };
  }

  const normalizedEmail = trimmedEmail.toLowerCase();

  let uid: string;
  let existingUser: Awaited<ReturnType<typeof auth.getUserByEmail>> | null;
  try {
    existingUser = await auth.getUserByEmail(normalizedEmail);
  } catch {
    existingUser = null;
  }

  if (existingUser) {
    if (existingUser.customClaims?.superadmin === true) {
      return { status: "conflict", email: normalizedEmail, reason: "Belongs to a platform administrator" };
    }
    uid = existingUser.uid;
    const existingMemberSnap = await db.collection("businessUsers").doc(uid).get();
    const existingMember = existingMemberSnap.data() as Partial<TeamMemberDoc> | undefined;
    if (existingMember?.businessId && existingMember.businessId !== businessId) {
      return { status: "conflict", email: normalizedEmail, reason: "Already on another business's team" };
    }
    if (existingMember?.businessId === businessId && existingMember.active !== false) {
      return { status: "already_member", email: normalizedEmail, reason: "Already on this team" };
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
    { uid, businessId, email: normalizedEmail, role, active: true, createdAt: Date.now() },
    { merge: true }
  );

  const brand: Branding = {
    businessName: typeof business.businessName === "string" ? business.businessName : "Your Company",
    brandColor: typeof business.brandColor === "string" ? business.brandColor : undefined,
    logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : undefined,
    contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : undefined,
    contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : undefined,
  };

  let inviteEmail: { status: string; reason?: string };
  const resetLink = await auth.generatePasswordResetLink(normalizedEmail).catch((err: unknown) => {
    console.warn("Team invite reset-link generation failed:", (err as Error)?.message ?? err);
    return null;
  });

  if (resetLink) {
    try {
      const result = await sendTeamInviteEmail({ to: normalizedEmail, brand, role: role as TeamRole, resetLink });
      if (result.status === "delivered") {
        inviteEmail = { status: "sent" };
      } else if (result.status === "unconfigured") {
        inviteEmail = { status: "not_configured", reason: "Resend API key or FROM address not configured" };
      } else {
        inviteEmail = { status: "failed", reason: result.failureCode ?? "unknown" };
      }
    } catch (sendErr: unknown) {
      console.warn("Team invite email send failed:", (sendErr as Error)?.message ?? sendErr);
      inviteEmail = { status: "failed", reason: "email send threw an error" };
    }
  } else {
    inviteEmail = { status: "failed", reason: "Could not generate password reset link" };
  }

  return { status: "invited", uid, email: normalizedEmail, role: role as TeamRole, inviteEmail };
}

/** Active (non-removed) businessUsers count — what a seatLimit is checked against. */
export async function countActiveTeamMembers(db: Firestore, businessId: string): Promise<number> {
  const snap = await db
    .collection("businessUsers")
    .where("businessId", "==", businessId)
    .where("active", "==", true)
    .get();
  return snap.size;
}

export const DEFAULT_SEAT_LIMIT = 5;
