import { randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { isPlatformAccount } from "@/lib/auth/platformAccount";
import { jsonWithCache } from "@/lib/http/cache";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

// Provisioning never changes an existing account's membership or privileges.
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const { businessId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonWithCache({ error: "Invalid JSON" }, "noStore", { status: 400 });
  const { ownerEmail, resetPassword } = body;
  if (typeof ownerEmail !== "string" || ownerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim()) || (resetPassword !== undefined && typeof resetPassword !== "boolean")) {
    return jsonWithCache({ error: "Enter a valid client email and an explicit reset choice." }, "noStore", { status: 400 });
  }
  const email = ownerEmail.trim().toLowerCase();
  const auth = getAdminAuth(), db = getAdminFirestore();
  if (!auth || !db) return jsonWithCache({ error: "Admin SDK unavailable" }, "noStore", { status: 503 });
  try {
    const biz = await db.collection("businesses").doc(businessId).get();
    if (!biz.exists) return jsonWithCache({ error: "Business not found" }, "noStore", { status: 404 });
    // Only user-not-found permits creation. Outages, permission errors and races must never trigger a takeover.
    const existing = await auth.getUserByEmail(email).catch((error: unknown) => {
      if ((error as { code?: string })?.code === "auth/user-not-found") return null;
      throw error;
    });
    if (existing) {
      const member = (await db.collection("businessUsers").doc(existing.uid).get()).data();
      if (existing.customClaims?.superadmin === true || await isPlatformAccount(auth, existing.uid, member)) {
        return jsonWithCache({ error: "This platform account cannot be provisioned or reset here." }, "noStore", { status: 409 });
      }
      if (!member || member.businessId !== businessId) {
        return jsonWithCache({ error: "This email already has an account outside this business. It cannot be reassigned here." }, "noStore", { status: 409 });
      }
      if (resetPassword !== true) {
        return jsonWithCache({ error: "This client already has a login. Use Reset password to change its password." }, "noStore", { status: 409 });
      }
      const tempPassword = generateTempPassword();
      await auth.updateUser(existing.uid, { password: tempPassword });
      // Preserve role, tenant, activation and creation date, even for a disabled staff member.
      return jsonWithCache({ tempPassword }, "noStore");
    }
    if (resetPassword === true) return jsonWithCache({ error: "No client login exists. Use Provision Login first." }, "noStore", { status: 409 });
    const tempPassword = generateTempPassword();
    const created = await auth.createUser({ email, password: tempPassword, emailVerified: false });
    await db.collection("businessUsers").doc(created.uid).set({ uid: created.uid, businessId, email, role: "owner", active: true, createdAt: Date.now() });
    return jsonWithCache({ tempPassword }, "noStore");
  } catch {
    // Provider details can contain personal data. Never log or echo them, or expose a password on failure.
    return jsonWithCache({ error: "The client login could not be changed. Try again." }, "noStore", { status: 503 });
  }
}
