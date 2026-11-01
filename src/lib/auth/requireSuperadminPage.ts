import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { confirmSuperadminClaim, verifyIdToken } from "@/lib/firebase/admin";

/** Authorize before the privileged shell renders; a profile role never grants access. */
export async function requireSuperadminPage(next: "/admin" | "/hub") {
  const token = (await cookies()).get("__session")?.value;
  const user = token ? await verifyIdToken(token) : null;
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await confirmSuperadminClaim(user))) redirect("/company/dashboard");
}
