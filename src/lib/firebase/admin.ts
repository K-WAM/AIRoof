// Firebase Admin SDK initialization (server-side only)
import * as admin from "firebase-admin";
import { isE2EHarness } from "@/lib/e2e/harness";

let adminApp: admin.app.App | null = null;

function initializeAdmin() {
  if (adminApp) return adminApp;

  // Local smoke harness: talk to the Auth/Firestore emulators with no credentials (see src/lib/e2e/harness.ts).
  if (isE2EHarness()) {
    // `next dev` compiles each route into its own module instance, so the default app may already exist.
    if (admin.apps.length) {
      adminApp = admin.app();
      return adminApp;
    }
    adminApp = admin.initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-luxor-e2e" });
    admin.firestore(adminApp).settings({ ignoreUndefinedProperties: true });
    return adminApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT_JSON not set. Admin SDK unavailable. Server-side operations will fail."
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    // Drop undefined fields instead of throwing on .set()/.update().
    // Must run once, before any Firestore operation. Prevents the entire class of
    // "Cannot use 'undefined' as a Firestore value" errors (e.g. optional appointment notes).
    admin.firestore(adminApp).settings({ ignoreUndefinedProperties: true });
    return adminApp;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    return null;
  }
}

export const getAdminAuth = () => {
  const app = initializeAdmin();
  return app ? admin.auth(app) : null;
};

export const getAdminFirestore = () => {
  const app = initializeAdmin();
  return app ? admin.firestore(app) : null;
};

// Superadmin confirmation (T-170). A custom claim rides inside the ID token, so removing it (or disabling the account,
// or revoking its sessions) would otherwise keep working until the token expires — up to an hour. Superadmin requests
// are rare, so each one re-reads the live Auth record (memoized 30 s per instance, like the member cache).
const SUPERADMIN_CONFIRM_TTL_MS = 30_000;
const superadminConfirmCache = new Map<string, { ok: boolean; exp: number }>();

export async function confirmSuperadminClaim(decoded: admin.auth.DecodedIdToken): Promise<boolean> {
  if ((decoded as { superadmin?: unknown }).superadmin !== true) return false;
  const key = `${decoded.uid}:${decoded.auth_time}`;
  const cached = superadminConfirmCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.ok;
  let ok = false;
  try {
    const auth = getAdminAuth();
    if (auth) {
      const record = await auth.getUser(decoded.uid);
      const validAfter = record.tokensValidAfterTime ? Date.parse(record.tokensValidAfterTime) : 0;
      ok = record.customClaims?.superadmin === true && !record.disabled && decoded.auth_time * 1000 >= validAfter;
    }
  } catch (error) {
    console.error("Superadmin confirmation failed:", error instanceof Error ? error.message : "unknown error");
    ok = false;
  }
  if (superadminConfirmCache.size >= 200) superadminConfirmCache.clear();
  superadminConfirmCache.set(key, { ok, exp: Date.now() + SUPERADMIN_CONFIRM_TTL_MS });
  return ok;
}

// Verify Firebase ID token (server-side)
export async function verifyIdToken(
  idToken: string
): Promise<admin.auth.DecodedIdToken | null> {
  try {
    const auth = getAdminAuth();
    if (!auth) return null;
    return await auth.verifyIdToken(idToken);
  } catch (error) {
    console.error("ID token verification failed:", error);
    return null;
  }
}
