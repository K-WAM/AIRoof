import type { NextRequest } from "next/server";
import { jsonWithCache } from "@/lib/http/cache";
import { cookieLink } from "@/lib/onboarding/link";
import { publicView } from "@/lib/onboarding/view";
import { clientLogo } from "@/lib/onboarding/prefill";
import { routeError } from "@/lib/onboarding/http";
export async function GET(request: NextRequest) {
  try {
    const { portal } = await cookieLink(request);
    return jsonWithCache(publicView(portal, await clientLogo(portal.businessId)), "noStore");
  } catch (error) { return routeError(error); }
}
