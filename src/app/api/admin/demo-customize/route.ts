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

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { verifySuperadmin } from "@/lib/auth/verifyRole";
import { VERTICAL_TEMPLATES, type VerticalId } from "@/lib/verticals/templates";
import { demoSeedFor } from "@/lib/verticals/demoSeed";

// The single live demo line. demo-roofing already has the Vapi number + assistant.
const LIVE_LINE_BUSINESS_ID = "demo-roofing";
const LIVE_LINE_PHONE = "+1 (754) 283-7658";
const DEFAULT_EMAIL = "kwamwad@gmail.com";
const ROOFING_DEFAULT_NAME = "Apex Roofing South Florida";

// The live voice is one assistant; the persona name adapts via the prompt/greeting.
const AGENT_NAME: Record<VerticalId, string> = {
  roofing: "Alice",
  hvac: "Claire",
  landscaping: "Maya",
  dental: "Aria",
  "property-management": "Val",
  "general-contractors": "Rex",
};

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

  // The line is universal, so reset always restores it to the roofing default.
  const result = await applyVertical({ verticalId: "roofing", companyName: ROOFING_DEFAULT_NAME, email: DEFAULT_EMAIL });
  return NextResponse.json({ ...result, reset: true });
}

async function applyVertical(opts: { verticalId: VerticalId; companyName: string; email: string }) {
  const db = getAdminFirestore();
  if (!db) return { ok: false, error: "Firestore not available" };

  const t = VERTICAL_TEMPLATES[opts.verticalId];
  const agentName = AGENT_NAME[opts.verticalId];
  const greeting = `Thanks for calling ${opts.companyName}, this is ${agentName}. How can I help?`;
  const afterHoursGreeting = `Thanks for calling ${opts.companyName}. The office is closed, but I'm ${agentName} — I can take your details and the team will follow up first thing.`;
  const now = Date.now();

  // 1. Reconfigure the live-line business to this vertical + prospect. The webhook's
  //    dynamic prompt reads these fields, so the live call adapts to the industry.
  const base = db.collection("businesses").doc(LIVE_LINE_BUSINESS_ID);
  await base.update({
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

  // 2. Reseed sample calls/leads/appointments so the dashboard reads as this industry.
  const seed = demoSeedFor(opts.verticalId, now);
  for (const sub of ["calls", "leads", "appointments"] as const) {
    const snap = await base.collection(sub).get();
    if (!snap.empty) {
      const del = db.batch();
      snap.docs.forEach((d) => del.delete(d.ref));
      await del.commit();
    }
  }
  const add = db.batch();
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
    add.set(base.collection("appointments").doc(), {
      ...a, businessId: LIVE_LINE_BUSINESS_ID, endTime: a.startTime + 3_600_000,
      calendarProvider: "mock", createdAt: now, updatedAt: now,
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
  };
}
