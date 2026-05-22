// Demo customization endpoint — points the demo business at a prospect's
// email + company name, and updates Alice's first message on Vapi so she
// greets the caller as that company.
//
// POST   { email, companyName }   → customize
// DELETE                          → reset to defaults

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";

const BUSINESS_ID = "demo-roofing";
const DEFAULT_EMAIL = "kwamwad@gmail.com";
const DEFAULT_NAME = "Apex Roofing South Florida";
const DEFAULT_GREETING = "Hello. Thanks for calling Apex Roofing. This is Alice. How can I help?";
const VAPI_ASSISTANT_ID = "9267a84a-0f4f-416b-a328-1dc539f5265e";

export async function POST(request: NextRequest) {
  let body: { email?: string; companyName?: string };
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

  const greeting = `Hello. Thanks for calling ${companyName}. This is Alice. How can I help?`;
  const result = await applyCustomization({ email, companyName, greeting });
  return NextResponse.json(result);
}

export async function DELETE() {
  const result = await applyCustomization({
    email: DEFAULT_EMAIL,
    companyName: DEFAULT_NAME,
    greeting: DEFAULT_GREETING,
  });
  return NextResponse.json({ ...result, reset: true });
}

async function applyCustomization(opts: { email: string; companyName: string; greeting: string }) {
  const db = getAdminFirestore();
  if (!db) {
    return { ok: false, error: "Firestore not available" };
  }

  await db.collection("businesses").doc(BUSINESS_ID).update({
    notificationEmail: opts.email,
    businessName: opts.companyName,
    greeting: opts.greeting,
    updatedAt: Date.now(),
  });

  const vapiKey = process.env.VAPI_API_KEY;
  let vapiUpdated = false;
  let vapiError: string | undefined;

  if (vapiKey) {
    try {
      const res = await fetch(`https://api.vapi.ai/assistant/${VAPI_ASSISTANT_ID}`, {
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

  return {
    ok: true,
    firestoreUpdated: true,
    vapiUpdated,
    vapiError,
    appliedGreeting: opts.greeting,
  };
}
