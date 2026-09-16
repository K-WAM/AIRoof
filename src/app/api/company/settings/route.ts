import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { updateAssistantPersona } from "@/lib/vapi/vapiClient";
import type { BusinessConfig } from "@/types";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });

  // Was missing entirely — any caller who knew a businessId could read
  // another tenant's notification email/contact info/business hours. The
  // PUT below has always been gated; this GET was not.
  const gate = await verifyAuthAndRole(req, businessId, ["owner", "staff", "viewer", "superadmin"]);
  if ("error" in gate) return gate.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const d = snap.data()!;
  return jsonWithCache({
    timezone: d.timezone ?? "America/New_York",
    businessHours: d.businessHours ?? {},
    notificationEmail: d.notificationEmail ?? "",
    contactPhone: d.contactPhone ?? "",
    contactEmail: d.contactEmail ?? "",
    businessName: d.businessName ?? "",
    // Spanish (Phase 12, Phase 6)
    agentLanguage: d.agentLanguage ?? "en",
    agentLanguages: d.agentLanguages ?? ["en"],
  }, "semiStatic");
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { businessId, timezone, businessHours, notificationEmail, contactPhone, contactEmail, agentLanguage, agentLanguages } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (agentLanguage !== undefined && !["en", "es"].includes(agentLanguage)) {
    return NextResponse.json({ error: 'agentLanguage must be "en" or "es"' }, { status: 400 });
  }

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (timezone) update.timezone = timezone;
  if (businessHours) update.businessHours = businessHours;
  if (notificationEmail !== undefined) update.notificationEmail = notificationEmail;
  if (contactPhone !== undefined) update.contactPhone = contactPhone;
  if (contactEmail !== undefined) update.contactEmail = contactEmail;
  if (agentLanguage !== undefined) update.agentLanguage = agentLanguage;
  if (agentLanguages !== undefined) update.agentLanguages = agentLanguages;

  const businessRef = db.collection("businesses").doc(businessId);
  await businessRef.update(update);

  // Push the language switch live immediately — "the Spanish toggle should work seamlessly" means
  // the phone line itself changes on save, not just what's stored in Firestore for the next call
  // that happens to hit the assistant-request path (every provisioned number has a fixed
  // assistantId, so that dynamic path never actually fires — see updateAssistantPersona's own doc
  // comment). A push failure never fails the save itself; it's surfaced back to the owner instead
  // of silently leaving the live line on the old language.
  let vapiSyncWarning: string | undefined;
  if (agentLanguage !== undefined) {
    try {
      const freshSnap = await businessRef.get();
      const config = freshSnap.data() as BusinessConfig | undefined;
      if (config?.vapiAssistantId) {
        await updateAssistantPersona({
          assistantId: config.vapiAssistantId,
          firstMessage: config.greeting ?? "",
          systemPrompt: buildAgentPrompt(config),
          transcriberLanguage: agentLanguage,
        });
      }
    } catch (err) {
      console.warn("company/settings: Vapi persona push failed after language change:", (err as Error)?.message ?? err);
      vapiSyncWarning = "Saved, but the live phone line could not be updated yet — it may still answer in the previous language until the next successful sync.";
    }
  }

  // Bust timezone cache: client sessionStorage is client-side, no server action needed
  return NextResponse.json({ ok: true, ...(vapiSyncWarning ? { vapiSyncWarning } : {}) });
}
