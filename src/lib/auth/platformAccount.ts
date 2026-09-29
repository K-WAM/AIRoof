import type { Auth } from "firebase-admin/auth";

// T-170: Luxor's platform (superadmin) account can carry a businessUsers doc that points at a tenant (the old provisioning
// script put it on demo-roofing). A tenant owner must never be able to edit, disable or re-invite that account through
// their Team screen — disabling it would lock the platform operator out. Team routes treat it as "not a team member".
export async function isPlatformAccount(
  auth: Pick<Auth, "getUser"> | null,
  uid: string,
  member: { role?: unknown; superadmin?: unknown } | undefined,
): Promise<boolean> {
  if (member?.role === "superadmin" || member?.superadmin === true) return true;
  if (!auth) return false;
  try {
    const record = await auth.getUser(uid);
    return record.customClaims?.superadmin === true;
  } catch {
    return false;
  }
}
