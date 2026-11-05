import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { confirmSuperadminClaim, getAdminFirestore } from "@/lib/firebase/admin";
import type { TeamRole } from "@/types/team";

export const VIEW_AS_COOKIE = "__viewas";
export const VIEW_AS_TTL_MS = 60 * 60_000;
export const VIEW_AS_READ_ONLY = "View as is read-only. Exit to make changes.";

export interface ViewAsSession {
  uid: string;
  businessId: string;
  role: TeamRole;
  trade?: string;
  crewId?: string;
  memberUid?: string;
  label: string;
  createdAt: number;
  expiresAt: number;
  endedAt: number | null;
}

const cache = new Map<string, { session: ViewAsSession | null; until: number }>();
export function evictViewAs(id: string): void { cache.delete(id); }

export function viewAsId(req: NextRequest): string | null {
  const id = req.cookies.get(VIEW_AS_COOKIE)?.value;
  return id && /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
}

export function viewAsCookieOptions() {
  return { httpOnly: true, sameSite: "strict" as const, path: "/", secure: process.env.NODE_ENV !== "development", maxAge: 3600 };
}

/** Server-side projection only. Never changes the Firebase identity or trusts a client-supplied role. */
export async function resolveViewAs(req: NextRequest, verifiedUser: DecodedIdToken): Promise<ViewAsSession | null> {
  const id = viewAsId(req);
  if (!id || verifiedUser.superadmin !== true || !(await confirmSuperadminClaim(verifiedUser))) return null;
  const now = Date.now();
  let hit = cache.get(id);
  if (!hit || hit.until <= now) {
    const db = getAdminFirestore();
    if (!db) throw new Error("Database unavailable");
    const doc = await db.collection("viewAsSessions").doc(id).get();
    hit = { session: doc.exists ? doc.data() as ViewAsSession : null, until: now + 30_000 };
    if (cache.size >= 500) cache.clear();
    cache.set(id, hit);
  }
  const s = hit.session;
  if (!s || s.uid !== verifiedUser.uid || s.endedAt !== null || !Number.isFinite(s.expiresAt) ||
      now >= s.expiresAt || !s.businessId || !["owner", "staff", "crew", "viewer"].includes(s.role)) return null;
  return s;
}
