import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const root = db.collection("businesses").doc(businessId);
  const [business, library, crews, members, calls] = await Promise.all([root.get(), root.collection("library").doc("pricing").get(), root.collection("crews").count().get(), root.collection("team").count().get(), root.collection("calls").count().get()]);
  const config = business.data() as Record<string, unknown> | undefined;
  const pricing = library.data() as { materials?: unknown[]; laborRates?: unknown[]; logoUrl?: string } | undefined;
  const phone = config?.elevenlabs || config?.vapiPhoneNumberId || config?.vapiAssistantId;
  return jsonWithCache({ phoneConfigured: Boolean(phone), prices: (pricing?.materials?.length ?? 0) + (pricing?.laborRates?.length ?? 0), resources: crews.data().count, hasLogo: Boolean(pricing?.logoUrl || config?.logoUrl), teamMembers: members.data().count, calls: calls.data().count, phoneNumber: (config?.phoneNumber as string | undefined) }, "noStore");
}
