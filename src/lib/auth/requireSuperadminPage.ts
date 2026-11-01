import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { confirmSuperadminClaim, verifyIdToken } from "@/lib/firebase/admin";

/**
 * Authorize before the privileged shell renders; a profile role never grants access.
 *
 * "refresh": a cookie is present but can't be verified — the sign-in placeholder (`__session=1`, written by /login
 * before AuthProvider stores the real token) or an ID token past its one-hour life after an idle tab. The layout then
 * renders <SessionRefresh>, which refreshes the token in the browser and re-runs this check, instead of bouncing a
 * still-signed-in superadmin to /login. Nothing privileged renders on that path.
 */
export async function requireSuperadminPage(next: "/admin" | "/hub"): Promise<"ok" | "refresh"> {
  const token = (await cookies()).get("__session")?.value;
  if (!token) redirect(`/login?next=${encodeURIComponent(next)}`);
  const user = await verifyIdToken(token);
  if (!user) return "refresh";
  if (!(await confirmSuperadminClaim(user))) redirect("/company/dashboard");
  return "ok";
}
