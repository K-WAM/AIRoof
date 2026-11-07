import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { OnboardingLinkRecord, OnboardingPortal } from "@/types/onboarding";
import { onboardingDb, OnboardingError, portalRef } from "./store";

export const LINK_TTL = 60 * 24 * 60 * 60 * 1000;
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function newToken() { return randomBytes(32).toString("base64url"); }
export function validRecord(record: OnboardingLinkRecord | undefined, now = Date.now()): record is OnboardingLinkRecord {
  return !!record && !record.revokedAt && record.expiresAt > now;
}
export async function lookupLink(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new OnboardingError("Open the link Luxor sent you again, or ask us for a new one.", 401);
  const hash = hashToken(token);
  const ref = onboardingDb().collection("clientOnboardingLinks").doc(hash);
  const record = (await ref.get()).data() as OnboardingLinkRecord | undefined;
  if (!validRecord(record)) throw new OnboardingError("Open the link Luxor sent you again, or ask us for a new one.", 401);
  const portal = (await portalRef(record.businessId).get()).data() as OnboardingPortal | undefined;
  // Check the current portal too: a rotated/revoked link cannot retain access.
  if (!portal?.link || portal.link.revokedAt || portal.link.expiresAt <= Date.now() ||
      !timingSafeEqual(Buffer.from(hashToken(portal.link.token)), Buffer.from(hash))) {
    throw new OnboardingError("Open the link Luxor sent you again, or ask us for a new one.", 401);
  }
  return { hash, ref, record, portal };
}
export function cookieLink(request: NextRequest) { return lookupLink(request.cookies.get("onb")?.value ?? ""); }

/** Persisted per-link budget: shared by all write endpoints and server instances. */
export async function claimWrite(hash: string) {
  const db = onboardingDb();
  const ref = db.collection("clientOnboardingLinks").doc(hash);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!validRecord(data as OnboardingLinkRecord | undefined)) throw new OnboardingError("Open your client link again.", 401);
    const now = Date.now();
    const current = data?.writeWindowAt > now - 60_000;
    const count = current ? Number(data?.writeCount ?? 0) : 0;
    if (count >= 20) throw new OnboardingError("Keep this page open. Wait a minute before saving again.", 429);
    tx.update(ref, { writeWindowAt: current ? data!.writeWindowAt : now, writeCount: count + 1 });
  });
}
