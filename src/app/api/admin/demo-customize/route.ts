// Demo customization endpoint — points a vertical's demo business at a prospect's
// email + company name, and updates the agent's first message on Vapi so they
// greet the caller as that company.
//
// POST   { email, companyName, verticalId? }   → customize (verticalId defaults to "roofing")
// DELETE ?verticalId=...                        → reset to defaults

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

const DEFAULT_EMAIL = "kwamwad@gmail.com";

const DEMO_BUSINESS_MAP: Record<string, {
  businessId: string;
  vapiAssistantId: string | null;
  agentName: string;
  defaultName: string;
  defaultGreeting: string;
}> = {
  roofing: {
    businessId: "demo-roofing",
    vapiAssistantId: "9267a84a-0f4f-416b-a328-1dc539f5265e",
    agentName: "Alice",
    defaultName: "Apex Roofing South Florida",
    defaultGreeting: "Hello. Thanks for calling Apex Roofing. This is Alice. How can I help?",
  },
  hvac: {
    businessId: "demo-hvac",
    vapiAssistantId: null,
    agentName: "Claire",
    defaultName: "Summit HVAC Demo",
    defaultGreeting: "Thanks for calling Summit HVAC Demo, this is Claire. How can I help?",
  },
  landscaping: {
    businessId: "demo-landscaping",
    vapiAssistantId: null,
    agentName: "Maya",
    defaultName: "Greenpath Landscaping Demo",
    defaultGreeting: "Hi, thanks for calling Greenpath Landscaping Demo! This is Maya.",
  },
  dental: {
    businessId: "demo-dental",
    vapiAssistantId: null,
    agentName: "Aria",
    defaultName: "Bright Smile Dental Demo",
    defaultGreeting: "Thank you for calling Bright Smile Dental Demo, this is Aria.",
  },
  "property-management": {
    businessId: "demo-property-management",
    vapiAssistantId: null,
    agentName: "Val",
    defaultName: "Harbor Property Mgmt Demo",
    defaultGreeting: "Thanks for calling Harbor Property Mgmt Demo — this is Val.",
  },
  "general-contractors": {
    businessId: "demo-general-contractors",
    vapiAssistantId: null,
    agentName: "Rex",
    defaultName: "Summit GC Demo",
    defaultGreeting: "Thanks for calling Summit GC Demo, this is Rex. How can I help?",
  },
};

function resolveDemoBusiness(verticalId?: string | null) {
  const key = verticalId && DEMO_BUSINESS_MAP[verticalId] ? verticalId : "roofing";
  return DEMO_BUSINESS_MAP[key];
}

export async function POST(request: NextRequest) {
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

  const entry = resolveDemoBusiness(body.verticalId);
  const greeting = `Hello. Thanks for calling ${companyName}. This is ${entry.agentName}. How can I help?`;

  const result = await applyCustomization({ email, companyName, greeting, ...entry });
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const verticalId = new URL(request.url).searchParams.get("verticalId");
  const entry = resolveDemoBusiness(verticalId);
  const result = await applyCustomization({
    email: DEFAULT_EMAIL,
    companyName: entry.defaultName,
    greeting: entry.defaultGreeting,
    ...entry,
  });
  return NextResponse.json({ ...result, reset: true });
}

async function applyCustomization(opts: {
  email: string;
  companyName: string;
  greeting: string;
  businessId: string;
  vapiAssistantId: string | null;
  agentName?: string;
  defaultName?: string;
  defaultGreeting?: string;
}) {
  const db = getAdminFirestore();
  if (!db) {
    return { ok: false, error: "Firestore not available" };
  }

  await db.collection("businesses").doc(opts.businessId).update({
    notificationEmail: opts.email,
    businessName: opts.companyName,
    greeting: opts.greeting,
    updatedAt: Date.now(),
  });

  let vapiUpdated = false;
  let vapiError: string | undefined;

  if (!opts.vapiAssistantId) {
    vapiError = "No Vapi assistant configured for this vertical — voice demo pending provisioning";
  } else {
    const vapiKey = process.env.VAPI_API_KEY;
    if (vapiKey) {
      try {
        const res = await fetch(`https://api.vapi.ai/assistant/${opts.vapiAssistantId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${vapiKey}`,
          },
          body: JSON.stringify({ firstMessage: opts.greeting }),
        });
        if (res.ok) {
          vapiUpdated = true;
        } else {
          vapiError = `Vapi PATCH ${res.status}: ${await res.text()}`;
        }
      } catch (err) {
        vapiError = err instanceof Error ? err.message : "Vapi request failed";
      }
    } else {
      vapiError = "VAPI_API_KEY not configured — first message must be updated manually in Vapi UI";
    }
  }

  return {
    ok: true,
    firestoreUpdated: true,
    vapiUpdated,
    vapiError,
    appliedGreeting: opts.greeting,
    businessId: opts.businessId,
    demoUrl: `https://ai-roof.vercel.app/company/dashboard?preview=${opts.businessId}`,
  };
}
