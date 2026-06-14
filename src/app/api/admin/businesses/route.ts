import { NextRequest, NextResponse } from "next/server";
import type {
  AdminAuditEvent,
  BusinessConfig,
  BusinessIntegrationStatus,
  BusinessOnboardingStatus,
  BusinessPhoneNumber,
} from "@/types";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { getPlanPreset } from "@/lib/ai/planPresets";
import { getVerticalTemplate } from "@/lib/verticals/templates";

interface CreateBusinessRequest {
  businessId: string;
  businessName: string;
  industry: string;
  ownerEmail?: string;
  phoneNumber?: string;
  serviceArea: string | string[];
  businessHours?: string | Record<string, string>;
  escalationPhone?: string;
  notificationEmail?: string;
  calendarProvider?: BusinessConfig["calendarProvider"];
  planTier?: BusinessConfig["planTier"];
  agentVoice?: string;
  agentTone?: string;
  liveModel?: string;
  backOfficeModel?: string;
  agentName?: string;
  agentIdentity?: string;
  greeting?: string;
  afterHoursGreeting?: string;
  temperature?: number;
  maxTokens?: number;
  active?: boolean;
  // Vapi
  vapiAssistantId?: string;
  vapiPhoneNumberId?: string;
  // Branding
  brandColor?: string;
  logoUrl?: string | null;
  contactPhone?: string;
  contactEmail?: string;
  websiteUrl?: string;
  timezone?: string;
  actorUid?: string;
  actorEmail?: string;
}

export async function GET(req: NextRequest): Promise<
  NextResponse<
    | {
        businesses: Array<{
          business: BusinessConfig;
          onboarding: BusinessOnboardingStatus | null;
          integrationStatus: BusinessIntegrationStatus | null;
        }>;
      }
    | { error: string }
  >
> {
  const gate = await verifySuperadmin(req);
  if ("error" in gate) return gate.error;

  try {
    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json(
        { error: "Firestore not available" },
        { status: 500 }
      );
    }

    const businessesSnapshot = await db.collection("businesses").orderBy("createdAt", "desc").get();
    const businesses = await Promise.all(
      businessesSnapshot.docs.map(async (businessDoc) => {
        const business = { businessId: businessDoc.id, ...businessDoc.data() } as BusinessConfig;
        const bizId = businessDoc.id;
        const [onboardingDoc, integrationDoc] = await Promise.all([
          db.collection("businessOnboarding").doc(bizId).get(),
          db.collection("businessIntegrationStatus").doc(bizId).get(),
        ]);

        return {
          business,
          onboarding: onboardingDoc.exists
            ? (onboardingDoc.data() as BusinessOnboardingStatus)
            : null,
          integrationStatus: integrationDoc.exists
            ? (integrationDoc.data() as BusinessIntegrationStatus)
            : null,
        };
      })
    );

    return NextResponse.json({ businesses });
  } catch (error) {
    console.error("GET /api/admin/businesses error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<{ success: true; businessId: string; loginEmail?: string; tempPassword?: string } | { error: string }>> {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  try {
    const body: CreateBusinessRequest = await request.json();
    const { businessId, businessName, industry } = body;

    if (!businessId || !businessName || !industry || !body.serviceArea) {
      return NextResponse.json(
        { error: "Missing required fields: businessId, businessName, industry, serviceArea" },
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

    // Provision Firebase Auth user for the business owner
    let provisionedLogin: { uid: string; email: string; tempPassword: string } | null = null;
    if (body.ownerEmail) {
      const auth = getAdminAuth();
      if (auth) {
        const tempPassword = generateTempPassword();
        try {
          const userRecord = await auth.createUser({
            email: body.ownerEmail,
            password: tempPassword,
            emailVerified: false,
            displayName: businessName,
          });
          provisionedLogin = { uid: userRecord.uid, email: body.ownerEmail, tempPassword };
        } catch (authErr: unknown) {
          const code = (authErr as { code?: string })?.code;
          // If user already exists we skip — they can be linked manually
          if (code !== "auth/email-already-exists") {
            console.warn("Auth user creation failed (non-fatal):", authErr);
          }
        }
      }
    }

    const businessRef = db.collection("businesses").doc(businessId);
    const onboardingRef = db.collection("businessOnboarding").doc(businessId);
    const integrationRef = db.collection("businessIntegrationStatus").doc(businessId);
    const auditRef = db.collection("adminAuditEvents").doc(`audit_${now}`);
    const existingBusiness = await businessRef.get();

    if (existingBusiness.exists) {
      return NextResponse.json(
        { error: `Business ${businessId} already exists` },
        { status: 409 }
      );
    }

    const template = getVerticalTemplate(industry);
    const preset = getPlanPreset(body.planTier);
    const normalizedPhoneNumber = body.phoneNumber ? normalizePhone(body.phoneNumber) : "";

    const businessConfig: BusinessConfig = {
      businessId,
      businessName,
      industry,
      phoneNumber: body.phoneNumber,
      timezone: body.timezone ?? "America/New_York",
      serviceArea: body.serviceArea,
      businessHours: body.businessHours || {
        Monday: "08:00 - 17:00",
        Tuesday: "08:00 - 17:00",
        Wednesday: "08:00 - 17:00",
        Thursday: "08:00 - 17:00",
        Friday: "08:00 - 17:00",
        Saturday: "Closed",
        Sunday: "Closed",
      },
      emergencyRules: template.emergencyRules,
      bookingRules: template.bookingRules,
      escalationPhone: body.escalationPhone,
      notificationEmail: body.notificationEmail,
      approvedServices: template.approvedServices,
      approvedFaqs: template.approvedFaqs,
      disallowedTopics: template.disallowedTopics,
      calendarProvider: body.calendarProvider || "mock",
      planTier: preset.planTier,
      aiProvider: "openai",
      liveModel: body.liveModel || preset.liveModel,
      backOfficeModel: body.backOfficeModel || preset.backOfficeModel,
      agentName: body.agentName || template.agentName,
      agentIdentity: body.agentIdentity || template.agentIdentity,
      greeting:
        body.greeting ||
        template.greetingTemplate.replace("{businessName}", businessName),
      afterHoursGreeting:
        body.afterHoursGreeting ||
        template.afterHoursGreetingTemplate.replace("{businessName}", businessName),
      agentVoice: body.agentVoice || preset.agentVoice,
      agentTone: body.agentTone || template.agentTone || preset.agentTone,
      temperature: body.temperature ?? preset.temperature,
      maxTokens: body.maxTokens ?? preset.maxTokens,
      active: body.active ?? false,
      // Vapi integration
      ...(body.vapiAssistantId ? { vapiAssistantId: body.vapiAssistantId } : {}),
      ...(body.vapiPhoneNumberId ? { vapiPhoneNumberId: body.vapiPhoneNumberId } : {}),
      // Branding
      ...(body.brandColor ? { brandColor: body.brandColor } : {}),
      ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
      ...(body.contactPhone ? { contactPhone: body.contactPhone } : {}),
      ...(body.contactEmail ? { contactEmail: body.contactEmail } : {}),
      ...(body.websiteUrl ? { websiteUrl: body.websiteUrl } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const onboardingStatus: BusinessOnboardingStatus = {
      businessId,
      profileComplete: true,
      agentRulesComplete: template.emergencyRules.length > 0 && template.bookingRules.length > 0,
      faqComplete: template.approvedFaqs.length > 0,
      phoneMapped: false,
      calendarConfigured: businessConfig.calendarProvider !== "mock",
      notificationsConfigured: Boolean(body.escalationPhone || body.notificationEmail),
      testCallsPassed: false,
      securityReviewed: false,
      readyForLaunch: false,
      notes: body.ownerEmail ? `Owner email: ${body.ownerEmail}` : undefined,
    };

    const integrationStatus: BusinessIntegrationStatus = {
      businessId,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
      twilioConfigured: false,
      calendarConfigured: businessConfig.calendarProvider !== "mock",
      emailConfigured: Boolean(body.notificationEmail),
      smsConfigured: Boolean(body.escalationPhone),
      issues: [],
      lastHealthCheckAt: now,
    };

    const auditEvent: AdminAuditEvent = {
      auditEventId: auditRef.id,
      actorUid: body.actorUid || "system",
      actorEmail: body.actorEmail,
      businessId,
      action: "business.created",
      targetPath: `businesses/${businessId}`,
      after: businessConfig,
      createdAt: now,
    };

    await db.runTransaction(async (transaction) => {
      transaction.set(businessRef, businessConfig);
      transaction.set(onboardingRef, onboardingStatus);
      transaction.set(integrationRef, integrationStatus);
      transaction.set(auditRef, auditEvent);

      if (body.phoneNumber && normalizedPhoneNumber) {
        const phoneRef = db.collection("businessPhoneNumbers").doc(`${businessId}-main`);
        const phoneMapping: BusinessPhoneNumber = {
          phoneNumberId: phoneRef.id,
          businessId,
          phoneNumber: body.phoneNumber,
          normalizedPhoneNumber,
          label: "Main line",
          active: false,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(phoneRef, phoneMapping);
      }

      if (provisionedLogin) {
        const businessUserRef = db.collection("businessUsers").doc(provisionedLogin.uid);
        transaction.set(businessUserRef, {
          uid: provisionedLogin.uid,
          email: provisionedLogin.email,
          businessId,
          role: "owner",
        });
      }
    });

    return NextResponse.json({
      success: true,
      businessId,
      ...(provisionedLogin ? {
        loginEmail: provisionedLogin.email,
        tempPassword: provisionedLogin.tempPassword,
      } : {}),
    });
  } catch (error) {
    console.error("POST /api/admin/businesses error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? `+${digits}` : digits;
}
