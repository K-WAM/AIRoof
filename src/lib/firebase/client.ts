// Firebase Client SDK initialization (browser-safe) — lazily loaded (T-070).
//
// firebase/auth + firebase/firestore together are ~150kB (gzipped) of JS. Every
// authenticated page used to pay that cost synchronously (a static top-level
// `import { auth, db } from "./client"` bundles the whole SDK into that page's
// first-load JS, whether or not the page renders before the user interacts with
// anything auth/data-related). Loading them via dynamic `import()` instead lets
// webpack code-split them into their own chunk, so a page's own JS shrinks and
// hydrates faster while the SDK chunk fetches in parallel.
//
// The app is still initialized eagerly (not gated behind a call) so the actual
// network fetch for these chunks starts the moment this module is first
// evaluated (effectively as soon as hydration begins) rather than waiting for
// whichever effect happens to run first.
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

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
let dbPromise: Promise<Firestore | null> | null = null;

/** Resolves to the Firebase Auth instance, loading the SDK on first call (memoized). */
export function getFirebaseAuth(): Promise<Auth | null> {
  if (!authPromise) {
    authPromise = appPromise.then((app) =>
      app ? import("firebase/auth").then(({ getAuth }) => getAuth(app)) : null
    );
  }
  return authPromise;
}

/** Resolves to the Firestore instance, loading the SDK on first call (memoized). */
export function getFirebaseDb(): Promise<Firestore | null> {
  if (!dbPromise) {
    dbPromise = appPromise.then((app) =>
      app ? import("firebase/firestore").then(({ getFirestore }) => getFirestore(app)) : null
    );
  }
  return dbPromise;
}
