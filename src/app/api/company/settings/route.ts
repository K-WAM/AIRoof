import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifyAuthAndRole } from "@/lib/auth/verifyRole";
import { jsonWithCache } from "@/lib/http/cache";
import { buildAgentPrompt } from "@/lib/ai/agentPromptBuilder";
import { getVoiceProvider } from "@/lib/voice/provider";
import {
  composeGreetingWithDisclosure,
  resolveRecordingDisclosure,
  validateRecordingDisclosureText,
} from "@/lib/recordingDisclosure";
import type { BusinessConfig } from "@/types";
import { DEFAULT_INVOICE_COPY } from "@/lib/documents/invoiceCopy";

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

  const d = snap.data()! as BusinessConfig;
  return jsonWithCache({
    timezone: d.timezone ?? "America/New_York",
    businessHours: d.businessHours ?? {},
    notificationEmail: d.notificationEmail ?? "",
    contactPhone: d.contactPhone ?? "",
    contactEmail: d.contactEmail ?? "",
    licenseNumber: d.licenseNumber ?? "",
    businessName: d.businessName ?? "",
    address: d.address ?? "",
    websiteUrl: d.websiteUrl ?? "",
    brandColor: d.brandColor ?? null,
    logoUrl: d.logoUrl ?? null,
    // Spanish (Phase 12, Phase 6)
    agentLanguage: d.agentLanguage ?? "en",
    agentLanguages: d.agentLanguages ?? ["en"],
    // Call-recording notice (Phase 16, T-102): the stored greetings plus the
    // resolved disclosure feed the settings page's live spoken-greeting preview.
    greeting: d.greeting ?? "",
    afterHoursGreeting: d.afterHoursGreeting ?? "",
    recordingDisclosure: resolveRecordingDisclosure(d),
    invoiceCopy: { ...DEFAULT_INVOICE_COPY, ...d.invoiceCopy },
  }, "semiStatic");
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { businessId, timezone, businessHours, notificationEmail, contactPhone, contactEmail, licenseNumber, agentLanguage, agentLanguages, recordingDisclosure, invoiceCopy } = body;

  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  if (licenseNumber !== undefined && (typeof licenseNumber !== "string" || licenseNumber.length > 40 || /[<>\u0000-\u001f]/.test(licenseNumber))) return NextResponse.json({ error: "Invalid license number" }, { status: 400 });
  if (agentLanguage !== undefined && !["en", "es"].includes(agentLanguage)) {
    return NextResponse.json({ error: 'agentLanguage must be "en" or "es"' }, { status: 400 });
  }
  if (invoiceCopy !== undefined && (invoiceCopy === null || typeof invoiceCopy !== "object" || Array.isArray(invoiceCopy) || ["opening", "closing", "thankYou", "terms"].some((key) => typeof invoiceCopy[key] !== "string" || invoiceCopy[key].length > 4000 || /[<>\u0000-\u001f]/.test(invoiceCopy[key])))) {
    return NextResponse.json({ error: "Invalid invoice copy" }, { status: 400 });
  }

  // T-102: shape + content validation for the recording notice. Rejects bad
  // input before any auth/write work. `text` may be omitted or empty — that
  // means "use the drafted default sentence" (never store an empty text).
  let disclosureUpdate: { enabled: boolean; text?: string } | undefined;
  if (recordingDisclosure !== undefined) {
    if (
      recordingDisclosure === null ||
      typeof recordingDisclosure !== "object" ||
      Array.isArray(recordingDisclosure) ||
      typeof recordingDisclosure.enabled !== "boolean"
    ) {
      return NextResponse.json({ error: "recordingDisclosure must be { enabled: boolean, text?: string }" }, { status: 400 });
    }
    let text: string | undefined;
    if (recordingDisclosure.text !== undefined) {
      if (typeof recordingDisclosure.text !== "string") {
        return NextResponse.json({ error: "recordingDisclosure.text must be a string" }, { status: 400 });
      }
      const check = validateRecordingDisclosureText(recordingDisclosure.text);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      const trimmed = recordingDisclosure.text.trim();
      text = trimmed.length > 0 ? trimmed : undefined;
    }
    disclosureUpdate = { enabled: recordingDisclosure.enabled, ...(text ? { text } : {}) };
  }

  const auth = await verifyAuthAndRole(req, businessId, ["owner", "staff", "superadmin"]);
  if ("error" in auth) return auth.error;

  // The recording notice is owner/superadmin territory (a legal-compliance
  // setting), even though staff may save the other settings on this route.
  if (disclosureUpdate !== undefined && !auth.user.superadmin && auth.user.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can change the call recording notice" }, { status: 403 });
  }

  const db = getAdminFirestore();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (timezone) update.timezone = timezone;
  if (businessHours) update.businessHours = businessHours;
  if (notificationEmail !== undefined) update.notificationEmail = notificationEmail;
  if (contactPhone !== undefined) update.contactPhone = contactPhone;
  if (contactEmail !== undefined) update.contactEmail = contactEmail;
  if (licenseNumber !== undefined) update.licenseNumber = licenseNumber.trim();
  if (agentLanguage !== undefined) update.agentLanguage = agentLanguage;
  if (agentLanguages !== undefined) update.agentLanguages = agentLanguages;
  if (disclosureUpdate !== undefined) update.recordingDisclosure = disclosureUpdate;
  if (invoiceCopy !== undefined) update.invoiceCopy = { opening: invoiceCopy.opening, closing: invoiceCopy.closing, thankYou: invoiceCopy.thankYou, terms: invoiceCopy.terms };

  const businessRef = db.collection("businesses").doc(businessId);
  await businessRef.update(update);

  // Push the change live immediately — "the Spanish toggle should work seamlessly" means
  // the phone line itself changes on save, not just what's stored in Firestore for the next call
  // that happens to hit the assistant-request path (every provisioned number has a fixed
  // assistantId, so that dynamic path never actually fires — see updateAssistantPersona's own doc
  // comment). T-102: a recording-notice change also pushes here so the spoken greeting on the
  // live line picks it up (the first message now carries the composed disclosure). A push failure
  // never fails the save itself; it's surfaced back to the owner instead of silently leaving the
  // live line on the old state.
  let vapiSyncWarning: string | undefined;
  if (agentLanguage !== undefined || disclosureUpdate !== undefined) {
    try {
      const freshSnap = await businessRef.get();
      const config = freshSnap.data() as BusinessConfig | undefined;
      if (config) {
        const provider = getVoiceProvider(config);
        const agentId = provider.id === "elevenlabs" ? config.elevenlabs?.agentId : config.vapiAssistantId;
        if (agentId) await provider.pushPersona({
          config,
          firstMessage: composeGreetingWithDisclosure(config.greeting ?? "", resolveRecordingDisclosure(config)),
          systemPrompt: buildAgentPrompt(config),
          // Only touch the transcriber when the language actually changed; a
          // disclosure-only save must not disturb the speaking configuration.
          ...(agentLanguage !== undefined ? { language: agentLanguage } : {}),
        });
      }
    } catch (err) {
      console.warn("company/settings: Vapi persona push failed after save:", (err as Error)?.message ?? err);
      vapiSyncWarning = "Saved, but the live phone line could not be updated yet — it may still use the previous greeting or language until the next successful sync.";
    }
  }

  // Bust timezone cache: client sessionStorage is client-side, no server action needed
  return NextResponse.json({ ok: true, ...(vapiSyncWarning ? { vapiSyncWarning } : {}) });
}
