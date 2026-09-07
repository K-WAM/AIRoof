import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { AdminAuditEvent, BusinessConfig } from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";

interface SubscriptionRequest {
  action: "pause" | "resume";
  reason?: string;
  actorUid?: string;
  actorEmail?: string;
}

// POST /api/admin/businesses/[businessId]/subscription — pause or resume a
// client's dashboard access for non-payment. Dashboard-only by design: this
// never touches Vapi/agent config, so a billing dispute never means a
// customer's call goes unanswered (enforced client-side by the paused gate
// in src/app/company/layout.tsx, sourced from useBusinessModules()).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
): Promise<NextResponse<{ success: true; subscriptionStatus: string } | { error: string }>> {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  const { businessId } = await params;
  const body: SubscriptionRequest = await request.json().catch(() => ({}) as SubscriptionRequest);

  if (body.action !== "pause" && body.action !== "resume") {
    return NextResponse.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

  const businessRef = db.collection("businesses").doc(businessId);
  const auditRef = db.collection("adminAuditEvents").doc(`audit_${Date.now()}`);
  const now = Date.now();

  try {
    const nextStatus = await db.runTransaction(async (transaction) => {
      const businessDoc = await transaction.get(businessRef);
      if (!businessDoc.exists) throw new Error(`Business ${businessId} not found`);
      const currentConfig = businessDoc.data() as BusinessConfig;

      const nextStatus: BusinessConfig["subscriptionStatus"] =
        body.action === "pause" ? "paused" : "active";

      // ignoreUndefinedProperties (see src/lib/firebase/admin.ts) strips plain
      // `undefined` fields from a write instead of clearing them — so
      // resuming must use FieldValue.delete() to actually clear pausedAt/
      // pausedReason, not just omit them.
      const update: Record<string, unknown> =
        body.action === "pause"
          ? {
              subscriptionStatus: "paused",
              pausedAt: now,
              ...(body.reason?.trim() ? { pausedReason: body.reason.trim() } : { pausedReason: FieldValue.delete() }),
              updatedAt: now,
            }
          : {
              subscriptionStatus: "active",
              pausedAt: FieldValue.delete(),
              pausedReason: FieldValue.delete(),
              updatedAt: now,
            };

      transaction.update(businessRef, update);

      const auditEvent: AdminAuditEvent = {
        auditEventId: auditRef.id,
        actorUid: body.actorUid || "system",
        actorEmail: body.actorEmail,
        businessId,
        action: body.action === "pause" ? "subscription.paused" : "subscription.resumed",
        targetPath: `businesses/${businessId}`,
        before: { subscriptionStatus: currentConfig.subscriptionStatus ?? "active" },
        after: { subscriptionStatus: nextStatus },
        createdAt: now,
      };
      transaction.set(auditRef, auditEvent);

      return nextStatus;
    });

    return NextResponse.json({ success: true, subscriptionStatus: nextStatus! });
  } catch (error) {
    console.error("POST /api/admin/businesses/[businessId]/subscription error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
