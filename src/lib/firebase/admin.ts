// Firebase Admin SDK initialization (server-side only)
//
// Modular entry points (firebase-admin/app, /auth, /firestore) — the
// `import * as admin from "firebase-admin"` legacy-namespace style was
// removed outright in firebase-admin v14 ("Removed legacy namespace
// support. To import Admin SDK APIs you should use the ES module entry
// points."), so this is the only supported form now, not a style choice.
import { cert, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App | null = null;

function initializeAdmin() {
  if (adminApp) return adminApp;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    console.warn(
      "FIREBASE_SERVICE_ACCOUNT_JSON not set. Admin SDK unavailable. Server-side operations will fail."
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    });
    // Drop undefined fields instead of throwing on .set()/.update().
    // Must run once, before any Firestore operation. Prevents the entire class of
    // "Cannot use 'undefined' as a Firestore value" errors (e.g. optional appointment notes).
    getFirestore(adminApp).settings({ ignoreUndefinedProperties: true });
    return adminApp;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    return null;
  }
}

export const getAdminAuth = () => {
  const app = initializeAdmin();
  return app ? getAuth(app) : null;
};

export const getAdminFirestore = () => {
  const app = initializeAdmin();
  return app ? getFirestore(app) : null;
};

// Verify Firebase ID token (server-side)
export async function verifyIdToken(
  idToken: string
): Promise<DecodedIdToken | null> {
  try {
    const auth = getAdminAuth();
    if (!auth) return null;
    return await auth.verifyIdToken(idToken);
  } catch (error) {
    console.error("ID token verification failed:", error);
    return null;
  }
}
