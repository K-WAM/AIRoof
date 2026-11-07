import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { lookupLink } from "@/lib/onboarding/link";
import { onboardingDb, portalRef } from "@/lib/onboarding/store";
import type { OnboardingLinkRecord, OnboardingPortal } from "@/types/onboarding";
import { validRecord } from "@/lib/onboarding/link";

function secureHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow"); return response;
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = checkRateLimit(request, { windowMs: 60_000, max: 30, keyPrefix: "onboarding-link" });
  if (limited) return secureHeaders(limited);
  try {
    const { token } = await params; const link = await lookupLink(token);
    await onboardingDb().runTransaction(async tx => {
      const [record, doc] = await Promise.all([tx.get(link.ref), tx.get(portalRef(link.record.businessId))]);
      if (!validRecord(record.data() as OnboardingLinkRecord | undefined)) throw new Error("Link unavailable");
      const portal = doc.data() as OnboardingPortal;
      tx.set(portalRef(portal.businessId), { ...portal, link: { ...portal.link, lastOpenedAt: Date.now() } });
    });
    const response = NextResponse.redirect(new URL("/onboarding", request.url), 303);
    response.cookies.set("onb", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor((link.record.expiresAt - Date.now()) / 1000)) });
    return secureHeaders(response);
  } catch {
    const response = new NextResponse('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>Luxor onboarding</title></head><body><main style="max-width:36rem;margin:12vh auto;padding:24px;font-family:system-ui;line-height:1.6"><p>with Luxor</p><h1>Your onboarding link</h1><p>This link has expired or was turned off. Ask Luxor for a new one.</p><a href="mailto:connect@luxordev.com">Contact Luxor</a></main></body></html>', { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } });
    response.cookies.delete("onb"); return secureHeaders(response);
  }
}
