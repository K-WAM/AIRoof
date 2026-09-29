import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { jsonWithCache } from "@/lib/http/cache";
import { LINE_ACTIONS, routingWithLine, transition, type LineAction } from "@/lib/phoneLines/lifecycle";
import { LINE_CONFLICT_MESSAGE, findLineConflicts, toE164, toPhoneLineView } from "@/lib/phoneLines/registry";
import type { BusinessConfig, BusinessPhoneNumber } from "@/types";
import { SMS_PURPOSES, SMS_STATUSES, type LineProvider, type LineSms, type LineStatus, type SmsPurpose, type SmsStatus } from "@/types/phoneLine";

// PATCH /api/admin/phone-lines/[lineId] { action, dryRun?, confirm?, provider?, callId?, sms? } — Phase 32, T-171.
//
// mark_provisioned / mark_connected   bookkeeping only (Draft → Provisioned → Connected)
// record_test { callId }               the call must exist in THIS tenant and have arrived on THIS number, after connection
// go_live { confirm: "<e164>" }        dry-run by default; applying writes the ElevenLabs routing in the same transaction
//                                      and keeps the routing it replaced (previousRouting)
// retire { confirm: "<e164>" }         dry-run by default; takes the number off the tenant's routing, restoring the
//                                      primary number it replaced; call records are never touched. Demo lines refuse.
// set_sms { sms: {...} }               texting readiness; "ready" needs confirm (NH-29 / D5 approvals happen outside)

interface PatchBody {
  action?: string;
  dryRun?: boolean;
  confirm?: string;
  provider?: string;
  callId?: string;
  sms?: { status?: string; isDefaultSender?: boolean; purposes?: string[] };
}

type RoutingDiff = {
  before: { phoneNumber: string | null; extraPhoneNumbers: string[] };
  after: { phoneNumber: string | null; extraPhoneNumbers: string[] };
};

function json(body: unknown, status = 200) {
  return jsonWithCache(body, "noStore", { status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lineId: string }> }) {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const { lineId } = await params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (!LINE_ACTIONS.includes(body.action as LineAction)) {
    return json({ error: `action must be one of: ${LINE_ACTIONS.join(", ")}` }, 400);
  }
  const action = body.action as LineAction;

  const lineRef = db.collection("businessPhoneNumbers").doc(lineId);
  const lineSnap = await lineRef.get();
  if (!lineSnap.exists) return json({ error: "Line not found" }, 404);
  const line = lineSnap.data() as Partial<BusinessPhoneNumber> & { connectedAt?: number };
  const e164 = toE164(line.normalizedPhoneNumber ?? line.phoneNumber);
  const businessId = line.businessId;
  if (!e164 || typeof businessId !== "string") return json({ error: "This line record is incomplete" }, 409);
  const status: LineStatus = line.status ?? "draft";

  const step = transition(status, action);
  if (!step.ok) return json({ error: step.reason }, 409);

  const now = Date.now();
  const update: Record<string, unknown> = { status: step.next, updatedAt: now, updatedBy: gate.user.uid };
  let routingDiff: RoutingDiff | null = null;
  let businessUpdate: Record<string, unknown> | null = null;

  if (action === "mark_provisioned" || action === "mark_connected") {
    const provider = (body.provider ?? line.provider) as LineProvider | undefined;
    if (body.provider !== undefined && body.provider !== "elevenlabs" && body.provider !== "vapi") {
      return json({ error: "provider must be elevenlabs or vapi" }, 400);
    }
    if (action === "mark_connected" && !provider) return json({ error: "Say which voice provider answers this line" }, 400);
    if (provider) update.provider = provider;
    if (action === "mark_connected") update.connectedAt = now;
  }

  if (action === "record_test") {
    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(callId)) return json({ error: "callId required — the test call from this tenant's Calls list" }, 400);
    const call = await db.collection("businesses").doc(businessId).collection("calls").doc(callId).get();
    if (!call.exists) return json({ error: "That call is not in this business's Calls — it did not land on this tenant" }, 409);
    const callData = call.data() ?? {};
    const calledNumber = toE164(callData.calledNumber);
    if (!calledNumber) return json({ error: "That call has no record of the number dialed — make a new test call to this line" }, 409);
    if (calledNumber !== e164) return json({ error: "That call came in on a different number" }, 409);
    const startedAt = typeof callData.startedAt === "number" ? callData.startedAt : 0;
    if (typeof line.connectedAt === "number" && startedAt < line.connectedAt) {
      return json({ error: "That call happened before the line was connected — make a new test call" }, 409);
    }
    update.lastTestAt = now;
    update.lastTestCallId = callId;
  }

  if (action === "go_live" || action === "retire") {
    if (body.confirm !== e164) return json({ error: `Type the number exactly (${e164}) to confirm` }, 400);
    if (action === "retire" && line.purpose === "demo") {
      return json({ error: "Demo lines are managed in Demo Studio, not retired here" }, 409);
    }
    if (action === "go_live") {
      const conflicts = await findLineConflicts(db, e164, businessId);
      if (conflicts.length > 0) return json({ error: LINE_CONFLICT_MESSAGE[conflicts[0].kind] }, 409);
    }
    const businessSnap = await db.collection("businesses").doc(businessId).get();
    if (!businessSnap.exists) return json({ error: "Business not found" }, 404);
    const business = businessSnap.data() as Partial<BusinessConfig>;
    const provider = line.provider;
    if (provider === "elevenlabs") {
      if (action === "go_live" && !business.elevenlabs?.agentId) {
        return json({ error: "Connect the ElevenLabs agent on the business's config page first" }, 409);
      }
      const before = {
        phoneNumber: business.elevenlabs?.phoneNumber ?? null,
        extraPhoneNumbers: [...(business.elevenlabs?.extraPhoneNumbers ?? [])],
      };
      let after: RoutingDiff["after"];
      if (action === "go_live") {
        const next = routingWithLine(before, e164);
        if ("error" in next) return json({ error: next.error }, 409);
        after = next;
        update.active = true;
        update.previousRouting = {
          businessId,
          elevenlabsPhoneNumber: before.phoneNumber,
          elevenlabsExtraPhoneNumbers: before.extraPhoneNumbers,
          capturedAt: now,
        };
      } else {
        const replaced = line.previousRouting?.elevenlabsPhoneNumber ?? null;
        after = {
          phoneNumber: before.phoneNumber === e164 ? (replaced && replaced !== e164 ? replaced : null) : before.phoneNumber,
          extraPhoneNumbers: before.extraPhoneNumbers.filter((number) => number !== e164),
        };
        update.active = false;
      }
      routingDiff = { before, after };
      businessUpdate = {
        "elevenlabs.phoneNumber": after.phoneNumber ?? FieldValue.delete(),
        "elevenlabs.extraPhoneNumbers": after.extraPhoneNumbers,
        updatedAt: now,
      };
    } else {
      // Vapi routing is the phone-number ID set on the config page; the registry only records the state.
      update.active = action === "go_live";
    }
    if (body.dryRun !== false) {
      return json({
        dryRun: true,
        line: toPhoneLineView(lineId, { ...line, status: step.next }, true),
        routing: routingDiff ?? { note: "Routing for this provider is set on the business's config page; only the line state changes." },
        apply: `Send the same request with "dryRun": false to apply.`,
      });
    }
  }

  if (action === "set_sms") {
    const sms = body.sms ?? {};
    const current: LineSms = {
      status: line.sms?.status ?? "not_configured",
      purposes: line.sms?.purposes ?? [...SMS_PURPOSES],
      isDefaultSender: line.sms?.isDefaultSender === true,
    };
    if (sms.status !== undefined && !SMS_STATUSES.includes(sms.status as SmsStatus)) return json({ error: "Invalid SMS status" }, 400);
    if (sms.purposes !== undefined && (!Array.isArray(sms.purposes) || sms.purposes.some((purpose) => !SMS_PURPOSES.includes(purpose as SmsPurpose)))) {
      return json({ error: "Invalid SMS purposes" }, 400);
    }
    if (sms.status === "ready" && body.confirm !== e164) {
      return json({ error: `Texting goes live only with carrier approval. Type the number exactly (${e164}) to confirm` }, 400);
    }
    const next: LineSms = {
      status: (sms.status as SmsStatus | undefined) ?? current.status,
      purposes: (sms.purposes as SmsPurpose[] | undefined) ?? current.purposes,
      isDefaultSender: sms.isDefaultSender ?? current.isDefaultSender,
    };
    update.sms = next;
  }

  const auditRef = db.collection("adminAuditEvents").doc(`audit_line_${now}_${lineId}`);
  await db.runTransaction(async (transaction) => {
    const siblings = action === "set_sms" && update.sms && (update.sms as LineSms).isDefaultSender
      ? await transaction.get(db.collection("businessPhoneNumbers").where("businessId", "==", businessId))
      : null;
    transaction.update(lineRef, update);
    if (businessUpdate) transaction.update(db.collection("businesses").doc(businessId), businessUpdate);
    // One default sender per business (decision D4).
    for (const sibling of siblings?.docs ?? []) {
      if (sibling.id !== lineId && sibling.data().sms?.isDefaultSender === true) {
        transaction.update(sibling.ref, { "sms.isDefaultSender": false, updatedAt: now });
      }
    }
    transaction.set(auditRef, {
      auditEventId: auditRef.id,
      actorUid: gate.user.uid,
      actorEmail: gate.user.email ?? null,
      businessId,
      action: `phone_line.${action}`,
      targetPath: `businessPhoneNumbers/${lineId}`,
      before: line,
      after: { ...update, ...(routingDiff ? { routing: routingDiff } : {}) },
      createdAt: now,
    });
  });

  const saved = await lineRef.get();
  return json({
    line: toPhoneLineView(lineId, saved.data() as Partial<BusinessPhoneNumber>, true),
    ...(routingDiff ? { routing: routingDiff } : {}),
  });
}
