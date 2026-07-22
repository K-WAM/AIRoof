// Demo customization — universal live demo line.
//
// demo-roofing owns the one live Vapi number + assistant, so it acts as the single
// "demo line". Each launch RECONFIGURES this business to the chosen vertical and
// reseeds its sample data, so the one phone number adapts to whatever industry you
// launched: the agent's greeting + full script are served from this business's
// config by the webhook's dynamic prompt ({{greeting}} / {{systemPrompt}}).
//
// POST   { email, companyName, verticalId? }   → launch (verticalId defaults to "roofing")
// DELETE                                        → reset the line to the roofing default
//
// Requires the Vapi assistant's System Prompt = {{systemPrompt}} and First Message
// = {{greeting}} for the call to adapt (no per-vertical Vapi assistant needed).

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { VERTICAL_TEMPLATES, demoAgentName, type VerticalId } from "@/lib/verticals/templates";
import { demoSeedFor } from "@/lib/verticals/demoSeed";

// The single live demo line. demo-roofing already has the Vapi number + assistant.
const LIVE_LINE_BUSINESS_ID = "demo-roofing";
const LIVE_LINE_PHONE = "+1 (754) 283-7658";
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

  let body: { email?: string; companyName?: string; verticalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const companyName = body.companyName?.trim();

  if (!email || !companyName) {
    return NextResponse.json({ error: "email and companyName are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email format" }, { status: 400 });
  }

  const result = await applyVertical({ verticalId: resolveVerticalId(body.verticalId), companyName, email });
  return NextResponse.json(result);
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
  const result = await applyVertical({ verticalId: "roofing", companyName: ROOFING_DEFAULT_NAME, email: DEFAULT_EMAIL });
  return NextResponse.json({ ...result, reset: true });
}

async function applyVertical(opts: { verticalId: VerticalId; companyName: string; email: string }) {
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

  // 0. Ensure the business has a stable field key — the QR link carries it so
  //    unauthenticated crews/prospects can use the public /field screen. Generated
  //    once; kept stable across launches so printed QRs stay valid.
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
    // 1. Reconfigure the live-line business to this vertical + prospect. The webhook's
    //    dynamic prompt reads these fields, so the live call adapts to the industry.
    await base.update({
      fieldKey,
      industry: opts.verticalId,
      businessName: opts.companyName,
      notificationEmail: opts.email,
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
    });

    // 2. Backup existing data, then delete and reseed. The backup write must
    //    succeed before any document is deleted — if it fails the whole reset aborts.
    const seed = demoSeedFor(opts.verticalId, now);
    const subs = ["calls", "leads", "appointments", "crews", "jobs"] as const;

    const snapshots: Record<string, FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>> = {};
    const backupData: Record<string, Record<string, unknown>[]> = {};

    for (const sub of subs) {
      const snap = await base.collection(sub).get();
      snapshots[sub] = snap;
      backupData[sub] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    await base.collection("backups").doc(String(now)).set({
      timestamp: now,
      businessId: LIVE_LINE_BUSINESS_ID,
      operation: "reset",
      verticalId: opts.verticalId,
      data: backupData,
    });

    for (const sub of subs) {
      const snap = snapshots[sub];
      if (!snap.empty) {
        const del = db.batch();
        snap.docs.forEach((d) => del.delete(d.ref));
        await del.commit();
      }
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

    return {
      ok: true,
      firestoreUpdated: true,
      verticalId: opts.verticalId,
      label: t.label,
      agentName,
      appliedGreeting: greeting,
      businessId: LIVE_LINE_BUSINESS_ID,
      phone: LIVE_LINE_PHONE,
      demoUrl: `https://ai-roof.vercel.app/company/dashboard?preview=${LIVE_LINE_BUSINESS_ID}`,
      // Secured public field link — the key authorizes the QR flow without a login.
      fieldUrl: `https://ai-roof.vercel.app/field?businessId=${LIVE_LINE_BUSINESS_ID}&key=${fieldKey}`,
    };
  } finally {
    await lockRef.set({ locked: false, completedAt: Date.now() }, { merge: true });
  }
}
