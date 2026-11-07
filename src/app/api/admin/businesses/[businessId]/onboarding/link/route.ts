import type { NextRequest } from "next/server";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { changeLink } from "@/lib/onboarding/admin";
import { routeError } from "@/lib/onboarding/http";
type Context = { params: Promise<{ businessId: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try { return jsonWithCache({ portal: await changeLink((await params).businessId, gate.user, false) }, "noStore"); }
  catch (error) { return routeError(error); }
}
export async function DELETE(request: NextRequest, { params }: Context) {
  const gate = await verifySuperadmin(request); if ("error" in gate) return gate.error;
  try { return jsonWithCache({ portal: await changeLink((await params).businessId, gate.user, true) }, "noStore"); }
  catch (error) { return routeError(error); }
}
