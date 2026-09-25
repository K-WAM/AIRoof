// Demo customization — universal live demo line.
//
// demo-roofing owns the one live Vapi number + assistant, so it acts as the single
// "demo line". Each launch RECONFIGURES this business to the chosen vertical, reseeds
// its sample data, AND pushes the rendered greeting + system prompt directly onto the
// Vapi assistant (see updateAssistantPersona) — so the one phone number adapts to
// whatever industry you launched.
//
// POST   { email, companyName, verticalId? }   → launch (verticalId defaults to "roofing")
// DELETE                                        → reset the line to the roofing default
//
// 2026-09-02 fix: this used to rely on Vapi's assistant-request webhook filling
// {{systemPrompt}}/{{greeting}} template placeholders on the assistant per call — that
// only fires when a phone number has NO fixed assistantId, and this one always has,
// so the templates rendered empty on every real call (confirmed: the call's own
// assistantOverrides.variableValues contained only carrier/SIP metadata, none of ours).
// The persona is now pushed directly via the Vapi API on every launch instead.

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { mintFieldExchangeToken, verifySuperadmin } from "@/lib/auth/verifyRole";
import { VERTICAL_TEMPLATES, demoAgentName, type VerticalId } from "@/lib/verticals/templates";
import { demoSeedFor } from "@/lib/verticals/demoSeed";
import { mergeWorkStarter, workCatalogStarterFor } from "@/lib/verticals/workCatalogStarter";
import { mergeStarterKit, starterKitFor } from "@/lib/verticals/starterKits";
import { getVoiceProvider } from "@/lib/voice/provider";
import { buildInitiationResponse } from "@/lib/voice/elevenlabs/initiationConfig";
import { MAX_LOGO_B64_BYTES, totalLogoBytes } from "@/lib/branding/logo";
import { jsonWithCache } from "@/lib/http/cache";
import { getAppUrl } from "@/lib/config/appUrl";
import type { BusinessConfig } from "@/types";
import type { LibraryLogo } from "@/types/library";

// The single live demo line. demo-roofing already has the Vapi number + assistant.
const LIVE_LINE_BUSINESS_ID = "demo-roofing";
const DEFAULT_EMAIL = "kwamwad@gmail.com";
const ROOFING_DEFAULT_NAME = "Apex Roofing South Florida";

// Hard in-code allowlist — never configurable. A destructive reset must never
// touch a business whose id is not in this set.
const DEMO_BUSINESS_IDS: ReadonlySet<string> = new Set(["demo-roofing"]);

// Maximum age of a reset lock before it is considered stale and reclaimable.
const LOCK_TTL_MS = 120_000;

const CONFIRM_PHRASE = "RESET";

function isAllowedDemoBusiness(businessId: string): boolean {
  return DEMO_BUSINESS_IDS.has(businessId);
}

// The live voice is one assistant; the persona name adapts via the prompt/greeting.
// Resolved from the shared template helper so the Demo Studio screen and the live
// call always agree on the name (see demoAgentName).

function resolveVerticalId(v?: string | null): VerticalId {
  return v && VERTICAL_TEMPLATES[v as VerticalId] ? (v as VerticalId) : "roofing";
}

export async function POST(request: NextRequest) {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  let body: { email?: string; companyName?: string; phone?: string; verticalId?: string; contactName?: string; serviceArea?: string; logoDataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Both fields are OPTIONAL (owner, 2026-09-24: "no complicated forms with friction"): a demo launches with just an
  // industry. A blank company name becomes "<Industry> Demo"; a blank email falls back to the default demo inbox.
  // A email that IS provided must still be valid.
  const verticalId = resolveVerticalId(body.verticalId);
  const providedEmail = body.email?.trim();
  if (providedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(providedEmail)) {
    return NextResponse.json({ error: "invalid email format" }, { status: 400 });
  }
  const email = providedEmail || DEFAULT_EMAIL;
  const companyName = body.companyName?.trim() || `${VERTICAL_TEMPLATES[verticalId].label} Demo`;
  // Optional prospect business phone: shown on their invoices/quotes/confirmations (contactPhone). Deliberately NOT
  // wired to escalationPhone — an emergency test call must never ring a prospect's real phone by surprise.
  const providedPhone = body.phone?.trim();
  if (providedPhone && !/^[+()\-.\s\d]{7,20}$/.test(providedPhone)) {
    return NextResponse.json({ error: "invalid phone format" }, { status: 400 });
  }

  if (body.logoDataUrl !== undefined && !parseLogo(body.logoDataUrl)) {
    return NextResponse.json({ error: "Logo must be a PNG, JPEG or WebP within the logo library size limit" }, { status: 400 });
  }
  const result = await applyVertical({ verticalId, companyName, email, phone: providedPhone,
    contactName: body.contactName?.trim(), serviceArea: body.serviceArea?.trim(), logoDataUrl: body.logoDataUrl });
  return NextResponse.json(result);
}

function parseLogo(dataUrl: string): LibraryLogo | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length > MAX_LOGO_B64_BYTES) return null;
  const logo: LibraryLogo = { logoId: `demo_${Date.now()}`, name: "Prospect logo", b64: match[2],
    mimeType: match[1] as LibraryLogo["mimeType"], variant: "color", isDefault: true, createdAt: Date.now() };
  return totalLogoBytes([logo]) <= MAX_LOGO_B64_BYTES ? logo : null;
}

// Backup sizing (see the reset's backup write): strings longer than this are base64 images/blobs, not data worth
// keeping for a demo tenant; the whole backup stays well under Firestore's 1 MiB document limit.
const BACKUP_LONG_STRING = 2_000;
const BACKUP_MAX_CHARS = 900_000;

function slimBackup(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > BACKUP_LONG_STRING ? `[omitted ${value.length} chars]` : value;
  }
  if (Array.isArray(value)) return value.map(slimBackup);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, slimBackup(v)]));
  }
  return value;
}

function lineState(config: BusinessConfig, now = new Date()) {
  if (config.voiceProvider !== "elevenlabs") return {
    lineReady: false, lineError: "Demo line is not on ElevenLabs yet — run scripts/move-demo-line-to-elevenlabs.mjs",
    greetingPreview: "",
  };
  if (!getVoiceProvider(config).isConfigured(config)) return {
    lineReady: false, lineError: "ElevenLabs line or API key is not configured", greetingPreview: "",
  };
  const greetingPreview = buildInitiationResponse(config, undefined, now).conversation_config_override.agent?.first_message ?? "";
  return greetingPreview ? { lineReady: true, lineError: undefined, greetingPreview } : {
    lineReady: false, lineError: "Unable to render the demo greeting", greetingPreview: "",
  };
}

function displayPhone(value?: string): string {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length === 11 && digits.startsWith("1")
    ? `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}` : value ?? "";
}

export async function GET(request: NextRequest) {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;
  const db = getAdminFirestore();
  if (!db) return jsonWithCache({ error: "Firestore not available" }, "noStore", { status: 503 });
  const base = db.collection("businesses").doc(LIVE_LINE_BUSINESS_ID);
  const [business, calls] = await Promise.all([base.get(), base.collection("calls").orderBy("startedAt", "desc").limit(1).get()]);
  if (!business.exists) return jsonWithCache({ error: "Demo tenant missing" }, "noStore", { status: 404 });
  const config = business.data() as BusinessConfig;
  return jsonWithCache({ businessName: config.businessName, industry: config.industry,
    phone: displayPhone(config.elevenlabs?.phoneNumber), ...lineState(config),
    seededAt: business.data()?.seededAt ?? null,
    lastCallAt: calls.docs[0]?.data()?.startedAt ?? null,
    configured: { elevenLabsApiKey: !!process.env.ELEVENLABS_API_KEY,
      elevenLabsToolSecret: !!process.env.ELEVENLABS_TOOL_SECRET,
      elevenLabsWebhookSecret: !!process.env.ELEVENLABS_WEBHOOK_SECRET },
  }, "volatile");
}

export async function DELETE(request: NextRequest) {
  const gate = await verifySuperadmin(request);
  if ("error" in gate) return gate.error;

  let body: { confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Must send confirm: "${CONFIRM_PHRASE}" to reset` },
      { status: 400 },
    );
  }

  // The line is universal, so reset always restores it to the roofing default.
  const result = await applyVertical({ verticalId: "roofing", companyName: ROOFING_DEFAULT_NAME, email: DEFAULT_EMAIL, phone: undefined });
  return NextResponse.json({ ...result, reset: true });
}

async function applyVertical(opts: { verticalId: VerticalId; companyName: string; email: string; phone?: string; contactName?: string; serviceArea?: string; logoDataUrl?: string }) {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not available" };

  // Guard 1 — allowlist: the hardcoded LIVE_LINE_BUSINESS_ID must itself be
  // in the code constant, or the route must never run on a real tenant.
  if (!isAllowedDemoBusiness(LIVE_LINE_BUSINESS_ID)) {
    return { ok: false, error: "This route only operates on allowed demo businesses" };
  }

  const t = VERTICAL_TEMPLATES[opts.verticalId];
  const agentName = demoAgentName(opts.verticalId);
  const greeting = `Thanks for calling ${opts.companyName}, this is ${agentName}. How can I help?`;
  const afterHoursGreeting = `Thanks for calling ${opts.companyName}. The office is closed, but I'm ${agentName} — I can take your details and the team will follow up first thing.`;
  const now = Date.now();

  // 0. Ensure the business has a stable field-key mint secret. It never leaves
  //    the server; QR links carry only a signed, one-use exchange grant.
  const base = db.collection("businesses").doc(LIVE_LINE_BUSINESS_ID);
  const existing = await base.get();

  // Guard 2 — isDemo marker: only businesses explicitly seeded as demos can be
  // reset. The marker is written by the seed script and lives on the business doc.
  if (existing.data()?.isDemo !== true) {
    return { ok: false, error: "Business is not a demo business (missing isDemo marker)" };
  }

  let fieldKey: string = existing.data()?.fieldKey ?? "";
  if (typeof fieldKey !== "string" || fieldKey.length < 16) {
    fieldKey = randomBytes(16).toString("hex");
  }

  // Guard 3 — transactional lock: serializes concurrent resets so two operators
  // cannot interleave backup/delete/re-seed operations.
  const lockRef = base.collection("backups").doc("lock");
  const acquired = await db.runTransaction(async (tx) => {
    const lockSnap = await tx.get(lockRef);
    if (lockSnap.exists) {
      const lockData = lockSnap.data()!;
      if (lockData.locked && (Date.now() - (lockData.startedAt as number)) < LOCK_TTL_MS) {
        return false;
      }
    }
    tx.set(lockRef, { locked: true, startedAt: Date.now(), operation: "reset" }, { merge: true });
    return true;
  });

  if (!acquired) {
    return { ok: false, error: "A reset is already in progress — try again in a moment" };
  }

  try {
    // 1. Reconfigure the live-line business to this vertical + prospect. This is the
    //    source of truth the Company portal reads — Vapi is pushed separately below,
    //    since Vapi's own {{systemPrompt}}/{{greeting}} templates never actually fill
    //    on a live call (see updateAssistantPersona's doc comment).
    const configPatch = {
      fieldKey,
      industry: opts.verticalId,
      businessName: opts.companyName,
      contactName: opts.contactName ?? null,
      serviceArea: opts.serviceArea || (existing.data()?.serviceArea as string | string[] | undefined) || "Miami",
      notificationEmail: opts.email,
      // Documents/emails read contactEmail/contactPhone; set them every launch so a previous prospect's details never
      // leak onto the next demo's invoices (null clears them).
      contactEmail: opts.email,
      contactPhone: opts.phone ?? null,
      agentName,
      agentIdentity: t.agentIdentity,
      agentTone: t.agentTone,
      greeting,
      afterHoursGreeting,
      approvedServices: t.approvedServices,
      approvedFaqs: t.approvedFaqs,
      emergencyRules: t.emergencyRules,
      bookingRules: t.bookingRules,
      disallowedTopics: t.disallowedTopics,
      brandColor: t.color,
      updatedAt: now,
    };
    await base.update(configPatch);

    const mergedConfig = { ...(existing.data() as BusinessConfig), ...configPatch } as BusinessConfig;
    const state = lineState(mergedConfig);

    // 2. Backup existing data, then delete and reseed. The backup write must
    //    succeed before any document is deleted — if it fails the whole reset aborts.
    const seed = demoSeedFor(opts.verticalId, now);
    const subs = ["calls", "leads", "appointments", "crews", "jobs", "customers", "quotes", "invoices", "punches", "agentActions", "schedulingLocks"] as const;

    const snapshots: Record<string, FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>> = {};
    const backupData: Record<string, Record<string, unknown>[]> = {};

    for (const sub of subs) {
      const snap = await base.collection(sub).get();
      snapshots[sub] = snap;
      backupData[sub] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // A job's child collections survive a plain document delete. Preserve them
    // in the backup and remove the entire tree before reusing J-number IDs.
    for (const job of snapshots.jobs.docs) {
      for (const child of ["updates", "photos", "photoBlobs"]) {
        const nested = await job.ref.collection(child).get();
        backupData[`jobs/${job.id}/${child}`] = nested.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    }
    const conversations = await db.collection("elevenlabsConversations").where("businessId", "==", LIVE_LINE_BUSINESS_ID).get();
    backupData.elevenlabsConversations = conversations.docs.map((d) => ({ id: d.id, ...d.data() }));
    const libraryDocs = await Promise.all(["logos", "workCatalog", "pricing"].map((id) => base.collection("library").doc(id).get()));
    backupData.library = libraryDocs.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() }));

    // One Firestore doc caps at 1 MiB, and photo blobs (~900 KB each) or a logo would blow past it — a failed backup
    // aborts the reset, which would make every launch after a demo with a photo fail. Long strings (base64 images,
    // blobs) are replaced by a marker; if what's left is still near the cap, only per-collection counts are kept.
    const slimmed = slimBackup(backupData) as Record<string, Record<string, unknown>[]>;
    const tooBig = JSON.stringify(slimmed).length > BACKUP_MAX_CHARS;
    await base.collection("backups").doc(String(now)).set({
      timestamp: now,
      businessId: LIVE_LINE_BUSINESS_ID,
      operation: "reset",
      verticalId: opts.verticalId,
      data: tooBig
        ? Object.fromEntries(Object.entries(slimmed).map(([k, v]) => [k, [{ truncated: true, count: v.length }]]))
        : slimmed,
    });

    for (const sub of subs) {
      const snap = snapshots[sub];
      if (!snap.empty) {
        if (sub === "jobs") {
          for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
        } else {
          for (const doc of snap.docs) await doc.ref.delete();
        }
      }
    }
    for (const doc of conversations.docs) await doc.ref.delete();

    // Use the same pure import helpers as the Library starter endpoints. Start
    // empty on every launch so an earlier prospect's edits cannot leak.
    const workItems = workCatalogStarterFor(opts.verticalId);
    if (workItems) {
      const { catalog } = mergeWorkStarter({ items: [] }, workItems, now);
      await base.collection("library").doc("workCatalog").set(catalog);
    } else {
      await base.collection("library").doc("workCatalog").set({ items: [], starterKitImported: [] });
    }
    const pricingKit = starterKitFor(opts.verticalId);
    if (pricingKit) {
      const { library } = mergeStarterKit({ materials: [], laborRates: [], documents: [] }, pricingKit,
        !t.disabledModules.includes("pricing"), opts.verticalId, now);
      await base.collection("library").doc("pricing").set(library);
    } else {
      await base.collection("library").doc("pricing").set({ materials: [], laborRates: [], documents: [] });
    }

    const add = db.batch();

    // Resources first — appointments/jobs below reference them by id.
    const resourceIds = seed.resources.map(() => base.collection("crews").doc());
    seed.resources.forEach((r, i) => {
      add.set(resourceIds[i], {
        ...r, crewId: resourceIds[i].id, businessId: LIVE_LINE_BUSINESS_ID,
        active: true, createdAt: now,
      });
    });

    // Job ids are handed out from the business's jobCounter (see POST /api/jobs), so
    // seeding fixed ids without advancing it would let the next real job collide
    // with — and overwrite — a seeded one.
    seed.jobs.forEach((j, i) => {
      const jobId = `J-${1001 + i}`;
      add.set(base.collection("jobs").doc(jobId), {
        ...j, jobId, businessId: LIVE_LINE_BUSINESS_ID,
        createdAt: now - (i + 1) * 86_400_000, updatedAt: now,
      });
    });
    if (seed.jobs.length > 0) {
      add.update(base, { jobCounter: 1000 + seed.jobs.length });
    }
    seed.calls.forEach((c, i) => {
      const createdAt = now - (i + 1) * 3_600_000;
      const duration = 60 + i * 25;
      add.set(base.collection("calls").doc(), {
        ...c, businessId: LIVE_LINE_BUSINESS_ID, status: "completed",
        startedAt: createdAt, endedAt: createdAt + duration * 1000, duration,
        createdAt, updatedAt: now, messages: [],
      });
    });
    seed.leads.forEach((l, i) => {
      add.set(base.collection("leads").doc(), {
        ...l, businessId: LIVE_LINE_BUSINESS_ID, createdAt: now - (i + 1) * 7_200_000, updatedAt: now,
      });
    });
    seed.appointments.forEach((a) => {
      const { resourceIndex, ...appt } = a;
      add.set(base.collection("appointments").doc(), {
        ...appt, businessId: LIVE_LINE_BUSINESS_ID, endTime: a.startTime + 3_600_000,
        calendarProvider: "mock", createdAt: now, updatedAt: now,
        // Intake verticals open with a populated board; one booking stays
        // unassigned on purpose so there's always a card to drag in the demo.
        ...(resourceIndex !== undefined && resourceIds[resourceIndex]
          ? { assignedCrewId: resourceIds[resourceIndex].id }
          : {}),
      });
    });
    await add.commit();

    await base.update({ seededAt: now });

    const logo = opts.logoDataUrl ? parseLogo(opts.logoDataUrl) : null;
    await base.collection("library").doc("logos").set({ logos: logo ? [logo] : [], updatedAt: now });

    const fieldGrant = mintFieldExchangeToken(LIVE_LINE_BUSINESS_ID, fieldKey);
    return {
      ok: true,
      firestoreUpdated: true,
      ...state,
      verticalId: opts.verticalId,
      label: t.label,
      agentName,
      appliedGreeting: greeting,
      businessId: LIVE_LINE_BUSINESS_ID,
      phone: displayPhone(mergedConfig.elevenlabs?.phoneNumber),
      demoUrl: `${getAppUrl()}/company/dashboard?preview=${LIVE_LINE_BUSINESS_ID}`,
      // Short-lived exchange URL; the route sets an HttpOnly session then redirects
      // to /field without leaving a reusable credential in history or referrers.
      fieldUrl: `${getAppUrl()}/api/field/exchange?grant=${encodeURIComponent(fieldGrant.token)}`,
    };
  } finally {
    await lockRef.set({ locked: false, completedAt: Date.now() }, { merge: true });
  }
}
