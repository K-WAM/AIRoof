import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { sendTeamInviteEmail } from "@/lib/notify";
import { defaultLandingPath } from "@/lib/team/landing";
import { getVerticalTemplate } from "@/lib/verticals/templates";
import { getAppUrl } from "@/lib/config/appUrl";
import { jsonWithCache } from "@/lib/http/cache";
import type { TeamRole, TradeTitle } from "@/types/team";

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const { businessId } = await req.json().catch(() => ({}));
  if (typeof businessId !== "string" || !businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  const auth = getAdminAuth();
  if (!db || !auth) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  const [memberSnap, businessSnap] = await Promise.all([
    db.collection("businessUsers").doc(uid).get(),
    db.collection("businesses").doc(businessId).get(),
  ]);
  const member = memberSnap.data();
  const business = businessSnap.data();
  if (!memberSnap.exists || member?.businessId !== businessId) return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  if (member?.active === false) return NextResponse.json({ error: "Unlock this member before resending an invite" }, { status: 409 });
  if (!businessSnap.exists || !business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const disabledModules = getVerticalTemplate(typeof business.industry === "string" ? business.industry : "").disabledModules;
  const continueUrl = `${getAppUrl()}${defaultLandingPath({ role: member.role as TeamRole, trade: member.trade as TradeTitle | undefined }, disabledModules)}`;
  const resetLink = await auth.generatePasswordResetLink(member.email, { url: continueUrl });
  const sent = await sendTeamInviteEmail({
    to: member.email,
    role: member.role as TeamRole,
    resetLink,
    brand: {
      businessName: typeof business.businessName === "string" ? business.businessName : "Your Company",
      brandColor: typeof business.brandColor === "string" ? business.brandColor : undefined,
      logoUrl: typeof business.logoUrl === "string" ? business.logoUrl : undefined,
      contactPhone: typeof business.contactPhone === "string" ? business.contactPhone : undefined,
      contactEmail: typeof business.contactEmail === "string" ? business.contactEmail : undefined,
    },
  });
  if (sent.status !== "delivered") return jsonWithCache({ error: "Invite email could not be sent" }, "noStore", { status: 503 });
  return jsonWithCache({ ok: true }, "noStore");
}
