// Firebase Client SDK initialization (browser-safe) — lazily loaded (T-070).
//
// firebase/auth alone is lazily code-split so a page's own JS shrinks and
// hydrates faster while the SDK chunk fetches in parallel, instead of a
// static top-level `import { auth } from "./client"` bundling the whole SDK
// into every page's first-load JS whether or not it's needed immediately.
//
// firebase/firestore is deliberately NOT re-exported from here. The last
// client-side Firestore reads/writes (AuthContext's profile doc, the
// business-modules/timezone hooks, and two Pipeline status writes) were
// replaced by server API routes in the Phase 1 foundation work — see
// /api/auth/profile and /api/company/bootstrap — specifically to drop the
// ~281KB @firebase/firestore chunk from every authenticated page. Don't add
// it back here; if a new feature seems to need a client Firestore read,
// write a server route instead (this app already authenticates every page
// via the __session cookie, so a server round trip is one hop, not two).
//
// The app is still initialized eagerly (not gated behind a call) so the actual
// network fetch for the auth chunk starts the moment this module is first
// evaluated (effectively as soon as hydration begins) rather than waiting for
// whichever effect happens to run first.
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigValid = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
);

const appPromise: Promise<FirebaseApp | null> = isConfigValid
  ? import("firebase/app").then(({ initializeApp, getApps, getApp }) =>
      getApps().length ? getApp() : initializeApp(firebaseConfig)
    )
  : Promise.resolve(null);

let authPromise: Promise<Auth | null> | null = null;

/** Resolves to the Firebase Auth instance, loading the SDK on first call (memoized). */
export function getFirebaseAuth(): Promise<Auth | null> {
  if (!authPromise) {
    authPromise = appPromise.then((app) =>
      app ? import("firebase/auth").then(({ getAuth }) => getAuth(app)) : null
    );
  }
  return authPromise;
}
