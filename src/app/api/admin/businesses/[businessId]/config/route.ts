import { NextRequest, NextResponse } from "next/server";
import type {
  AdminAuditEvent,
  BusinessConfig,
  BusinessIntegrationStatus,
  BusinessOnboardingStatus,
} from "@/types";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { getPlanPreset } from "@/lib/ai/planPresets";
import { getVerticalTemplate } from "@/lib/verticals/templates";

interface UpdateBusinessConfigRequest {
  businessName?: string;
  industry?: string;
  phoneNumber?: string;
  serviceArea?: string | string[];
  businessHours?: string | Record<string, string>;
  escalationPhone?: string;
  notificationEmail?: string;
  approvedServices?: string[];
  approvedFaqs?: Array<{ question: string; answer: string }>;
  emergencyRules?: string[];
  bookingRules?: string[];
  disallowedTopics?: string[];
  calendarProvider?: BusinessConfig["calendarProvider"];
  planTier?: BusinessConfig["planTier"];
  liveModel?: string;
  backOfficeModel?: string;
  agentName?: string;
  agentIdentity?: string;
  greeting?: string;
  afterHoursGreeting?: string;
  agentVoice?: string;
  agentTone?: string;
  temperature?: number;
  maxTokens?: number;
  active?: boolean;
  timezone?: string;
  // Vapi integration
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
  // Pricing (invoice generation)
  laborRate?: { defaultHourlyRate: number };
  defaultTaxRate?: number;
  // Branding
  brandColor?: string;
  logoUrl?: string;
  contactPhone?: string;
  contactEmail?: string;
  websiteUrl?: string;
  applyTemplateDefaults?: boolean;
  onboarding?: Partial<BusinessOnboardingStatus>;
  actorUid?: string;
  actorEmail?: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
): Promise<NextResponse> {
  try {
    const { businessId } = await params;
    const db = getAdminFirestore();
    if (!db) return NextResponse.json({ error: "Firestore not available" }, { status: 503 });

    const [bizDoc, onboardingDoc] = await Promise.all([
      db.collection("businesses").doc(businessId).get(),
      db.collection("businessOnboarding").doc(businessId).get(),
    ]);

    if (!bizDoc.exists) return NextResponse.json({ error: "Business not found" }, { status: 404 });

    return NextResponse.json({
      business: bizDoc.data(),
      onboarding: onboardingDoc.exists ? onboardingDoc.data() : null,
    });
  } catch (error) {
    console.error("GET /api/admin/businesses/[businessId]/config error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
): Promise<NextResponse<{ success: true; businessId: string } | { error: string }>> {
  try {
    const { businessId } = await params;
    const body: UpdateBusinessConfigRequest = await request.json();

    if (!businessId) {
      return NextResponse.json(
        { error: "Missing businessId parameter" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "Firestore not available" },
        { status: 500 }
      );
    }

    const now = Date.now();
    const businessRef = db.collection("businesses").doc(businessId);
    const onboardingRef = db.collection("businessOnboarding").doc(businessId);
    const integrationRef = db.collection("businessIntegrationStatus").doc(businessId);
    const auditRef = db.collection("adminAuditEvents").doc(`audit_${now}`);

    await db.runTransaction(async (transaction) => {
      const businessDoc = await transaction.get(businessRef);
      if (!businessDoc.exists) {
        throw new Error(`Business ${businessId} not found`);
      }

      const currentConfig = businessDoc.data() as BusinessConfig;
      const nextIndustry = body.industry || currentConfig.industry;
      const template = getVerticalTemplate(nextIndustry);
      const preset = getPlanPreset(body.planTier || currentConfig.planTier);

      const configUpdate: Partial<BusinessConfig> = {
        businessName: body.businessName,
        industry: body.industry,
        phoneNumber: body.phoneNumber,
        serviceArea: body.serviceArea,
        businessHours: body.businessHours,
        escalationPhone: body.escalationPhone,
        notificationEmail: body.notificationEmail,
        calendarProvider: body.calendarProvider,
        planTier: body.planTier,
        liveModel: body.liveModel || (body.planTier ? preset.liveModel : undefined),
        backOfficeModel:
          body.backOfficeModel || (body.planTier ? preset.backOfficeModel : undefined),
        agentName: body.agentName,
        agentIdentity: body.agentIdentity,
        greeting: body.greeting,
        afterHoursGreeting: body.afterHoursGreeting,
        agentVoice: body.agentVoice || (body.planTier ? preset.agentVoice : undefined),
        agentTone:
          body.agentTone ||
          (body.applyTemplateDefaults ? template.agentTone : undefined) ||
          (body.planTier ? preset.agentTone : undefined),
        temperature: body.temperature ?? (body.planTier ? preset.temperature : undefined),
        maxTokens: body.maxTokens ?? (body.planTier ? preset.maxTokens : undefined),
        active: body.active,
        timezone: body.timezone,
        // Vapi integration
        vapiAssistantId: body.vapiAssistantId,
        vapiPhoneNumberId: body.vapiPhoneNumberId,
        // Pricing
        ...(body.laborRate !== undefined ? { laborRate: body.laborRate } : {}),
        ...(body.defaultTaxRate !== undefined ? { defaultTaxRate: body.defaultTaxRate } : {}),
        // Branding
        brandColor: body.brandColor,
        logoUrl: body.logoUrl,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        websiteUrl: body.websiteUrl,
        updatedAt: now,
      };

      if (body.applyTemplateDefaults) {
        configUpdate.approvedServices = template.approvedServices;
        configUpdate.approvedFaqs = template.approvedFaqs;
        configUpdate.emergencyRules = template.emergencyRules;
        configUpdate.bookingRules = template.bookingRules;
        configUpdate.disallowedTopics = template.disallowedTopics;
      } else {
        configUpdate.approvedServices = body.approvedServices;
        configUpdate.approvedFaqs = body.approvedFaqs;
        configUpdate.emergencyRules = body.emergencyRules;
        configUpdate.bookingRules = body.bookingRules;
        configUpdate.disallowedTopics = body.disallowedTopics;
      }

      const cleanedConfigUpdate = removeUndefined(configUpdate);
      transaction.update(businessRef, cleanedConfigUpdate);

      const onboardingDoc = await transaction.get(onboardingRef);
      const onboardingUpdate: Partial<BusinessOnboardingStatus> = removeUndefined({
        ...body.onboarding,
        businessId,
        profileComplete:
          body.onboarding?.profileComplete ??
          Boolean(body.businessName || currentConfig.businessName),
        agentRulesComplete:
          body.onboarding?.agentRulesComplete ??
          Boolean(
            cleanedConfigUpdate.emergencyRules ||
              cleanedConfigUpdate.bookingRules ||
              currentConfig.emergencyRules?.length
          ),
        faqComplete:
          body.onboarding?.faqComplete ??
          Boolean(cleanedConfigUpdate.approvedFaqs || currentConfig.approvedFaqs?.length),
        calendarConfigured:
          body.onboarding?.calendarConfigured ??
          (body.calendarProvider ? body.calendarProvider !== "mock" : undefined),
        notificationsConfigured:
          body.onboarding?.notificationsConfigured ??
          Boolean(body.escalationPhone || body.notificationEmail),
      });

      if (onboardingDoc.exists) {
        transaction.update(onboardingRef, onboardingUpdate);
      } else {
        transaction.set(onboardingRef, {
          businessId,
          profileComplete: false,
          agentRulesComplete: false,
          faqComplete: false,
          phoneMapped: false,
          calendarConfigured: false,
          notificationsConfigured: false,
          testCallsPassed: false,
          securityReviewed: false,
          readyForLaunch: false,
          ...onboardingUpdate,
        } satisfies BusinessOnboardingStatus);
      }

      const integrationDoc = await transaction.get(integrationRef);
      const integrationUpdate: Partial<BusinessIntegrationStatus> = removeUndefined({
        businessId,
        calendarConfigured: body.calendarProvider
          ? body.calendarProvider !== "mock"
          : undefined,
        emailConfigured: body.notificationEmail ? true : undefined,
        smsConfigured: body.escalationPhone ? true : undefined,
        lastHealthCheckAt: now,
      });

      if (integrationDoc.exists) {
        transaction.update(integrationRef, integrationUpdate);
      } else {
        transaction.set(integrationRef, {
          businessId,
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
          twilioConfigured: false,
          calendarConfigured: body.calendarProvider !== "mock",
          emailConfigured: Boolean(body.notificationEmail),
          smsConfigured: Boolean(body.escalationPhone),
          issues: [],
          lastHealthCheckAt: now,
        } satisfies BusinessIntegrationStatus);
      }

      const auditEvent: AdminAuditEvent = {
        auditEventId: auditRef.id,
        actorUid: body.actorUid || "system",
        actorEmail: body.actorEmail,
        businessId,
        action: "business.updated",
        targetPath: `businesses/${businessId}`,
        before: currentConfig,
        after: cleanedConfigUpdate,
        createdAt: now,
      };

      transaction.set(auditRef, auditEvent);
    });

    return NextResponse.json({ success: true, businessId });
  } catch (error) {
    console.error("PUT /api/admin/businesses/[businessId]/config error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}
