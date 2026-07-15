// Firebase Admin SDK initialization (server-side only)
import * as admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

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

export default adminApp;
